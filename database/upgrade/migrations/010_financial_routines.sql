CREATE FUNCTION calculate_net_salary(p_base DECIMAL(18,2), p_bonus DECIMAL(18,2), p_deductions DECIMAL(18,2))
RETURNS DECIMAL(18,2) DETERMINISTIC NO SQL SQL SECURITY INVOKER
BEGIN
  IF p_base IS NULL OR p_bonus IS NULL OR p_deductions IS NULL OR p_base<0 OR p_bonus<0 OR p_deductions<0 OR p_deductions>p_base+p_bonus THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid salary components';
  END IF;
  RETURN p_base+p_bonus-p_deductions;
END;
-- statement-breakpoint
CREATE PROCEDURE ll_authorize(IN p_actor BIGINT UNSIGNED, IN p_permission VARCHAR(80))
SQL SECURITY DEFINER
BEGIN
  DECLARE v_status VARCHAR(16) DEFAULT NULL;
  SELECT account_status INTO v_status FROM users WHERE user_id=p_actor FOR SHARE;
  IF v_status IS NULL OR v_status<>'active' OR NOT EXISTS (
    SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp.role_id=ur.role_id
    JOIN permissions p ON p.permission_id=rp.permission_id
    WHERE ur.user_id=p_actor AND p.permission_code=p_permission
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Operation not authorized'; END IF;
END;
-- statement-breakpoint
CREATE PROCEDURE ll_lock_account(IN p_account BIGINT UNSIGNED, OUT p_balance DECIMAL(18,2))
SQL SECURITY DEFINER
BEGIN
  DECLARE v_status VARCHAR(16) DEFAULT NULL;
  SET p_balance=NULL;
  SELECT balance,account_status INTO p_balance,v_status FROM accounts WHERE account_id=p_account FOR UPDATE;
  IF v_status IS NULL OR v_status<>'active' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Account is not active'; END IF;
END;
-- statement-breakpoint
CREATE PROCEDURE ll_execute(
 IN p_actor BIGINT UNSIGNED, IN p_operation VARCHAR(24), IN p_key TEXT,
 IN p_source BIGINT UNSIGNED, IN p_destination BIGINT UNSIGNED, IN p_branch BIGINT UNSIGNED,
 IN p_amount TEXT, IN p_description TEXT, IN p_original BIGINT UNSIGNED, IN p_payroll BIGINT UNSIGNED)
SQL SECURITY DEFINER
main: BEGIN
  DECLARE v_request BIGINT UNSIGNED;
  DECLARE v_hash BINARY(32);
  DECLARE v_saved_hash BINARY(32);
  DECLARE v_reference VARCHAR(64);
  DECLARE v_state VARCHAR(24);
  DECLARE v_amount DECIMAL(18,2);
  DECLARE v_source BIGINT UNSIGNED;
  DECLARE v_destination BIGINT UNSIGNED;
  DECLARE v_source_balance DECIMAL(18,2);
  DECLARE v_destination_balance DECIMAL(18,2);
  DECLARE v_transfer BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_original BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_other BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_type VARCHAR(24);
  DECLARE v_source_type VARCHAR(24);
  DECLARE v_destination_type VARCHAR(24);
  DECLARE v_preparer BIGINT UNSIGNED;
  DECLARE v_approver BIGINT UNSIGNED;
  DECLARE v_employee BIGINT UNSIGNED;
  DECLARE v_employee_status VARCHAR(24);
  DECLARE v_branch_status VARCHAR(16) DEFAULT NULL;
  DECLARE v_net DECIMAL(18,2);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  IF p_operation IS NULL OR p_operation NOT IN ('deposit','withdrawal','transfer','reversal','payroll') OR
     p_key IS NULL OR CHAR_LENGTH(p_key) NOT BETWEEN 1 AND 100 OR NOT REGEXP_LIKE(p_key,'^[A-Za-z0-9._:-]+$','c') OR
     p_description IS NULL OR CHAR_LENGTH(TRIM(p_description)) NOT BETWEEN 1 AND 500 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid operation, request key or description';
  END IF;
  START TRANSACTION;
  CALL ll_authorize(p_actor,CASE p_operation WHEN 'reversal' THEN 'transactions.reverse' WHEN 'payroll' THEN 'payroll.process' ELSE 'transactions.process' END);
  SET v_hash=UNHEX(SHA2(CAST(JSON_ARRAY(p_source,p_destination,p_branch,p_amount,p_description,p_original,p_payroll) AS CHAR),256));
  INSERT INTO operation_requests(actor_id,operation,idempotency_key,payload_hash)
    VALUES(p_actor,p_operation,p_key,v_hash) ON DUPLICATE KEY UPDATE request_id=request_id;
  SELECT request_id,payload_hash,request_status,result_reference INTO v_request,v_saved_hash,v_state,v_reference
    FROM operation_requests WHERE actor_id=p_actor AND operation=p_operation AND idempotency_key=p_key FOR UPDATE;
  IF v_saved_hash<>v_hash THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Idempotency key payload conflict'; END IF;
  IF v_state='completed' THEN
    COMMIT; SELECT v_reference AS reference_number,1 AS replayed; LEAVE main;
  END IF;
  SET v_reference=UUID();

  IF p_operation='payroll' THEN
    SET v_state=NULL;
    SELECT payroll_status,created_by,approved_by,employee_id,net_salary
      INTO v_state,v_preparer,v_approver,v_employee,v_net FROM payroll_records WHERE payroll_id=p_payroll FOR UPDATE;
    IF v_state IS NULL OR v_state<>'approved' OR v_preparer=v_approver OR v_approver IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Payroll requires independent approval';
    END IF;
    CALL ll_authorize(v_approver,'payroll.approve');
    SELECT employment_status INTO v_employee_status FROM employees WHERE employee_id=v_employee FOR SHARE;
    IF v_employee_status<>'active' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Employee is not active'; END IF;
    UPDATE payroll_records SET payroll_status='processed',processed_at=UTC_TIMESTAMP(6),pay_date=UTC_DATE(),processing_reference=v_reference WHERE payroll_id=p_payroll;
    INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,request_id,before_values,after_values)
      VALUES(p_actor,'payroll.process','payroll_records',p_payroll,v_request,JSON_OBJECT('status','approved'),JSON_OBJECT('status','processed','reference',v_reference,'net_salary',v_net));
  ELSE
    SELECT branch_status INTO v_branch_status FROM branches WHERE branch_id=p_branch FOR SHARE;
    IF v_branch_status IS NULL OR v_branch_status<>'active' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Branch is not active'; END IF;
    SET v_source=p_source; SET v_destination=p_destination;
    IF p_operation='reversal' THEN
      SET v_type=NULL;
      SELECT transaction_type,account_id,amount,transfer_id,transaction_id INTO v_type,v_source,v_amount,v_transfer,v_original
        FROM banking_transactions WHERE transaction_id=p_original;
      IF v_type IS NULL OR v_type IN ('reversal_debit','reversal_credit') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Transaction cannot be reversed'; END IF;
      IF v_transfer IS NOT NULL THEN
        SELECT account_id,transaction_id INTO v_source,v_original FROM banking_transactions WHERE transfer_id=v_transfer AND transaction_type='transfer_credit';
        SELECT account_id,transaction_id INTO v_destination,v_other FROM banking_transactions WHERE transfer_id=v_transfer AND transaction_type='transfer_debit';
        IF v_other IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Incomplete transfer cannot be reversed'; END IF;
        SET v_source_type='reversal_debit'; SET v_destination_type='reversal_credit';
      ELSE
        SET v_destination=NULL;
        SET v_source_type=IF(v_type='deposit','reversal_debit','reversal_credit');
      END IF;
      SET v_transfer=NULL;
    ELSE
      IF p_amount IS NULL OR NOT REGEXP_LIKE(p_amount,'^(0|[1-9][0-9]{0,15})([.][0-9]{1,2})?$','c') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Amount must be an exact decimal with at most two fractional digits';
      END IF;
      SET v_amount=CAST(p_amount AS DECIMAL(18,2));
      IF v_amount<=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Amount must be positive'; END IF;
      SET v_source_type=CASE p_operation WHEN 'deposit' THEN 'deposit' WHEN 'withdrawal' THEN 'withdrawal' ELSE 'transfer_debit' END;
      SET v_destination_type='transfer_credit';
    END IF;
    IF v_source IS NULL OR (p_operation='transfer' AND v_destination IS NULL) OR v_source=v_destination THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Distinct valid accounts required';
    END IF;
    IF v_destination IS NULL OR v_source<v_destination THEN
      CALL ll_lock_account(v_source,v_source_balance);
      IF v_destination IS NOT NULL THEN CALL ll_lock_account(v_destination,v_destination_balance); END IF;
    ELSE
      CALL ll_lock_account(v_destination,v_destination_balance);
      CALL ll_lock_account(v_source,v_source_balance);
    END IF;
    IF v_source_type IN ('deposit','reversal_credit') THEN SET v_source_balance=v_source_balance+v_amount;
    ELSE
      IF v_source_balance<v_amount THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Insufficient funds'; END IF;
      SET v_source_balance=v_source_balance-v_amount;
    END IF;
    UPDATE accounts SET balance=v_source_balance,row_version=row_version+1 WHERE account_id=v_source;
    IF v_destination IS NOT NULL THEN
      SET v_destination_balance=v_destination_balance+v_amount;
      UPDATE accounts SET balance=v_destination_balance,row_version=row_version+1 WHERE account_id=v_destination;
    END IF;
    IF p_operation='transfer' THEN
      INSERT INTO transfers(reference_number,request_id,source_account_id,destination_account_id,amount,description,created_by)
        VALUES(v_reference,v_request,v_source,v_destination,v_amount,p_description,p_actor);
      SET v_transfer=LAST_INSERT_ID();
    END IF;
    INSERT INTO banking_transactions(account_id,branch_id,request_id,transfer_id,transaction_type,amount,balance_after,description,reference_number,created_by,reversal_of_transaction_id)
      VALUES(v_source,p_branch,v_request,v_transfer,v_source_type,v_amount,v_source_balance,p_description,CONCAT(v_reference,'-1'),p_actor,v_original);
    IF v_destination IS NOT NULL THEN
      INSERT INTO banking_transactions(account_id,branch_id,request_id,transfer_id,transaction_type,amount,balance_after,description,reference_number,created_by,reversal_of_transaction_id)
        VALUES(v_destination,p_branch,v_request,v_transfer,v_destination_type,v_amount,v_destination_balance,p_description,CONCAT(v_reference,'-2'),p_actor,v_other);
    END IF;
    INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,request_id,after_values)
      VALUES(p_actor,CONCAT('transactions.',p_operation),'operation_requests',v_request,v_request,
       JSON_OBJECT('reference',v_reference,'source',v_source,'destination',v_destination,'amount',v_amount,'original',p_original));
  END IF;
  UPDATE operation_requests SET request_status='completed',result_reference=v_reference,completed_at=UTC_TIMESTAMP(6) WHERE request_id=v_request;
  COMMIT;
  SELECT v_reference AS reference_number,0 AS replayed;
