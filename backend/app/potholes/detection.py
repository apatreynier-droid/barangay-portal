"""Running the model and storing or returning its results."""

from __future__ import annotations

import logging

from fastapi.responses import FileResponse
from mysql.connector import MySQLConnection

from ..attachments import ValidatedImage, build_attachment_response, store_image_file
from ..ml.detector import (
    DetectionFailed,
    DetectionResult,
    DetectionUnavailable,
    detector,
    draw_annotated_jpeg,
)
from ..schemas import PotholeDetectionEntry
from .common import POTHOLE_PHOTOS_SUBDIR

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
#  Detection                                                                  #
# --------------------------------------------------------------------------- #


def run_detection(image) -> tuple[str, DetectionResult | None]:
    """Return ``(detection_status, result)``; a result only if the model ran."""
    try:
        return "completed", detector.detect(image)
    except DetectionUnavailable as error:
        logger.warning("Pothole detection did not run: %s", error)
        return "not_run", None
    except DetectionFailed as error:
        logger.error("Pothole detection failed: %s", error)
        return "failed", None


def store_annotated_photo(image, result: DetectionResult | None) -> str | None:
    """Save the photo with its boxes. No detections means no annotated copy.

    A drawing or disk problem must not lose the report or the real detection
    results, so it only logs and leaves the report without this extra image.
    """
    if result is None or result.count == 0:
        return None
    try:
        data = draw_annotated_jpeg(image, result.detections)
        return store_image_file(
            ValidatedImage(
                data=data,
                content_type="image/jpeg",
                extension=".jpg",
                original_filename="annotated.jpg",
            ),
            POTHOLE_PHOTOS_SUBDIR,
        )
    except OSError:
        logger.exception("Could not save the annotated pothole photo")
        return None


def insert_detections(cursor, report_id: int, result: DetectionResult | None) -> None:
    if result is None or result.count == 0:
        return
    cursor.executemany(
        """
        INSERT INTO pothole_detections
          (report_id, detection_number, confidence, x_min, y_min, x_max, y_max)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        [
            (report_id, item.number, item.confidence, item.x_min, item.y_min, item.x_max, item.y_max)
            for item in result.detections
        ],
    )


def load_detections(
    connection: MySQLConnection, report_ids: list[int]
) -> dict[int, list[PotholeDetectionEntry]]:
    """The stored detections of several reports, in one query."""
    if not report_ids:
        return {}
    placeholders = ", ".join(["%s"] * len(report_ids))
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            f"""
            SELECT report_id, detection_number AS number, confidence,
                   x_min, y_min, x_max, y_max
            FROM pothole_detections
            WHERE report_id IN ({placeholders})
            ORDER BY report_id, detection_number
            """,
            tuple(report_ids),
        )
        rows = cursor.fetchall()
    finally:
        cursor.close()

    grouped: dict[int, list[PotholeDetectionEntry]] = {}
    for row in rows:
        grouped.setdefault(row.pop("report_id"), []).append(PotholeDetectionEntry(**row))
    return grouped


def detection_fields(
    row: dict[str, object], detections: dict[int, list[PotholeDetectionEntry]]
) -> dict[str, object]:
    return {
        "detection_status": row["detection_status"],
        "detection_count": row["detection_count"],
        "detection_threshold": row["detection_threshold"],
        "detections": detections.get(row["id"], []),
        "has_annotated_photo": bool(row["annotated_stored_filename"]),
    }


def _describe_detection(detection_status: str, result: DetectionResult | None) -> str:
    """One sentence for the administrators' notification."""
    if result is None:
        return "AI detection did not run on this photo."
    if result.count == 0:
        return "The AI found no potholes in the photo; please review it."
    noun = "pothole" if result.count == 1 else "potholes"
    return f"The AI found {result.count} possible {noun} (unverified)."


def annotated_photo_response(
    row: dict[str, object] | None, *, download: bool = False
) -> FileResponse:
    """Stream a report's annotated photo; 404 when it has none."""
    has_photo = row is not None and row["stored_filename"]
    return build_attachment_response(
        {
            "stored_filename": row["stored_filename"],
            "content_type": "image/jpeg",
            "original_filename": f"{row['report_number']}-detections.jpg",
        }
        if has_photo
        else None,
        download=download,
        subdir=POTHOLE_PHOTOS_SUBDIR,
        not_found_detail="This report has no annotated photo.",
    )
