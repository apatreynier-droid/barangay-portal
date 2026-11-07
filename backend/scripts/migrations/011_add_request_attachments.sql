-- Migration 011: request_attachments (resident image per document request).
--
-- The Resident "Request a Document" page requires an image. The image file is
-- stored on disk in backend/uploads/request_attachments/ under a random name
-- (see backend/app/attachments.py); this table keeps its metadata and links it
-- to requests.id. One attachment per request (UNIQUE request_id). Deleting a
-- request removes its attachment row (ON DELETE CASCADE).
--
-- Idempotent apply (recommended):
--   cd backend
--   .\.venv\Scripts\Activate.ps1
--   python scripts\apply_request_attachments_migration.py
--
-- One-off apply:
--   mysql -u root -p < backend/scripts/migrations/011_add_request_attachments.sql

USE `barangay_portal`;

CREATE TABLE IF NOT EXISTS `request_attachments` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
