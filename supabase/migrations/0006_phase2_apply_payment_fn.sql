-- Migration 0006: Phase 2 — partial payment converts installment remainder to interest_debt,
-- then applies remaining payment FIFO to active interest_debts.
-- Replaces the Phase 1 function from 0005_apply_payment_fn.sql.

CREATE OR REPLACE FUNCTION public.apply_payment(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment         payments%ROWTYPE;
  v_remaining       bigint;
  v_installment     installments%ROWTYPE;
  v_interest_debt   interest_debts%ROWTYPE;
  v_to_apply        bigint;
  v_new_remaining   bigint;
  v_applications    jsonb := '[]'::jsonb;
  v_default_rate    text;
BEGIN
  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PaymentNotFoundError: payment % not found', p_payment_id;
  END IF;
  IF v_payment.status <> 'pending' THEN
    RAISE EXCEPTION 'PaymentAlreadyAppliedError: payment % is not pending', p_payment_id;
  END IF;

  v_remaining := v_payment.amount_minor;

  -- Snapshot the default rate once; stored as JSONB string '"0.24"' → extract via #>> '{}'
  SELECT value #>> '{}' INTO v_default_rate FROM settings WHERE key = 'default_annual_rate';

  -- FIFO: lock pending installments for this debtor's debts in matching currency
  FOR v_installment IN
    SELECT i.*
    FROM installments i
    JOIN debts d ON d.id = i.debt_id
    WHERE d.debtor_id = v_payment.debtor_id
      AND d.currency  = v_payment.currency
      AND i.status    = 'pending'
    ORDER BY i.due_date ASC, i.sequence_number ASC
    FOR UPDATE OF i
  LOOP
    EXIT WHEN v_remaining = 0;

    v_to_apply      := LEAST(v_remaining, v_installment.remaining_amount_minor);
    v_new_remaining := v_installment.remaining_amount_minor - v_to_apply;

    INSERT INTO payment_applications
      (payment_id, target_type, target_id, applied_amount_minor)
    VALUES
      (p_payment_id, 'installment', v_installment.id, v_to_apply);

    v_applications := v_applications || jsonb_build_array(
      jsonb_build_object(
        'target_id',            v_installment.id,
        'target_type',          'installment',
        'applied_amount_minor', v_to_apply
      )
    );

    v_remaining := v_remaining - v_to_apply;

    IF v_new_remaining > 0 THEN
      -- Phase 2: payment exhausted before covering installment — convert remainder to interest_debt
      INSERT INTO interest_debts
        (debt_id, source_installment_id, principal_minor, current_balance_minor,
         interest_rate, is_simulated, status)
      VALUES
        (v_installment.debt_id, v_installment.id, v_new_remaining, v_new_remaining,
         v_default_rate, false, 'active');

      UPDATE installments
      SET remaining_amount_minor = 0,
          status                 = 'converted'
      WHERE id = v_installment.id;
    ELSE
      UPDATE installments
      SET remaining_amount_minor = 0,
          status                 = 'paid'
      WHERE id = v_installment.id;
    END IF;
  END LOOP;

  -- Phase 2: apply remaining payment FIFO to active non-simulated interest_debts
  IF v_remaining > 0 THEN
    FOR v_interest_debt IN
      SELECT idb.*
      FROM interest_debts idb
      JOIN debts d ON d.id = idb.debt_id
      WHERE d.debtor_id      = v_payment.debtor_id
        AND d.currency       = v_payment.currency
        AND idb.is_simulated = false
        AND idb.status       = 'active'
      ORDER BY idb.created_at ASC
      FOR UPDATE OF idb
    LOOP
      EXIT WHEN v_remaining = 0;

      v_to_apply      := LEAST(v_remaining, v_interest_debt.current_balance_minor);
      v_new_remaining := v_interest_debt.current_balance_minor - v_to_apply;

      INSERT INTO payment_applications
        (payment_id, target_type, target_id, applied_amount_minor)
      VALUES
        (p_payment_id, 'interest_debt', v_interest_debt.id, v_to_apply);

      v_applications := v_applications || jsonb_build_array(
        jsonb_build_object(
          'target_id',            v_interest_debt.id,
          'target_type',          'interest_debt',
          'applied_amount_minor', v_to_apply
        )
      );

      v_remaining := v_remaining - v_to_apply;

      UPDATE interest_debts
      SET current_balance_minor = v_new_remaining,
          status = CASE WHEN v_new_remaining = 0 THEN 'settled' ELSE status END
      WHERE id = v_interest_debt.id;
    END LOOP;
  END IF;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'PaymentExcessError: payment % has % minor units unallocated',
      p_payment_id, v_remaining;
  END IF;

  UPDATE payments
  SET status = 'approved', applied_at = now()
  WHERE id = p_payment_id;

  RETURN jsonb_build_object(
    'applications', v_applications,
    'leftover_minor', 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_payment(uuid) TO service_role;
