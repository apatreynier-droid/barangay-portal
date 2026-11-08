-- Migration 007: duplicate protection for the notifications table.
--
-- Admin notifications carry a deterministic `dedupe_key` claimed through a
-- UNIQUE index, so a repeated action never notifies twice
-- (see backend/app/notifications.py).
--
-- Nullable on purpose: older rows keep NULL, and MySQL allows any number of
-- NULLs in a UNIQUE index.
--
-- Idempotent apply (recommended):
--   cd backend
--   .\.venv\Scripts\Activate.ps1
--   python scripts\apply_notification_dedupe_migration.py
--
-- One-off apply:
--   mysql -u root -p < backend/scripts/migrations/007_add_notification_dedupe.sql

USE `barangay_portal`;

ALTER TABLE `notifications`
  ADD COLUMN IF NOT EXISTS `dedupe_key` varchar(191) DEFAULT NULL;

ALTER TABLE `notifications`
  ADD UNIQUE KEY IF NOT EXISTS `uq_notification_dedupe` (`dedupe_key`);
