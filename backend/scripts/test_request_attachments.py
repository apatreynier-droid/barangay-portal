r"""End-to-end checks for document request image attachments.

Runs against the backend on https://localhost:8000 (start it first with run_https.py) and the
configured MySQL database:

    cd backend
    .\.venv\Scripts\Activate.ps1
    python scripts\test_request_attachments.py

Covers: a resident submits a request with an image -> the file is stored on
disk and linked to the request ID in ``request_attachments`` -> the
administrator sees the metadata in the request details and downloads the exact
bytes -> another resident gets 404 / 403 -> requests without an image keep
working -> invalid uploads (wrong type, too large, empty, missing) are rejected
without creating a request -> a brand-new backend process still serves the
image (persistence across restarts) -> deleting a pending request removes its
image.

Everything this run creates (probe residents, their requests, attachment rows
and files, notifications, activity logs) is removed at the end.
"""

from __future__ import annotations

import base64
import json
import os
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
import zlib
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.attachments import (  # noqa: E402
    STORED_FILENAME_PATTERN,
    request_attachments_dir,
)
from app.config import settings  # noqa: E402
from app.database import create_connection  # noqa: E402

# The dev server runs over HTTPS (run_https.py). Override with API_BASE_URL.
BASE_URL = os.getenv("API_BASE_URL", "https://localhost:8000").rstrip("/")
FRESH_PROCESS_PORT = 8011

ADMIN_EMAIL = "admin@barangaylagab.com"
ADMIN_PASSWORD = "Admin@123"

RESIDENT_A_EMAIL = "attachment-probe-a@example.com"
RESIDENT_B_EMAIL = "attachment-probe-b@example.com"
RESIDENT_PASSWORD = "ProbeResident123!"

# Smallest valid lossless WebP (1x1 pixel).
WEBP_1X1 = base64.b64decode("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==")

failures: list[str] = []


def check(condition: bool, message: str) -> None:
    print(f"  [{'PASS' if condition else 'FAIL'}] {message}")
    if not condition:
        failures.append(message)


# ----------------------------------------------------------------- HTTP helpers


def http(
    path: str,
    *,
    method: str = "GET",
    data: bytes | None = None,
    headers: dict[str, str] | None = None,
    token: str | None = None,
    base_url: str = BASE_URL,
) -> tuple[int, dict[str, str], bytes]:
    """Return ``(status, headers, raw_body)``; never raises on HTTP errors."""
    all_headers = dict(headers or {})
    if token:
        all_headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(
        f"{base_url}{path}", data=data, headers=all_headers, method=method
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers), error.read()


def request_json(
    path: str,
    *,
    method: str = "GET",
    body: dict[str, Any] | None = None,
    token: str | None = None,
) -> tuple[int, Any]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    status, _, raw = http(
        path,
        method=method,
        data=data,
        headers={"Content-Type": "application/json"},
        token=token,
    )
    try:
        return status, (json.loads(raw) if raw else None)
    except json.JSONDecodeError:
        return status, raw.decode("utf-8", "replace")


def submit_with_attachment(
    token: str,
    document_type_id: int,
    purpose: str,
    file: tuple[str, bytes, str] | None,
) -> tuple[int, Any]:
    """POST /api/requests/with-attachment as multipart/form-data."""
    boundary = uuid.uuid4().hex
    parts: list[bytes] = []
    for name, value in (("document_type_id", str(document_type_id)), ("purpose", purpose)):
        parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n'
            f"{value}\r\n".encode("utf-8")
        )
    if file is not None:
        filename, content, content_type = file
        parts.append(
            (
                f"--{boundary}\r\nContent-Disposition: form-data; "
                f'name="attachment"; filename="{filename}"\r\n'
                f"Content-Type: {content_type}\r\n\r\n"
            ).encode("utf-8")
            + content
            + b"\r\n"
        )
    parts.append(f"--{boundary}--\r\n".encode("utf-8"))

    status, _, raw = http(
        "/api/requests/with-attachment",
        method="POST",
        data=b"".join(parts),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        token=token,
    )
    try:
        return status, json.loads(raw) if raw else None
    except json.JSONDecodeError:
        return status, raw.decode("utf-8", "replace")


def login(email: str, password: str) -> tuple[int, Any]:
    return request_json(
        "/api/auth/login", method="POST", body={"email": email, "password": password}
    )


# ------------------------------------------------------------------ test data


def make_png(width: int = 64, height: int = 48) -> bytes:
    """A real (viewable) PNG gradient, built without third-party libraries."""

    def chunk(kind: bytes, payload: bytes) -> bytes:
        return (
            struct.pack(">I", len(payload))
            + kind
            + payload
            + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
        )

    rows = b"".join(
        b"\x00"
        + b"".join(
            bytes((x * 255 // width, y * 255 // height, 160)) for x in range(width)
        )
        for y in range(height)
    )
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(rows))
        + chunk(b"IEND", b"")
    )


