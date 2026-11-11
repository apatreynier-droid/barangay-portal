r"""Idempotently add the pickup_time column to requests (migration 014).

Safe to run more than once: it checks ``information_schema`` before the ALTER.
Existing rows keep their pickup date and get no time (NULL).

    cd backend
    .\.venv\Scripts\Activate.ps1
    python scripts\apply_request_pickup_time_migration.py
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.database import create_connection  # noqa: E402

TABLE_NAME = "requests"
COLUMN_NAME = "pickup_time"
COLUMN_DEFINITION = "time DEFAULT NULL AFTER `pickup_date`"


def main() -> None:
    connection = create_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            SELECT COLUMN_NAME
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s
            """,
            (TABLE_NAME,),
        )
        existing_columns = {row[0] for row in cursor.fetchall()}

        if COLUMN_NAME in existing_columns:
            print(f"  skip (exists): {TABLE_NAME}.{COLUMN_NAME}")
        else:
            cursor.execute(
                f"ALTER TABLE `{TABLE_NAME}` "
                f"ADD COLUMN `{COLUMN_NAME}` {COLUMN_DEFINITION}"
            )
            print(f"  added: {TABLE_NAME}.{COLUMN_NAME}")

        connection.commit()
    finally:
        cursor.close()
        connection.close()

    print("Migration complete.")


if __name__ == "__main__":
    main()
