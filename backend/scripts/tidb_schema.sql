-- TiDB-compatible schema (generated from src/db/barangay_portal.sql via SHOW CREATE TABLE).
-- TiDB cannot add AUTO_INCREMENT with ALTER TABLE, so keys are inline here.
SET FOREIGN_KEY_CHECKS = 0;
CREATE DATABASE IF NOT EXISTS `barangay_portal` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `barangay_portal`;
CREATE TABLE `activity_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `actor_name` varchar(150) NOT NULL,
  `actor_role` varchar(50) NOT NULL DEFAULT 'system',
  `action_type` enum('Approve','Reject','Status','Update','Create','Login','Delete') NOT NULL DEFAULT 'Update',
  `action` varchar(255) NOT NULL,
  `target_type` varchar(50) NOT NULL DEFAULT 'System',
  `target` varchar(255) NOT NULL DEFAULT 'System',
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_activity_user` (`user_id`),
  KEY `activity_created_lookup` (`created_at`),
  CONSTRAINT `fk_activity_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
;
CREATE TABLE `auth_sessions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `token_hash` (`token_hash`),
  KEY `fk_session_user` (`user_id`),
  KEY `active_session_lookup` (`user_id`,`expires_at`,`revoked_at`),
  CONSTRAINT `fk_session_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
;
CREATE TABLE `document_types` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `document_name` varchar(150) NOT NULL,
  `description` text DEFAULT NULL,
  `fee` decimal(10,2) NOT NULL DEFAULT 100.00,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `document_name` (`document_name`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
;
CREATE TABLE `notifications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `title` varchar(255) NOT NULL,
  `message` text NOT NULL,
  `notification_type` enum('request','announcement','system','registration') NOT NULL DEFAULT 'system',
  `related_request_id` int(11) DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `dedupe_key` varchar(191) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_notification_dedupe` (`dedupe_key`),
  KEY `fk_notification_user` (`user_id`),
  KEY `fk_notification_request` (`related_request_id`),
  CONSTRAINT `fk_notification_request` FOREIGN KEY (`related_request_id`) REFERENCES `requests` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_notification_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
;
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
  KEY `password_reset_lookup` (`user_id`,`expires_at`),
  CONSTRAINT `fk_password_reset_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
;
CREATE TABLE `pothole_report_updates` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `report_id` int(11) NOT NULL,
  `changed_by` int(11) DEFAULT NULL,
  `old_status` enum('pending','verified','under_maintenance','resolved','rejected') DEFAULT NULL,
  `new_status` enum('pending','verified','under_maintenance','resolved','rejected') DEFAULT NULL,
  `remark` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_pothole_update_report` (`report_id`),
  KEY `fk_pothole_update_user` (`changed_by`),
  CONSTRAINT `fk_pothole_update_report` FOREIGN KEY (`report_id`) REFERENCES `pothole_reports` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_pothole_update_user` FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
