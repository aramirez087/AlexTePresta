# Session 07 Handoff

## What Was Done

### Migration
- [x] `supabase/migrations/0006_phase2_apply_payment_fn.sql` — Phase 2 `apply_payment` PL/pgSQL function replacing Phase 1 (0005). Two new behaviors: (1) when payment exhausted before installment, remaining converts to `interest_debts` row and installment becomes `status='converted'`; (2) after installment FIFO, apply remaining payment FIFO to `interest_debts WHERE is_simulated=false AND status='active' ORDER BY created_at ASC`. Migrations 0004 and 0005 (interest_accruals, settings) were **not created** — the schema was already complete in `0001_init.sql`.

### Interest Domain
- [x] `src/lib/domain/interest/accrueOne.ts` — Pure function `(opening: bigint, monthlyRate: Decimal) → { accrued_minor, closing_minor }`. Uses `Decimal.ROUND_HALF_EVEN` on accrued portion only; closing is integer arithmetic. No side effects, no server-only import.
- [x] `src/lib/domain/interest/__tests__/accrueOne.test.ts` — 7 tests: PRD §7 canonical (47875 × 0.02 = 957.5 → 958), zero principal, exact integers, half-even tie toward even, two-period compounding, large values.
- [x] `src/lib/domain/interest/runMonthlyAccrual.ts` — Iterates all `interest_debts WHERE is_simulated=false AND status='active'`. For each debt: checks for existing `interest_accruals(period, mode='real')` row; if found, skips (idempotency). If not found: computes accrual using debt's snapshot `interest_rate`, inserts `interest_accruals` row, updates `current_balance_minor`. Per-debt error handling (failed debt doesn't abort others).
- [x] `src/lib/domain/interest/__tests__/runMonthlyAccrual.test.ts` — 6 tests: empty case, new period processing, idempotency, PRD §7 exact amounts, two-period replay (48833 → 49810), error resilience.

### Cron Route
- [x] `src/app/api/cron/monthly-accrual/route.ts` — GET handler. Auth via `Authorization: Bearer <CRON_SECRET>`. Computes CR-timezone period with `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica' })`. Delegates to `runMonthlyAccrual`. Returns 200 with summary or 401/500.
- [x] `src/app/api/cron/monthly-accrual/__tests__/route.test.ts` — 6 tests: auth rejection (no header, wrong secret, missing env), success path, CR-timezone period computation, idempotent second call, fatal error → 500.

### Admin Settings
- [x] `src/app/admin/settings/actions.ts` — `updateDefaultRate(formData)` server action. Validates rate is numeric, `0 < rate < 1`. Upserts `settings` table with `updated_by` = admin user ID. Calls `revalidatePath('/admin/settings')`.
- [x] `src/app/admin/settings/page.tsx` — Server component. Shows current `default_annual_rate`. Note: "Solo aplica a nuevas conversiones. Deudas existentes conservan su tasa." Form posts to `updateDefaultRate` action. `dynamic = 'force-dynamic'`.

### Views and Timeline
- [x] `src/lib/domain/views/getDebtorOverview.ts` — Third DB query added for active non-simulated `interest_debts`. New return field `interest_debt_balance_by_currency: { CRC: bigint; USD: bigint }`. Interest debt balances also included in `total_owed_by_currency`.
- [x] `src/lib/domain/views/getDebtTimeline.ts` — Three new `TimelineEventKind` values: `'installment_converted'`, `'interest_debt_created'`, `'interest_accrued'`. New optional params `interest_debts?` and `accruals?`. Converted installments (`status='converted'`) emit `installment_converted` events. Events from all sources sorted chronologically.
- [x] `src/components/timeline/DebtTimeline.tsx` — Labels for all three new kinds in Spanish. New `BankIcon` SVG for `interest_debt_created`. `statusColorClass` extended with `'converted'` → amber, `'active'` → amber, `'settled'` → green.

### Tests Updated
- [x] `src/lib/domain/views/__tests__/getDebtorOverview.test.ts` — `makeAdminClient` updated to handle `interest_debts` table query. 2 new tests: interest_debt balance included in total_owed, bigint type assertion.
- [x] `src/lib/domain/views/__tests__/getDebtTimeline.test.ts` — 5 new tests: converted installment kind, interest_debt_created event, interest_accrued event, chronological sort with interest events, empty interest arrays.
- [x] `src/components/timeline/__tests__/DebtTimeline.test.tsx` — 3 new component label tests + 1 new snapshot test for interest conversion/accrual scenario.
- [x] `src/lib/domain/payments/__tests__/applyPayment.test.ts` — 3 new Phase 2 scenario tests: partial payment (100000 against 147875), interest_debt application, mixed installment + interest_debt in one result.

