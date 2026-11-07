-- ===========================================================================
-- Migration 009: Standardize Purok names to Purok - 1 through Purok - 7
-- ===========================================================================
-- Database: barangay_portal
--
-- PURPOSE
--   Replace the legacy Purok labels ("Purok - 3 Lagab" and
--   "Purok - 3 Lagab Curvada") with the standardized value "Purok - 3", and
--   add a CHECK constraint so only the seven standardized Purok names can be
--   stored in resident_profiles.purok going forward.
--
-- SAFETY / BACKUP
--   1. A full backup of resident_profiles is created first so existing records
--      remain intact and can be restored if needed.
--   2. The legacy->standardized mapping is documented below and applied
--      explicitly -- no silent merges of uncertain records.
--   3. Records whose correct Purok classification cannot be confirmed are left
--      untouched (NULL/other values are not modified by this migration).
--
-- LEGACY -> STANDARDIZED MAPPING (reviewed against resident address fields,
-- which reference "Purok 3" for the affected records):
--   "Purok - 3 Lagab"            -> "Purok - 3"
--   "Purok - 3 Lagab Curvada"    -> "Purok - 3"
--
-- No new Purok table is created: the existing resident_profiles.purok column
-- is reused, consistent with the current database architecture.
-- ===========================================================================

USE `barangay_portal`;

-- ---------------------------------------------------------------------------
-- Step 1: Inspect affected records BEFORE migration (documentation only).
-- ---------------------------------------------------------------------------
SELECT id, user_id, purok, address
FROM resident_profiles
WHERE purok IN ('Purok - 3 Lagab', 'Purok - 3 Lagab Curvada')
ORDER BY id;

-- ---------------------------------------------------------------------------
-- Step 2: Backup existing resident_profiles data.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `resident_profiles_purok_standardization_backup`;
CREATE TABLE `resident_profiles_purok_standardization_backup`
SELECT * FROM `resident_profiles`;

-- ---------------------------------------------------------------------------
-- Step 3: Apply the documented mapping to the purok column only.
-- ---------------------------------------------------------------------------
UPDATE `resident_profiles`
SET `purok` = 'Purok - 3'
WHERE `purok` IN ('Purok - 3 Lagab', 'Purok - 3 Lagab Curvada');

-- ---------------------------------------------------------------------------
-- Step 4: Enforce the standardized values at the database level.
-- ---------------------------------------------------------------------------
ALTER TABLE `resident_profiles`
ADD CONSTRAINT `chk_resident_profiles_purok`
CHECK (`purok` IS NULL OR `purok` IN (
    'Purok - 1', 'Purok - 2', 'Purok - 3',
    'Purok - 4', 'Purok - 5', 'Purok - 6', 'Purok - 7'
));

-- ---------------------------------------------------------------------------
-- Step 5: Verify the migration results.
-- ---------------------------------------------------------------------------
SELECT `purok`, COUNT(*) AS total
FROM `resident_profiles`
GROUP BY `purok`
ORDER BY `purok`;

-- Confirm no legacy values remain.
SELECT COUNT(*) AS legacy_purok_records_remaining
FROM `resident_profiles`
WHERE `purok` IN ('Purok - 3 Lagab', 'Purok - 3 Lagab Curvada');
