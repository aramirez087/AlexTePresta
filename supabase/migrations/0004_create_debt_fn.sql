-- Migration 0004: Atomic debt + installment creation function
-- UNIQUE (debt_id, sequence_number) already exists in 0001_init.sql:63 — no DDL needed here
-- This function is the only authoritative path for creating a debt with its full schedule atomically

CREATE OR REPLACE FUNCTION public.create_debt_with_installments(
  p_debtor_id               uuid,
  p_currency                text,
  p_total_amount_minor      bigint,
  p_total_installments      int,
  p_installment_amount_minor bigint,
  p_due_day                 int,
  p_start_month             text,
  p_description             text,
  p_created_by              uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_debt_id uuid;
  v_seq     int;
  v_year    int;
  v_month   int;
  v_total_months int;
  v_target_month int;
  v_due_date date;
BEGIN
  INSERT INTO public.debts (
    debtor_id,
    currency,
    total_amount_minor,
    total_installments,
    installment_amount_minor,
    due_day,
    start_month,
    description,
    created_by
  ) VALUES (
    p_debtor_id,
    p_currency,
    p_total_amount_minor,
    p_total_installments,
    p_installment_amount_minor,
    p_due_day,
    p_start_month,
    p_description,
    p_created_by
  )
  RETURNING id INTO v_debt_id;

  -- Parse start_month 'YYYY-MM' into year and month integers
  v_year  := split_part(p_start_month, '-', 1)::int;
  v_month := split_part(p_start_month, '-', 2)::int;

  -- Convert to zero-indexed total months for arithmetic
  v_total_months := v_year * 12 + (v_month - 1);

  FOR v_seq IN 1..p_total_installments LOOP
    v_target_month := v_total_months + (v_seq - 1);
    v_due_date := make_date(
      v_target_month / 12,
      (v_target_month % 12) + 1,
      p_due_day
    );

    INSERT INTO public.installments (
      debt_id,
      sequence_number,
      due_date,
      amount_minor,
      remaining_amount_minor,
      status
    ) VALUES (
      v_debt_id,
      v_seq,
      v_due_date,
      p_installment_amount_minor,
      p_installment_amount_minor,
      'pending'
    )
    ON CONFLICT (debt_id, sequence_number) DO NOTHING;
  END LOOP;

  RETURN v_debt_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_debt_with_installments(uuid, text, bigint, int, bigint, int, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_debt_with_installments(uuid, text, bigint, int, bigint, int, text, text, uuid) TO service_role;
