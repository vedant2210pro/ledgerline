CREATE TABLE branches (
  branch_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  address VARCHAR(500) NOT NULL,
  phone VARCHAR(25) NOT NULL,
  branch_status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT ck_branch_name CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT ck_branch_status CHECK (branch_status IN ('active','inactive'))
) ENGINE=InnoDB;
-- statement-breakpoint
CREATE TABLE employees (
  employee_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_code VARCHAR(24) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  department VARCHAR(80) NOT NULL,
  phone VARCHAR(25) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  designation VARCHAR(100) NOT NULL,
  employment_status VARCHAR(16) NOT NULL DEFAULT 'active',
  date_of_joining DATE NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT ck_employee_name CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT ck_employee_department CHECK (CHAR_LENGTH(TRIM(department)) > 0),
  CONSTRAINT ck_employee_status CHECK (employment_status IN ('active','on_leave','inactive'))
) ENGINE=InnoDB;
-- statement-breakpoint
CREATE TABLE customers (
  customer_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  phone VARCHAR(25) NOT NULL,
  address VARCHAR(500) NOT NULL,
  customer_status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT ck_customer_name CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT ck_customer_status CHECK (customer_status IN ('active','inactive'))
) ENGINE=InnoDB;
-- statement-breakpoint
CREATE TABLE accounts (
  account_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  account_number VARCHAR(24) NOT NULL UNIQUE,
  customer_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  account_type VARCHAR(16) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  balance DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  open_date DATE NOT NULL,
  account_status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_account_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE RESTRICT,
  CONSTRAINT fk_account_employee FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE RESTRICT,
  CONSTRAINT ck_account_type CHECK (account_type IN ('savings','current','salary')),
  CONSTRAINT ck_account_currency CHECK (currency = 'INR'),
  CONSTRAINT ck_account_balance CHECK (balance >= 0),
  CONSTRAINT ck_account_status CHECK (account_status IN ('active','frozen','closed')),
  CONSTRAINT ck_closed_account CHECK (account_status <> 'closed' OR balance = 0)
) ENGINE=InnoDB;
-- statement-breakpoint
CREATE TABLE payroll (
  payroll_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id BIGINT UNSIGNED NOT NULL,
  salary_amount DECIMAL(18,2) NOT NULL,
  bonus DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  deductions DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  gross_salary DECIMAL(18,2) NOT NULL,
  net_salary DECIMAL(18,2) NOT NULL,
  payroll_period DATE NOT NULL COMMENT 'First day of the pay month',
  pay_date DATE NULL,
  payroll_status VARCHAR(20) NOT NULL DEFAULT 'draft',
  created_by BIGINT UNSIGNED NOT NULL,
  approved_by BIGINT UNSIGNED NULL,
  approved_at DATETIME(6) NULL,
  processed_at DATETIME(6) NULL,
  rejection_reason VARCHAR(500) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT uq_payroll_period UNIQUE (employee_id,payroll_period),
  CONSTRAINT fk_payroll_employee FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_creator FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_approver FOREIGN KEY (approved_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  CONSTRAINT ck_payroll_values CHECK (salary_amount >= 0 AND bonus >= 0 AND deductions >= 0 AND deductions <= salary_amount + bonus),
  CONSTRAINT ck_payroll_gross CHECK (gross_salary = salary_amount + bonus),
  CONSTRAINT ck_payroll_net CHECK (net_salary = gross_salary - deductions AND net_salary >= 0),
  CONSTRAINT ck_payroll_period CHECK (DAYOFMONTH(payroll_period) = 1),
  CONSTRAINT ck_payroll_status CHECK (payroll_status IN ('draft','pending_approval','approved','processed','rejected','failed')),
  CONSTRAINT ck_payroll_approval_pair CHECK ((approved_by IS NULL AND approved_at IS NULL) OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CONSTRAINT ck_payroll_approval_required CHECK (payroll_status NOT IN ('approved','processed') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CONSTRAINT ck_payroll_separation CHECK (approved_by IS NULL OR approved_by <> created_by),
  CONSTRAINT ck_payroll_processing CHECK ((payroll_status = 'processed' AND processed_at IS NOT NULL AND pay_date IS NOT NULL) OR (payroll_status <> 'processed' AND processed_at IS NULL)),
  CONSTRAINT ck_payroll_rejection CHECK (payroll_status <> 'rejected' OR (rejection_reason IS NOT NULL AND CHAR_LENGTH(TRIM(rejection_reason)) > 0))
) ENGINE=InnoDB;