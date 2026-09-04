from __future__ import annotations

import sys
from pathlib import Path

import mysql.connector

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.database import create_connection  # noqa: E402
from app.security import hash_password  # noqa: E402

# Default administrator account used to access the Admin Dashboard.
ADMIN_EMAIL = "admin@barangaylagab.com"
ADMIN_PASSWORD = "Admin@123"
ADMIN_FIRST_NAME = "Elena"
ADMIN_LAST_NAME = "Reyes"


def main() -> None:
    connection = create_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute(
            "SELECT id, role, account_status FROM users WHERE email = %s",
            (ADMIN_EMAIL,),
        )
        existing_user = cursor.fetchone()

        if existing_user is not None:
            print(
                f"Admin account already exists for {ADMIN_EMAIL} "
                f"(role: {existing_user['role']}, status: {existing_user['account_status']}). "
                "No changes were made."
            )
            return

        try:
            cursor.execute(
                """
                INSERT INTO users (email, password_hash, role, account_status)
                VALUES (%s, %s, 'admin', 'active')
                """,
                (ADMIN_EMAIL, hash_password(ADMIN_PASSWORD)),
            )
            user_id = cursor.lastrowid

            # get_current_user joins resident_profiles, so the admin needs a profile row.
            cursor.execute(
                """
                INSERT INTO resident_profiles
                  (user_id, first_name, last_name, contact_number, address)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (
                    user_id,
                    ADMIN_FIRST_NAME,
                    ADMIN_LAST_NAME,
                    "00000000000",
                    "Barangay Hall, Barangay Lagab",
                ),
            )
            connection.commit()
        except mysql.connector.Error:
            connection.rollback()
            raise

        print("Default admin account created successfully.")
        print(f"  Email:    {ADMIN_EMAIL}")
        print(f"  Password: {ADMIN_PASSWORD}")
        print("  Role:     admin")
    finally:
        cursor.close()
        connection.close()


if __name__ == "__main__":
    main()
