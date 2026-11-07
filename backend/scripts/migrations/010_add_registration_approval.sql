-- Migration 010: resident registration approval workflow.
--
-- Every new resident now waits for an Administrator's review, so:
--
--   users.account_status  gains 'pending' and 'rejected'. The values are
--                         appended, so every existing account keeps its status.
--                         The column default becomes 'pending' so a row that
--                         forgets to set a status can never unlock the portal.
--                         'inactive' stays the stored value for a Deactivated
--                         account.
--   users.reviewed_by/reviewed_at/rejection_reason
--                         record who decided, when, and why it was rejected.
--   notifications.notification_type
--                         gains 'registration' so the Admin Notifications page
--                         can link a new registration to the Approvals page.
--   registration_emails   outbox for the three registration emails. A row is
--                         written in the same transaction as the status change
--                         and the UNIQUE key allows one email per event.
--
-- Idempotent apply (recommended):
--   cd backend
--   .\.venv\Scripts\Activate.ps1
--   python scripts\apply_registration_approval_migration.py
--
-- One-off apply (first run only):
--   mysql -u root -p < backend/scripts/migrations/010_add_registration_approval.sql

USE `barangay_portal`;

ALTER TABLE `users`
  MODIFY COLUMN `account_status`
    ENUM('active', 'inactive', 'suspended', 'pending', 'rejected')
    NOT NULL DEFAULT 'pending',
  ADD COLUMN `reviewed_by` int(11) DEFAULT NULL,
  ADD COLUMN `reviewed_at` timestamp NULL DEFAULT NULL,
  ADD COLUMN `rejection_reason` varchar(1000) DEFAULT NULL,
  ADD CONSTRAINT `fk_users_reviewed_by`
    FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `notifications`
  MODIFY COLUMN `notification_type`
    ENUM('request', 'announcement', 'system', 'registration')
    NOT NULL DEFAULT 'system';

CREATE TABLE IF NOT EXISTS `registration_emails` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
