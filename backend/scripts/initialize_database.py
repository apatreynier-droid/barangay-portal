from __future__ import annotations

import sys
from pathlib import Path

import mysql.connector

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.database import create_connection  # noqa: E402


SCHEMA_PATH = (
    Path(__file__).resolve().parents[2]
    / "barangay_portal_system"
    / "src"
    / "db"
    / "barangay_portal.sql"
)


def main() -> None:
    schema = SCHEMA_PATH.read_text(encoding="utf-8")
    connection = create_connection(include_database=False)
    cursor = connection.cursor()

    try:
        for statement in schema.split(";"):
            if statement.strip():
                try:
                    cursor.execute(statement)
                except mysql.connector.Error as error:
                    if error.errno == 1050:  # Table already exists
                        table_name = error.msg.split("'")[1] if "'" in error.msg else "a table"
                        print(
                            f"Database already initialized (table '{table_name}' already exists). "
                            "Use a fresh database or drop the existing tables to reinitialize."
                        )
                        return
                    raise
        connection.commit()
    finally:
        cursor.close()
        connection.close()

    print("MySQL schema initialized successfully.")


if __name__ == "__main__":
    main()
