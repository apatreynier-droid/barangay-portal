-- Migration 015: add Business Permit, Certificate of Indigency and Travel Pass
-- to the document types residents can request.
-- Apply ONCE with:  mysql -u root -p < backend/scripts/migrations/015_add_more_document_types.sql
-- For an idempotent option, run instead:
--   python scripts/apply_more_document_types_migration.py  (see backend/README.md)
--
-- Fees: indigency certificates are free; every other type costs 100.00
-- (see migration 016).

USE `barangay_portal`;

INSERT INTO `document_types` (`document_name`, `description`, `fee`, `is_active`)
VALUES
  ('Business Permit',
   'Barangay business clearance required to operate a business within the barangay.',
   100.00, 1),
  ('Certificate of Indigency',
   'Certifies that the resident belongs to a low-income household, for financial, medical or legal assistance.',
   0.00, 1),
  ('Travel Pass',
   'Certifies the resident''s identity and residency for travel outside the barangay.',
   100.00, 1);
