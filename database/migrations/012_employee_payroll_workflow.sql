ALTER TABLE employees ADD COLUMN row_version INT UNSIGNED NOT NULL DEFAULT 0;
-- statement-breakpoint
ALTER TABLE payroll_records ADD COLUMN row_version INT UNSIGNED NOT NULL DEFAULT 0;
-- statement-breakpoint
CREATE INDEX idx_transaction_transfer_type ON banking_transactions(transfer_id,transaction_type);
-- statement-breakpoint
CREATE INDEX idx_audit_entity ON audit_logs(entity_type,entity_id,audit_id);
