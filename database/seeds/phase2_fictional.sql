-- FICTIONAL DEVELOPMENT DATA ONLY. Never automatically run in deployment.
-- No working passwords or positive balances: financial routines arrive in Phase 3.
INSERT INTO users(name,email,account_status) VALUES
 ('Demo Administrator','admin@ledgerline.example.test','disabled'),
 ('Demo Banking Staff','banking@ledgerline.example.test','disabled'),
 ('Demo Payroll Preparer','preparer@ledgerline.example.test','disabled'),
 ('Demo Payroll Reviewer','reviewer@ledgerline.example.test','disabled'),
 ('Demo Auditor','auditor@ledgerline.example.test','disabled');
-- statement-breakpoint
INSERT INTO user_roles(user_id,role_id)
 SELECT u.user_id,r.role_id FROM users u JOIN roles r ON r.role_name=
 CASE u.email
 WHEN 'admin@ledgerline.example.test' THEN 'administrator'
 WHEN 'banking@ledgerline.example.test' THEN 'banking_staff'
 WHEN 'preparer@ledgerline.example.test' THEN 'payroll_manager'
 WHEN 'reviewer@ledgerline.example.test' THEN 'payroll_manager'
 WHEN 'auditor@ledgerline.example.test' THEN 'auditor' END
 WHERE u.email IN ('admin@ledgerline.example.test','banking@ledgerline.example.test','preparer@ledgerline.example.test','reviewer@ledgerline.example.test','auditor@ledgerline.example.test');
-- statement-breakpoint
INSERT INTO branches(branch_code,name,address,phone) VALUES
 ('DEMO-CENTRAL','Demo Central Branch','100 Example Avenue, Fictional District','DEMO-0001'),
 ('DEMO-NORTH','Demo North Branch','200 Sample Road, Fictional District','DEMO-0002');
-- statement-breakpoint
INSERT INTO employees(employee_code,name,department,phone,email,designation,date_of_joining) VALUES
 ('DEMO-E001','Avery Shah (Fictional)','Banking','DEMO-0101','avery.employee@example.test','Account Officer','2026-01-10'),
 ('DEMO-E002','Robin Mehta (Fictional)','Finance','DEMO-0102','robin.employee@example.test','Payroll Analyst','2026-02-15'),
 ('DEMO-E003','Casey Rao (Fictional)','Operations','DEMO-0103','casey.employee@example.test','Operations Associate','2026-03-20');
-- statement-breakpoint
INSERT INTO customers(name,email,phone,address) VALUES
 ('Morgan Sen (Fictional)','morgan.customer@example.test','DEMO-0201','301 Example Street, Fictional City'),
 ('Jordan Iyer (Fictional)','jordan.customer@example.test','DEMO-0202','302 Example Street, Fictional City'),
 ('Taylor Das (Fictional)','taylor.customer@example.test','DEMO-0203','303 Example Street, Fictional City');
-- statement-breakpoint
INSERT INTO accounts(account_number,customer_id,employee_id,account_type,open_date)
 SELECT 'DEMO-A001',c.customer_id,e.employee_id,'savings','2026-10-01' FROM customers c CROSS JOIN employees e WHERE c.email='morgan.customer@example.test' AND e.employee_code='DEMO-E001';
-- statement-breakpoint
INSERT INTO accounts(account_number,customer_id,employee_id,account_type,open_date)
 SELECT 'DEMO-A002',c.customer_id,e.employee_id,'current','2026-10-02' FROM customers c CROSS JOIN employees e WHERE c.email='morgan.customer@example.test' AND e.employee_code='DEMO-E001';
-- statement-breakpoint
INSERT INTO accounts(account_number,customer_id,employee_id,account_type,open_date)
 SELECT 'DEMO-A003',c.customer_id,e.employee_id,'salary','2026-10-03' FROM customers c CROSS JOIN employees e WHERE c.email='jordan.customer@example.test' AND e.employee_code='DEMO-E001';
-- statement-breakpoint
INSERT INTO payroll(employee_id,salary_amount,bonus,deductions,gross_salary,net_salary,payroll_period,payroll_status,created_by)
 SELECT e.employee_id,50000.00,2000.00,3000.00,52000.00,49000.00,'2026-10-01','draft',u.user_id FROM employees e CROSS JOIN users u WHERE e.employee_code='DEMO-E002' AND u.email='preparer@ledgerline.example.test';
-- statement-breakpoint
INSERT INTO audit_logs(action,entity_type,after_values)
 VALUES ('development.seed','seed_runs',JSON_OBJECT('seed','phase2_fictional_v1','fictional',TRUE,'note','No funds or external payments; users disabled'));