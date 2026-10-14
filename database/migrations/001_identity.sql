-- Role definitions are data; API enforcement is implemented in Phase 4.
CREATE TABLE roles (
  role_id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role_name VARCHAR(40) NOT NULL UNIQUE,
  description VARCHAR(255) NOT NULL
) ENGINE=InnoDB;
-- statement-breakpoint
CREATE TABLE permissions (
  permission_id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  permission_code VARCHAR(80) NOT NULL UNIQUE,
  description VARCHAR(255) NOT NULL
) ENGINE=InnoDB;
-- statement-breakpoint
CREATE TABLE users (
  user_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  account_status VARCHAR(16) NOT NULL DEFAULT 'invited',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT ck_user_name CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT ck_user_status CHECK (account_status IN ('invited','active','disabled')),
  CONSTRAINT ck_user_password CHECK (account_status <> 'active' OR (password_hash IS NOT NULL AND CHAR_LENGTH(password_hash) >= 20))
) ENGINE=InnoDB;
-- statement-breakpoint
CREATE TABLE user_roles (
  user_id BIGINT UNSIGNED NOT NULL,
  role_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id,role_id),
  CONSTRAINT fk_user_role_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_user_role_role FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE RESTRICT
) ENGINE=InnoDB;
-- statement-breakpoint
CREATE TABLE role_permissions (
  role_id SMALLINT UNSIGNED NOT NULL,
  permission_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id,permission_id),
  CONSTRAINT fk_role_permission_role FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE RESTRICT,
  CONSTRAINT fk_role_permission_permission FOREIGN KEY (permission_id) REFERENCES permissions(permission_id) ON DELETE RESTRICT
) ENGINE=InnoDB;