# Session 07: Phase 2 — Partial-Payment Conversion and Monthly Compound Accrual

Paste this into a new Claude Code session:

```md
# Continuity
Continue from Session 06 artifacts.

# Mission
On partial payment, convert the missing portion of the installment into an interest sub-debt; run idempotent monthly compound accrual on real interest debts.

# Repository anchors
- src/lib/domain/payments/applyPayment.ts (to extend)
- src/lib/domain/interest/ (to create)
- supabase/migrations/0004_interest_accrual.sql, 0005_settings.sql (to create)
- src/app/api/cron/monthly-accrual/route.ts (to create)
- src/app/admin/settings/ (to create)
- docs/architecture/interest-model.md

# Tasks
1. Migration `0004_interest_accrual.sql`: ensure `interest_accruals(id, interest_debt_id, period text, opening_balance bigint, accrued_amount bigint, closing_balance bigint, created_at)` with `UNIQUE (interest_debt_id, period)`. `period` is 'YYYY-MM'.
2. Migration `0005_settings.sql`: `settings(key text primary key, value jsonb, updated_by uuid, updated_at timestamptz)`. Seed `default_annual_rate` = `"0.24"`.
3. Extend `applyPayment.ts`: when a payment is exhausted before fully covering its current installment, move the installment's `remaining_amount` into a new `interest_debts` row (`source_installment_id` set, `principal` = remaining, `current_balance` = remaining, `interest_rate` = settings.default_annual_rate snapshot, `is_simulated=false`, `created_at=now()`). The installment row gets `status='converted'` and `remaining_amount=0`. Record applied portion in `payment_applications` as `target_type='installment'`. Lock the interest_debts insert behind the same transaction.
4. Extend `applyPayment.ts` allocation order: after exhausting pending installments, apply remaining payment FIFO to `interest_debts` where `is_simulated=false` ordered by `created_at ASC`. Each allocation gets a `payment_applications` row with `target_type='interest_debt'`. If an interest_debt's `current_balance` reaches zero, mark `status='settled'` (add column in migration 0004).
5. Implement `src/lib/domain/interest/accrueOne.ts`: pure `(opening: bigint, monthlyRate: Decimal) => { accrued_minor: bigint, closing_minor: bigint }`. Uses decimal.js, rounds half-even to minor units. Tested at boundaries (0, very large values).
6. Implement `src/lib/domain/interest/runMonthlyAccrual.ts`: for `period='YYYY-MM'`, iterate `interest_debts` where `is_simulated=false AND status='active'`. Upsert `interest_accruals` keyed `(interest_debt_id, period)` and update `current_balance = closing_minor`. Idempotent — second call for the same period is a no-op.
7. Implement Vercel cron `src/app/api/cron/monthly-accrual/route.ts` triggered on day 25 after installment generation. Authenticated via `CRON_SECRET` header. Computes `period` from request date.
8. Build `/admin/settings/page.tsx`: edit `default_annual_rate`. Existing interest_debts retain their snapshot rate (rate change applies only to future conversions).
9. Update `getDebtorOverview` and `DebtTimeline` to surface interest_debts and accrual events distinctly from zero-rate balances. Timeline gains `kind: 'installment_converted' | 'interest_accrued' | 'interest_debt_created'`.
10. Tests: PRD §7 example — payment 100000 against installment 147875 → installment converted, one interest_debt of principal=47875. Accrue 24% annually one month on 47875: closing = 47875 * (1 + 0.24/12) = 48832.5 → rounds to 48833 (verify exact rounding in test). Re-running accrual for same period changes nothing. Multi-period replay: two consecutive calls yield expected compounded result.

# Deliverables
- supabase/migrations/0004_interest_accrual.sql, 0005_settings.sql
- src/lib/domain/interest/{accrueOne,runMonthlyAccrual}.ts + tests
- Updated src/lib/domain/payments/applyPayment.ts + tests
- src/app/api/cron/monthly-accrual/route.ts + tests
- src/app/admin/settings/page.tsx
- Updated src/lib/domain/views/{getDebtorOverview,getDebtTimeline}.ts + tests
- docs/roadmap/alextepresta/session-07-handoff.md

# Quality gates
- `npm run check`
- `npx vitest run` (all conversion + accrual tests pass)

# Exit criteria
- PRD §7 example reproduces exactly in DB state and timeline.
- Cron route is idempotent, authenticated via `CRON_SECRET`, and rejects unauthenticated requests with 401.
```
