"""Idempotently add Business Permit, Certificate of Indigency and Travel Pass
to document_types (migration 015).

A document type is inserted only when no row with the same name exists, so it
is safe to run multiple times:

    cd backend
    .\\.venv\\Scripts\\Activate.ps1
    python scripts\\apply_more_document_types_migration.py
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.database import create_connection  # noqa: E402

# (document_name, description, fee). Indigency certificates are free; every
# other type costs 100.00 (see migration 016).
DOCUMENT_TYPES: list[tuple[str, str, str]] = [
    (
        "Business Permit",
        "Barangay business clearance required to operate a business within "
        "the barangay.",
        "100.00",
    ),
    (
        "Certificate of Indigency",
        "Certifies that the resident belongs to a low-income household, for "
        "financial, medical or legal assistance.",
        "0.00",
    ),
    (
        "Travel Pass",
        "Certifies the resident's identity and residency for travel outside "
        "the barangay.",
        "100.00",
    ),
]


def main() -> None:
    connection = create_connection()
    cursor = connection.cursor()

    for document_name, description, fee in DOCUMENT_TYPES:
        cursor.execute(
            "SELECT id FROM `document_types` WHERE `document_name` = %s",
            (document_name,),
        )
        if cursor.fetchone() is not None:
            print(f"  skip (exists): {document_name}")
            continue

        cursor.execute(
            """
            INSERT INTO `document_types`
              (`document_name`, `description`, `fee`, `is_active`)
            VALUES (%s, %s, %s, 1)
            """,
            (document_name, description, fee),
        )
        print(f"  added: {document_name} (fee {fee})")

    connection.commit()
    cursor.close()
    connection.close()

    print("Migration complete.")


if __name__ == "__main__":
    main()
