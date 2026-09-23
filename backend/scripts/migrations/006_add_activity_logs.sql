-- Migration 006: activity_logs audit table.
--
-- Every notable action performed in the portal (logins, document request
-- submissions, admin status changes, resident profile updates) is recorded
-- here once and surfaced on the Admin "Activity Logs" page. Log entries are
-- append-only: nothing in the application edits or deletes them.
--
-- Idempotent apply (recommended):
--   cd backend
--   .\.venv\Scripts\Activate.ps1
--   python -c "import mysql.connector, pathlib; c=mysql.connector.connect(host='127.0.0.1',user='root',password='');cur=c.cursor();cur.execute(pathlib.Path('scripts/migrations/006_add_activity_logs.sql').read_text());c.commit()"
--
-- One-off apply:
--   mysql -u root -p < backend/scripts/migrations/006_add_activity_logs.sql

USE `barangay_portal`;

CREATE TABLE IF NOT EXISTS `activity_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `actor_name` varchar(150) NOT NULL,
  `actor_role` varchar(50) NOT NULL DEFAULT 'system',
  `action_type` enum('Approve','Reject','Status','Update','Create','Login','Delete')
    NOT NULL DEFAULT 'Update',
  `action` varchar(255) NOT NULL,
  `target_type` varchar(50) NOT NULL DEFAULT 'System',
  `target` varchar(255) NOT NULL DEFAULT 'System',
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_activity_user` (`user_id`),
  KEY `activity_created_lookup` (`created_at`),
  CONSTRAINT `fk_activity_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;