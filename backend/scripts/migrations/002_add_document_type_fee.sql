-- Migration 002: add the fee column to document_types and seed default fees.
-- Apply ONCE with:  mysql -u root -p < backend/scripts/migrations/002_add_document_type_fee.sql
-- For an idempotent option, run instead:
--   python scripts/apply_document_type_fee_migration.py  (see backend/README.md)

USE `barangay_portal`;

ALTER TABLE `document_types`
  ADD COLUMN `fee` decimal(10,2) NOT NULL DEFAULT 50.00 AFTER `description`;

-- Default fees: free for indigency certificates, higher for business permits.
UPDATE `document_types` SET `fee` = 0.00
  WHERE `document_name` LIKE '%Indigency%';

UPDATE `document_types` SET `fee` = 100.00
  WHERE `document_name` LIKE '%Business Permit%';
