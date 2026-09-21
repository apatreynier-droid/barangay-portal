"""Idempotently create the ``password_reset_tokens`` table.

Used by the Forgot Password flow to store single-use, hashed reset tokens.

Checks ``information_schema`` first, so it is safe to run multiple times:

    cd backend
    .\\.venv\\Scripts\\Activate.ps1
    python scripts\\apply_password_reset_migration.py
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.database import create_connection  # noqa: E402

TABLE_NAME = "password_reset_tokens"

CREATE_TABLE_SQL = """
CREATE TABLE `password_reset_tokens` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `requested_ip` varchar(45) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `token_hash` (`token_hash`),
  KEY `fk_password_reset_user` (`user_id`),
  KEY `password_reset_lookup` (`user_id`, `expires_at`),
  CONSTRAINT `fk_password_reset_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
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
            "Migration complete. Nothing to change - the reset-token table is "
            "already in place."
        )
    else:
        print("Migration complete. Password-reset tokens can now be stored.")


if __name__ == "__main__":
    main()
