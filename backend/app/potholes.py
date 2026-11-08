"""Pothole reports: resident submissions and their administration.

Residents submit via ``POST /api/pothole-reports`` (multipart photo +
location); admins review via ``GET /api/admin/pothole-reports``. Reports are
stored as submitted: no image processing or automatic detection.

Location: coordinates are optional. ``location_source`` is ``gps`` (with
accuracy in metres) or ``manual`` (a map pin, no accuracy). Reports without
coordinates are listed but not mapped.

Storage: photos reuse ``app.attachments`` (magic-byte validation, random
names, authenticated streaming) under ``uploads/pothole_reports``.

Access: residents see only their own reports. Admin Portal roles see all
reports; verifying/rejecting is reserved for administrators, while Staff may
record repair progress (under maintenance, resolved).
"""

from __future__ import annotations

import hashlib
import logging
import math
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Literal

import mysql.connector
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from mysql.connector import MySQLConnection

from .activity_logs import record_activity_log
from .attachments import (
    TABLE_MISSING_ERROR,
    build_attachment_response,
    delete_stored_file,
    read_validated_image,
    store_image_file,
    upload_subdir,
)
from .config import settings
from .database import get_db
from .dependencies import (
    ADMINISTRATOR_ROLES,
    get_current_admin_portal_user,
    get_current_user,
)
from .notifications import (
    action_time_bucket,
    build_dedupe_key,
    create_notification,
    notify_admins,
)
from .puroks import STANDARDIZED_PUROKS, validate_purok
from .rate_limit import get_client_ip
from .schemas import (
    AdminPotholeRemarkInput,
    AdminPotholeReportDetailResponse,
    AdminPotholeReportResponse,
    AdminPotholeStatusCounts,
    AdminPotholeStatusInput,
    AdminPotholeSummaryResponse,
    AdminPotholeUpdateEntry,
    AdminPurokCount,
    PotholePhotoMeta,
    ResidentPotholeReportResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()

#: Sub-folder of ``settings.upload_dir`` that holds the report photos.
POTHOLE_PHOTOS_SUBDIR = "pothole_reports"

#: Philippine time: the admin's date filters are calendar days in Manila.
MANILA_TIMEZONE = timezone(timedelta(hours=8))

STATUS_LABELS = {
    "pending": "Pending",
    "verified": "Verified",
    "under_maintenance": "Under Maintenance",
    "resolved": "Resolved",
    "rejected": "Rejected",
}

#: Status workflow. Resolved and rejected reports are closed.
ALLOWED_TRANSITIONS: dict[str, frozenset[str]] = {
    "pending": frozenset({"verified", "rejected"}),
    "verified": frozenset({"under_maintenance", "rejected"}),
    "under_maintenance": frozenset({"resolved"}),
    "resolved": frozenset(),
    "rejected": frozenset(),
}

#: Statuses a Staff account may set (repair progress). Verifying or rejecting
#: a resident's report stays with the administrator roles.
STAFF_PERMITTED_STATUSES = frozenset({"under_maintenance", "resolved"})

MAX_LOCATION_LENGTH = 255
MAX_ROAD_LENGTH = 150
MAX_NOTES_LENGTH = 1000
#: Anything worse than this is not a usable position (it is not stored).
MAX_ACCEPTED_ACCURACY_M = 100_000


def pothole_photos_dir() -> Path:
    return upload_subdir(POTHOLE_PHOTOS_SUBDIR)


# --------------------------------------------------------------------------- #
#  Helpers                                                                    #
# --------------------------------------------------------------------------- #


@contextmanager
def pothole_db_errors(action: str) -> Iterator[None]:
    """Turn database errors into clear HTTP errors.

    A missing table means migration 012 has not been applied yet; say so
    instead of failing with a bare 500.
    """
    try:
        yield
    except mysql.connector.Error as error:
        if error.errno == TABLE_MISSING_ERROR:
            logger.error(
                "pothole_reports table is missing; run "
                "scripts/apply_pothole_reports_migration.py"
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "Pothole reports are not set up on the server yet "
                    "(database migration 012 is missing)."
                ),
            ) from error
        logger.exception("Database error while trying to %s", action)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not {action}.",
        ) from error


