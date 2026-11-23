-- Migration 016: every document type costs 100.00 except Certificate of
-- Indigency, which stays free (0.00). New document types also default to 100.00.
-- Safe to run more than once:
--   mysql -u root -p < backend/scripts/migrations/016_standardize_document_fees.sql
-- or:
--   python scripts/apply_document_fee_standardization_migration.py  (see backend/README.md)

USE `barangay_portal`;

ALTER TABLE `document_types`
  ALTER COLUMN `fee` SET DEFAULT 100.00;

UPDATE `document_types` SET `fee` = 100.00
  WHERE `document_name` NOT LIKE '%Indigency%';

UPDATE `document_types` SET `fee` = 0.00
  WHERE `document_name` LIKE '%Indigency%';
