"""Idempotently add the 'Approved' status to request status enums.

Checks `information_schema` before each MODIFY, so it is safe to run
multiple times:

    cd backend
    .\\.venv\\Scripts\\Activate.ps1
    python scripts\\apply_approved_status_migration.py
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.database import create_connection  # noqa: E402

NEW_ENUM = (
    "enum('Pending','Approved','Processing','Ready for Pickup',"
    "'Completed','Rejected')"
)

# (table, column, nullable, default)
ENUM_COLUMNS: list[tuple[str, str, bool, str | None]] = [
    ("requests", "status", False, "'Pending'"),
    ("request_status_history", "old_status", True, None),
    ("request_status_history", "new_status", False, None),
]


def main() -> None:
    connection = create_connection()
    cursor = connection.cursor()

    changed: list[str] = []

    for table, column, nullable, default in ENUM_COLUMNS:
        cursor.execute(
            """
            SELECT COLUMN_TYPE
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = %s AND COLUMN_NAME = %s
            """,
            (table, column),
        )
        row = cursor.fetchone()

        if row is None:
            print(f"  skip (missing): {table}.{column}")
            continue

        column_type = row[0]
        if "Approved" in column_type:
            print(f"  skip (already includes Approved): {table}.{column}")
            continue

        null_sql = "NULL" if nullable else "NOT NULL"
        default_sql = f" DEFAULT {default}" if default else ""
        cursor.execute(
            f"ALTER TABLE `{table}` MODIFY `{column}` {NEW_ENUM} "
            f"{null_sql}{default_sql}"
        )
        changed.append(f"{table}.{column}")
        print(f"  updated: {table}.{column} -> includes 'Approved'")

    connection.commit()
    cursor.close()
    connection.close()

    if changed:
        print(f"Migration complete. {len(changed)} column(s) updated.")
    else:
        print("Migration complete. Nothing to change — schema is up to date.")


if __name__ == "__main__":
    main()