def _clean_text(value: str | None, max_length: int, field: str) -> str | None:
    if value is None:
        return None
    stripped = " ".join(value.split()) if field != "notes" else value.strip()
    if not stripped:
        return None
    if len(stripped) > max_length:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"The {field.replace('_', ' ')} must be {max_length} characters or fewer.",
        )
    return stripped


def _invalid_location(message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=message)


def validate_coordinates(
    latitude: float | None,
    longitude: float | None,
    gps_accuracy_m: float | None,
    location_source: str | None,
    location_captured_at: datetime | None,
) -> tuple[float | None, float | None, float | None, str | None, datetime | None]:
    """Return the values to store, or raise 422.

    Coordinates are all-or-nothing and must say where they came from; a
    manual pin never carries a GPS accuracy or capture time.
    """
    if latitude is None and longitude is None:
        # No position: nothing location-related may be stored.
        return None, None, None, None, None

    if latitude is None or longitude is None:
        raise _invalid_location("Both latitude and longitude are required.")
    if not (math.isfinite(latitude) and math.isfinite(longitude)):
        raise _invalid_location("The coordinates are not valid numbers.")
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        raise _invalid_location("The coordinates are out of range.")
    if latitude == 0 and longitude == 0:
        # 0,0 is what some devices report when they have no fix at all.
        raise _invalid_location("The device did not return a real position.")
    if location_source not in ("gps", "manual"):
        raise _invalid_location(
            "Say whether the coordinates came from GPS or a map pin."
        )

    if location_source == "manual":
        return round(latitude, 7), round(longitude, 7), None, "manual", None

    accuracy: float | None = None
    if gps_accuracy_m is not None:
        if not math.isfinite(gps_accuracy_m) or gps_accuracy_m < 0:
            raise _invalid_location("The GPS accuracy is not valid.")
        if gps_accuracy_m > MAX_ACCEPTED_ACCURACY_M:
            raise _invalid_location(
                "The GPS reading is too inaccurate to locate the pothole."
            )
        accuracy = round(gps_accuracy_m, 2)

    captured_at: datetime | None = None
    if location_captured_at is not None:
        aware = (
            location_captured_at
            if location_captured_at.tzinfo is not None
            else location_captured_at.replace(tzinfo=timezone.utc)
        )
        captured_utc = aware.astimezone(timezone.utc)
        # A wrong device clock must not produce a fix "from the future".
        if captured_utc <= datetime.now(timezone.utc) + timedelta(minutes=5):
            captured_at = captured_utc.replace(tzinfo=None)

    return round(latitude, 7), round(longitude, 7), accuracy, "gps", captured_at


def _manila_day_start_utc(day: date) -> datetime:
    """Start of a Manila calendar day as a naive UTC timestamp (DB time)."""
    return (
        datetime.combine(day, time.min, tzinfo=MANILA_TIMEZONE)
        .astimezone(timezone.utc)
        .replace(tzinfo=None)
    )


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _location_summary(row: dict[str, object]) -> str:
    parts = [row.get("location_description"), row.get("road_name"), row.get("purok")]
    seen: list[str] = []
    for part in parts:
        if part and part not in seen:
            seen.append(str(part))
    return ", ".join(seen)


