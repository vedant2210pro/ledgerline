-- Read-only companion queries. Run after selecting banking_payroll_db.
-- This machine uses the legacy-upgrade track. Fresh clean installs use schema_migrations instead.
SELECT migration_name,status,applied_at FROM legacy_upgrade_migrations ORDER BY migration_name;
SELECT TABLE_NAME,ENGINE,TABLE_COLLATION FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME;
SELECT TABLE_NAME,CONSTRAINT_NAME,CONSTRAINT_TYPE FROM information_schema.table_constraints WHERE CONSTRAINT_SCHEMA=DATABASE() ORDER BY TABLE_NAME,CONSTRAINT_TYPE;
SELECT TABLE_NAME,REFERENCED_TABLE_NAME,DELETE_RULE FROM information_schema.referential_constraints WHERE CONSTRAINT_SCHEMA=DATABASE();
SELECT c.customer_id,c.name,COUNT(a.account_id) AS account_count,COALESCE(SUM(a.balance),0.00) AS total_balance
 FROM customers c LEFT JOIN accounts a ON a.customer_id=c.customer_id GROUP BY c.customer_id,c.name;
SELECT a.account_number,c.name AS customer,e.name AS account_officer,a.balance
 FROM accounts a INNER JOIN customers c ON c.customer_id=a.customer_id INNER JOIN employees e ON e.employee_id=a.employee_id;
SELECT e.name,p.payroll_period,p.salary_amount,p.gross_salary,p.net_salary,p.payroll_status
 FROM payroll_records p INNER JOIN employees e ON e.employee_id=p.employee_id;
SELECT r.role_name,COUNT(rp.permission_id) AS permission_count FROM roles r LEFT JOIN role_permissions rp ON rp.role_id=r.role_id GROUP BY r.role_id,r.role_name;