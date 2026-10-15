-- Run on Ledgerline Cloud as avnadmin, before deploying the opening-review update.
-- Adds review metadata writes only; no balance updates or account activation.
GRANT SELECT, UPDATE (reconciliation_state,reviewed_by,reviewed_at,review_note) ON banking_payroll_db.account_opening_snapshots TO 'ledgerline_web'@'%';
GRANT SELECT ON banking_payroll_db.legacy_import_batches TO 'ledgerline_web'@'%';
GRANT SELECT ON banking_payroll_db.legacy_record_links TO 'ledgerline_web'@'%';
GRANT SELECT ON banking_payroll_db.account TO 'ledgerline_web'@'%';
SHOW GRANTS FOR 'ledgerline_web'@'%';