ADMIN_REPORT_SELECT = """
    SELECT pothole_reports.id, pothole_reports.report_number,
           pothole_reports.purok, pothole_reports.road_name,
           pothole_reports.location_description, pothole_reports.notes,
           pothole_reports.latitude, pothole_reports.longitude,
           pothole_reports.gps_accuracy_m, pothole_reports.location_source,
           pothole_reports.location_captured_at, pothole_reports.status,
           pothole_reports.reported_at, pothole_reports.updated_at,
           pothole_reports.photo_original_filename,
           pothole_reports.photo_content_type,
           pothole_reports.photo_file_size,
           TRIM(CONCAT(resident_profiles.first_name, ' ',
                       resident_profiles.last_name)) AS resident_name,
           resident_profiles.contact_number AS resident_contact,
           resident_profiles.address AS resident_address
    FROM pothole_reports
    JOIN resident_profiles ON resident_profiles.user_id = pothole_reports.user_id
"""


def admin_report_response(row: dict[str, object]) -> AdminPotholeReportResponse:
    return AdminPotholeReportResponse(
        id=row["id"],
        report_number=row["report_number"],
        resident_name=row["resident_name"],
        resident_contact=row["resident_contact"] or None,
        resident_address=row["resident_address"] or None,
        purok=row["purok"],
        road_name=row["road_name"],
        location_description=row["location_description"],
        notes=row["notes"],
        latitude=row["latitude"],
        longitude=row["longitude"],
        gps_accuracy_m=row["gps_accuracy_m"],
        location_source=row["location_source"],
        location_captured_at=row["location_captured_at"],
        status=row["status"],
        reported_at=row["reported_at"],
        updated_at=row["updated_at"],
        photo=PotholePhotoMeta(
            original_filename=row["photo_original_filename"],
            content_type=row["photo_content_type"],
            file_size=row["photo_file_size"],
        ),
    )


def load_admin_report_detail(
    connection: MySQLConnection, report_id: int
) -> AdminPotholeReportDetailResponse:
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(f"{ADMIN_REPORT_SELECT} WHERE pothole_reports.id = %s", (report_id,))
        row = cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Pothole report was not found.")

        cursor.execute(
            """
            SELECT pothole_report_updates.id, pothole_report_updates.old_status,
                   pothole_report_updates.new_status, pothole_report_updates.remark,
                   pothole_report_updates.created_at,
                   NULLIF(TRIM(CONCAT(COALESCE(resident_profiles.first_name, ''), ' ',
                                      COALESCE(resident_profiles.last_name, ''))), '')
                     AS changed_by_name,
                   users.role AS changed_by_role
            FROM pothole_report_updates
            LEFT JOIN users ON users.id = pothole_report_updates.changed_by
            LEFT JOIN resident_profiles
                   ON resident_profiles.user_id = pothole_report_updates.changed_by
            WHERE pothole_report_updates.report_id = %s
            ORDER BY pothole_report_updates.created_at ASC, pothole_report_updates.id ASC
            """,
            (report_id,),
        )
        history = cursor.fetchall()
    finally:
        cursor.close()

    base = admin_report_response(row)
    return AdminPotholeReportDetailResponse(
        **base.model_dump(),
        history=[AdminPotholeUpdateEntry(**entry) for entry in history],
    )


# --------------------------------------------------------------------------- #
#  Resident endpoints                                                         #
# --------------------------------------------------------------------------- #


def require_resident(
    current_user: dict[str, object] = Depends(get_current_user),
) -> dict[str, object]:
    """Pothole reports are filed from the Resident Portal only."""
    if current_user.get("role") != "resident":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only resident accounts can submit pothole reports.",
        )
    return current_user


RESIDENT_REPORT_SELECT = """
    SELECT pothole_reports.id, pothole_reports.report_number,
           pothole_reports.purok, pothole_reports.road_name,
           pothole_reports.location_description, pothole_reports.notes,
           pothole_reports.latitude, pothole_reports.longitude,
           pothole_reports.gps_accuracy_m, pothole_reports.location_source,
           pothole_reports.location_captured_at, pothole_reports.status,
           pothole_reports.reported_at, pothole_reports.updated_at,
           (SELECT updates.remark
            FROM pothole_report_updates updates
            WHERE updates.report_id = pothole_reports.id
              AND updates.old_status IS NOT NULL
              AND updates.new_status = pothole_reports.status
            ORDER BY updates.id DESC
            LIMIT 1) AS status_remark
    FROM pothole_reports
"""