# ---------------------------------------------------------------- DB helpers


def db_query(sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    connection = create_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(sql, params)
        rows = cursor.fetchall()
        cursor.close()
        return rows
    finally:
        connection.close()


def table_watermark(table: str) -> int:
    return int(db_query(f"SELECT COALESCE(MAX(id), 0) AS v FROM {table}")[0]["v"])


def request_count(email: str) -> int:
    return int(
        db_query(
            """
            SELECT COUNT(*) AS v FROM requests
            JOIN users ON users.id = requests.user_id WHERE users.email = %s
            """,
            (email,),
        )[0]["v"]
    )


def stored_files() -> set[str]:
    return {path.name for path in request_attachments_dir().iterdir() if path.is_file()}


def remove_probe_accounts() -> None:
    """Delete probe files first (rows only cascade), then the accounts."""
    rows = db_query(
        """
        SELECT request_attachments.stored_filename
        FROM request_attachments
        JOIN requests ON requests.id = request_attachments.request_id
        JOIN users ON users.id = requests.user_id
        WHERE users.email IN (%s, %s)
        """,
        (RESIDENT_A_EMAIL, RESIDENT_B_EMAIL),
    )
    for row in rows:
        if STORED_FILENAME_PATTERN.fullmatch(row["stored_filename"]):
            (request_attachments_dir() / row["stored_filename"]).unlink(missing_ok=True)

    connection = create_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(
            "DELETE FROM users WHERE email IN (%s, %s)",
            (RESIDENT_A_EMAIL, RESIDENT_B_EMAIL),
        )
        connection.commit()
        cursor.close()
    finally:
        connection.close()


def remove_run_rows(log_watermark: int, notification_watermark: int) -> None:
    connection = create_connection()
    try:
        cursor = connection.cursor()
        cursor.execute("DELETE FROM activity_logs WHERE id > %s", (log_watermark,))
        cursor.execute("DELETE FROM notifications WHERE id > %s", (notification_watermark,))
        connection.commit()
        cursor.close()
    finally:
        connection.close()


def create_resident(admin_token: str, email: str, last_name: str) -> str | None:
    status, registered = request_json(
        "/api/auth/register",
        method="POST",
        body={
            "first_name": "Attachment",
            "last_name": last_name,
            "email": email,
            "password": RESIDENT_PASSWORD,
            "phone": "+639000000000",
            "address": "1 Probe Street, Purok 1",
        },
    )
    check(status == 201, f"{email} registers (got {status})")
    if status != 201:
        return None
    resident_id = int(registered["reference_number"].split("-")[1])
    status, _ = request_json(
        f"/api/admin/registrations/{resident_id}/approve", method="POST", token=admin_token
    )
    check(status == 200, f"administrator approves {email} (got {status})")
    status, auth = login(email, RESIDENT_PASSWORD)
    check(status == 200, f"{email} signs in (got {status})")
    return auth["access_token"] if status == 200 else None


# ----------------------------------------------------------- fresh process


def fetch_from_fresh_process(admin_token: str, request_id: int) -> tuple[int, bytes]:
    """Start a brand-new backend process and fetch the attachment from it."""
    process = subprocess.Popen(
        [
            sys.executable, "-m", "uvicorn", "app.main:app",
            "--port", str(FRESH_PROCESS_PORT), "--log-level", "warning",
        ],
        cwd=BACKEND_DIR,
        env={**os.environ, "REGISTRATION_EMAIL_WORKER_INTERVAL_SECONDS": "0"},
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    base_url = f"http://127.0.0.1:{FRESH_PROCESS_PORT}"
    try:
        for _ in range(60):
            try:
                status, _, _ = http("/api/health", base_url=base_url)
                if status == 200:
                    break
            except urllib.error.URLError:
                pass
            time.sleep(0.5)
        status, _, body = http(
            f"/api/admin/document-requests/{request_id}/attachment",
            token=admin_token,
            base_url=base_url,
        )
        return status, body
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()


# ----------------------------------------------------------------------- main


def main() -> None:
    print("Document request attachment checks")
    log_watermark = table_watermark("activity_logs")
    notification_watermark = table_watermark("notifications")
    remove_probe_accounts()  # leftovers from an interrupted earlier run
    files_before = stored_files()

    try:
        run_checks()
    finally:
        remove_probe_accounts()
        remove_run_rows(log_watermark, notification_watermark)
        check(stored_files() == files_before, "cleanup left no probe files on disk")

    print()
    if failures:
        print(f"{len(failures)} check(s) FAILED:")
        for failure in failures:
            print(f"  - {failure}")
        sys.exit(1)
    print("All attachment checks passed.")


def run_checks() -> None:
    status, admin_auth = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    check(status == 200, "administrator signs in")
    if status != 200:
        return
    admin_token = admin_auth["access_token"]

    token_a = create_resident(admin_token, RESIDENT_A_EMAIL, "Probe A")
    token_b = create_resident(admin_token, RESIDENT_B_EMAIL, "Probe B")
    if not token_a or not token_b:
        return

    status, document_types = request_json("/api/document-types", token=token_a)
    check(status == 200 and bool(document_types), "document types load")
    document_type_id = int(document_types[0]["id"])

    # 1-3. Resident submits with an image; stored and linked to the request ID.
    print("\n Upload and storage")
    png = make_png()
    status, created = submit_with_attachment(
        token_a,
        document_type_id,
        "Attachment probe: valid PNG",
        ("C:\\fakepath\\barangay id.png", png, "image/png"),
    )
    check(status == 201, f"resident submits a request with a PNG (got {status})")
    if status != 201:
        return
    request_id = int(created["id"])
    check(created["status"] == "Pending", "new request keeps the normal 'Pending' status")

    rows = db_query(
        "SELECT * FROM request_attachments WHERE request_id = %s", (request_id,)
    )
    check(len(rows) == 1, "exactly one request_attachments row has this request ID")
    row = rows[0] if rows else {}
    check(
        bool(STORED_FILENAME_PATTERN.fullmatch(row.get("stored_filename", ""))),
        f"stored under a generated safe name ({row.get('stored_filename')})",
    )
    check(
        row.get("original_filename") == "barangay id.png",
        "client path is stripped from the original filename",
    )
    check(row.get("content_type") == "image/png", "content type detected as image/png")
    check(row.get("file_size") == len(png), "file size recorded")
    stored_path = settings.upload_dir / "request_attachments" / row.get("stored_filename", "-")
    check(stored_path.is_file(), "the file exists in the persistent upload folder")
    check(
        stored_path.is_file() and stored_path.read_bytes() == png,
        "stored bytes are identical to the upload",
    )

    # 4-7. Administrator sees the exact image in the request details.
    print("\n Administrator view")
    status, detail = request_json(
        f"/api/admin/document-requests/{request_id}", token=admin_token
    )
    attachment = (detail or {}).get("attachment") if status == 200 else None
    check(status == 200 and attachment is not None, "request details include the attachment")
    check(
        bool(attachment)
        and attachment["original_filename"] == "barangay id.png"
        and attachment["file_size"] == len(png)
        and attachment["content_type"] == "image/png"
        and bool(attachment["uploaded_at"]),
        "attachment metadata (filename, size, type, upload date) is correct",
    )

    status, headers, body = http(
        f"/api/admin/document-requests/{request_id}/attachment", token=admin_token
    )
    check(status == 200 and body == png, "administrator downloads the exact original bytes")
    check(headers.get("content-type") == "image/png", "served as image/png")
    check(headers.get("x-content-type-options") == "nosniff", "served with nosniff")
    check("sandbox" in headers.get("content-security-policy", ""), "served with a sandbox CSP")
    check("no-store" in headers.get("cache-control", ""), "not stored by shared caches")
    check(
        headers.get("content-disposition", "").startswith("inline"),
        "default disposition is inline (for the preview)",
    )
    status, headers, _ = http(
        f"/api/admin/document-requests/{request_id}/attachment?download=true",
        token=admin_token,
    )
    check(
        status == 200
        and headers.get("content-disposition", "").startswith("attachment")
        and "barangay%20id.png" in headers.get("content-disposition", ""),
        "?download=true answers as a download with the original filename",
    )

    # 10. Still accessible after logging out and back in.
    request_json("/api/auth/logout", method="POST", token=admin_token)
    status, _, _ = http(
        f"/api/admin/document-requests/{request_id}/attachment", token=admin_token
    )
    check(status == 401, "a logged-out token can no longer fetch the image")
    status, admin_auth = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    admin_token = admin_auth["access_token"]
    status, _, body = http(
        f"/api/admin/document-requests/{request_id}/attachment", token=admin_token
    )
    check(status == 200 and body == png, "after signing in again the image is still served")

    # Persistence across backend restarts: a brand-new process serves it.
    status, body = fetch_from_fresh_process(admin_token, request_id)
    check(status == 200 and body == png, "a freshly started backend process serves the image")

    # Status changes keep the attachment.
    status, updated = request_json(
        f"/api/admin/document-requests/{request_id}",
        method="PATCH",
        token=admin_token,
        body={"status": "Approved"},
    )
    check(
        status == 200 and (updated or {}).get("attachment", {}).get("id") == row.get("id"),
        f"approving the request keeps its attachment (got {status})",
    )

    # Authorization.
    print("\n Access control")
    status, _, body = http(f"/api/requests/{request_id}/attachment", token=token_a)
    check(status == 200 and body == png, "the owner resident can fetch their own image")
    status, _, _ = http(f"/api/requests/{request_id}/attachment", token=token_b)
    check(status == 404, f"another resident gets 404 for it (got {status})")
    status, _, _ = http(
        f"/api/admin/document-requests/{request_id}/attachment", token=token_b
    )
    check(status == 403, f"a resident cannot use the admin endpoint (got {status})")
    status, _, _ = http(f"/api/admin/document-requests/{request_id}/attachment")
    check(status == 401, f"unauthenticated access is refused (got {status})")
    status, detail_b = request_json(f"/api/requests/{request_id}", token=token_b)
    check(status == 404, "another resident cannot open the request either")

    # 11a. Requests without attachments keep working.
    print("\n Requests without an attachment")
    status, plain = request_json(
        "/api/requests",
        method="POST",
        token=token_b,
        body={"document_type_id": document_type_id, "purpose": "Attachment probe: no image"},
    )
    check(status == 201, f"the JSON endpoint still creates requests (got {status})")
    plain_id = int(plain["id"])
    status, detail = request_json(
        f"/api/admin/document-requests/{plain_id}", token=admin_token
    )
    check(status == 200 and detail.get("attachment") is None, "its details report no attachment")
    status, _, _ = http(
        f"/api/admin/document-requests/{plain_id}/attachment", token=admin_token
    )
    check(status == 404, "its attachment endpoint answers 404")
    status, _, _ = http(f"/api/requests/{plain_id}/attachment", token=token_b)
    check(status == 404, "the owner also gets 404 (nothing attached)")

    # 11b. Invalid uploads are rejected and create nothing.
    print("\n Invalid uploads")
    count_before = request_count(RESIDENT_A_EMAIL)
    files_before = stored_files()
    invalid_cases = [
        ("text renamed to .png", ("notes.png", b"hello, this is text", "image/png"), 415),
        ("GIF image", ("anim.gif", b"GIF89a" + b"\x00" * 64, "image/gif"), 415),
        ("HTML disguised as JPG", ("x.jpg", b"<html><script>alert(1)</script>", "image/jpeg"), 415),
        ("SVG image", ("logo.svg", b"<svg xmlns='http://www.w3.org/2000/svg'/>", "image/svg+xml"), 415),
        ("empty file", ("empty.png", b"", "image/png"), 422),
        (
            "image over the size limit",
            ("big.png", png[:16] + b"\x00" * settings.request_attachment_max_bytes, "image/png"),
            413,
        ),
        ("missing attachment field", None, 422),
    ]
    for label, file, expected in invalid_cases:
        status, body = submit_with_attachment(
            token_a, document_type_id, "Attachment probe: invalid", file
        )
        check(status == expected, f"{label} is rejected with {expected} (got {status})")
    status, _ = submit_with_attachment(
        token_a, document_type_id, "   ", ("ok.png", png, "image/png")
    )
    check(status == 422, f"a blank purpose is rejected (got {status})")
    check(request_count(RESIDENT_A_EMAIL) == count_before, "rejected uploads created no request")
    check(stored_files() == files_before, "rejected uploads left no file on disk")

    # Other accepted formats.
    status, created_webp = submit_with_attachment(
        token_a, document_type_id, "Attachment probe: WebP", ("photo.webp", WEBP_1X1, "image/webp")
    )
    check(status == 201, f"a WebP image is accepted (got {status})")
    webp_id = int(created_webp["id"]) if status == 201 else 0
    status, headers, body = http(
        f"/api/admin/document-requests/{webp_id}/attachment", token=admin_token
    )
    check(
        status == 200 and body == WEBP_1X1 and headers.get("content-type") == "image/webp",
        "the WebP is served back unchanged as image/webp",
    )

    # Each request shows only its own image.
    status, _, body = http(
        f"/api/admin/document-requests/{request_id}/attachment", token=admin_token
    )
    check(body == png, "the first request still shows its own PNG, not the WebP")

    # Deleting a pending request removes its attachment row and file.
    print("\n Deleting a request")
    webp_row = db_query(
        "SELECT stored_filename FROM request_attachments WHERE request_id = %s", (webp_id,)
    )
    webp_path = request_attachments_dir() / (webp_row[0]["stored_filename"] if webp_row else "-")
    status, _ = request_json(f"/api/requests/{webp_id}", method="DELETE", token=token_a)
    check(status == 204, f"the resident deletes the pending WebP request (got {status})")
    check(
        not db_query("SELECT id FROM request_attachments WHERE request_id = %s", (webp_id,)),
        "its attachment row is removed",
    )
    check(not webp_path.exists(), "its file is removed from disk")


if __name__ == "__main__":
    main()
