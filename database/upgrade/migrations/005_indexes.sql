-- MySQL already indexes primary keys, unique keys and referencing FK columns.
-- These indexes cover planned filter/order combinations, not every column.
CREATE INDEX ix_customer_name ON customers(name,customer_id);
-- statement-breakpoint
CREATE INDEX ix_employee_department_status ON employees(department,employment_status,employee_id);
-- statement-breakpoint
CREATE INDEX ix_transaction_date ON banking_transactions(transaction_date,transaction_id);
-- statement-breakpoint
CREATE INDEX ix_transaction_account_date ON banking_transactions(account_id,transaction_date,transaction_id);
-- statement-breakpoint
CREATE INDEX ix_transaction_branch_date ON banking_transactions(branch_id,transaction_date,transaction_id);
-- statement-breakpoint
CREATE INDEX ix_payroll_period_status ON payroll_records(payroll_period,payroll_status,payroll_id);
-- statement-breakpoint
CREATE INDEX ix_session_expiry ON sessions(expires_at);
-- statement-breakpoint
CREATE INDEX ix_attempt_subject_time ON login_attempts(subject_hash,attempted_at);
-- statement-breakpoint
CREATE INDEX ix_audit_entity ON audit_logs(entity_type,entity_id,created_at);
-- statement-breakpoint
CREATE INDEX ix_audit_time ON audit_logs(created_at,audit_id);
-- statement-breakpoint
ALTER TABLE payroll_records ADD COLUMN processing_reference VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD CONSTRAINT uq_payroll_processing_reference UNIQUE (processing_reference),
  ADD CONSTRAINT ck_payroll_reference CHECK ((payroll_status = 'processed' AND processing_reference IS NOT NULL) OR (payroll_status <> 'processed' AND processing_reference IS NULL));