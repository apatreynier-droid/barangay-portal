"""Place names for coordinates, and GPS coordinates stored inside a photo.

Neither is ever invented. A failed or disabled lookup returns ``None``, and the
report is kept without that value.

Reverse geocoding sends the report's coordinates (nothing else) to the configured
service, by default OpenStreetMap's public Nominatim server. Its usage policy
allows at most one request per second and requires an identifying User-Agent:
https://operations.osmfoundation.org/policies/nominatim/
"""

from __future__ import annotations

import io
import json
import logging
import math
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone

from PIL import Image

from .config import settings

logger = logging.getLogger(__name__)

MAX_ADDRESS_LENGTH = 255
MIN_SECONDS_BETWEEN_LOOKUPS = 1.1
GPS_IFD_TAG = 0x8825

_lookup_lock = threading.Lock()
_last_lookup_at = 0.0


def reverse_geocode(latitude: float | None, longitude: float | None) -> str | None:
    """Best effort: a readable place name, or ``None`` if it is not available."""
    global _last_lookup_at

    if latitude is None or longitude is None or not settings.reverse_geocode_url:
        return None

    query = urllib.parse.urlencode(
        {"format": "jsonv2", "lat": latitude, "lon": longitude, "zoom": 18, "addressdetails": 0}
    )
    request = urllib.request.Request(
        f"{settings.reverse_geocode_url}?{query}",
        headers={
            "User-Agent": settings.reverse_geocode_user_agent,
            "Accept-Language": "en",
        },
    )

    try:
        with _lookup_lock:
            wait = MIN_SECONDS_BETWEEN_LOOKUPS - (time.monotonic() - _last_lookup_at)
            if wait > 0:
                time.sleep(wait)
            _last_lookup_at = time.monotonic()
            with urllib.request.urlopen(
                request, timeout=settings.reverse_geocode_timeout_seconds
            ) as response:
                body = response.read(256 * 1024)
        place = json.loads(body).get("display_name")
    except (urllib.error.URLError, TimeoutError, OSError, ValueError, AttributeError) as error:
        logger.info("Reverse geocoding was not available: %s", error)
        return None

    if not isinstance(place, str) or not place.strip():
        return None
    return " ".join(place.split())[:MAX_ADDRESS_LENGTH]


@dataclass(frozen=True)
class PhotoGps:
    latitude: float
    longitude: float
    captured_at: datetime | None


def _degrees(values: object, reference: object, negative_reference: str) -> float | None:
    try:
        degrees, minutes, seconds = (float(value) for value in values)  # type: ignore[union-attr]
    except (TypeError, ValueError, ZeroDivisionError):
        return None
    result = degrees + minutes / 60 + seconds / 3600
    if not math.isfinite(result):
        return None
    text = reference.decode("ascii", "ignore") if isinstance(reference, bytes) else str(reference)
    return -result if text.strip().upper() == negative_reference else result


def _gps_timestamp(gps: dict) -> datetime | None:
    """The GPS clock reading (always UTC), if present and not in the future."""
    try:
        day = str(gps[29]).strip()
        hours, minutes, seconds = (float(value) for value in gps[7])
        stamp = datetime.strptime(day, "%Y:%m:%d").replace(
            hour=int(hours), minute=int(minutes), second=int(seconds)
        )
    except (KeyError, TypeError, ValueError, ZeroDivisionError):
        return None
    return stamp if stamp <= datetime.now(timezone.utc).replace(tzinfo=None) else None


def read_photo_gps(data: bytes) -> PhotoGps | None:
    """Coordinates from the photo's EXIF block, only if they are valid.

    Browsers and messaging apps often remove this metadata, so its absence is
    normal.
    """
    try:
        with Image.open(io.BytesIO(data)) as image:
            gps = dict(image.getexif().get_ifd(GPS_IFD_TAG))
    except (OSError, ValueError, SyntaxError, TypeError):
        return None

    if not gps:
        return None

    latitude = _degrees(gps.get(2), gps.get(1, "N"), "S")
    longitude = _degrees(gps.get(4), gps.get(3, "E"), "W")
    if latitude is None or longitude is None:
        return None
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        return None
    # 0,0 is what cameras write when they have no fix.
    if latitude == 0 and longitude == 0:
        return None

    return PhotoGps(round(latitude, 7), round(longitude, 7), _gps_timestamp(gps))