@router.post(
    "/api/pothole-reports",
    response_model=ResidentPotholeReportResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_pothole_report(
    request: Request,
    photo: UploadFile = File(),
    location_description: str = Form(min_length=1, max_length=MAX_LOCATION_LENGTH),
    purok: str | None = Form(default=None),
    road_name: str | None = Form(default=None),
    notes: str | None = Form(default=None),
    latitude: float | None = Form(default=None),
    longitude: float | None = Form(default=None),
    gps_accuracy_m: float | None = Form(default=None),
    location_source: Literal["gps", "manual"] | None = Form(default=None),
    location_captured_at: datetime | None = Form(default=None),
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(require_resident),
) -> ResidentPotholeReportResponse:
    """A resident submits a pothole photo and where it is (multipart).

    The row and the stored photo are created atomically: if anything fails,
    neither is kept.
    """
    location_text = _clean_text(location_description, MAX_LOCATION_LENGTH, "location")
    if location_text is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Please describe where the pothole is.",
        )
    road = _clean_text(road_name, MAX_ROAD_LENGTH, "road_name")
    note_text = _clean_text(notes, MAX_NOTES_LENGTH, "notes")
    try:
        purok_value = validate_purok(purok)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Please choose a Purok from the list.",
        ) from error

    lat, lng, accuracy, source, captured_at = validate_coordinates(
        latitude, longitude, gps_accuracy_m, location_source, location_captured_at
    )
    image = read_validated_image(photo, settings.pothole_photo_max_bytes)

    stored_filename: str | None = None
    cursor = connection.cursor(dictionary=True)
    try:
        with pothole_db_errors("save the pothole report"):
            stored_filename = store_image_file(image, POTHOLE_PHOTOS_SUBDIR)
            cursor.execute(
                """
                INSERT INTO pothole_reports
                  (report_number, user_id, purok, road_name, location_description,
                   notes, latitude, longitude, gps_accuracy_m, location_source,
                   location_captured_at, status, photo_original_filename,
                   photo_stored_filename, photo_content_type, photo_file_size)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending',
                        %s, %s, %s, %s)
                """,
                (
                    f"TEMP-{stored_filename[:24]}",
                    current_user["id"],
                    purok_value,
                    road,
                    location_text,
                    note_text,
                    lat,
                    lng,
                    accuracy,
                    source,
                    captured_at,
                    image.original_filename,
                    stored_filename,
                    image.content_type,
                    image.size,
                ),
            )
            report_id = cursor.lastrowid
            report_number = f"PH-{datetime.now(timezone.utc).year}-{report_id:06d}"
            cursor.execute(
                "UPDATE pothole_reports SET report_number = %s WHERE id = %s",
                (report_number, report_id),
            )
            cursor.execute(
                """
                INSERT INTO pothole_report_updates
                  (report_id, changed_by, old_status, new_status)
                VALUES (%s, %s, NULL, 'pending')
                """,
                (report_id, current_user["id"]),
            )
            place = _location_summary(
                {"location_description": location_text, "road_name": road, "purok": purok_value}
            )
            create_notification(
                connection,
                user_id=int(current_user["id"]),
                title="Pothole report received",
                message=(
                    f"Your pothole report {report_number} ({place}) was sent. "
                    "Barangay staff will review it."
                ),
                dedupe_key=build_dedupe_key("pothole-received", report_id),
            )
            # Same transaction as the report: a rollback also discards the notification.
            notify_admins(
                connection,
                title="New pothole report",
                message=(
                    f"{current_user['first_name']} {current_user['last_name']} "
                    f"reported a pothole at {place} ({report_number}). "
                    + (
                        "GPS location included."
                        if source == "gps"
                        else "Location pinned on the map."
                        if source == "manual"
                        else "No map location was captured."
                    )
                ),
                dedupe_key=build_dedupe_key(
                    "pothole-submitted",
                    current_user["id"],
                    hashlib.sha1(image.data).hexdigest(),
                    action_time_bucket(),
                ),
            )
            connection.commit()
    except Exception as error:
        # Nothing is kept from a failed submission: no row, no photo file.
        try:
            connection.rollback()
        finally:
            delete_stored_file(stored_filename, POTHOLE_PHOTOS_SUBDIR)
            cursor.close()
        if isinstance(error, OSError):
            logger.exception("Could not store a pothole report photo")
            raise HTTPException(
                status_code=500, detail="Could not save the photo. Please try again."
            ) from error
        raise

    cursor.execute(f"{RESIDENT_REPORT_SELECT} WHERE pothole_reports.id = %s", (report_id,))
    row = cursor.fetchone()
    cursor.close()

    record_activity_log(
        connection,
        user_id=int(current_user["id"]),
        action_type="Create",
        action="submitted a pothole report",
        target=f"{report_number} ({place})",
        target_type="Pothole Report",
        ip_address=get_client_ip(request),
    )

    return ResidentPotholeReportResponse(**row)


