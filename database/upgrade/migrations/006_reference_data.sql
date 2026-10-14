INSERT INTO roles(role_name,description) VALUES
 ('administrator','Administer the academic workspace'),
 ('banking_staff','Manage banking records and permitted operations'),
 ('payroll_manager','Manage employee records and payroll workflows'),
 ('auditor','Read and export explicitly permitted reports and history');
-- statement-breakpoint
INSERT INTO permissions(permission_code,description) VALUES
 ('customers.view','View customers'),('customers.create','Create customers'),('customers.update','Update or deactivate customers'),
 ('accounts.view','View accounts'),('accounts.create','Create zero-balance accounts'),('accounts.update','Update permitted account metadata'),
 ('transactions.view','View banking history'),('transactions.process','Deposit, withdraw and transfer fictional funds'),('transactions.reverse','Create controlled transaction reversals'),
 ('employees.view','View employee information'),('employees.create','Create employees'),('employees.update','Update or deactivate employees'),
 ('payroll.view','View sensitive payroll amounts'),('payroll.create','Create and submit payroll'),('payroll.update','Revise permitted payroll drafts'),('payroll.approve','Approve or reject payroll prepared by another user'),('payroll.process','Process approved academic payroll'),
 ('branches.view','View branches'),('branches.create','Create branches'),('branches.update','Update or deactivate branches'),
 ('reports.banking.view','Read banking summaries'),('reports.banking.export','Export banking summaries'),('reports.payroll.view','Read payroll summaries'),('reports.payroll.export','Export payroll summaries'),
 ('users.administer','Manage identities and assigned roles'),('audit.view','Browse authorized audit records'),('settings.administer','Manage application settings');
-- statement-breakpoint
INSERT INTO role_permissions(role_id,permission_id)
 SELECT r.role_id,p.permission_id FROM roles r CROSS JOIN permissions p WHERE r.role_name='administrator';
-- statement-breakpoint
INSERT INTO role_permissions(role_id,permission_id)
 SELECT r.role_id,p.permission_id FROM roles r CROSS JOIN permissions p
 WHERE r.role_name='banking_staff' AND p.permission_code IN
 ('customers.view','customers.create','customers.update','accounts.view','accounts.create','accounts.update','transactions.view','transactions.process','branches.view','reports.banking.view','reports.banking.export');
-- statement-breakpoint
INSERT INTO role_permissions(role_id,permission_id)
 SELECT r.role_id,p.permission_id FROM roles r CROSS JOIN permissions p
 WHERE r.role_name='payroll_manager' AND p.permission_code IN
 ('employees.view','employees.create','employees.update','payroll.view','payroll.create','payroll.update','payroll.approve','payroll.process','reports.payroll.view','reports.payroll.export');
-- statement-breakpoint
INSERT INTO role_permissions(role_id,permission_id)
 SELECT r.role_id,p.permission_id FROM roles r CROSS JOIN permissions p
 WHERE r.role_name='auditor' AND p.permission_code IN
 ('customers.view','accounts.view','transactions.view','employees.view','payroll.view','branches.view','reports.banking.view','reports.banking.export','reports.payroll.view','reports.payroll.export','audit.view');