"""Pothole reports: resident submissions and their administration.

Residents submit via ``POST /api/pothole-reports`` (multipart photo +
location); admins review via ``GET /api/admin/pothole-reports``.

Detection: each photo goes through the YOLO model (``app.ml.detector``), which
finds and counts potholes. The counts are unverified AI output: a report always
starts as pending, and only an administrator confirms real, unique defects. If
the model cannot run, the report is still saved with ``detection_status`` saying
so and no count; a result is never made up.

Location: coordinates are optional and always come from outside the image
analysis. ``location_source`` is ``gps`` (with accuracy in metres), ``manual``
(a map pin, no accuracy) or ``photo`` (valid GPS metadata inside the photo, used
only when the device sent no position and the metadata places it near the
barangay). Reports without coordinates are listed but not mapped.

Storage: photos reuse ``app.attachments`` (magic-byte validation, random
names, authenticated streaming) under ``uploads/pothole_reports``. The original
is stored byte for byte; the annotated copy is a separate file.

Access: residents see only their own reports. Admin Portal roles see all
reports; verifying/rejecting and marking duplicates are reserved for
administrators, while Staff may record repair progress (under maintenance,
resolved).
"""

from __future__ import annotations

from fastapi import APIRouter

from . import admin_routes, resident_routes
from .common import pothole_photos_dir
from .detection import run_detection

__all__ = ["pothole_photos_dir", "router", "run_detection"]

router = APIRouter()
# Registration order is the route matching order.
router.include_router(resident_routes.router)
router.include_router(admin_routes.router)
