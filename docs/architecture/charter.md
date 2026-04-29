# AlexTePresta — Architecture Charter

## Vision

AlexTePresta is a personal loan management web app for tracking installment-based loans between family members and friends. The administrator (Alexander Ramirez) creates and manages debts, approves payments, and reviews account activity. Debtors (non-technical family members) submit payments and view their own account history. Access is by invitation only — no public sign-up, no anonymous reads.

## Baseline

As of Session 1, the repository contained only `.git`, `.gitignore`, and `LICENSE`. No application code existed. All subsequent sessions build on top of this charter.

## Target Users

- **Admin**: Alexander Ramirez — single administrator who manages all debtors, debts, and payments.
- **Debtors**: Non-technical family members who use the app primarily on mobile to submit payments and check their balance. UI language: Spanish (es-CR locale).

## Phases

### Phase 1 — MVP

- Google Sign-In via Supabase Auth (invitation-only)
- Invitation flow: admin issues token-based invite links with 7-day TTL
- Zero-rate installment debts (single currency per debt)
- Installment schedule generation (admin creates, system generates rows)
- Debtor payment submission (`status = 'pending'`)
- Admin payment approval with FIFO application to installments
- Audit trail via `payment_applications` (immutable, append-only)
- Account-statement timeline view for both admin and debtor

### Phase 2 — Interest Conversion

- Partial-payment detection: if payment partially covers an installment, the unpaid shortfall converts to an `interest_debts` record at the admin-configured compound rate
- Monthly accrual cron: `balance = balance * (1 + annual_rate / 12)` applied via `interest_accruals` records
- Admin settings for default annual rate (`settings` table)
- FIFO payment application extended: after installments, excess is applied to `interest_debts` in creation order

### Phase 3 — Simulation Mode

- Parallel simulated interest track (`is_simulated = true` rows mirror real `interest_debts`)
- Scenario projector: given a projected monthly payment, compute how long until all debts are settled
- Amber UI banner when simulation mode is active
- No DB side-effects from toggling simulation mode on/off

## Out of Scope (All Phases)

- Multi-admin accounts
- Currency conversion between CRC and USD within one debt
- Recurring automatic payments
- PDF export of statements
- Push notifications
- Any external integrations beyond Google OAuth and Supabase

## Glossary

- **Debt** — A zero-rate installment obligation in a single currency, created by admin for a specific debtor. A debtor may have multiple debts.

- **Installment** — One scheduled payment slice of a `Debt`, identified by `sequence_number`. Has `due_date`, `amount_minor`, `remaining_amount_minor`, and `status ∈ {pending, paid, converted, overdue}`.

- **InterestDebt** — A compound-interest sub-obligation created when a payment partially covers an installment. Carries a snapshot `interest_rate` (fixed at creation), `principal_minor` (the original shortfall), and a running `current_balance_minor` that grows monthly.

- **Payment** — Money received from or registered for a debtor. `status ∈ {pending, approved, rejected}`. Currency must match the target debts. Submitted by debtor or registered directly by admin.

- **PaymentApplication** — Immutable audit record linking a `Payment` to an `Installment` or `InterestDebt`, recording `applied_amount_minor`. Never deleted or updated. Forms the event source for reconstructing any account state.

- **Accrual** — Monthly record of compound interest growth on an `InterestDebt`, keyed `(interest_debt_id, period, mode)`. Idempotent: `INSERT ... ON CONFLICT DO NOTHING` prevents double-counting.

- **Minor units** — Monetary amounts are stored as integers in the currency's smallest unit (céntimos for CRC, cents for USD). Display divides by 100 using `Intl.NumberFormat`.

- **Simulated row** — Any row with `is_simulated = true`. Informational only; never factored into FIFO payment allocation or real balances.
