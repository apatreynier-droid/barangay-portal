-- Migration 007: duplicate protection for the notifications table.
--
-- Admin notifications are created automatically by the backend whenever a
-- resident submits, edits or deletes a document request (see
-- backend/app/notifications.py). To make sure the same action never notifies
-- the admin twice - for example when a form is submitted twice or the frontend
-- retries an API call - every notification row carries a deterministic
-- `dedupe_key`, claimed through a UNIQUE index.
--
-- The column is nullable on purpose: rows written before this migration (the
-- resident status notifications) keep NULL, and MySQL allows any number of
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