@router.get(
    "/api/pothole-reports", response_model=list[ResidentPotholeReportResponse]
)
def list_my_pothole_reports(
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(require_resident),
) -> list[ResidentPotholeReportResponse]:
    """The signed-in resident's own reports only."""
    cursor = connection.cursor(dictionary=True)
    try:
        with pothole_db_errors("load your pothole reports"):
            cursor.execute(
                f"""{RESIDENT_REPORT_SELECT}
                WHERE pothole_reports.user_id = %s
                ORDER BY pothole_reports.reported_at DESC, pothole_reports.id DESC
                """,
                (current_user["id"],),
            )
            rows = cursor.fetchall()
    finally:
        cursor.close()
    return [ResidentPotholeReportResponse(**row) for row in rows]


# --------------------------------------------------------------------------- #
#  Admin Portal endpoints                                                     #
# --------------------------------------------------------------------------- #


@router.get(
    "/api/admin/pothole-reports", response_model=list[AdminPotholeReportResponse]
)
def list_pothole_reports(
    search: str | None = Query(default=None, max_length=100),
    purok: str | None = Query(
        default=None, description='A standardized Purok, or "unspecified".'
    ),
    report_status: Literal[
        "pending", "verified", "under_maintenance", "resolved", "rejected"
    ]
    | None = Query(default=None, alias="status"),
    date_from: date | None = Query(default=None, description="Manila calendar day."),
    date_to: date | None = Query(default=None, description="Manila calendar day."),
    connection: MySQLConnection = Depends(get_db),
    _: dict[str, object] = Depends(get_current_admin_portal_user),
) -> list[AdminPotholeReportResponse]:
    """Every resident's reports, newest first, with optional filters."""
    conditions: list[str] = []
    params: list[object] = []

    term = (search or "").strip()
    if term:
        like = f"%{_escape_like(term)}%"
        conditions.append(
            """(pothole_reports.report_number LIKE %s
                OR CONCAT(resident_profiles.first_name, ' ', resident_profiles.last_name) LIKE %s
                OR pothole_reports.road_name LIKE %s
                OR pothole_reports.location_description LIKE %s
                OR pothole_reports.purok LIKE %s)"""
        )
        params.extend([like] * 5)

    if purok:
        if purok == "unspecified":
            conditions.append("pothole_reports.purok IS NULL")
        elif purok in STANDARDIZED_PUROKS:
            conditions.append("pothole_reports.purok = %s")
            params.append(purok)
        else:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Unknown Purok filter.",
            )

    if report_status:
        conditions.append("pothole_reports.status = %s")
        params.append(report_status)
    if date_from:
        conditions.append("pothole_reports.reported_at >= %s")
        params.append(_manila_day_start_utc(date_from))
    if date_to:
        conditions.append("pothole_reports.reported_at < %s")
        params.append(_manila_day_start_utc(date_to + timedelta(days=1)))

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    cursor = connection.cursor(dictionary=True)
    try:
        with pothole_db_errors("load the pothole reports"):
            cursor.execute(
                f"""{ADMIN_REPORT_SELECT} {where}
                ORDER BY pothole_reports.reported_at DESC, pothole_reports.id DESC
                """,
                tuple(params),
            )
            rows = cursor.fetchall()
    finally:
        cursor.close()
    return [admin_report_response(row) for row in rows]


