CREATE TRIGGER immutable_transaction_update BEFORE UPDATE ON banking_transactions FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Posted transactions are immutable; create a reversal';
-- statement-breakpoint
CREATE TRIGGER immutable_transaction_delete BEFORE DELETE ON banking_transactions FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Posted transactions cannot be deleted';
-- statement-breakpoint
CREATE TRIGGER immutable_transfer_update BEFORE UPDATE ON transfers FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Posted transfers are immutable';
-- statement-breakpoint
CREATE TRIGGER immutable_transfer_delete BEFORE DELETE ON transfers FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Posted transfers cannot be deleted';
-- statement-breakpoint
CREATE TRIGGER immutable_processed_payroll_update BEFORE UPDATE ON payroll_records FOR EACH ROW
BEGIN
 IF OLD.payroll_status='processed' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Processed payroll is immutable'; END IF;
END;
-- statement-breakpoint
CREATE TRIGGER immutable_processed_payroll_delete BEFORE DELETE ON payroll_records FOR EACH ROW
BEGIN
 IF OLD.payroll_status='processed' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Processed payroll cannot be deleted'; END IF;
END;
-- statement-breakpoint
CREATE TRIGGER immutable_audit_update BEFORE UPDATE ON audit_logs FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Audit records are immutable';
-- statement-breakpoint
CREATE TRIGGER immutable_financial_audit_delete BEFORE DELETE ON audit_logs FOR EACH ROW
BEGIN
 IF OLD.request_id IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Financial audit records cannot be deleted'; END IF;
END;
-- statement-breakpoint
CREATE TRIGGER immutable_completed_request BEFORE UPDATE ON operation_requests FOR EACH ROW
BEGIN
 IF OLD.request_status='completed' AND NOT (
   NEW.request_id=OLD.request_id AND NEW.actor_id=OLD.actor_id AND NEW.operation=OLD.operation AND
   BINARY NEW.idempotency_key=BINARY OLD.idempotency_key AND NEW.payload_hash=OLD.payload_hash AND
   NEW.request_status=OLD.request_status AND NEW.result_reference<=>OLD.result_reference AND
   NEW.created_at=OLD.created_at AND NEW.completed_at<=>OLD.completed_at
 ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Completed requests are immutable'; END IF;
END;
-- statement-breakpoint
CREATE TRIGGER immutable_completed_request_delete BEFORE DELETE ON operation_requests FOR EACH ROW
BEGIN
 IF OLD.request_status='completed' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Completed requests cannot be deleted'; END IF;
END;
-- statement-breakpoint
CREATE SQL SECURITY INVOKER VIEW v_customer_accounts AS
SELECT c.customer_id,c.name,c.customer_status,a.account_id,a.account_number,a.account_type,a.account_status,a.balance,a.currency
FROM customers c LEFT JOIN accounts a ON a.customer_id=c.customer_id;
-- statement-breakpoint
CREATE SQL SECURITY INVOKER VIEW v_transaction_history AS
SELECT t.transaction_id,t.account_id,a.account_number,c.customer_id,c.name AS customer_name,t.branch_id,b.name AS branch_name,
 t.transaction_type,t.amount,t.balance_after,t.transaction_date,t.description,t.reference_number,t.request_id,t.transfer_id,t.reversal_of_transaction_id,t.created_by
FROM banking_transactions t JOIN accounts a ON a.account_id=t.account_id
JOIN customers c ON c.customer_id=a.customer_id JOIN branches b ON b.branch_id=t.branch_id;
-- statement-breakpoint
CREATE SQL SECURITY INVOKER VIEW v_account_reconciliation AS
SELECT a.account_id,a.account_number,a.balance,COALESCE(o.opening_balance,0.00) AS opening_balance,
 COALESCE(m.movement,0.00) AS net_movement,
 a.balance-COALESCE(o.opening_balance,0.00)-COALESCE(m.movement,0.00) AS discrepancy,
 o.reconciliation_state
FROM accounts a LEFT JOIN account_opening_snapshots o ON o.account_id=a.account_id
LEFT JOIN (SELECT account_id,SUM(CASE WHEN transaction_type IN ('deposit','transfer_credit','reversal_credit') THEN amount ELSE -amount END) AS movement
 FROM banking_transactions GROUP BY account_id) m ON m.account_id=a.account_id;
-- statement-breakpoint
CREATE SQL SECURITY INVOKER VIEW v_branch_activity AS
SELECT b.branch_id,b.branch_code,b.name,COUNT(t.transaction_id) AS posting_count,
 COALESCE(SUM(CASE WHEN t.transaction_type IN ('deposit','transfer_credit','reversal_credit') THEN t.amount ELSE 0 END),0.00) AS credits,
 COALESCE(SUM(CASE WHEN t.transaction_type IN ('withdrawal','transfer_debit','reversal_debit') THEN t.amount ELSE 0 END),0.00) AS debits
FROM banking_transactions t RIGHT JOIN branches b ON b.branch_id=t.branch_id GROUP BY b.branch_id,b.branch_code,b.name;
-- statement-breakpoint
CREATE SQL SECURITY INVOKER VIEW v_employee_payroll AS
SELECT e.employee_id,e.employee_code,e.name,e.department,p.payroll_id,p.payroll_period,p.salary_amount,p.bonus,p.deductions,
 p.gross_salary,p.net_salary,p.payroll_status,p.pay_date,p.processing_reference
FROM employees e LEFT JOIN payroll_records p ON p.employee_id=e.employee_id;
-- statement-breakpoint
CREATE SQL SECURITY INVOKER VIEW v_monthly_payroll AS
SELECT payroll_period,payroll_status,COUNT(*) AS employee_count,SUM(gross_salary) AS gross_total,
 SUM(deductions) AS deductions_total,SUM(net_salary) AS net_total
FROM payroll_records GROUP BY payroll_period,payroll_status;
