r"""Idempotently add the ``notifications.dedupe_key`` duplicate guard.

Admin notifications are written automatically by the backend (see
``app/notifications.py``) whenever an important action happens - a resident
submitting, editing or deleting a document request, a request status change, a
new resident account, or a resident profile/account update.

Each of those rows carries a deterministic ``dedupe_key`` so the same action
can never notify the admin twice, even when a form is submitted twice or the
frontend retries an API call. The value is claimed through a UNIQUE index, so
the database - not the application - is what prevents duplicates.

Checks ``information_schema`` first, so it is safe to run multiple times:

    cd backend
    .\.venv\Scripts\Activate.ps1
    python scripts\apply_notification_dedupe_migration.py
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.database import create_connection  # noqa: E402

TABLE_NAME = "notifications"
COLUMN_NAME = "dedupe_key"
INDEX_NAME = "uq_notification_dedupe"

ADD_COLUMN_SQL = f"""
ALTER TABLE `{TABLE_NAME}`
  ADD COLUMN `{COLUMN_NAME}` varchar(191) DEFAULT NULL
"""

ADD_INDEX_SQL = f"""
ALTER TABLE `{TABLE_NAME}`
  ADD UNIQUE KEY `{INDEX_NAME}` (`{COLUMN_NAME}`)
"""


def main() -> None:
    connection = create_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            SELECT COUNT(*)
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = %s
              AND COLUMN_NAME = %s
            """,
            (TABLE_NAME, COLUMN_NAME),
        )
        column_exists = cursor.fetchone()[0] > 0

        if column_exists:
            print(f"  skip (already exists): {TABLE_NAME}.{COLUMN_NAME}")
        else:
            cursor.execute(ADD_COLUMN_SQL)
            connection.commit()
            print(f"  added: {TABLE_NAME}.{COLUMN_NAME}")

        cursor.execute(
            """
            SELECT COUNT(*)
            FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = %s
              AND INDEX_NAME = %s
            """,
            (TABLE_NAME, INDEX_NAME),
        )
        index_exists = cursor.fetchone()[0] > 0

        if index_exists:
            print(f"  skip (already exists): {INDEX_NAME}")
        else:
            cursor.execute(ADD_INDEX_SQL)
            connection.commit()
            print(f"  added: {INDEX_NAME}")
    finally:
        cursor.close()
        connection.close()

    if column_exists and index_exists:
        print(
            "Migration complete. Nothing to change - duplicate protection for "
            "notifications is already in place."
        )
    else:
        print(
            "Migration complete. Repeating the same action can no longer write "
            "a duplicate admin notification."
        )


if __name__ == "__main__":
    main()
