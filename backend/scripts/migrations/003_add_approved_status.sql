-- Migration 003: add the 'Approved' status to request status enums.
-- Apply ONCE with:  mysql -u root -p < backend/scripts/migrations/003_add_approved_status.sql
-- For an idempotent option, run instead:
--   python scripts/apply_approved_status_migration.py

USE `barangay_portal`;

ALTER TABLE `requests`
  MODIFY `status`
  enum('Pending','Approved','Processing','Ready for Pickup','Completed','Rejected')
  NOT NULL DEFAULT 'Pending';

ALTER TABLE `request_status_history`
  MODIFY `old_status`
  enum('Pending','Approved','Processing','Ready for Pickup','Completed','Rejected')
  DEFAULT NULL;

ALTER TABLE `request_status_history`
  MODIFY `new_status`
  enum('Pending','Approved','Processing','Ready for Pickup','Completed','Rejected')
  NOT NULL;
