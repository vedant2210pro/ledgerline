CREATE TABLE login_throttles (
 subject_hash BINARY(32) PRIMARY KEY,
 window_start DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 attempt_count INT UNSIGNED NOT NULL DEFAULT 1,
 CONSTRAINT ck_throttle_attempts CHECK(attempt_count>0),
 INDEX ix_throttle_window(window_start)
) ENGINE=InnoDB;
-- statement-breakpoint
ALTER TABLE customers ADD COLUMN row_version INT UNSIGNED NOT NULL DEFAULT 0;
-- statement-breakpoint
ALTER TABLE accounts ADD COLUMN row_version INT UNSIGNED NOT NULL DEFAULT 0;
-- statement-breakpoint
ALTER TABLE branches ADD COLUMN row_version INT UNSIGNED NOT NULL DEFAULT 0;
-- statement-breakpoint
ALTER TABLE audit_logs ADD COLUMN http_request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL;
