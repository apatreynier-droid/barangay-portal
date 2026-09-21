-- Migration 005: request_status_emails log table.
--
-- Tracks the delivery outcome of every automatic status-change email so that
-- each (request_id, status) pair is emailed at most once and so operators can
-- see when a notification failed to send without having to dig through app logs.
--
-- Idempotent apply (recommended):
--   cd backend
--   .\.venv\Scripts\Activate.ps1
--   python scripts\apply_request_status_email_migration.py
--
-- One-off apply:
--   mysql -u root -p < backend/scripts/migrations/005_add_request_status_emails.sql

USE `barangay_portal`;

CREATE TABLE IF NOT EXISTS `request_status_emails` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;