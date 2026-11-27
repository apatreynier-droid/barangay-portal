"""Admin Portal endpoints: review and manage reports."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import FileResponse
from mysql.connector import MySQLConnection

from ..activity_logs import record_activity_log
from ..attachments import (
    build_attachment_response,
    delete_stored_file,
    read_stored_bytes,
)
from ..database import get_db
from ..dependencies import ADMINISTRATOR_ROLES, get_current_admin_portal_user
from ..ml.detector import InvalidPhoto, decode_photo
from ..notifications import build_dedupe_key, create_notification
from ..puroks import STANDARDIZED_PUROKS
from ..rate_limit import get_client_ip
from ..schemas import (
    AdminPotholeDuplicateInput,
    AdminPotholePurokCount,
    AdminPotholeRemarkInput,
    AdminPotholeReportDetailResponse,
    AdminPotholeReportResponse,
    AdminPotholeStatusCounts,
    AdminPotholeStatusInput,
    AdminPotholeSummaryResponse,
)
from .common import MANILA_TIMEZONE, POTHOLE_PHOTOS_SUBDIR, pothole_db_errors
from .detection import (
    annotated_photo_response,
    insert_detections,
    load_detections,
    run_detection,
    store_annotated_photo,
)
from .reports import (
    ADMIN_REPORT_SELECT,
    _location_summary,
    admin_report_response,
    load_admin_report_detail,
)

router = APIRouter()


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


#: Statuses in which a report counts as an administrator-confirmed defect.
CONFIRMED_STATUSES = ("verified", "under_maintenance", "resolved")


def _manila_day_start_utc(day: date) -> datetime:
    """Start of a Manila calendar day as a naive UTC timestamp (DB time)."""
    return (
        datetime.combine(day, time.min, tzinfo=MANILA_TIMEZONE)
        .astimezone(timezone.utc)
        .replace(tzinfo=None)
    )


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


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
            detections = load_detections(connection, [row["id"] for row in rows])
    finally:
        cursor.close()
    return [admin_report_response(row, detections) for row in rows]


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
            # AI counts per photo stay separate from confirmed, unique defects:
            # a duplicate still adds its detections, never a confirmed defect.
            cursor.execute(
                f"""
                SELECT purok, COUNT(*) AS total,
                       COALESCE(SUM(CASE WHEN status <> 'rejected'
                                         THEN detection_count ELSE 0 END), 0) AS detected,
                       COALESCE(SUM(CASE WHEN status IN {CONFIRMED_STATUSES!r}
                                          AND duplicate_of_report_id IS NULL
                                         THEN verified_defect_count ELSE 0 END), 0) AS verified
                FROM pothole_reports GROUP BY purok
                """
            )
            purok_rows = {row["purok"]: row for row in cursor.fetchall()}
            cursor.execute(
                """
                SELECT COUNT(*) AS total FROM pothole_reports
                WHERE latitude IS NOT NULL AND longitude IS NOT NULL
                """
            )
            with_coordinates = int(cursor.fetchone()["total"])
    finally:
        cursor.close()

    def purok_value(name: str | None, key: str) -> int:
        row = purok_rows.get(name)
        return int(row[key]) if row else 0

    top_purok_detected = max(
        (purok_value(name, "detected") for name in STANDARDIZED_PUROKS), default=0
    )

    return AdminPotholeSummaryResponse(
        total_detected_potholes=sum(int(row["detected"]) for row in purok_rows.values()),
        verified_unique_defects=sum(int(row["verified"]) for row in purok_rows.values()),
        top_puroks=[
            name
            for name in STANDARDIZED_PUROKS
            if top_purok_detected > 0 and purok_value(name, "detected") == top_purok_detected
        ],
        top_purok_detected=top_purok_detected,
        status_counts=AdminPotholeStatusCounts(
            total=sum(by_status.values()),
            pending=by_status.get("pending", 0),
            verified=by_status.get("verified", 0),
            under_maintenance=by_status.get("under_maintenance", 0),
            resolved=by_status.get("resolved", 0),
            rejected=by_status.get("rejected", 0),
        ),
        by_purok=[
            AdminPotholePurokCount(
                purok=name,
                count=purok_value(name, "total"),
                detected_potholes=purok_value(name, "detected"),
                verified_defects=purok_value(name, "verified"),
            )
            for name in STANDARDIZED_PUROKS
        ],
        unspecified_purok=purok_value(None, "total"),
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


@router.get(
    "/api/admin/pothole-reports/{report_id}/annotated-photo",
    response_class=FileResponse,
)
def get_annotated_pothole_photo(
    report_id: int,
    download: bool = False,
    connection: MySQLConnection = Depends(get_db),
    _: dict[str, object] = Depends(get_current_admin_portal_user),
) -> FileResponse:
    """The photo with the model's boxes drawn on it."""
    cursor = connection.cursor(dictionary=True)
    try:
        with pothole_db_errors("load the annotated photo"):
            cursor.execute(
                """
                SELECT report_number, annotated_stored_filename AS stored_filename
                FROM pothole_reports WHERE id = %s
                """,
                (report_id,),
            )
            row = cursor.fetchone()
    finally:
        cursor.close()
    return annotated_photo_response(row, download=download)


