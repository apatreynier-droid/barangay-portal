-- Migration 001: add resident registration fields to resident_profiles.
-- Apply ONCE with:  mysql -u root -p < backend/scripts/migrations/001_add_registration_profile_fields.sql
-- Note: uses plain ALTER TABLE (MySQL does not support ADD COLUMN IF NOT EXISTS).
-- For an idempotent option, run instead:  python scripts/apply_registration_migration.py  (see backend/README.md)

USE `barangay_portal`;

ALTER TABLE `resident_profiles`
  ADD COLUMN `suffix` varchar(20) DEFAULT NULL AFTER `last_name`,
  ADD COLUMN `place_of_birth` varchar(255) DEFAULT NULL AFTER `date_of_birth`,
  ADD COLUMN `sex` enum('Male','Female') DEFAULT NULL AFTER `place_of_birth`,
  ADD COLUMN `civil_status` enum('Single','Married','Widowed','Separated','Annulled') DEFAULT NULL AFTER `sex`,
  ADD COLUMN `nationality` varchar(100) DEFAULT NULL AFTER `civil_status`,
  ADD COLUMN `religion` varchar(100) DEFAULT NULL AFTER `nationality`,
  ADD COLUMN `voter_status` enum('Registered Voter','Not Yet Registered') DEFAULT NULL AFTER `religion`,
  ADD COLUMN `house_no` varchar(20) DEFAULT NULL AFTER `voter_status`,
  ADD COLUMN `street` varchar(150) DEFAULT NULL AFTER `house_no`,
  ADD COLUMN `purok` varchar(50) DEFAULT NULL AFTER `street`,
  ADD COLUMN `years_of_residency` smallint(6) unsigned DEFAULT NULL AFTER `purok`,
  ADD COLUMN `occupation` varchar(100) DEFAULT NULL AFTER `years_of_residency`,
  ADD COLUMN `employer` varchar(150) DEFAULT NULL AFTER `occupation`,
  ADD COLUMN `emergency_contact_name` varchar(150) DEFAULT NULL AFTER `employer`,
  ADD COLUMN `emergency_contact_relationship` varchar(50) DEFAULT NULL AFTER `emergency_contact_name`,
  ADD COLUMN `emergency_contact_number` varchar(20) DEFAULT NULL AFTER `emergency_contact_relationship`,
  ADD COLUMN `emergency_contact_address` varchar(255) DEFAULT NULL AFTER `emergency_contact_number`;
