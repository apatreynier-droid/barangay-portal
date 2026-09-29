-- Migration 008: staff account roles used by the Admin "User Management" page.
--
-- The portal ships two account roles: 'resident' (document requests) and
-- 'admin' (Admin Portal). User Management also manages non-resident staff
-- accounts, so the existing users.role enum is extended with:
--
--   'staff'       - barangay staff account created from User Management
--   'super_admin' - full administrator; the only role allowed to hand out
--                   administrator roles or manage administrator accounts
--
-- The new values are appended, so every existing account (residents and the
-- existing administrator) keeps its current role. The statement is a single
-- MODIFY COLUMN, which makes re-running this migration harmless.
--
-- Idempotent apply (recommended):
--   cd backend
--   .\.venv\Scripts\Activate.ps1
--   python scripts\apply_staff_role_migration.py
--
-- One-off apply:
--   mysql -u root -p < backend/scripts/migrations/008_add_staff_account_roles.sql

USE `barangay_portal`;

ALTER TABLE `users`
  MODIFY COLUMN `role` ENUM('resident', 'staff', 'admin', 'super_admin')
    NOT NULL DEFAULT 'resident';