@router.get(
    "/api/admin/pothole-reports/summary",
    response_model=AdminPotholeSummaryResponse,
)
def pothole_reports_summary(
    connection: MySQLConnection = Depends(get_db),
    _: dict[str, object] = Depends(get_current_admin_portal_user),
) -> AdminPotholeSummaryResponse:
    """Dashboard statistics, counted in the database."""
    cursor = connection.cursor(dictionary=True)
    try:
        with pothole_db_errors("load the pothole statistics"):
            cursor.execute(
                "SELECT status, COUNT(*) AS total FROM pothole_reports GROUP BY status"
            )
            by_status = {row["status"]: int(row["total"]) for row in cursor.fetchall()}
            cursor.execute(
                "SELECT purok, COUNT(*) AS total FROM pothole_reports GROUP BY purok"
            )
            by_purok = {row["purok"]: int(row["total"]) for row in cursor.fetchall()}
            cursor.execute(
                """
                SELECT COUNT(*) AS total FROM pothole_reports
                WHERE latitude IS NOT NULL AND longitude IS NOT NULL
                """
            )
            with_coordinates = int(cursor.fetchone()["total"])
    finally:
        cursor.close()

    return AdminPotholeSummaryResponse(
        status_counts=AdminPotholeStatusCounts(
            total=sum(by_status.values()),
            pending=by_status.get("pending", 0),
            verified=by_status.get("verified", 0),
            under_maintenance=by_status.get("under_maintenance", 0),
            resolved=by_status.get("resolved", 0),
            rejected=by_status.get("rejected", 0),
        ),
        by_purok=[
            AdminPurokCount(purok=name, count=by_purok.get(name, 0))
            for name in STANDARDIZED_PUROKS
        ],
        unspecified_purok=by_purok.get(None, 0),
        with_coordinates=with_coordinates,
    )


@router.get(
    "/api/admin/pothole-reports/{report_id}",
    response_model=AdminPotholeReportDetailResponse,
)
def get_pothole_report(
    report_id: int,
    connection: MySQLConnection = Depends(get_db),
    _: dict[str, object] = Depends(get_current_admin_portal_user),
) -> AdminPotholeReportDetailResponse:
    with pothole_db_errors("load the pothole report"):
        return load_admin_report_detail(connection, report_id)


@router.get(
    "/api/admin/pothole-reports/{report_id}/photo", response_class=FileResponse
)
def get_pothole_report_photo(
    report_id: int,
    download: bool = False,
    connection: MySQLConnection = Depends(get_db),
    _: dict[str, object] = Depends(get_current_admin_portal_user),
) -> FileResponse:
    """The original photo exactly as the resident uploaded it."""
    cursor = connection.cursor(dictionary=True)
    try:
        with pothole_db_errors("load the photo"):
            cursor.execute(
                """
                SELECT id, photo_stored_filename AS stored_filename,
                       photo_content_type AS content_type,
                       photo_original_filename AS original_filename
                FROM pothole_reports WHERE id = %s
                """,
                (report_id,),
            )
            row = cursor.fetchone()
    finally:
        cursor.close()

    return build_attachment_response(
        row,
        download=download,
        subdir=POTHOLE_PHOTOS_SUBDIR,
        not_found_detail="The photo of this report was not found.",
    )


