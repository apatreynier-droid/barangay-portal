r"""Idempotently create the ``activity_logs`` audit table.

This table backs the admin "Activity Logs" page. Every notable action in the
portal (logins, document request submissions, admin status changes, resident
profile updates, ...) is appended here once and never edited or deleted.

Checks ``information_schema`` first, so it is safe to run multiple times:

    cd backend
    .\.venv\Scripts\Activate.ps1
    python scripts\apply_activity_logs_migration.py
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.database import create_connection  # noqa: E402

TABLE_NAME = "activity_logs"

CREATE_TABLE_SQL = """
CREATE TABLE `activity_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `actor_name` varchar(150) NOT NULL,
  `actor_role` varchar(50) NOT NULL DEFAULT 'system',
  `action_type` enum('Approve','Reject','Status','Update','Create','Login','Delete')
    NOT NULL DEFAULT 'Update',
  `action` varchar(255) NOT NULL,
  `target_type` varchar(50) NOT NULL DEFAULT 'System',
  `target` varchar(255) NOT NULL DEFAULT 'System',
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_activity_user` (`user_id`),
  KEY `activity_created_lookup` (`created_at`),
  CONSTRAINT `fk_activity_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
"""


def main() -> None:
    connection = create_connection()
    cursor = connection.cursor()

    cursor.execute(
        """
        SELECT COUNT(*)
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s
        """,
        (TABLE_NAME,),
    )
    exists = cursor.fetchone()[0] > 0

    if exists:
        print(f"  skip (already exists): {TABLE_NAME}")
    else:
        cursor.execute(CREATE_TABLE_SQL)
        connection.commit()
        print(f"  created: {TABLE_NAME}")

    cursor.close()
    connection.close()

    if exists:
        print(
            "Migration complete. Nothing to change - the activity log table is "
            "already in place."
        )
    else:
        print(
            "Migration complete. Admin activity logging can now record and "
            "display the portal's audit trail."
        )


if __name__ == "__main__":
    main()