-- Migration 0001: Initial schema for AlexTePresta Phase 1+2
-- All monetary amounts stored as bigint in minor units (céntimos/cents)
-- Currency and status values enforced by CHECK constraints (no enum types)

-- users: mirrors auth.users; extended with application role
CREATE TABLE public.users (
  id          uuid        PRIMARY KEY,  -- mirrors auth.users.id
  email       text        UNIQUE NOT NULL,
  role        text        NOT NULL CHECK (role IN ('admin', 'debtor')),
  invited_by  uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX users_role_idx ON public.users(role);
CREATE INDEX users_email_idx ON public.users(email);

-- invites: admin-issued one-time invitation tokens
CREATE TABLE public.invites (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text        NOT NULL,
  token       text        UNIQUE NOT NULL,  -- 32-byte hex, crypto-random
  expires_at  timestamptz NOT NULL,         -- created_at + 7 days
  consumed_at timestamptz,                  -- NULL = unused
  inviter_id  uuid        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX invites_email_idx ON public.invites(email);
CREATE INDEX invites_token_idx ON public.invites(token);

-- debts: zero-rate installment obligations, single-currency per debt
CREATE TABLE public.debts (
  id                       uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  debtor_id                uuid    NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  currency                 text    NOT NULL CHECK (currency IN ('CRC', 'USD')),
  total_amount_minor       bigint  NOT NULL CHECK (total_amount_minor > 0),
  total_installments       int     NOT NULL CHECK (total_installments BETWEEN 1 AND 120),
  installment_amount_minor bigint  NOT NULL CHECK (installment_amount_minor > 0),
  due_day                  int     NOT NULL CHECK (due_day BETWEEN 1 AND 28),
  start_month              text    NOT NULL,  -- 'YYYY-MM'; text avoids timezone ambiguity
  description              text,
  status                   text    NOT NULL DEFAULT 'active'
                                   CHECK (status IN ('active', 'paid', 'cancelled')),
  created_by               uuid    NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX debts_debtor_id_idx ON public.debts(debtor_id);
CREATE INDEX debts_status_idx ON public.debts(status);
CREATE INDEX debts_debtor_status_idx ON public.debts(debtor_id, status);

-- installments: scheduled payment slices of a debt
CREATE TABLE public.installments (
  id                     uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id                uuid    NOT NULL REFERENCES public.debts(id) ON DELETE CASCADE,
  sequence_number        int     NOT NULL CHECK (sequence_number > 0),
  due_date               date    NOT NULL,
  amount_minor           bigint  NOT NULL CHECK (amount_minor > 0),
  remaining_amount_minor bigint  NOT NULL CHECK (remaining_amount_minor >= 0),
  status                 text    NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'paid', 'converted', 'overdue')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (debt_id, sequence_number)
);

CREATE INDEX installments_debt_id_idx ON public.installments(debt_id);
CREATE INDEX installments_due_date_idx ON public.installments(due_date);
CREATE INDEX installments_status_idx ON public.installments(status);
CREATE INDEX installments_debt_seq_idx ON public.installments(debt_id, sequence_number);

-- interest_debts: compound-interest sub-debts from partial installment payments
CREATE TABLE public.interest_debts (
  id                    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id               uuid    NOT NULL REFERENCES public.debts(id) ON DELETE RESTRICT,
  source_installment_id uuid    REFERENCES public.installments(id) ON DELETE RESTRICT,
  principal_minor       bigint  NOT NULL CHECK (principal_minor > 0),
  current_balance_minor bigint  NOT NULL CHECK (current_balance_minor >= 0),
  interest_rate         text    NOT NULL,   -- decimal string snapshot at creation, e.g. "0.24"
  is_simulated          boolean NOT NULL DEFAULT false,
  mirror_of             uuid    REFERENCES public.interest_debts(id) ON DELETE SET NULL,
  status                text    NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'settled')),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX interest_debts_debt_id_idx ON public.interest_debts(debt_id);
CREATE INDEX interest_debts_source_installment_id_idx ON public.interest_debts(source_installment_id);
CREATE INDEX interest_debts_is_simulated_idx ON public.interest_debts(is_simulated);
CREATE INDEX interest_debts_mirror_of_idx ON public.interest_debts(mirror_of);
CREATE INDEX interest_debts_status_idx ON public.interest_debts(status);

-- payments: money submitted by debtor or registered directly by admin
CREATE TABLE public.payments (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  debtor_id    uuid    NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  currency     text    NOT NULL CHECK (currency IN ('CRC', 'USD')),
  amount_minor bigint  NOT NULL CHECK (amount_minor > 0),
  status       text    NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'approved', 'rejected')),
  created_by   uuid    NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  applied_at   timestamptz,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payments_debtor_id_idx ON public.payments(debtor_id);
CREATE INDEX payments_status_idx ON public.payments(status);
CREATE INDEX payments_created_at_idx ON public.payments(created_at);

-- payment_applications: immutable audit log linking payments to targets
-- target_id is a logical polymorphic FK; no DB-level FK constraint
-- Application layer validates target_type before every insert
CREATE TABLE public.payment_applications (
  id                   uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id           uuid    NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  target_type          text    NOT NULL CHECK (target_type IN ('installment', 'interest_debt')),
  target_id            uuid    NOT NULL,
  applied_amount_minor bigint  NOT NULL CHECK (applied_amount_minor > 0),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payment_applications_payment_id_idx ON public.payment_applications(payment_id);
CREATE INDEX payment_applications_target_idx ON public.payment_applications(target_type, target_id);

-- interest_accruals: monthly compound interest records per interest debt
CREATE TABLE public.interest_accruals (
  id                    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  interest_debt_id      uuid    NOT NULL REFERENCES public.interest_debts(id) ON DELETE RESTRICT,
  period                text    NOT NULL,  -- 'YYYY-MM'
  opening_balance_minor bigint  NOT NULL CHECK (opening_balance_minor >= 0),
  accrued_amount_minor  bigint  NOT NULL CHECK (accrued_amount_minor >= 0),
  closing_balance_minor bigint  NOT NULL CHECK (closing_balance_minor >= 0),
  mode                  text    NOT NULL DEFAULT 'real'
                                CHECK (mode IN ('real', 'simulated')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (interest_debt_id, period, mode)
);

CREATE INDEX interest_accruals_interest_debt_id_idx ON public.interest_accruals(interest_debt_id);
CREATE INDEX interest_accruals_period_idx ON public.interest_accruals(period);

-- settings: admin-configurable key-value store
CREATE TABLE public.settings (
  key        text    PRIMARY KEY,
  value      jsonb   NOT NULL,
  updated_by uuid    REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed default rates directly in init (idempotent via ON CONFLICT)
INSERT INTO public.settings (key, value) VALUES
  ('default_annual_rate', '"0.24"'),
  ('simulated_annual_rate', '"0.24"')
ON CONFLICT (key) DO NOTHING;