END;
-- statement-breakpoint
CREATE PROCEDURE sp_deposit_money(IN actor BIGINT UNSIGNED,IN request_key TEXT,IN account BIGINT UNSIGNED,IN branch BIGINT UNSIGNED,IN amount TEXT,IN description TEXT)
SQL SECURITY DEFINER
CALL ll_execute(actor,'deposit',request_key,account,NULL,branch,amount,description,NULL,NULL);
-- statement-breakpoint
CREATE PROCEDURE sp_withdraw_money(IN actor BIGINT UNSIGNED,IN request_key TEXT,IN account BIGINT UNSIGNED,IN branch BIGINT UNSIGNED,IN amount TEXT,IN description TEXT)
SQL SECURITY DEFINER
CALL ll_execute(actor,'withdrawal',request_key,account,NULL,branch,amount,description,NULL,NULL);
-- statement-breakpoint
CREATE PROCEDURE sp_transfer_money(IN actor BIGINT UNSIGNED,IN request_key TEXT,IN source BIGINT UNSIGNED,IN destination BIGINT UNSIGNED,IN branch BIGINT UNSIGNED,IN amount TEXT,IN description TEXT)
SQL SECURITY DEFINER
CALL ll_execute(actor,'transfer',request_key,source,destination,branch,amount,description,NULL,NULL);
-- statement-breakpoint
CREATE PROCEDURE sp_reverse_transaction(IN actor BIGINT UNSIGNED,IN request_key TEXT,IN original BIGINT UNSIGNED,IN branch BIGINT UNSIGNED,IN reason TEXT)
SQL SECURITY DEFINER
CALL ll_execute(actor,'reversal',request_key,NULL,NULL,branch,NULL,reason,original,NULL);
-- statement-breakpoint
CREATE PROCEDURE sp_process_payroll(IN actor BIGINT UNSIGNED,IN request_key TEXT,IN payroll BIGINT UNSIGNED,IN description TEXT)
SQL SECURITY DEFINER
CALL ll_execute(actor,'payroll',request_key,NULL,NULL,NULL,NULL,description,NULL,payroll);
