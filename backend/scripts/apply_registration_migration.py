"""Idempotently add the resident registration fields to resident_profiles.

Works on both MySQL and MariaDB by checking `information_schema` before each
ALTER, so it is safe to run multiple times:

    cd backend
    .\\.venv\\Scripts\\Activate.ps1
    python scripts\\apply_registration_migration.py
"""

from __future__ import annotations

from app.database import create_connection

# (column_name, column_definition, after_column)
NEW_COLUMNS: list[tuple[str, str, str]] = [
    ("suffix", "varchar(20) DEFAULT NULL", "last_name"),
    ("place_of_birth", "varchar(255) DEFAULT NULL", "date_of_birth"),
    ("sex", "enum('Male','Female') DEFAULT NULL", "place_of_birth"),
    (
        "civil_status",
        "enum('Single','Married','Widowed','Separated','Annulled') "
        "DEFAULT NULL",
        "sex",
    ),
    ("nationality", "varchar(100) DEFAULT NULL", "civil_status"),
    ("religion", "varchar(100) DEFAULT NULL", "nationality"),
    (
        "voter_status",
        "enum('Registered Voter','Not Yet Registered') DEFAULT NULL",
        "religion",
    ),
    ("house_no", "varchar(20) DEFAULT NULL", "voter_status"),
    ("street", "varchar(150) DEFAULT NULL", "house_no"),
    ("purok", "varchar(50) DEFAULT NULL", "street"),
    ("years_of_residency", "smallint(6) unsigned DEFAULT NULL", "purok"),
    ("occupation", "varchar(100) DEFAULT NULL", "years_of_residency"),
    ("employer", "varchar(150) DEFAULT NULL", "occupation"),
    ("emergency_contact_name", "varchar(150) DEFAULT NULL", "employer"),
    (
        "emergency_contact_relationship",
        "varchar(50) DEFAULT NULL",
        "emergency_contact_name",
    ),
    (
        "emergency_contact_number",
        "varchar(20) DEFAULT NULL",
        "emergency_contact_relationship",
    ),
    (
        "emergency_contact_address",
        "varchar(255) DEFAULT NULL",
        "emergency_contact_number",
    ),
]

TABLE_NAME = "resident_profiles"


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

    added: list[str] = []
    for column_name, definition, after_column in NEW_COLUMNS:
        if column_name in existing_columns:
            print(f"  skip (exists): {column_name}")
            continue

        cursor.execute(
            f"ALTER TABLE `{TABLE_NAME}` "
            f"ADD COLUMN `{column_name}` {definition} "
            f"AFTER `{after_column}`"
        )
        added.append(column_name)
        print(f"  added: {column_name}")

    connection.commit()
    cursor.close()
    connection.close()

    if added:
        print(f"Migration complete. {len(added)} column(s) added.")
    else:
        print("Migration complete. Nothing to add — schema is up to date.")


if __name__ == "__main__":
    main()
