-- Migration 0005: FIFO payment application function (Phase 1)
-- Applies a pending payment to installments in due_date ASC, sequence_number ASC order.
-- Phase 1: excess payment (leftover > 0 after FIFO loop) is rejected with rollback.
-- Phase 2 (interest debt conversion on partial pay) deferred to Session 07.

CREATE OR REPLACE FUNCTION public.apply_payment(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment         payments%ROWTYPE;
  v_remaining       bigint;
  v_installment     installments%ROWTYPE;
  v_to_apply        bigint;
  v_new_remaining   bigint;
  v_applications    jsonb := '[]'::jsonb;
BEGIN
  -- Lock the payment row to prevent concurrent application
  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PaymentNotFoundError: payment % not found', p_payment_id;
  END IF;
  IF v_payment.status <> 'pending' THEN
    RAISE EXCEPTION 'PaymentAlreadyAppliedError: payment % is not pending', p_payment_id;
  END IF;

  v_remaining := v_payment.amount_minor;

  -- FIFO: lock pending installments for this debtor's debts in matching currency
  FOR v_installment IN
    SELECT i.*
    FROM installments i
    JOIN debts d ON d.id = i.debt_id
    WHERE d.debtor_id = v_payment.debtor_id
      AND d.currency  = v_payment.currency
      AND i.status    = 'pending'
    ORDER BY i.due_date ASC, i.sequence_number ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining = 0;

    v_to_apply := LEAST(v_remaining, v_installment.remaining_amount_minor);
    v_new_remaining := v_installment.remaining_amount_minor - v_to_apply;

    INSERT INTO payment_applications
      (payment_id, target_type, target_id, applied_amount_minor)
    VALUES
      (p_payment_id, 'installment', v_installment.id, v_to_apply);

    v_applications := v_applications || jsonb_build_array(
      jsonb_build_object(
        'target_id', v_installment.id,
        'target_type', 'installment',
        'applied_amount_minor', v_to_apply
      )
    );

    UPDATE installments
    SET remaining_amount_minor = v_new_remaining,
        status = CASE WHEN v_new_remaining = 0 THEN 'paid' ELSE status END
    WHERE id = v_installment.id;

    v_remaining := v_remaining - v_to_apply;
  END LOOP;

  -- Phase 1: reject any excess; roll back the entire transaction
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
