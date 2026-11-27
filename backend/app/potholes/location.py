"""Coordinates: validation, distances and nearby reports."""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from mysql.connector import MySQLConnection

from ..config import settings
from ..schemas import AdminPotholeNearbyReport


#: Anything worse than this is not a usable position (it is not stored).
MAX_ACCEPTED_ACCURACY_M = 100_000


#: Possible-duplicate search radius: the two GPS accuracy circles, within limits.
MIN_NEARBY_RADIUS_M = 30.0


MAX_NEARBY_RADIUS_M = 100.0


METRES_PER_DEGREE_LATITUDE = 111_320.0


EARTH_RADIUS_M = 6_371_000.0


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


def _distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    half_lat = math.radians(lat2 - lat1) / 2
    half_lng = math.radians(lng2 - lng1) / 2
    value = math.sin(half_lat) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(half_lng) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(value)))


def is_near_barangay(latitude: float, longitude: float) -> bool:
    return (
        _distance_m(
            latitude,
            longitude,
            settings.barangay_center_latitude,
            settings.barangay_center_longitude,
        )
        <= settings.photo_gps_max_distance_km * 1000
    )


def distance_from_barangay_m(latitude: object, longitude: object) -> float | None:
    """Metres from the barangay center, or None when there are no coordinates."""
    if latitude is None or longitude is None:
        return None
    return round(
        _distance_m(
            float(latitude),
            float(longitude),
            settings.barangay_center_latitude,
            settings.barangay_center_longitude,
        ),
        1,
    )


def find_nearby_reports(
    connection: MySQLConnection, report: dict[str, object]
) -> list[AdminPotholeNearbyReport]:
    """Other reports close enough to possibly show the same pothole.

    These are suggestions for the administrator. Nothing is merged or excluded
    until the administrator decides.
    """
    if report["latitude"] is None or report["longitude"] is None:
        return []

    latitude, longitude = float(report["latitude"]), float(report["longitude"])
    lat_margin = MAX_NEARBY_RADIUS_M / METRES_PER_DEGREE_LATITUDE
    lng_margin = lat_margin / max(0.01, math.cos(math.radians(latitude)))
    own_accuracy = float(report["gps_accuracy_m"] or 0)

    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT id, report_number, status, latitude, longitude, gps_accuracy_m,
                   detection_count, duplicate_of_report_id, reported_at
            FROM pothole_reports
            WHERE id <> %s AND status <> 'rejected'
              AND latitude BETWEEN %s AND %s
              AND longitude BETWEEN %s AND %s
            """,
            (
                report["id"],
                latitude - lat_margin,
                latitude + lat_margin,
                longitude - lng_margin,
                longitude + lng_margin,
            ),
        )
        rows = cursor.fetchall()
    finally:
        cursor.close()

    nearby = []
    for row in rows:
        distance = _distance_m(latitude, longitude, float(row["latitude"]), float(row["longitude"]))
        radius = min(
            MAX_NEARBY_RADIUS_M,
            max(MIN_NEARBY_RADIUS_M, own_accuracy + float(row["gps_accuracy_m"] or 0)),
        )
        if distance <= radius:
            nearby.append(
                AdminPotholeNearbyReport(
                    id=row["id"],
                    report_number=row["report_number"],
                    status=row["status"],
                    distance_m=round(distance, 1),
                    detection_count=row["detection_count"],
                    duplicate_of_report_id=row["duplicate_of_report_id"],
                    reported_at=row["reported_at"],
                )
            )
    return sorted(nearby, key=lambda item: item.distance_m)
