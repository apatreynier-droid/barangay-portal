"""Set every document type's fee to 100.00 except Certificate of Indigency,
which stays free (migration 016). New document types also default to 100.00.

Only sets values, so it is safe to run multiple times:

    cd backend
    .\\.venv\\Scripts\\Activate.ps1
    python scripts\\apply_document_fee_standardization_migration.py
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.database import create_connection  # noqa: E402

STANDARD_FEE = "100.00"
FREE_FEE = "0.00"
FREE_PATTERN = "%Indigency%"


def main() -> None:
    connection = create_connection()
    cursor = connection.cursor()

    cursor.execute(
        f"ALTER TABLE `document_types` ALTER COLUMN `fee` SET DEFAULT {STANDARD_FEE}"
    )
    print(f"  column default -> {STANDARD_FEE}")

    cursor.execute(
        "UPDATE `document_types` SET `fee` = %s WHERE `document_name` NOT LIKE %s",
        (STANDARD_FEE, FREE_PATTERN),
    )
    print(f"  {cursor.rowcount} type(s) changed to {STANDARD_FEE}")

    cursor.execute(
        "UPDATE `document_types` SET `fee` = %s WHERE `document_name` LIKE %s",
        (FREE_FEE, FREE_PATTERN),
    )
    print(f"  {cursor.rowcount} Indigency type(s) changed to {FREE_FEE}")

    connection.commit()
    cursor.close()
    connection.close()

    print("Migration complete.")


if __name__ == "__main__":
    main()
