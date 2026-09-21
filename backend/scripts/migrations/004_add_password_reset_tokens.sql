-- Migration 004: single-use, hashed password-reset tokens for the
-- Forgot Password flow (used by POST /api/auth/forgot-password and
-- POST /api/auth/reset-password).
--
-- Apply ONCE with:  mysql -u root -p < backend/scripts/migrations/004_add_password_reset_tokens.sql
-- For an idempotent option, run instead:
--   python scripts/apply_password_reset_migration.py
--
-- Only the SHA-256 hash of a reset token is stored and the plain token only
-- ever exists inside the emailed link.

USE `barangay_portal`;

CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `requested_ip` varchar(45) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `token_hash` (`token_hash`),
  KEY `fk_password_reset_user` (`user_id`),
  KEY `password_reset_lookup` (`user_id`, `expires_at`),
  CONSTRAINT `fk_password_reset_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
