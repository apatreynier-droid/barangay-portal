r"""Idempotently extend ``users.role`` with the User Management roles.

The Admin "User Management" page manages non-resident accounts, so the
existing ``users.role`` enum gains two values:

* ``staff``       - barangay staff account (created from User Management)
* ``super_admin`` - full administrator, the only role that may hand out
                    administrator roles or manage administrator accounts

Existing rows are untouched: the enum values are appended and no account's
role is rewritten. The script checks ``information_schema`` first, so it is
safe to run multiple times:

    cd backend
    .\.venv\Scripts\Activate.ps1
    python scripts\apply_staff_role_migration.py
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.database import create_connection  # noqa: E402

TABLE_NAME = "users"
COLUMN_NAME = "role"

ALTER_SQL = """
ALTER TABLE `users`
  MODIFY COLUMN `role` ENUM('resident', 'staff', 'admin', 'super_admin')
    NOT NULL DEFAULT 'resident'
"""


def main() -> None:
    connection = create_connection()
    cursor = connection.cursor()

    cursor.execute(
        """
        SELECT COLUMN_TYPE
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = %s
          AND COLUMN_NAME = %s
        """,
        (TABLE_NAME, COLUMN_NAME),
    )
    row = cursor.fetchone()

    if row is None:
        cursor.close()
        connection.close()
        raise SystemExit(
            f"Could not find {TABLE_NAME}.{COLUMN_NAME}. "
            "Initialize the database first (python scripts\\initialize_database.py)."
        )

    column_type = row[0]
    already_migrated = "staff" in column_type and "super_admin" in column_type

    if already_migrated:
        print(f"  skip (already migrated): {TABLE_NAME}.{COLUMN_NAME} -> {column_type}")
    else:
        cursor.execute(ALTER_SQL)
        connection.commit()
        print(f"  updated: {TABLE_NAME}.{COLUMN_NAME} (was {column_type})")

    cursor.close()
    connection.close()

    if already_migrated:
        print(
            "Migration complete. Nothing to change - staff account roles are "
            "already available."
        )
    else:
        print(
            "Migration complete. User Management can now store 'staff' and "
            "'super_admin' accounts; existing roles were left unchanged."
        )


if __name__ == "__main__":
    main()
