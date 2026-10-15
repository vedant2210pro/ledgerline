-- Run this ENTIRE file in your Aiven Workbench connection as avnadmin.
-- Owner-requested academic account activation. No balances or legacy rows are edited.
-- Any failed check rolls back ALL account/review/audit changes in the CALL.
-- Existing active/closed accounts and previous review evidence are left intact.
USE banking_payroll_db;
GRANT SELECT, UPDATE (reconciliation_state,reviewed_by,reviewed_at,review_note) ON banking_payroll_db.account_opening_snapshots TO 'ledgerline_web'@'%';
GRANT SELECT ON banking_payroll_db.legacy_import_batches TO 'ledgerline_web'@'%';
GRANT SELECT ON banking_payroll_db.legacy_record_links TO 'ledgerline_web'@'%';
GRANT SELECT ON banking_payroll_db.account TO 'ledgerline_web'@'%';

DROP PROCEDURE IF EXISTS ledgerline_activate_frozen_20261015;
DELIMITER $$
-- BEGIN PROCEDURE
CREATE PROCEDURE ledgerline_activate_frozen_20261015(IN p_email VARCHAR(254), IN p_account BIGINT UNSIGNED)
SQL SECURITY INVOKER
BEGIN
  DECLARE done INT DEFAULT 0;
  DECLARE aid BIGINT UNSIGNED;
  DECLARE actor BIGINT UNSIGNED;
  DECLARE n INT DEFAULT 0;
  DECLARE activated INT DEFAULT 0;
  DECLARE pending INT DEFAULT 0;
  DECLARE before_json JSON;
  DECLARE problem VARCHAR(128);
  DECLARE run_id CHAR(36) DEFAULT UUID();
  DECLARE candidates CURSOR FOR
    SELECT account_id FROM accounts WHERE account_status='frozen'
      AND (p_account IS NULL OR account_id=p_account) ORDER BY account_id FOR UPDATE;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done=1;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT MIN(u.user_id) INTO actor FROM users u
    JOIN user_roles ur USING(user_id) JOIN roles r USING(role_id)
    WHERE u.email=p_email AND u.account_status='active' AND r.role_name='administrator';
  IF actor IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='No active administrator matches the supplied email.'; END IF;
  OPEN candidates;
  account_loop: LOOP
    FETCH candidates INTO aid;
    IF done=1 THEN LEAVE account_loop; END IF;
    SELECT COUNT(*) INTO n FROM accounts a JOIN customers c USING(customer_id)
      JOIN employees e USING(employee_id)
      WHERE a.account_id=aid AND c.customer_status='active'
      AND e.employment_status IN ('active','legacy_incomplete');
    IF n<>1 THEN
      SET problem=CONCAT('Activation stopped: customer/officer unavailable for account ',aid);
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=problem;
    END IF;
    SELECT COUNT(*) INTO n FROM v_account_reconciliation WHERE account_id=aid AND discrepancy=0;
    IF n<>1 THEN
      SET problem=CONCAT('Activation stopped: balance discrepancy on account ',aid);
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=problem;
    END IF;
    SELECT JSON_OBJECT('account_status',account_status,'balance',balance,'row_version',row_version)
      INTO before_json FROM accounts WHERE account_id=aid;
    SELECT COUNT(*) INTO pending FROM account_opening_snapshots
      WHERE account_id=aid AND reconciliation_state='pending';
    IF pending=1 THEN
      SELECT COUNT(*) INTO n FROM account_opening_snapshots s
        JOIN legacy_import_batches b USING(batch_id)
        JOIN legacy_record_links l ON l.batch_id=s.batch_id AND l.target_id=s.account_id
          AND l.target_table='accounts' AND l.source_table='account' AND l.history_state='mapped'
        JOIN account original ON original.account_id=l.source_id
        WHERE s.account_id=aid AND b.verification_status='verified' AND original.balance=s.opening_balance;
      IF n<>1 THEN
        SET problem=CONCAT('Activation stopped: original opening balance not verified for account ',aid);
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=problem;
      END IF;
      UPDATE account_opening_snapshots SET reconciliation_state='reviewed',reviewed_by=actor,
        reviewed_at=UTC_TIMESTAMP(6),
        review_note='Owner-authorized academic bulk activation: automated original-source balance, verified import and ledger reconciliation checks passed. Not a manual statement review.'
        WHERE account_id=aid;
      INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,before_values,after_values,http_request_id)
        SELECT actor,'accounts.opening_review','accounts',aid,JSON_OBJECT('reconciliation_state','pending'),
          JSON_OBJECT('reconciliation_state',reconciliation_state,'opening_balance',opening_balance,
            'reviewed_by',reviewed_by,'reviewed_at',reviewed_at,'review_note',review_note),run_id
        FROM account_opening_snapshots WHERE account_id=aid;
    END IF;
    UPDATE accounts SET account_status='active',row_version=row_version+1 WHERE account_id=aid;
    INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,before_values,after_values,http_request_id)
      SELECT actor,'accounts.activate_bulk','accounts',aid,before_json,
        JSON_OBJECT('account_status',account_status,'balance',balance,'row_version',row_version,
          'reason','Owner requested activation of frozen academic accounts'),run_id
      FROM accounts WHERE account_id=aid;
    SET activated=activated+1;
  END LOOP;
  CLOSE candidates;
  COMMIT;
  SELECT activated AS accounts_activated,run_id AS audit_request_id;
END
-- END PROCEDURE
$$
DELIMITER ;

CALL ledgerline_activate_frozen_20261015('sawantvedant2207@gmail.com',NULL);
DROP PROCEDURE IF EXISTS ledgerline_activate_frozen_20261015;
SELECT account_number,account_status,balance FROM accounts ORDER BY account_id;
SELECT account_id,discrepancy FROM v_account_reconciliation WHERE discrepancy<>0;
