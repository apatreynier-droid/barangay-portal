-- Migration 008: staff account roles used by the Admin "User Management" page.
--
-- Extends users.role with:
--   'staff'       - barangay staff account created from User Management
--   'super_admin' - full administrator; the only role allowed to assign
--                   administrator roles or manage administrator accounts
--
-- Values are appended, so existing accounts keep their role. Re-running this
-- single MODIFY COLUMN is harmless.
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
