CREATE TABLE sessions (
  session_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash BINARY(32) NOT NULL UNIQUE,
  csrf_token_hash BINARY(32) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  expires_at DATETIME(6) NOT NULL,
  revoked_at DATETIME(6) NULL,
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
  CONSTRAINT ck_session_expiry CHECK (expires_at > created_at),
  CONSTRAINT ck_session_revocation CHECK (revoked_at IS NULL OR revoked_at >= created_at)
) ENGINE=InnoDB;
-- statement-breakpoint
CREATE TABLE login_attempts (
  attempt_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  subject_hash BINARY(32) NOT NULL COMMENT 'HMAC of normalized login identity or address, no raw identifiers',
  attempt_kind VARCHAR(16) NOT NULL,
  attempted_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  was_successful BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT ck_attempt_kind CHECK (attempt_kind IN ('identity','address')),
  CONSTRAINT ck_attempt_success CHECK (was_successful IN (0,1))
) ENGINE=InnoDB;
-- statement-breakpoint
CREATE TABLE audit_logs (
  audit_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_id BIGINT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id BIGINT UNSIGNED NULL,
  request_id BIGINT UNSIGNED NULL,
  before_values JSON NULL,
  after_values JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_audit_request FOREIGN KEY (request_id) REFERENCES operation_requests(request_id) ON DELETE RESTRICT,
  CONSTRAINT ck_audit_action CHECK (CHAR_LENGTH(TRIM(action)) > 0)
) ENGINE=InnoDB;
-- statement-breakpoint
CREATE TABLE seed_runs (
  seed_name VARCHAR(100) PRIMARY KEY,
  checksum CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;