def _require_administrator(current_user: dict[str, object], action: str) -> None:
    if current_user.get("role") not in ADMINISTRATOR_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Only an administrator can {action}.",
        )


@router.post(
    "/api/admin/pothole-reports/{report_id}/detection",
    response_model=AdminPotholeReportDetailResponse,
)
def retry_pothole_detection(
    report_id: int,
    request: Request,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_portal_user),
) -> AdminPotholeReportDetailResponse:
    """Run the model on a report whose detection did not complete.

    A completed result is never replaced, so what a report recorded at the time
    stays the same when a newer model is installed later.
    """
    _require_administrator(current_user, "re-run pothole detection")

    cursor = connection.cursor(dictionary=True)
    try:
        with pothole_db_errors("load the pothole report"):
            cursor.execute(
                """
                SELECT report_number, detection_status,
                       photo_stored_filename AS stored_filename
                FROM pothole_reports WHERE id = %s
                """,
                (report_id,),
            )
            report = cursor.fetchone()
    finally:
        cursor.close()

    if report is None:
        raise HTTPException(status_code=404, detail="Pothole report was not found.")
    if report["detection_status"] == "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Detection already completed for this report.",
        )

    photo_bytes = read_stored_bytes(
        str(report["stored_filename"]), POTHOLE_PHOTOS_SUBDIR
    )
    if photo_bytes is None:
        raise HTTPException(status_code=404, detail="The photo of this report was not found.")
    try:
        decoded_photo = decode_photo(photo_bytes)
    except InvalidPhoto as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The stored photo could not be read.",
        ) from error

    detection_status, detection = run_detection(decoded_photo)
    if detection is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The detection model is not available right now. Please try again later.",
        )

    annotated_filename = store_annotated_photo(decoded_photo, detection)
    cursor = connection.cursor(dictionary=True)
    try:
        with pothole_db_errors("save the detection results"):
            
            # Conditional, so two people retrying at once store one result.
            cursor.execute(
                """
                UPDATE pothole_reports
                SET detection_status = %s, detection_count = %s, detection_threshold = %s,
                    detection_model = %s, annotated_stored_filename = %s
                WHERE id = %s AND detection_status <> 'completed'
                """,
                (
                    detection_status,
                    detection.count,
                    detection.threshold,
                    detection.model_name,
                    annotated_filename,
                    report_id,
                ),
            )
            if cursor.rowcount == 0:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Detection already completed for this report.",
                )
            insert_detections(cursor, report_id, detection)
            connection.commit()
    except Exception:
        connection.rollback()
        delete_stored_file(annotated_filename, POTHOLE_PHOTOS_SUBDIR)
        raise
    finally:
        cursor.close()

    record_activity_log(
        connection,
        user_id=int(current_user["id"]),
        action_type="Update",
        action="re-ran pothole detection",
        target=report["report_number"],
        target_type="Pothole Report",
        ip_address=get_client_ip(request),
    )

    with pothole_db_errors("load the pothole report"):
        return load_admin_report_detail(connection, report_id)


