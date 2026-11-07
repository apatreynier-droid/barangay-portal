"""Resident image attachments for document requests.

Storage design
--------------
* The image bytes live on disk in ``settings.upload_dir / request_attachments``
  (persistent, survives backend restarts). The folder is never mounted as
  static files: every download goes through an authenticated endpoint.
* The ``request_attachments`` table stores the metadata plus the generated
  ``stored_filename`` and links it to ``requests.id`` (one image per request).
* Images are not stored as MySQL BLOBs: multi-megabyte rows bloat the
  database, its backups and every query touching the table, while a file
  reference keeps the database small and the files easy to back up.

Security
--------
* The file type is detected from its magic bytes (JPEG, PNG, WebP only); the
  client's ``Content-Type`` header and filename are never trusted.
* The size is enforced while reading (``settings.request_attachment_max_bytes``).
* Stored files get a random ``<uuid4 hex>.<ext>`` name. The resident's
  original filename is kept only as sanitized display metadata.
* Responses are sent with ``nosniff`` and a sandboxing CSP, and are never
  cached by shared caches.
"""

from __future__ import annotations

import logging
import os
import re
import unicodedata
import uuid
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

import mysql.connector
from fastapi import HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from mysql.connector import MySQLConnection

from .config import settings
from .schemas import RequestAttachmentResponse

logger = logging.getLogger(__name__)

#: Sub-folder of ``settings.upload_dir`` that holds request attachments.
REQUEST_ATTACHMENTS_SUBDIR = "request_attachments"

#: MySQL error number raised when a table does not exist yet.
TABLE_MISSING_ERROR = 1146

#: Generated names only: 32 lowercase hex characters + an allowed extension.
STORED_FILENAME_PATTERN = re.compile(r"^[0-9a-f]{32}\.(?:jpg|png|webp)$")

MAX_ORIGINAL_FILENAME_LENGTH = 255


@dataclass(frozen=True)
class ValidatedImage:
    data: bytes
    content_type: str
    extension: str
    original_filename: str

    @property
    def size(self) -> int:
        return len(self.data)


def detect_image_type(data: bytes) -> tuple[str, str] | None:
    """Return ``(content_type, extension)`` from the file's magic bytes."""
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", ".jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", ".png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp", ".webp"
    return None


def sanitize_original_filename(name: str | None, extension: str) -> str:
    """Keep a safe, display-only version of the resident's filename."""
    # Drop any client-side path ("C:\\fakepath\\x.jpg", "../../x.jpg").
    base = re.split(r"[\\/]", name or "")[-1]
    # Remove control/format characters and characters that break headers.
    base = "".join(
        character
        for character in unicodedata.normalize("NFC", base)
        if unicodedata.category(character)[0] != "C" and character not in '"<>'
    ).strip(" .")

    if not base:
        return f"attachment{extension}"

    if len(base) > MAX_ORIGINAL_FILENAME_LENGTH:
        stem, dot, suffix = base.rpartition(".")
        if dot and 0 < len(suffix) <= 10:
            keep = MAX_ORIGINAL_FILENAME_LENGTH - len(suffix) - 1
            base = f"{stem[:keep]}.{suffix}"
        else:
            base = base[:MAX_ORIGINAL_FILENAME_LENGTH]

    return base


def read_validated_image(
    upload: UploadFile, max_bytes: int | None = None
) -> ValidatedImage:
    """Read the upload (size-capped) and verify it is a JPEG, PNG or WebP.

    ``max_bytes`` defaults to the document-request attachment limit; other
    features (pothole report photos) pass their own limit.
    """
    if max_bytes is None:
        max_bytes = settings.request_attachment_max_bytes
    data = upload.file.read(max_bytes + 1)

    if not data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The attached image is empty.",
        )

    if len(data) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"The image must be {max_bytes // (1024 * 1024)} MB or smaller."
            ),
        )

    detected = detect_image_type(data)
    if detected is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Please attach a JPG, PNG or WebP image.",
        )

    content_type, extension = detected
    return ValidatedImage(
        data=data,
        content_type=content_type,
        extension=extension,
        original_filename=sanitize_original_filename(upload.filename, extension),
    )


def upload_subdir(subdir: str) -> Path:
    """Return (and create) a persistent sub-folder of ``settings.upload_dir``."""
    directory = settings.upload_dir / subdir
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def request_attachments_dir() -> Path:
    return upload_subdir(REQUEST_ATTACHMENTS_SUBDIR)


