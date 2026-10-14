CREATE TABLE legacy_import_batches (
 batch_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 source_schema VARCHAR(64) NOT NULL,
 inventory_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 importer_identity VARCHAR(288) NOT NULL,
 imported_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 verification_status VARCHAR(16) NOT NULL DEFAULT 'pending',
 row_counts JSON NOT NULL,
 CONSTRAINT ck_import_verified CHECK (verification_status IN ('pending','verified'))
) ENGINE=InnoDB;
-- statement-breakpoint
CREATE TABLE legacy_record_links (
 source_table VARCHAR(32) NOT NULL,
 source_id BIGINT UNSIGNED NOT NULL,
 target_table VARCHAR(32) NOT NULL,
 target_id BIGINT UNSIGNED NOT NULL,
 batch_id BIGINT UNSIGNED NOT NULL,
 source_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 history_state VARCHAR(32) NOT NULL,
 PRIMARY KEY(source_table,source_id),
 UNIQUE(target_table,target_id),
 CONSTRAINT fk_link_batch FOREIGN KEY(batch_id) REFERENCES legacy_import_batches(batch_id) ON DELETE RESTRICT,
 CONSTRAINT ck_history_state CHECK(history_state IN ('mapped','historical_only','unresolved_transfer'))
) ENGINE=InnoDB;
-- statement-breakpoint
CREATE TABLE account_opening_snapshots (
 account_id BIGINT UNSIGNED PRIMARY KEY,
 batch_id BIGINT UNSIGNED NOT NULL,
 opening_balance DECIMAL(18,2) NOT NULL,
 reconciliation_state VARCHAR(16) NOT NULL DEFAULT 'pending',
 reviewed_by BIGINT UNSIGNED NULL,
 reviewed_at DATETIME(6) NULL,
 review_note VARCHAR(1000) NULL,
 CONSTRAINT fk_opening_account FOREIGN KEY(account_id) REFERENCES accounts(account_id) ON DELETE RESTRICT,
 CONSTRAINT fk_opening_batch FOREIGN KEY(batch_id) REFERENCES legacy_import_batches(batch_id) ON DELETE RESTRICT,
 CONSTRAINT fk_opening_reviewer FOREIGN KEY(reviewed_by) REFERENCES users(user_id) ON DELETE RESTRICT,
 CONSTRAINT ck_opening_balance CHECK(opening_balance >= 0),
 CONSTRAINT ck_opening_review CHECK(
  (reconciliation_state='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_note IS NULL)
  OR (reconciliation_state='reviewed' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_note IS NOT NULL AND CHAR_LENGTH(TRIM(review_note))>0))
) ENGINE=InnoDB;
-- statement-breakpoint
CREATE TABLE legacy_payroll_periods (
 employee_id BIGINT UNSIGNED NOT NULL,
 candidate_period DATE NOT NULL COMMENT 'Derived from legacy pay_date; not an approval or confirmed pay period',
 source_payroll_id BIGINT UNSIGNED NOT NULL UNIQUE,
 batch_id BIGINT UNSIGNED NOT NULL,
 PRIMARY KEY(employee_id,candidate_period),
 CONSTRAINT fk_legacy_period_employee FOREIGN KEY(employee_id) REFERENCES employees(employee_id) ON DELETE RESTRICT,
 CONSTRAINT fk_legacy_period_batch FOREIGN KEY(batch_id) REFERENCES legacy_import_batches(batch_id) ON DELETE RESTRICT,
 CONSTRAINT ck_legacy_period CHECK(DAYOFMONTH(candidate_period)=1)
) ENGINE=InnoDB;
-- statement-breakpoint
ALTER TABLE employees MODIFY department VARCHAR(100) NOT NULL,
 MODIFY designation VARCHAR(100) NULL,
 MODIFY date_of_joining DATE NULL,
 MODIFY employment_status VARCHAR(20) NOT NULL DEFAULT 'active',
 DROP CHECK ck_employee_status,
 ADD COLUMN legacy_batch_id BIGINT UNSIGNED NULL,
 ADD CONSTRAINT fk_employee_import FOREIGN KEY(legacy_batch_id) REFERENCES legacy_import_batches(batch_id) ON DELETE RESTRICT,
 ADD CONSTRAINT ck_employee_status CHECK(employment_status IN ('active','on_leave','inactive','legacy_incomplete')),
 ADD CONSTRAINT ck_employee_known_fields CHECK(
  (employment_status='legacy_incomplete' AND legacy_batch_id IS NOT NULL AND designation IS NULL AND date_of_joining IS NULL)
  OR (employment_status<>'legacy_incomplete' AND designation IS NOT NULL AND date_of_joining IS NOT NULL));
-- statement-breakpoint
CREATE TRIGGER guard_legacy_payroll_insert BEFORE INSERT ON payroll_records FOR EACH ROW
BEGIN
 IF EXISTS(SELECT 1 FROM legacy_payroll_periods WHERE employee_id=NEW.employee_id AND candidate_period=NEW.payroll_period) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Historical payroll already reserves this employee month';
 END IF;
END;
-- statement-breakpoint
CREATE TRIGGER guard_legacy_payroll_update BEFORE UPDATE ON payroll_records FOR EACH ROW
BEGIN
 IF EXISTS(SELECT 1 FROM legacy_payroll_periods WHERE employee_id=NEW.employee_id AND candidate_period=NEW.payroll_period) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Historical payroll already reserves this employee month';
 END IF;
END;
-- statement-breakpoint
CREATE TRIGGER guard_legacy_account_activation BEFORE UPDATE ON accounts FOR EACH ROW
BEGIN
 IF NEW.account_status<>'frozen' AND EXISTS(SELECT 1 FROM account_opening_snapshots WHERE account_id=OLD.account_id AND reconciliation_state='pending') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Review the imported opening balance before account activation';
 END IF;
END;
-- statement-breakpoint
CREATE TRIGGER guard_frozen_posting BEFORE INSERT ON banking_transactions FOR EACH ROW
BEGIN
 IF EXISTS(SELECT 1 FROM accounts WHERE account_id=NEW.account_id AND account_status<>'active') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Posting requires an active account';
 END IF;
END;
