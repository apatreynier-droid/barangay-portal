r"""Idempotently apply migration 010 (resident registration approval).

Inspects ``information_schema`` before every step, so it is safe to run more
than once and never touches existing account rows:

    cd backend
    .\.venv\Scripts\Activate.ps1
    python scripts\apply_registration_approval_migration.py
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.database import create_connection  # noqa: E402

ACCOUNT_STATUS_SQL = """
ALTER TABLE `users`
  MODIFY COLUMN `account_status`
    ENUM('active', 'inactive', 'suspended', 'pending', 'rejected')
    NOT NULL DEFAULT 'pending'
"""

NOTIFICATION_TYPE_SQL = """
ALTER TABLE `notifications`
  MODIFY COLUMN `notification_type`
    ENUM('request', 'announcement', 'system', 'registration')
    NOT NULL DEFAULT 'system'
"""

USER_COLUMNS = {
    "reviewed_by": "ALTER TABLE `users` ADD COLUMN `reviewed_by` int(11) DEFAULT NULL",
    "reviewed_at": (
        "ALTER TABLE `users` ADD COLUMN `reviewed_at` timestamp NULL DEFAULT NULL"
    ),
    "rejection_reason": (
        "ALTER TABLE `users` ADD COLUMN `rejection_reason` varchar(1000) DEFAULT NULL"
    ),
}

REVIEWED_BY_FOREIGN_KEY_SQL = """
ALTER TABLE `users`
  ADD CONSTRAINT `fk_users_reviewed_by`
    FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
"""

REGISTRATION_EMAILS_SQL = """
CREATE TABLE `registration_emails` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `event_type` enum('registered','approved','rejected') NOT NULL,
  `delivery_status` enum('pending','sending','sent','failed','skipped')
    NOT NULL DEFAULT 'pending',
  `recipient_email` varchar(255) DEFAULT NULL,
  `attempts` int(11) NOT NULL DEFAULT 0,
  `last_error` varchar(500) DEFAULT NULL,
  `next_attempt_at` timestamp NULL DEFAULT NULL,
  `claimed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `sent_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_registration_email` (`user_id`, `event_type`),
  KEY `registration_email_due` (`delivery_status`, `next_attempt_at`),
  CONSTRAINT `fk_registration_email_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
"""


def column_type(cursor, table: str, column: str) -> str | None:
    cursor.execute(
        """
        SELECT COLUMN_TYPE
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND COLUMN_NAME = %s
        """,
        (table, column),
    )
    row = cursor.fetchone()
    return None if row is None else str(row[0])


def has_row(cursor, query: str) -> bool:
    cursor.execute(query)
    return int(cursor.fetchone()[0]) > 0


def main() -> None:
    connection = create_connection()
    cursor = connection.cursor()

    try:
        status_type = column_type(cursor, "users", "account_status") or ""
        if "'pending'" in status_type and "'rejected'" in status_type:
            print("  skip (already applied): users.account_status values")
        else:
            cursor.execute(ACCOUNT_STATUS_SQL)
            print("  updated: users.account_status (pending, rejected)")

        for name, statement in USER_COLUMNS.items():
            if column_type(cursor, "users", name) is not None:
                print(f"  skip (already exists): users.{name}")
            else:
                cursor.execute(statement)
                print(f"  added: users.{name}")

        if has_row(
            cursor,
            """
            SELECT COUNT(*)
            FROM information_schema.TABLE_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE()
              AND TABLE_NAME = 'users'
              AND CONSTRAINT_NAME = 'fk_users_reviewed_by'
            """,
        ):
            print("  skip (already exists): fk_users_reviewed_by")
        else:
            cursor.execute(REVIEWED_BY_FOREIGN_KEY_SQL)
            print("  added: fk_users_reviewed_by")

        type_values = column_type(cursor, "notifications", "notification_type") or ""
        if "'registration'" in type_values:
            print("  skip (already applied): notifications.notification_type")
        else:
            cursor.execute(NOTIFICATION_TYPE_SQL)
            print("  updated: notifications.notification_type (registration)")

        if has_row(
            cursor,
            """
            SELECT COUNT(*)
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'registration_emails'
            """,
        ):
            print("  skip (already exists): registration_emails")
        else:
            cursor.execute(REGISTRATION_EMAILS_SQL)
            print("  created: registration_emails")

        connection.commit()
    finally:
        cursor.close()
        connection.close()

    print("Migration 010 complete. Existing accounts were not changed.")


if __name__ == "__main__":
    main()
