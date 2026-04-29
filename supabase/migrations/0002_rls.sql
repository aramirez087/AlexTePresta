-- Migration 0002: Row-Level Security for all tables
-- Admins: full read/write access to all tables
-- Debtors: read-only access to own data, INSERT into payments with restrictions

-- Helper: check if calling user is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interest_debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interest_accruals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- USERS
CREATE POLICY "admins_all_users" ON public.users
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "debtors_read_own_user" ON public.users
  FOR SELECT USING (id = auth.uid());

-- INVITES (admin-only; debtors have no access)
CREATE POLICY "admins_all_invites" ON public.invites
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- DEBTS
CREATE POLICY "admins_all_debts" ON public.debts
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "debtors_read_own_debts" ON public.debts
  FOR SELECT USING (debtor_id = auth.uid());

-- INSTALLMENTS
CREATE POLICY "admins_all_installments" ON public.installments
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "debtors_read_own_installments" ON public.installments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.debts
      WHERE debts.id = installments.debt_id
        AND debts.debtor_id = auth.uid()
    )
  );

-- INTEREST_DEBTS
CREATE POLICY "admins_all_interest_debts" ON public.interest_debts
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "debtors_read_own_interest_debts" ON public.interest_debts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.debts
      WHERE debts.id = interest_debts.debt_id
        AND debts.debtor_id = auth.uid()
    )
  );

-- PAYMENTS
CREATE POLICY "admins_all_payments" ON public.payments
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "debtors_read_own_payments" ON public.payments
  FOR SELECT USING (debtor_id = auth.uid());

-- Debtors may only submit (INSERT) their own pending payments
CREATE POLICY "debtors_insert_pending_payments" ON public.payments
  FOR INSERT WITH CHECK (
    debtor_id = auth.uid()
    AND created_by = auth.uid()
    AND status = 'pending'
  );

-- PAYMENT_APPLICATIONS (audit log; debtors read-only via their payments)
CREATE POLICY "admins_all_payment_applications" ON public.payment_applications
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "debtors_read_own_payment_applications" ON public.payment_applications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.payments
      WHERE payments.id = payment_applications.payment_id
        AND payments.debtor_id = auth.uid()
    )
  );

-- INTEREST_ACCRUALS
CREATE POLICY "admins_all_interest_accruals" ON public.interest_accruals
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "debtors_read_own_interest_accruals" ON public.interest_accruals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.interest_debts idb
      JOIN public.debts d ON d.id = idb.debt_id
      WHERE idb.id = interest_accruals.interest_debt_id
        AND d.debtor_id = auth.uid()
    )
  );

-- SETTINGS (debtors may read rates for transparency; admin controls writes)
CREATE POLICY "admins_all_settings" ON public.settings
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "authenticated_read_settings" ON public.settings
  FOR SELECT USING (auth.uid() IS NOT NULL);
