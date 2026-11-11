r"""Idempotently apply migration 013 (AI pothole detection).

Runs each statement of ``scripts/migrations/013_add_pothole_detection.sql``
(the single definition) unless the column, constraint or table already exists.
Existing rows and photos are never modified, so it is safe to run repeatedly:

    cd backend
    .\.venv\Scripts\python.exe scripts\apply_pothole_detection_migration.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.database import create_connection  # noqa: E402

MIGRATION_FILE = BACKEND_DIR / "scripts" / "migrations" / "013_add_pothole_detection.sql"
ADD_COLUMN = re.compile(r"ADD COLUMN `(\w+)`")
ADD_CONSTRAINT = re.compile(r"ADD CONSTRAINT `(\w+)`")
TABLE_NAME = "pothole_reports"


def load_statements() -> list[str]:
    sql = "\n".join(
        line
        for line in MIGRATION_FILE.read_text(encoding="utf-8").splitlines()
        if not line.lstrip().startswith("--")
    )
    return [part.strip() for part in sql.split(";") if part.strip()]


def already_applied(cursor, statement: str) -> str | None:
    """Return what already exists for this statement, or None to run it."""
    match = ADD_COLUMN.search(statement)
    if match:
        cursor.execute(
            """
            SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND COLUMN_NAME = %s
            """,
            (TABLE_NAME, match.group(1)),
        )
        return match.group(1) if cursor.fetchone()[0] else None

    match = ADD_CONSTRAINT.search(statement)
    if match:
        cursor.execute(
            """
            SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND CONSTRAINT_NAME = %s
            """,
            (TABLE_NAME, match.group(1)),
        )
        return match.group(1) if cursor.fetchone()[0] else None

    return None


def main() -> None:
    connection = create_connection()
    cursor = connection.cursor()
    cursor.execute(
        """
        SELECT COUNT(*) FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s
        """,
        (TABLE_NAME,),
    )
    if not cursor.fetchone()[0]:
        raise SystemExit(
            "pothole_reports does not exist yet: run "
            "scripts\\apply_pothole_reports_migration.py first."
        )

    for statement in load_statements():
        existing = already_applied(cursor, statement)
        summary = " ".join(statement.split())[:80]
        if existing:
            print(f"  skip (already exists): {existing}")
            continue
        cursor.execute(statement)
        connection.commit()
        print(f"  applied: {summary}")

    cursor.close()
    connection.close()
    print("Migration 013 complete.")


if __name__ == "__main__":
    main()
