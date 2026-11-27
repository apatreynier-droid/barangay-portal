"""Constants and helpers shared by the pothole modules."""

from __future__ import annotations

import logging
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import timedelta, timezone
from pathlib import Path

import mysql.connector
from fastapi import HTTPException, status

from ..attachments import TABLE_MISSING_ERROR, upload_subdir

logger = logging.getLogger(__name__)


#: Sub-folder of ``settings.upload_dir`` that holds the report photos.
POTHOLE_PHOTOS_SUBDIR = "pothole_reports"


#: Philippine time: the admin's date filters are calendar days in Manila.
MANILA_TIMEZONE = timezone(timedelta(hours=8))


#: MySQL error number for a column that does not exist yet.
COLUMN_MISSING_ERROR = 1054


def pothole_photos_dir() -> Path:
    return upload_subdir(POTHOLE_PHOTOS_SUBDIR)


# --------------------------------------------------------------------------- #
#  Helpers                                                                    #
# --------------------------------------------------------------------------- #


@contextmanager
def pothole_db_errors(action: str) -> Iterator[None]:
    """Turn database errors into clear HTTP errors.

    A missing table or column means a migration has not been applied yet; say
    so instead of failing with a bare 500.
    """
    try:
        yield
    except mysql.connector.Error as error:
        if error.errno in (TABLE_MISSING_ERROR, COLUMN_MISSING_ERROR):
            logger.error(
                "Pothole tables are out of date; run "
                "scripts/apply_pothole_reports_migration.py and "
                "scripts/apply_pothole_detection_migration.py"
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "Pothole reports are not set up on the server yet "
                    "(database migrations 012 and 013 are required)."
                ),
            ) from error
        logger.exception("Database error while trying to %s", action)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not {action}.",
        ) from error