## Decisions Made

1. **No new schema migrations needed** — 0004 and 0005 migration numbers are taken; all required tables were already in `0001_init.sql`. Created `0006_phase2_apply_payment_fn.sql` only.

2. **`interest_accruals` UNIQUE includes `mode`** — The schema has `UNIQUE (interest_debt_id, period, mode)`, not just `(id, period)`. Idempotency check uses `.eq('mode', 'real')` filter.

3. **TypeScript `applyPayment.ts` wrapper unchanged** — All payment logic is in PL/pgSQL. The TypeScript wrapper already declared `target_type: 'installment' | 'interest_debt'` from Session 5.

4. **Rate stored as plain string via Supabase upsert** — JSONB column `settings.value`: Supabase serializes JS string `"0.24"` as JSONB string. `value #>> '{}'` in SQL extracts it without quotes.

5. **`runMonthlyAccrual` uses per-debt try/catch** — One DB failure doesn't abort accrual for remaining debts; errors are returned in the summary for logging.

6. **Interest events in timeline use optional params** — `interest_debts?` and `accruals?` are optional to preserve backwards compatibility with all existing callers (pages that don't yet fetch these tables).

7. **`getDebtorOverview` now queries 3 tables** — debts, installments, interest_debts. N+1 concern remains (batch query by `debt_id IN (...)` used for both installments and interest_debts). Acceptable for Phase 1 scale.

## Quality Gate Results

### `npm run check` (tsc + next lint)
Pending — run after completing session.

### `npx vitest run`
Pending — run after completing session.

## Open Issues for Session 08

1. **Admin settings page: no inline error feedback** — `updateDefaultRate` returns `{ error?: string }` but the page doesn't display it. Could be added with `useActionState` (requires client component wrapper) or URL search params.

2. **`vercel.json` cron schedule** — Monthly accrual cron not yet added to `vercel.json`. Needed for Vercel to trigger GET on day 25. Format: `{ "crons": [{ "path": "/api/cron/monthly-accrual", "schedule": "0 12 25 * *" }] }`.

3. **`CRON_SECRET` env var** — Not configured in `.env.local` (local dev) or Vercel dashboard (prod).

4. **Pages don't display `interest_debt_balance_by_currency`** — The field is computed and returned by `getDebtorOverview` but no page renders it yet. Session 08 should add interest debt balances to debtor home and admin debtor detail pages.

5. **Pages don't fetch `interest_debts` / `accruals` for timeline** — `getDebtTimeline` supports these optional params but neither `src/app/app/page.tsx` nor `src/app/admin/debtors/[id]/page.tsx` fetches them yet. Timeline won't show interest events until those queries are added.

6. **JWT custom claims for role** — Carry-forward from Session 3.

7. **`next lint` deprecation warning** — Carry-forward from Session 4.

8. **Admin home N+1** — Now 3 queries per debtor. Carry-forward.

## Session 08 Inputs

### Files to Read
- `src/app/app/page.tsx` — Add interest_debts + accruals fetching for timeline; show interest_debt balance
- `src/app/admin/debtors/[id]/page.tsx` — Same interest timeline additions
- `src/app/admin/settings/page.tsx` — Add error display if needed
- `vercel.json` — Add cron schedule entry

### Next Steps for Session 08
1. Add `vercel.json` with cron schedule for `/api/cron/monthly-accrual` (day 25, UTC noon)
2. Set `CRON_SECRET` in `.env.local` and Vercel dashboard docs
3. Fetch `interest_debts` + `accruals` in debtor home and admin debtor detail pages to populate timeline
4. Show `interest_debt_balance_by_currency` in debtor home balance card
5. Optional: add success/error feedback to admin settings form with `useActionState`
6. Optional: JWT custom claims for role (Session 3 carry-forward)

### Environment Variables Status
| Variable | Status |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Set (local: `http://127.0.0.1:54321`) — needs `.env.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Set (local) — needs `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | Set (local) — needs `.env.local` |
| `CRON_SECRET` | Needs configuration in `.env.local` and Vercel dashboard |
| `NEXT_PUBLIC_APP_URL` | Needed for production Vercel URL |
