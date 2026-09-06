"""Idempotently add the fee column to document_types and seed default fees.

Works on both MySQL and MariaDB by checking `information_schema` before the
ALTER, so it is safe to run multiple times:

    cd backend
    .\\.venv\\Scripts\\Activate.ps1
    python scripts\\apply_document_type_fee_migration.py
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.database import create_connection  # noqa: E402

TABLE_NAME = "document_types"
COLUMN_NAME = "fee"
COLUMN_DEFINITION = "decimal(10,2) NOT NULL DEFAULT 50.00 AFTER `description`"

# (name_pattern, fee) applied after the column exists.
FEE_RULES: list[tuple[str, str]] = [
    ("%Indigency%", "0.00"),
    ("%Business Permit%", "100.00"),
]


def main() -> None:
    connection = create_connection()
    cursor = connection.cursor()

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
        print(f"  skip (exists): {COLUMN_NAME}")
    else:
        cursor.execute(
            f"ALTER TABLE `{TABLE_NAME}` "
            f"ADD COLUMN `{COLUMN_NAME}` {COLUMN_DEFINITION}"
        )
        print(f"  added: {COLUMN_NAME}")

    for name_pattern, fee in FEE_RULES:
        cursor.execute(
            f"UPDATE `{TABLE_NAME}` SET `{COLUMN_NAME}` = %s "
            f"WHERE `document_name` LIKE %s",
            (fee, name_pattern),
        )
        print(f"  updated fees: {name_pattern} -> {fee}")

    connection.commit()
    cursor.close()
    connection.close()

    print("Migration complete.")


if __name__ == "__main__":
    main()