@router.put(
    "/api/admin/pothole-reports/{report_id}/duplicate",
    response_model=AdminPotholeReportDetailResponse,
)
def set_pothole_report_duplicate(
    report_id: int,
    payload: AdminPotholeDuplicateInput,
    request: Request,
    connection: MySQLConnection = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_admin_portal_user),
) -> AdminPotholeReportDetailResponse:
    
    """Mark (or unmark) a report as another photo of an earlier report's defect.

    Its AI count stays on record, but it adds nothing to the unique defect totals.
    The link is always to an original report, so duplicates never form chains.
    """
    
    _require_administrator(current_user, "mark duplicate reports")
    target_id = payload.duplicate_of_report_id
    if target_id == report_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A report cannot be a duplicate of itself.",
        )

    cursor = connection.cursor(dictionary=True)
    try:
        with pothole_db_errors("update the pothole report"):
            
            # Locked in id order, so two opposite requests cannot deadlock.
            ids = [report_id] if target_id is None else sorted((report_id, target_id))
            placeholders = ", ".join(["%s"] * len(ids))
            cursor.execute(
                f"""
                SELECT id, report_number, status, duplicate_of_report_id
                FROM pothole_reports WHERE id IN ({placeholders})
                ORDER BY id FOR UPDATE
                """,
                tuple(ids),
            )
            rows = {row["id"]: row for row in cursor.fetchall()}
            report = rows.get(report_id)
            if report is None:
                raise HTTPException(status_code=404, detail="Pothole report was not found.")

            if target_id is None:
                remark = "Unmarked as a duplicate report."
                
                # Back in the unique totals: a confirmed report needs a defect count.
                cursor.execute(
                    """
                    UPDATE pothole_reports
                    SET duplicate_of_report_id = NULL,
                        verified_defect_count = CASE WHEN status IN ('verified', 'under_maintenance', 'resolved')
                                                     THEN COALESCE(verified_defect_count, 1) END
                    WHERE id = %s
                    """,
                    (report_id,),
                )
            else:
                target = rows.get(target_id)
                if target is None:
                    raise HTTPException(status_code=404, detail="The original report was not found.")
                if target["status"] == "rejected":
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="A rejected report cannot be the original of a duplicate.",
                    )
                if target["duplicate_of_report_id"] is not None:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=(
                            f"{target['report_number']} is itself a duplicate. "
                            "Link to its original report instead."
                        ),
                    )
                cursor.execute(
                    "SELECT COUNT(*) AS total FROM pothole_reports WHERE duplicate_of_report_id = %s",
                    (report_id,),
                )
                if cursor.fetchone()["total"] > 0:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=(
                            "Other reports are marked as duplicates of this one. "
                            "Unlink them first."
                        ),
                    )
                remark = f"Marked as a duplicate of {target['report_number']}."
                cursor.execute(
                    """
                    UPDATE pothole_reports
                    SET duplicate_of_report_id = %s, verified_defect_count = NULL
                    WHERE id = %s
                    """,
                    (target_id, report_id),
                )

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
        action=remark.rstrip(".").lower(),
        target=report["report_number"],
        target_type="Pothole Report",
        ip_address=get_client_ip(request),
    )

    with pothole_db_errors("load the pothole report"):
        return load_admin_report_detail(connection, report_id)


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
                       road_name, purok, duplicate_of_report_id
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
            if new_status == "verified":
                # The administrator's number, not the AI's. A duplicate adds no
                # defect of its own; without a number, one defect is confirmed.
                cursor.execute(
                    "UPDATE pothole_reports SET verified_defect_count = %s WHERE id = %s",
                    (
                        None
                        if report["duplicate_of_report_id"] is not None
                        else payload.verified_defect_count or 1,
                        report_id,
                    ),
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
