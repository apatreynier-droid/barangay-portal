r"""Idempotently create the ``request_status_emails`` table.

This table backs the automatic email notifications sent to residents when an
administrator changes a document request's status. It gives two guarantees:

* At-most-once delivery: each ``(request_id, status)`` pair can only be
  recorded once, so a duplicated status update will not send a second email.
* Reliable troubleshooting: when an email fails to send, the failure is stored
  here (alongside the masked recipient address) so operators can audit it
  without having to parse the application logs.

Checks ``information_schema`` first, so it is safe to run multiple times:

    cd backend
    .\.venv\Scripts\Activate.ps1
    python scripts\apply_request_status_email_migration.py
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.database import create_connection  # noqa: E402

TABLE_NAME = "request_status_emails"

CREATE_TABLE_SQL = """
CREATE TABLE `request_status_emails` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `request_id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `status` varchar(64) NOT NULL,
  `delivery_status` enum('pending','sent','failed','skipped','duplicate')
    NOT NULL DEFAULT 'pending',
  `recipient_email` varchar(255) DEFAULT NULL,
  `error_message` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `sent_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_request_status_email` (`request_id`, `status`),
  KEY `fk_rse_request` (`request_id`),
  KEY `fk_rse_user` (`user_id`),
  CONSTRAINT `fk_rse_request`
    FOREIGN KEY (`request_id`) REFERENCES `requests` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_rse_user`
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
            "Migration complete. Nothing to change - the request-status email "
            "log table is already in place."
        )
    else:
        print(
            "Migration complete. Request-status email notifications can now be "
            "logged and deduplicated."
        )


if __name__ == "__main__":
    main()