def store_image_file(
    image: ValidatedImage, subdir: str = REQUEST_ATTACHMENTS_SUBDIR
) -> str:
    """Write the original bytes under a fresh random name and return that name.

    The bytes are written exactly as uploaded: no resizing, re-encoding or
    metadata stripping.
    """
    stored_filename = f"{uuid.uuid4().hex}{image.extension}"
    path = upload_subdir(subdir) / stored_filename

    # "xb": never overwrite an existing file.
    with open(path, "xb") as handle:
        handle.write(image.data)
        handle.flush()
        os.fsync(handle.fileno())

    return stored_filename


def resolve_stored_path(
    stored_filename: str, subdir: str = REQUEST_ATTACHMENTS_SUBDIR
) -> Path | None:
    """Map a stored name to its file, refusing anything but generated names."""
    if not STORED_FILENAME_PATTERN.fullmatch(stored_filename or ""):
        return None

    directory = upload_subdir(subdir).resolve()
    path = (directory / stored_filename).resolve()
    if path.parent != directory or not path.is_file():
        return None

    return path


def delete_stored_file(
    stored_filename: str | None, subdir: str = REQUEST_ATTACHMENTS_SUBDIR
) -> None:
    """Best-effort removal (used for rollbacks and deleted requests)."""
    if not stored_filename or not STORED_FILENAME_PATTERN.fullmatch(stored_filename):
        return

    try:
        (upload_subdir(subdir) / stored_filename).unlink(missing_ok=True)
    except OSError:
        logger.warning("Could not delete attachment file %s", stored_filename)


def insert_attachment_row(
    cursor,
    *,
    request_id: int,
    image: ValidatedImage,
    stored_filename: str,
    uploaded_by: object,
) -> None:
    cursor.execute(
        """
        INSERT INTO request_attachments
          (request_id, original_filename, stored_filename, content_type,
           file_size, uploaded_by)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (
            request_id,
            image.original_filename,
            stored_filename,
            image.content_type,
            image.size,
            uploaded_by,
        ),
    )


def fetch_attachment_row(
    connection: MySQLConnection,
    request_id: int,
    owner_user_id: object | None = None,
) -> dict[str, object] | None:
    """Load the attachment of ``request_id``.

    With ``owner_user_id`` the request must also belong to that user, so a
    resident can only ever reach their own attachment.
    """
    query = """
        SELECT request_attachments.id, request_attachments.request_id,
               request_attachments.original_filename,
               request_attachments.stored_filename,
               request_attachments.content_type,
               request_attachments.file_size,
               request_attachments.uploaded_at
        FROM request_attachments
        JOIN requests ON requests.id = request_attachments.request_id
        WHERE request_attachments.request_id = %s
    """
    params: tuple[object, ...] = (request_id,)
    if owner_user_id is not None:
        query += " AND requests.user_id = %s"
        params = (request_id, owner_user_id)

    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(query, params)
        return cursor.fetchone()
    except mysql.connector.Error as error:
        # Before migration 011 is applied the table does not exist; requests
        # must keep working, they simply have no attachment yet.
        if error.errno == TABLE_MISSING_ERROR:
            logger.warning(
                "request_attachments table is missing; run "
                "scripts/apply_request_attachments_migration.py"
            )
            return None
        raise
    finally:
        cursor.close()


def load_attachment_meta(
    connection: MySQLConnection, request_id: int
) -> RequestAttachmentResponse | None:
    row = fetch_attachment_row(connection, request_id)
    if row is None:
        return None

    return RequestAttachmentResponse(
        id=row["id"],
        original_filename=row["original_filename"],
        content_type=row["content_type"],
        file_size=row["file_size"],
        uploaded_at=row["uploaded_at"],
    )


def _content_disposition(filename: str, *, download: bool) -> str:
    ascii_fallback = (
        filename.encode("ascii", "replace").decode("ascii").replace("?", "_")
    ).replace("\\", "_")
    disposition = "attachment" if download else "inline"
    return (
        f'{disposition}; filename="{ascii_fallback}"; '
        f"filename*=UTF-8''{quote(filename)}"
    )


def build_attachment_response(
    row: dict[str, object] | None,
    *,
    download: bool = False,
    subdir: str = REQUEST_ATTACHMENTS_SUBDIR,
    not_found_detail: str = "Attachment was not found.",
) -> FileResponse:
    """Stream a stored image, or 404 when the row or file is missing.

    ``row`` needs ``stored_filename``, ``content_type`` and
    ``original_filename``.
    """
    path = resolve_stored_path(str(row["stored_filename"]), subdir) if row else None

    if row is None or path is None:
        if row is not None:
            logger.error(
                "Stored image %s is missing on disk (%s)",
                row["stored_filename"],
                subdir,
            )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=not_found_detail,
        )

    return FileResponse(
        path,
        media_type=str(row["content_type"]),
        headers={
            "Content-Disposition": _content_disposition(
                str(row["original_filename"]), download=download
            ),
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "Cache-Control": "private, no-store",
        },
    )