@router.patch(
    "/api/admin/pothole-reports/{report_id}/status",
    response_model=AdminPotholeReportDetailResponse,
)
def update_pothole_report_status(
    report_id: int,
    payload: AdminPotholeStatusInput,
    request: Request,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_portal_user),
) -> AdminPotholeReportDetailResponse:
    new_status = payload.status
    remark = (payload.remark or "").strip() or None

    if (
        current_user.get("role") not in ADMINISTRATOR_ROLES
        and new_status not in STAFF_PERMITTED_STATUSES
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an administrator can verify or reject a pothole report.",
        )
    if new_status == "rejected" and remark is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Please give the reason for rejecting this report.",
        )

    cursor = connection.cursor(dictionary=True)
    try:
        with pothole_db_errors("update the pothole report"):
            # Locked so two people acting at once cannot both move the report.
            cursor.execute(
                """
                SELECT id, user_id, report_number, status, location_description,
                       road_name, purok
                FROM pothole_reports WHERE id = %s FOR UPDATE
                """,
                (report_id,),
            )
            report = cursor.fetchone()
            if report is None:
                raise HTTPException(status_code=404, detail="Pothole report was not found.")

            old_status = report["status"]
            if new_status not in ALLOWED_TRANSITIONS[old_status]:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"This report is {STATUS_LABELS[old_status]} and cannot be "
                        f"changed to {STATUS_LABELS[new_status]}. Refresh the page "
                        "to see its latest status."
                    ),
                )

            cursor.execute(
                "UPDATE pothole_reports SET status = %s WHERE id = %s",
                (new_status, report_id),
            )
            cursor.execute(
                """
                INSERT INTO pothole_report_updates
                  (report_id, changed_by, old_status, new_status, remark)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (report_id, current_user["id"], old_status, new_status, remark),
            )
            message = (
                f"Your pothole report {report['report_number']} "
                f"({_location_summary(report)}) is now {STATUS_LABELS[new_status]}."
            )
            if remark:
                message += f" Remarks: {remark}"
            create_notification(
                connection,
                user_id=int(report["user_id"]),
                title="Pothole report update",
                message=message,
                dedupe_key=build_dedupe_key("pothole-status", report_id, new_status),
            )
            connection.commit()
    except HTTPException:
        connection.rollback()
        raise
    finally:
        cursor.close()

    record_activity_log(
        connection,
        user_id=int(current_user["id"]),
        action_type="Update",
        action=f"marked a pothole report as {STATUS_LABELS[new_status]}",
        target=f"{report['report_number']} ({_location_summary(report)})",
        target_type="Pothole Report",
        ip_address=get_client_ip(request),
    )

    with pothole_db_errors("load the pothole report"):
        return load_admin_report_detail(connection, report_id)


@router.post(
    "/api/admin/pothole-reports/{report_id}/remarks",
    response_model=AdminPotholeReportDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_pothole_report_remark(
    report_id: int,
    payload: AdminPotholeRemarkInput,
    request: Request,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_portal_user),
) -> AdminPotholeReportDetailResponse:
    remark = payload.remark.strip()
    if not remark:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Please type a remark first.",
        )

    cursor = connection.cursor(dictionary=True)
    try:
        with pothole_db_errors("save the remark"):
            cursor.execute(
                "SELECT report_number FROM pothole_reports WHERE id = %s", (report_id,)
            )
            report = cursor.fetchone()
            if report is None:
                raise HTTPException(status_code=404, detail="Pothole report was not found.")
            cursor.execute(
                """
                INSERT INTO pothole_report_updates (report_id, changed_by, remark)
                VALUES (%s, %s, %s)
                """,
                (report_id, current_user["id"], remark),
            )
            connection.commit()
    except HTTPException:
        connection.rollback()
        raise
    finally:
        cursor.close()

    record_activity_log(
        connection,
        user_id=int(current_user["id"]),
        action_type="Update",
        action="added a remark to a pothole report",
        target=report["report_number"],
        target_type="Pothole Report",
        ip_address=get_client_ip(request),
    )

    with pothole_db_errors("load the pothole report"):
        return load_admin_report_detail(connection, report_id)
