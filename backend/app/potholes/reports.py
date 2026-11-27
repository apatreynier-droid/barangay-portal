"""Report queries and the response objects built from them."""

from __future__ import annotations

from fastapi import HTTPException
from mysql.connector import MySQLConnection

from ..config import settings
from ..schemas import (
    AdminPotholeReportDetailResponse,
    AdminPotholeReportResponse,
    AdminPotholeUpdateEntry,
    PotholeDetectionEntry,
    PotholePhotoMeta,
)
from .detection import detection_fields, load_detections
from .location import distance_from_barangay_m, find_nearby_reports


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
           pothole_reports.location_captured_at, pothole_reports.resolved_address,
           pothole_reports.status,
           pothole_reports.reported_at, pothole_reports.updated_at,
           pothole_reports.photo_original_filename,
           pothole_reports.photo_content_type,
           pothole_reports.photo_file_size,
           pothole_reports.detection_status, pothole_reports.detection_count,
           pothole_reports.detection_threshold,
           pothole_reports.annotated_stored_filename,
           pothole_reports.verified_defect_count,
           pothole_reports.duplicate_of_report_id,
           original_report.report_number AS duplicate_of_report_number,
           TRIM(CONCAT(resident_profiles.first_name, ' ',
                       resident_profiles.last_name)) AS resident_name,
           resident_profiles.contact_number AS resident_contact,
           resident_profiles.address AS resident_address
    FROM pothole_reports
    JOIN resident_profiles ON resident_profiles.user_id = pothole_reports.user_id
    LEFT JOIN pothole_reports AS original_report
           ON original_report.id = pothole_reports.duplicate_of_report_id
"""


def admin_report_response(
    row: dict[str, object], detections: dict[int, list[PotholeDetectionEntry]]
) -> AdminPotholeReportResponse:
    distance_m = distance_from_barangay_m(row["latitude"], row["longitude"])
    return AdminPotholeReportResponse(
        **detection_fields(row, detections),
        distance_from_barangay_m=distance_m,
        outside_barangay=(
            distance_m is not None and distance_m > settings.barangay_radius_km * 1000
        ),
        resolved_address=row["resolved_address"],
        verified_defect_count=row["verified_defect_count"],
        duplicate_of_report_id=row["duplicate_of_report_id"],
        duplicate_of_report_number=row["duplicate_of_report_number"],
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

    base = admin_report_response(row, load_detections(connection, [report_id]))
    return AdminPotholeReportDetailResponse(
        **base.model_dump(),
        history=[AdminPotholeUpdateEntry(**entry) for entry in history],
        nearby_reports=find_nearby_reports(connection, row),
    )
