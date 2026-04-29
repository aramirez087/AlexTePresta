# AlexTePresta — Architecture Charter

## Vision

AlexTePresta is a personal loan-management web application for tracking family and friend loans. It is operated exclusively by one administrator (Alexander Ramirez), who creates debts, manages invitations, and approves payments. Debtors are non-technical family members who use the app to view their obligations and submit payment notifications. All monetary obligations are modeled as zero-rate installment debts that convert into compound-interest sub-debts when a payment does not fully cover a scheduled installment.

Access is by invitation only. There is no public sign-up and no anonymous read access.

## Baseline

As of Session 1 (2026-04-28), the repository contained no application code:

- `.gitignore`, `LICENSE` — repository scaffolding
- `docs/claude-sessions/alextepresta/` — session planning documents (sessions 00–09)
- No `package.json`, no `src/`, no `supabase/`, no `tsconfig.json`

This is the starting baseline recorded before any application code is written.

## Target Users

| Role | Person(s) | Technical level |
|------|-----------|-----------------|
| Admin | Alexander Ramirez | Developer |
| Debtor | Family members | Non-technical |

The UI language is **Spanish (es-CR locale)**. All currency values are formatted with `Intl.NumberFormat` using the debtor's currency.

## Phase 1 — MVP (Zero-rate Installments)

**In scope:**

- Google Sign-In via Supabase Auth
- Invitation flow: admin generates single-use tokens; recipient registers via invite link only
- Zero-rate installment debts: admin creates a debt with total amount, number of installments, and due day; the system generates the full installment schedule automatically
- Debtor payment submission: debtor submits a payment notification (amount + optional notes); payment starts as `pending`
- Admin payment approval: admin reviews and approves or rejects each pending payment
- FIFO application: on approval, the system applies the payment to the earliest unpaid installments first
- Full audit trail: every application is recorded as an immutable `payment_applications` row
- Account-statement timeline: chronological view of all debts, installments, payments, and applications for each debtor

**Payment rule (Phase 1):** If a payment exceeds all outstanding installments, it is rejected (`PaymentExcessError`). Partial payments that do not fully cover an installment are also rejected. Phase 1 only accepts payments that exactly cover one or more complete installments (or fall precisely on installment boundaries).

## Phase 2 — Partial-Payment Conversion + Compound Interest

**In scope:**

- Partial-payment → `InterestDebt` conversion: when a payment partially covers an installment, the unpaid remainder becomes a new `interest_debt` row with the annual rate snapshotted from `settings.default_annual_rate` at the moment of conversion
- Monthly compound-interest accrual cron: runs once per month, updates `current_balance_minor` on all active `interest_debts`, and inserts idempotent `interest_accruals` records
- Admin settings panel: update `default_annual_rate` (affects only future conversions, never retroactive)
- Extended FIFO: after exhausting pending installments, leftover payment amount is applied to `interest_debts` in chronological creation order
- Partial-payment UX: confirmation modal with Spanish copy before any conversion is committed (see [UX spec](./ux-partial-payment.md))

## Phase 3 — Simulation Mode

**In scope:**

- Parallel simulated interest track: when simulation mode is toggled on, the system creates mirror `interest_debt` rows with `is_simulated = true` and a separate `simulated_annual_rate` from settings
- Simulated accruals are stored with `mode = 'simulated'` in `interest_accruals`
- Scenario projector UI: shows the simulated trajectory alongside the real track without any database side effects from the toggle
- Amber UI banner: persistent banner while simulation mode is active so admin always knows they are viewing a hypothetical track

**Simulation constraint:** Simulated rows never participate in FIFO payment allocation. They are informational only.

## Out of Scope (All Phases)

- Multiple admin accounts
- Currency conversion between CRC and USD within a single debt
- Recurring automatic payments
- PDF/CSV export
- Push notifications or email reminders
- External accounting system integrations
- Two-factor authentication (Google SSO is sufficient)

## Glossary

### Debt
A zero-rate installment obligation in a single currency, created by the admin for a specific debtor. A `Debt` specifies the total amount, number of installments, the monthly due day (1–28), and the start month. It generates a fixed schedule of `Installment` rows.

### Installment
One scheduled payment slice of a `Debt`, identified by `sequence_number`. Carries `due_date`, `amount_minor`, `remaining_amount_minor`, and `status ∈ {pending, paid, converted, overdue}`. An installment is fully paid when `remaining_amount_minor = 0` and `status = 'paid'`. An installment is converted when a partial payment did not fully cover it and the remainder was moved to an `InterestDebt`; in this state `status = 'converted'` and `remaining_amount_minor = 0`.

### InterestDebt
A compound-interest sub-obligation created when a payment partially covers an `Installment`. Carries a snapshot `interest_rate` (decimal string, e.g. `"0.24"`) that never changes after creation, `principal_minor` (the original shortfall), and a running `current_balance_minor` that grows with each monthly accrual. `status ∈ {active, settled}`.

### Payment
Money received from (or submitted by) a debtor. `status ∈ {pending, approved, rejected}`. Currency must match the currency of the target debts. A `Payment` carries the submitted `amount_minor` and optional `notes`. It becomes actionable only when `status = 'approved'`, at which point the FIFO pipeline runs.

### PaymentApplication
An immutable audit record created when a `Payment` is applied to an `Installment` or `InterestDebt`. Records `payment_id`, `target_type ∈ {installment, interest_debt}`, `target_id`, and `applied_amount_minor`. Never updated or deleted. The full account state for any point in time can be reconstructed by replaying all `PaymentApplication` rows up to that timestamp.

### Accrual
A monthly record of compound-interest growth on an `InterestDebt`. Keyed by `(interest_debt_id, period, mode)` with a `UNIQUE` constraint that enforces idempotency. Stores `opening_balance_minor`, `accrued_amount_minor`, and `closing_balance_minor`. `mode ∈ {real, simulated}`.
