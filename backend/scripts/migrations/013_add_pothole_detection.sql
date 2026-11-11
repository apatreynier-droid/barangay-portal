-- Migration 013: AI pothole detection results and verified defect counts.
--
-- * pothole_detections: one row per pothole the model found in a report's
--   photo (confidence and bounding box in pixels of the upright photo).
-- * pothole_reports gains:
--     - detection_status: 'completed' (detection_count is the model's real
--       result, including 0), 'failed' (it could not process the photo) or
--       'not_run' (no model was available, or the report predates detection).
--       detection_count stays NULL unless the status is 'completed'.
--     - annotated_stored_filename: the photo with boxes drawn, stored beside
--       the original in uploads/pothole_reports/.
--     - resolved_address: reverse-geocoded place name, when available.
--     - verified_defect_count / duplicate_of_report_id: filled in by an
--       administrator. These, not the AI counts, drive the unique defect totals.
-- * location_source gains 'photo': coordinates read from the photo's own GPS
--   metadata, used only when the device did not send a position.
--
-- Existing rows keep all their data and become detection_status = 'not_run'.
--
-- Idempotent apply (recommended, it skips what already exists):
--   cd backend
--   .\.venv\Scripts\python.exe scripts\apply_pothole_detection_migration.py

ALTER TABLE `pothole_reports` MODIFY COLUMN `location_source` enum('gps','manual','photo') DEFAULT NULL;
ALTER TABLE `pothole_reports` ADD COLUMN `resolved_address` varchar(255) DEFAULT NULL AFTER `location_captured_at`;
ALTER TABLE `pothole_reports` ADD COLUMN `detection_status` enum('completed','failed','not_run') NOT NULL DEFAULT 'not_run' AFTER `photo_file_size`;
ALTER TABLE `pothole_reports` ADD COLUMN `detection_count` int(10) UNSIGNED DEFAULT NULL AFTER `detection_status`;
ALTER TABLE `pothole_reports` ADD COLUMN `detection_threshold` decimal(4,3) DEFAULT NULL AFTER `detection_count`;
ALTER TABLE `pothole_reports` ADD COLUMN `detection_model` varchar(100) DEFAULT NULL AFTER `detection_threshold`;
ALTER TABLE `pothole_reports` ADD COLUMN `annotated_stored_filename` varchar(64) DEFAULT NULL AFTER `detection_model`;
ALTER TABLE `pothole_reports` ADD COLUMN `verified_defect_count` int(10) UNSIGNED DEFAULT NULL AFTER `annotated_stored_filename`;
ALTER TABLE `pothole_reports` ADD COLUMN `duplicate_of_report_id` int(11) DEFAULT NULL AFTER `verified_defect_count`;
ALTER TABLE `pothole_reports` ADD CONSTRAINT `chk_pothole_detection_count` CHECK ((`detection_status` = 'completed') = (`detection_count` IS NOT NULL));
ALTER TABLE `pothole_reports` ADD CONSTRAINT `fk_pothole_duplicate_of` FOREIGN KEY (`duplicate_of_report_id`) REFERENCES `pothole_reports` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS `pothole_detections` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `report_id` int(11) NOT NULL,
  `detection_number` smallint(5) UNSIGNED NOT NULL,
  `confidence` decimal(5,4) NOT NULL,
  `x_min` decimal(8,2) NOT NULL,
  `y_min` decimal(8,2) NOT NULL,
  `x_max` decimal(8,2) NOT NULL,
  `y_max` decimal(8,2) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pothole_detection_number` (`report_id`, `detection_number`),
  CONSTRAINT `fk_pothole_detection_report` FOREIGN KEY (`report_id`) REFERENCES `pothole_reports` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chk_pothole_detection_confidence` CHECK (`confidence` BETWEEN 0 AND 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
