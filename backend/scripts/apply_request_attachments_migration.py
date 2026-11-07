r"""Idempotently create the ``request_attachments`` table (migration 011).

Backs the resident image attachment of document requests: the file lives in
``backend/uploads/request_attachments/`` and this table links its metadata to
``requests.id``. Also creates the upload folder.

Checks ``information_schema`` first, so it is safe to run multiple times:

    cd backend
    .\.venv\Scripts\Activate.ps1
    python scripts\apply_request_attachments_migration.py
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.attachments import request_attachments_dir  # noqa: E402
from app.database import create_connection  # noqa: E402

TABLE_NAME = "request_attachments"

CREATE_TABLE_SQL = """
CREATE TABLE `request_attachments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `request_id` int(11) NOT NULL,
  `original_filename` varchar(255) NOT NULL,
  `stored_filename` varchar(64) NOT NULL,
  `content_type` varchar(50) NOT NULL,
  `file_size` int(10) UNSIGNED NOT NULL,
  `uploaded_by` int(11) DEFAULT NULL,
  `uploaded_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_request_attachment_request` (`request_id`),
  UNIQUE KEY `uq_request_attachment_stored` (`stored_filename`),
  KEY `fk_request_attachment_user` (`uploaded_by`),
  CONSTRAINT `fk_request_attachment_request`
    FOREIGN KEY (`request_id`) REFERENCES `requests` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_request_attachment_user`
    FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`)
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

    upload_dir = request_attachments_dir()
    print(f"  upload folder ready: {upload_dir}")

    print(
        "Migration complete. Document requests can now store and display the "
        "resident's image attachment."
    )


if __name__ == "__main__":
    main()
