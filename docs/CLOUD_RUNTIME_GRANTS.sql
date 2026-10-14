-- Template for the NEW dedicated cloud runtime user ledgerline_web@%.
-- Run only on the cloud connection after importing banking_payroll_db.
-- Create this user first with a private strong password. Never use the provider admin as runtime.
-- Review SHOW GRANTS first. If the provider created this NEW user with broad defaults,
-- remove those defaults before applying these limited grants. Do not revoke the admin's access.
-- No statements in this file have been executed against any database.

GRANT SELECT ON `banking_payroll_db`.`users` TO 'ledgerline_web'@'%';
GRANT SELECT ON `banking_payroll_db`.`roles` TO 'ledgerline_web'@'%';
GRANT SELECT ON `banking_payroll_db`.`permissions` TO 'ledgerline_web'@'%';
GRANT SELECT ON `banking_payroll_db`.`user_roles` TO 'ledgerline_web'@'%';
GRANT SELECT ON `banking_payroll_db`.`role_permissions` TO 'ledgerline_web'@'%';
GRANT SELECT (employee_id,employee_code,name,employment_status) ON `banking_payroll_db`.`employees` TO 'ledgerline_web'@'%';
GRANT SELECT,INSERT (name,email,phone,address,customer_status),UPDATE (name,email,phone,address,customer_status,row_version) ON `banking_payroll_db`.`customers` TO 'ledgerline_web'@'%';
GRANT SELECT,INSERT (branch_code,name,address,phone,branch_status),UPDATE (branch_code,name,address,phone,branch_status,row_version) ON `banking_payroll_db`.`branches` TO 'ledgerline_web'@'%';
GRANT SELECT,INSERT (account_number,customer_id,employee_id,account_type,open_date),UPDATE (employee_id,account_status,row_version) ON `banking_payroll_db`.`accounts` TO 'ledgerline_web'@'%';
GRANT SELECT ON `banking_payroll_db`.`account_opening_snapshots` TO 'ledgerline_web'@'%';
GRANT SELECT,INSERT (user_id,token_hash,csrf_token_hash,expires_at),UPDATE (revoked_at) ON `banking_payroll_db`.`sessions` TO 'ledgerline_web'@'%';
GRANT SELECT,INSERT,UPDATE ON `banking_payroll_db`.`login_throttles` TO 'ledgerline_web'@'%';
GRANT INSERT ON `banking_payroll_db`.`login_attempts` TO 'ledgerline_web'@'%';
GRANT INSERT (actor_id,action,entity_type,entity_id,before_values,after_values,http_request_id) ON `banking_payroll_db`.`audit_logs` TO 'ledgerline_web'@'%';
GRANT SELECT,INSERT (employee_code,name,department,phone,email,designation,date_of_joining,employment_status),UPDATE (employee_code,name,department,phone,email,designation,date_of_joining,employment_status,row_version) ON `banking_payroll_db`.`employees` TO 'ledgerline_web'@'%';
GRANT SELECT,INSERT (employee_id,payroll_period,salary_amount,bonus,deductions,gross_salary,net_salary,created_by),UPDATE (employee_id,payroll_period,salary_amount,bonus,deductions,gross_salary,net_salary,created_by,payroll_status,approved_by,approved_at,rejection_reason,row_version) ON `banking_payroll_db`.`payroll_records` TO 'ledgerline_web'@'%';
GRANT SELECT ON `banking_payroll_db`.`banking_transactions` TO 'ledgerline_web'@'%';
GRANT SELECT ON `banking_payroll_db`.`audit_logs` TO 'ledgerline_web'@'%';
GRANT SELECT ON `banking_payroll_db`.`v_monthly_payroll` TO 'ledgerline_web'@'%';
GRANT EXECUTE ON PROCEDURE `banking_payroll_db`.`sp_deposit_money` TO 'ledgerline_web'@'%';
GRANT EXECUTE ON PROCEDURE `banking_payroll_db`.`sp_withdraw_money` TO 'ledgerline_web'@'%';
GRANT EXECUTE ON PROCEDURE `banking_payroll_db`.`sp_transfer_money` TO 'ledgerline_web'@'%';
GRANT EXECUTE ON PROCEDURE `banking_payroll_db`.`sp_reverse_transaction` TO 'ledgerline_web'@'%';
GRANT EXECUTE ON PROCEDURE `banking_payroll_db`.`sp_process_payroll` TO 'ledgerline_web'@'%';
GRANT EXECUTE ON FUNCTION `banking_payroll_db`.calculate_net_salary TO 'ledgerline_web'@'%';
GRANT INSERT (name,email,password_hash,account_status),UPDATE (name,email,password_hash,account_status,row_version) ON `banking_payroll_db`.`users` TO 'ledgerline_web'@'%';
GRANT INSERT,DELETE ON `banking_payroll_db`.`user_roles` TO 'ledgerline_web'@'%';
GRANT SELECT ON `banking_payroll_db`.`transfers` TO 'ledgerline_web'@'%';
GRANT SELECT ON `banking_payroll_db`.`v_account_reconciliation` TO 'ledgerline_web'@'%';
GRANT SELECT ON `banking_payroll_db`.`v_customer_accounts` TO 'ledgerline_web'@'%';
GRANT SELECT ON `banking_payroll_db`.`v_branch_activity` TO 'ledgerline_web'@'%';
GRANT SELECT ON `banking_payroll_db`.`v_employee_payroll` TO 'ledgerline_web'@'%';
GRANT SELECT ON `banking_payroll_db`.`v_transaction_history` TO 'ledgerline_web'@'%';
SHOW GRANTS FOR 'ledgerline_web'@'%';