;
CREATE TABLE `pothole_reports` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `report_number` varchar(32) NOT NULL,
  `user_id` int(11) NOT NULL,
  `purok` varchar(50) DEFAULT NULL,
  `road_name` varchar(150) DEFAULT NULL,
  `location_description` varchar(255) NOT NULL,
  `notes` text DEFAULT NULL,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `gps_accuracy_m` decimal(9,2) DEFAULT NULL,
  `location_source` enum('gps','manual') DEFAULT NULL,
  `location_captured_at` timestamp NULL DEFAULT NULL,
  `status` enum('pending','verified','under_maintenance','resolved','rejected') NOT NULL DEFAULT 'pending',
  `photo_original_filename` varchar(255) NOT NULL,
  `photo_stored_filename` varchar(64) NOT NULL,
  `photo_content_type` varchar(50) NOT NULL,
  `photo_file_size` int(10) unsigned NOT NULL,
  `reported_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pothole_report_number` (`report_number`),
  UNIQUE KEY `uq_pothole_photo_stored` (`photo_stored_filename`),
  KEY `idx_pothole_user` (`user_id`),
  KEY `idx_pothole_status` (`status`),
  KEY `idx_pothole_purok` (`purok`),
  KEY `idx_pothole_reported_at` (`reported_at`),
  CONSTRAINT `fk_pothole_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chk_pothole_purok` CHECK (`purok` is null or `purok` in ('Purok - 1','Purok - 2','Purok - 3','Purok - 4','Purok - 5','Purok - 6','Purok - 7')),
  CONSTRAINT `chk_pothole_coordinates` CHECK (`latitude` is null and `longitude` is null and `location_source` is null or `latitude` between -90 and 90 and `longitude` between -180 and 180 and `location_source` is not null),
  CONSTRAINT `chk_pothole_accuracy` CHECK (`gps_accuracy_m` is null or `gps_accuracy_m` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
;
CREATE TABLE `registration_emails` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `event_type` enum('registered','approved','rejected') NOT NULL,
  `delivery_status` enum('pending','sending','sent','failed','skipped') NOT NULL DEFAULT 'pending',
  `recipient_email` varchar(255) DEFAULT NULL,
  `attempts` int(11) NOT NULL DEFAULT 0,
  `last_error` varchar(500) DEFAULT NULL,
  `next_attempt_at` timestamp NULL DEFAULT NULL,
  `claimed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `sent_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_registration_email` (`user_id`,`event_type`),
  KEY `registration_email_due` (`delivery_status`,`next_attempt_at`),
  CONSTRAINT `fk_registration_email_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
;
CREATE TABLE `request_attachments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `request_id` int(11) NOT NULL,
  `original_filename` varchar(255) NOT NULL,
  `stored_filename` varchar(64) NOT NULL,
  `content_type` varchar(50) NOT NULL,
  `file_size` int(10) unsigned NOT NULL,
  `uploaded_by` int(11) DEFAULT NULL,
  `uploaded_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_request_attachment_request` (`request_id`),
  UNIQUE KEY `uq_request_attachment_stored` (`stored_filename`),
  KEY `fk_request_attachment_user` (`uploaded_by`),
  CONSTRAINT `fk_request_attachment_request` FOREIGN KEY (`request_id`) REFERENCES `requests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_request_attachment_user` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
;
CREATE TABLE `request_status_emails` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `request_id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `status` varchar(64) NOT NULL,
  `delivery_status` enum('pending','sent','failed','skipped','duplicate') NOT NULL DEFAULT 'pending',
  `recipient_email` varchar(255) DEFAULT NULL,
  `error_message` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `sent_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_request_status_email` (`request_id`,`status`),
  KEY `fk_rse_request` (`request_id`),
  KEY `fk_rse_user` (`user_id`),
  CONSTRAINT `fk_rse_request` FOREIGN KEY (`request_id`) REFERENCES `requests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_rse_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
;
CREATE TABLE `request_status_history` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `request_id` int(11) NOT NULL,
  `old_status` enum('Pending','Approved','Processing','Ready for Pickup','Completed','Rejected') DEFAULT NULL,
  `new_status` enum('Pending','Approved','Processing','Ready for Pickup','Completed','Rejected') NOT NULL,
  `changed_by` int(11) DEFAULT NULL,
  `remarks` text DEFAULT NULL,
  `changed_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_history_request` (`request_id`),
  KEY `fk_history_user` (`changed_by`),
  CONSTRAINT `fk_history_request` FOREIGN KEY (`request_id`) REFERENCES `requests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_history_user` FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
;
CREATE TABLE `requests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `request_number` varchar(32) NOT NULL,
  `user_id` int(11) NOT NULL,
  `document_type_id` int(11) NOT NULL,
  `purpose` text NOT NULL,
  `status` enum('Pending','Approved','Processing','Ready for Pickup','Completed','Rejected') NOT NULL DEFAULT 'Pending',
  `admin_remarks` text DEFAULT NULL,
  `submitted_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `last_updated` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `completed_at` timestamp NULL DEFAULT NULL,
  `pickup_date` date DEFAULT NULL,
  `pickup_time` time DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `request_number` (`request_number`),
  KEY `fk_request_user` (`user_id`),
  KEY `fk_request_document` (`document_type_id`),
  KEY `request_history_lookup` (`user_id`,`status`,`last_updated`),
  CONSTRAINT `fk_request_document` FOREIGN KEY (`document_type_id`) REFERENCES `document_types` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_request_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
;
CREATE TABLE `resident_profiles` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `first_name` varchar(100) NOT NULL,
  `middle_name` varchar(100) DEFAULT NULL,
  `last_name` varchar(100) NOT NULL,
  `suffix` varchar(20) DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `place_of_birth` varchar(255) DEFAULT NULL,
  `sex` enum('Male','Female') DEFAULT NULL,
  `civil_status` enum('Single','Married','Widowed','Separated','Annulled') DEFAULT NULL,
  `nationality` varchar(100) DEFAULT NULL,
  `religion` varchar(100) DEFAULT NULL,
  `voter_status` enum('Registered Voter','Not Yet Registered') DEFAULT NULL,
  `house_no` varchar(20) DEFAULT NULL,
  `street` varchar(150) DEFAULT NULL,
  `purok` varchar(50) DEFAULT NULL,
  `years_of_residency` smallint(6) unsigned DEFAULT NULL,
  `occupation` varchar(100) DEFAULT NULL,
  `employer` varchar(150) DEFAULT NULL,
  `emergency_contact_name` varchar(150) DEFAULT NULL,
  `emergency_contact_relationship` varchar(50) DEFAULT NULL,
  `emergency_contact_number` varchar(20) DEFAULT NULL,
  `emergency_contact_address` varchar(255) DEFAULT NULL,
  `contact_number` varchar(20) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  CONSTRAINT `fk_profile_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chk_resident_profiles_purok` CHECK (`purok` is null or `purok` in ('Purok - 1','Purok - 2','Purok - 3','Purok - 4','Purok - 5','Purok - 6','Purok - 7'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('resident','staff','admin','super_admin') NOT NULL DEFAULT 'resident',
  `account_status` enum('active','inactive','suspended','pending','rejected') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `reviewed_by` int(11) DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `rejection_reason` varchar(1000) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `fk_users_reviewed_by` (`reviewed_by`),
  CONSTRAINT `fk_users_reviewed_by` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
;
INSERT INTO document_types (document_name, description, fee, is_active) VALUES ('Business Permit','Barangay business clearance required to operate a business within the barangay.',100.00,1);
INSERT INTO document_types (document_name, description, fee, is_active) VALUES ('Certificate of Indigency','Certifies that the resident belongs to a low-income household, for financial, medical or legal assistance.',0.00,1);
INSERT INTO document_types (document_name, description, fee, is_active) VALUES ('Travel Pass','Certifies the resident''s identity and residency for travel outside the barangay.',100.00,1);
