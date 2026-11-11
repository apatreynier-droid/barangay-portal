-- Migration 014: add a pickup time to document requests.
-- The Admin "Ready for Pickup" action sets a pickup date AND time; residents
-- see both on My Requests. Existing requests keep their pickup date and get no
-- time (NULL = "time not set").
-- Apply ONCE with:  mysql -u root -p < backend/scripts/migrations/014_add_request_pickup_time.sql
-- For an idempotent option, run instead:
--   python scripts/apply_request_pickup_time_migration.py  (see backend/README.md)

USE `barangay_portal`;

ALTER TABLE `requests`
  ADD COLUMN `pickup_time` time DEFAULT NULL AFTER `pickup_date`;
