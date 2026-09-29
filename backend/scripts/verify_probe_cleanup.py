"""One-off: confirm the user-management test run left no probe rows behind."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import create_connection


def main() -> None:
    connection = create_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(
            "SELECT COUNT(*) FROM users WHERE email LIKE 'user-management-probe%'"
        )
        print("probe users left:", cursor.fetchone()[0])
        cursor.execute("SELECT role, COUNT(*) FROM users GROUP BY role ORDER BY role")
        print("users by role:", cursor.fetchall())
        cursor.execute(
            "SELECT COUNT(*) FROM activity_logs "
            "WHERE target LIKE '%ADM-113%' OR target LIKE '%ADM-114%'"
        )
        print("probe audit rows left:", cursor.fetchone()[0])
        cursor.execute(
            "SELECT COUNT(*) FROM resident_profiles WHERE user_id NOT IN "
            "(SELECT id FROM users)"
        )
        print("orphaned profiles:", cursor.fetchone()[0])
        cursor.close()
    finally:
        connection.close()


if __name__ == "__main__":
    main()
