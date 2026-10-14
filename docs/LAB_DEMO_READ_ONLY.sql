-- Run in MySQL Workbench. These statements only read data/metadata.
USE banking_payroll_db;

-- Inventory: base tables and views are listed separately.
SELECT TABLE_NAME, TABLE_TYPE, ENGINE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_TYPE, TABLE_NAME;

-- Primary keys, foreign keys, checks and uniqueness constraints.
SELECT CONSTRAINT_TYPE, COUNT(*) AS constraint_count
FROM information_schema.TABLE_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE()
GROUP BY CONSTRAINT_TYPE;

-- Exact column definitions and relationships for one central table.
SHOW CREATE TABLE accounts;

-- All foreign-key relationships for explaining the ER model.
SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- User access without exposing password hashes or session tokens.
SELECT u.user_id, u.name, u.email, u.account_status,
       GROUP_CONCAT(r.role_name ORDER BY r.role_name SEPARATOR ', ') AS roles
FROM users u
LEFT JOIN user_roles ur ON ur.user_id = u.user_id
LEFT JOIN roles r ON r.role_id = ur.role_id
GROUP BY u.user_id, u.name, u.email, u.account_status;

SELECT r.role_name, p.permission_code
FROM roles r
JOIN role_permissions rp ON rp.role_id = r.role_id
JOIN permissions p ON p.permission_id = rp.permission_id
ORDER BY r.role_name, p.permission_code;

-- A discrepancy of 0.00 means the recorded balance reconciles.
SELECT account_number, balance, opening_balance, net_movement, discrepancy
FROM v_account_reconciliation LIMIT 100;

-- JOIN and GROUP BY examples already encapsulated in reporting views.
SELECT * FROM v_customer_accounts LIMIT 20;
SELECT * FROM v_monthly_payroll LIMIT 20;

-- Procedures/functions, triggers and indexes.
SELECT ROUTINE_NAME, ROUTINE_TYPE
FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE();
SELECT TRIGGER_NAME, EVENT_MANIPULATION, EVENT_OBJECT_TABLE, ACTION_TIMING
FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE();
SHOW INDEX FROM banking_transactions;

-- Demonstrates the optimizer's plan without changing data.
EXPLAIN SELECT transaction_id, account_id, amount
FROM banking_transactions
WHERE account_id = 1 AND transaction_date >= '2026-01-01'
ORDER BY transaction_date;

-- Audit metadata only; avoids dumping personal before/after snapshots.
SELECT audit_id, actor_id, action, entity_type, entity_id, created_at
FROM audit_logs ORDER BY audit_id DESC LIMIT 20;
