-- Migration 012: pothole_reports + pothole_report_updates.
--
-- Backs the Resident "Pothole Detection" page (submission) and the Admin
-- "Pothole Management" page (review, map, statistics).
--
-- * pothole_reports: one row per resident submission. The photo is stored on
--   disk in backend/uploads/pothole_reports/ under a random name (see
--   backend/app/attachments.py); the row keeps its metadata. Coordinates are
--   only present when they were really captured: `location_source` says
--   whether they came from the device GPS ('gps') or from a pin the resident
--   placed on the map ('manual'). No coordinates -> all three are NULL.
-- * pothole_report_updates: status changes and administrator remarks
--   (an audit trail; the first row is the resident's submission).
--
-- Only new tables are created; no existing table or row is modified.
--
-- Idempotent apply (recommended):
--   cd backend
--   .\.venv\Scripts\Activate.ps1
--   python scripts\apply_pothole_reports_migration.py
--
-- One-off apply:
--   mysql -u root -p barangay_portal < backend/scripts/migrations/012_add_pothole_reports.sql

CREATE TABLE IF NOT EXISTS `pothole_reports` (
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
  `photo_file_size` int(10) UNSIGNED NOT NULL,
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
  CONSTRAINT `chk_pothole_purok` CHECK (`purok` IS NULL OR `purok` IN (
    'Purok - 1', 'Purok - 2', 'Purok - 3', 'Purok - 4', 'Purok - 5', 'Purok - 6', 'Purok - 7'
  )),
  CONSTRAINT `chk_pothole_coordinates` CHECK (
    (`latitude` IS NULL AND `longitude` IS NULL AND `location_source` IS NULL)
    OR (`latitude` BETWEEN -90 AND 90 AND `longitude` BETWEEN -180 AND 180
        AND `location_source` IS NOT NULL)
  ),
  CONSTRAINT `chk_pothole_accuracy` CHECK (`gps_accuracy_m` IS NULL OR `gps_accuracy_m` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `pothole_report_updates` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
