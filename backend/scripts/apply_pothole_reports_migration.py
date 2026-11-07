r"""Idempotently create the pothole report tables (migration 012).

Creates ``pothole_reports`` and ``pothole_report_updates`` from
``scripts/migrations/012_add_pothole_reports.sql`` (the single definition of
both tables) and the ``uploads/pothole_reports`` photo folder. Existing tables
and rows are never modified, so it is safe to run multiple times:

    cd backend
    .\.venv\Scripts\Activate.ps1
    python scripts\apply_pothole_reports_migration.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.database import create_connection  # noqa: E402
from app.potholes import pothole_photos_dir  # noqa: E402

MIGRATION_FILE = BACKEND_DIR / "scripts" / "migrations" / "012_add_pothole_reports.sql"
CREATE_PATTERN = re.compile(r"CREATE TABLE IF NOT EXISTS `(\w+)`")


def load_statements() -> list[tuple[str, str]]:
    """Return ``(table_name, create_statement)`` pairs in file order."""
    sql = "\n".join(
        line
        for line in MIGRATION_FILE.read_text(encoding="utf-8").splitlines()
        if not line.lstrip().startswith("--")
    )
    statements = []
    for statement in (part.strip() for part in sql.split(";")):
        match = CREATE_PATTERN.search(statement)
        if match:
            statements.append((match.group(1), statement))
    return statements


def main() -> None:
    connection = create_connection()
    cursor = connection.cursor()

    for table_name, statement in load_statements():
        cursor.execute(
            """
            SELECT COUNT(*)
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s
            """,
            (table_name,),
        )
        if cursor.fetchone()[0] > 0:
            print(f"  skip (already exists): {table_name}")
            continue
        cursor.execute(statement)
        connection.commit()
        print(f"  created: {table_name}")

    cursor.close()
    connection.close()

    print(f"  photo folder ready: {pothole_photos_dir()}")
    print(
        "Migration complete. Resident pothole reports are now stored and shown "
        "on the Admin Pothole Management page."
    )


if __name__ == "__main__":
    main()
