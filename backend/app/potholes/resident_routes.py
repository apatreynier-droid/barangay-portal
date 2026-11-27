"""Resident endpoints: submit and view their own reports."""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Literal

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from mysql.connector import MySQLConnection

from ..activity_logs import record_activity_log
from ..attachments import (
    build_attachment_response,
    delete_stored_file,
    read_validated_image,
    store_image_file,
)
from ..config import settings
from ..database import get_db
from ..dependencies import get_current_user
from ..geolocation import read_photo_gps, reverse_geocode
from ..ml.detector import InvalidPhoto, decode_photo
from ..notifications import (
    action_time_bucket,
    build_dedupe_key,
    create_notification,
    notify_admins,
)
from ..puroks import validate_purok
from ..rate_limit import get_client_ip, pothole_report_limiter
from ..schemas import ResidentPotholeReportResponse
from .common import POTHOLE_PHOTOS_SUBDIR, pothole_db_errors
from .detection import (
    _describe_detection,
    annotated_photo_response,
    detection_fields,
    insert_detections,
    load_detections,
    run_detection,
    store_annotated_photo,
)
from .location import is_near_barangay, validate_coordinates
from .reports import _location_summary

router = APIRouter()
logger = logging.getLogger(__name__)


MAX_LOCATION_LENGTH = 255


MAX_ROAD_LENGTH = 150


MAX_NOTES_LENGTH = 1000


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
           pothole_reports.location_captured_at, pothole_reports.resolved_address,
           pothole_reports.status,
           pothole_reports.reported_at, pothole_reports.updated_at,
           pothole_reports.detection_status, pothole_reports.detection_count,
           pothole_reports.detection_threshold,
           pothole_reports.annotated_stored_filename,
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

    The photo is run through the detection model before anything is stored. The
    row, its detections and the stored photos are created atomically: if anything
    fails, none of them is kept. A model failure is not a submission failure: the
    report is kept and says that detection did not complete.
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
    try:
        decoded_photo = decode_photo(image.data)
    except InvalidPhoto as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This image could not be read. Please choose another photo.",
        ) from error

    retry_after = pothole_report_limiter.hit(f"user:{current_user['id']}")
    if retry_after > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="You have sent many reports recently. Please try again later.",
            headers={"Retry-After": str(int(retry_after) + 1)},
        )

    # The device's position wins; a photo's own GPS metadata is only a fallback,
    # and is ignored if it places the photo away from the barangay (for example
    # an old picture, or one received from someone else).
    if lat is None:
        photo_gps = read_photo_gps(image.data)
        if photo_gps is not None and is_near_barangay(photo_gps.latitude, photo_gps.longitude):
            lat, lng, source = photo_gps.latitude, photo_gps.longitude, "photo"
            captured_at = photo_gps.captured_at

    detection_status, detection = run_detection(decoded_photo)
    resolved_address = reverse_geocode(lat, lng)

    stored_filename: str | None = None
    annotated_filename: str | None = None
    cursor = connection.cursor(dictionary=True)
    try:
        with pothole_db_errors("save the pothole report"):
            stored_filename = store_image_file(image, POTHOLE_PHOTOS_SUBDIR)
            annotated_filename = store_annotated_photo(decoded_photo, detection)
            cursor.execute(
                """
                INSERT INTO pothole_reports
                  (report_number, user_id, purok, road_name, location_description,
                   notes, latitude, longitude, gps_accuracy_m, location_source,
                   location_captured_at, resolved_address, status,
                   photo_original_filename,
                   photo_stored_filename, photo_content_type, photo_file_size,
                   detection_status, detection_count, detection_threshold,
                   detection_model, annotated_stored_filename)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending',
                        %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                    resolved_address,
                    image.original_filename,
                    stored_filename,
                    image.content_type,
                    image.size,
                    detection_status,
                    detection.count if detection else None,
                    detection.threshold if detection else None,
                    detection.model_name if detection else None,
                    annotated_filename,
                ),
            )
            report_id = cursor.lastrowid
            insert_detections(cursor, report_id, detection)
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
                        else "Location read from the photo's GPS data."
                        if source == "photo"
                        else "No map location was captured."
                    )
                    + f" {_describe_detection(detection_status, detection)}"
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
        # Nothing is kept from a failed submission: no row, no photo files.
        try:
            connection.rollback()
        finally:
            delete_stored_file(stored_filename, POTHOLE_PHOTOS_SUBDIR)
            delete_stored_file(annotated_filename, POTHOLE_PHOTOS_SUBDIR)
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

    return ResidentPotholeReportResponse(
        **{**row, **detection_fields(row, load_detections(connection, [report_id]))}
    )


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
            detections = load_detections(connection, [row["id"] for row in rows])
    finally:
        cursor.close()
    return [
        ResidentPotholeReportResponse(**{**row, **detection_fields(row, detections)})
        for row in rows
    ]


def _load_own_report_files(
    connection: MySQLConnection, report_id: int, user_id: object
) -> dict[str, object] | None:
    """A report's file details, only if it belongs to this resident."""
    cursor = connection.cursor(dictionary=True)
    try:
        with pothole_db_errors("load the photo"):
            cursor.execute(
                """
                SELECT id, report_number, photo_stored_filename,
                       photo_content_type, photo_original_filename,
                       annotated_stored_filename
                FROM pothole_reports WHERE id = %s AND user_id = %s
                """,
                (report_id, user_id),
            )
            return cursor.fetchone()
    finally:
        cursor.close()


@router.get("/api/pothole-reports/{report_id}/photo", response_class=FileResponse)
def get_my_pothole_photo(
    report_id: int,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(require_resident),
) -> FileResponse:
    """A resident's own original photo. Another resident's report looks absent."""
    row = _load_own_report_files(connection, report_id, current_user["id"])
    return build_attachment_response(
        {
            "stored_filename": row["photo_stored_filename"],
            "content_type": row["photo_content_type"],
            "original_filename": row["photo_original_filename"],
        }
        if row
        else None,
        subdir=POTHOLE_PHOTOS_SUBDIR,
        not_found_detail="The photo of this report was not found.",
    )


@router.get(
    "/api/pothole-reports/{report_id}/annotated-photo", response_class=FileResponse
)
def get_my_annotated_pothole_photo(
    report_id: int,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(require_resident),
) -> FileResponse:
    row = _load_own_report_files(connection, report_id, current_user["id"])
    return annotated_photo_response(
        {"stored_filename": row["annotated_stored_filename"], "report_number": row["report_number"]}
        if row
        else None
    )
