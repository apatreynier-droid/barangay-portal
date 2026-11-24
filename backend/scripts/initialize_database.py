from __future__ import annotations

import os
import sys
from pathlib import Path

import mysql.connector

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.database import create_connection  # noqa: E402


# The schema lives in the sibling frontend `src/` folder; resolve it relative
# to BACKEND_DIR so the project can be located anywhere.
# Hosted MySQL such as TiDB needs scripts/tidb_schema.sql instead (keys inline):
#   SCHEMA_FILE=scripts/tidb_schema.sql python scripts/initialize_database.py
SCHEMA_PATH = (
    Path(os.environ["SCHEMA_FILE"]).resolve()
    if os.getenv("SCHEMA_FILE")
    else BACKEND_DIR.parent / "src" / "db" / "barangay_portal.sql"
)


def is_comment_only(statement: str) -> bool:
    """Return True when a statement contains only comments and whitespace."""
    for line in statement.splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("--"):
            return False
    return True


def main() -> None:
    schema = SCHEMA_PATH.read_text(encoding="utf-8-sig")
    connection = create_connection(include_database=False)
    cursor = connection.cursor()

    try:
        for statement in schema.split(";"):
            if not statement.strip() or is_comment_only(statement):
                continue

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
