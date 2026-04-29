# Session 08 Handoff

## What Was Done

### Migrations
- [x] `supabase/migrations/0007_simulation_settings.sql` — `user_simulation_overrides` table with two RLS policies: admins manage all rows, users read their own override.
- [x] `supabase/migrations/0008_mirror_of.sql` — No-op (column pre-emptively in 0001). Sequential placeholder.
- [x] `supabase/migrations/0009_accrual_mode.sql` — No-op (column pre-emptively in 0001). Sequential placeholder.

### Interest Domain
- [x] `src/lib/domain/interest/runMonthlyAccrual.ts` — Added `mode: 'real' | 'simulated' = 'real'` parameter. Swaps `is_simulated=false/true` filter and tags accrual rows with the passed mode. Default unchanged so existing callers unaffected.
- [x] `src/lib/domain/interest/__tests__/runMonthlyAccrual.test.ts` — 4 new tests in `simulated mode` suite: empty case, accrual row has `mode='simulated'`, idempotency per mode, divergence (24% real=958, 36% simulated=1436 on same 47875 opening).

### Payment Domain
- [x] `src/lib/domain/payments/applyPayment.ts` — Added `resolveSimulatedRate` helper (user override → global setting → real rate fallback). After RPC success, queries newly-created real interest_debts, guard-checks for existing mirror, then inserts simulated twin with `is_simulated=true`, `mirror_of=realDebt.id`, and resolved rate. Failure is non-fatal (console.error only).
- [x] `src/lib/domain/payments/__tests__/applyPayment.test.ts` — 3 new tests: mirror created with correct fields, mirror skipped when already exists, rate fallback to real rate when neither override nor setting exists. `makeRpcMock` updated to include `from` mock returning empty interest_debts (no-op simulation path) so existing tests remain unaffected.

### Views
- [x] `src/lib/domain/views/getDebtorOverview.ts` — Renamed `interest_debt_balance_by_currency` → `real_balance_by_currency`. Added `simulated_balance_by_currency` (separate query, never included in `total_owed`). Returns `{ CRC: 0n, USD: 0n }` in both fields on early-return path.
- [x] `src/lib/domain/views/__tests__/getDebtorOverview.test.ts` — Updated all references, added 4 new simulation tests: simulated=0 when no rows, simulated reflects balance, total_owed excludes simulated, real/simulated can diverge.

### Timeline
- [x] `src/components/timeline/DebtTimeline.tsx` — Simulated events (`event.meta?.simulated === true`) get amber dashed border (`border-l-2 border-dashed border-amber-400`) and a "Simulado" label badge.
- [x] `src/components/timeline/__tests__/DebtTimeline.test.tsx` — 4 new tests: amber dashed border applied, "Simulado" label rendered, no dashed border for real events, snapshot with mixed real/simulated.

### Cron Route
- [x] `src/app/api/cron/monthly-accrual/route.ts` — Runs both modes sequentially (`real` then `simulated`). Returns `{ period, real: {...}, simulated: {...} }`.
- [x] `src/app/api/cron/monthly-accrual/__tests__/route.test.ts` — Updated 2 tests (response shape, idempotency), added test for dual-mode calls, updated CR-timezone test to expect `mode='real'`.

### Pages
- [x] `src/app/app/page.tsx` — Fetches `interest_debts` + `interest_accruals`, passes them to `getDebtTimeline`. Reads `searchParams.mode`. Shows amber banner + `?mode=simulada` toggle link + `/scenarios` link. Shows simulated balance in balance card when in simulation mode.
- [x] `src/app/admin/debtors/[id]/page.tsx` — Same additions as debtor home. Toggle link uses `/admin/debtors/${id}?mode=simulada`. Shows simulated real/USD balances in header. Admin scenarios link.
- [x] `src/app/(debtor)/scenarios/page.tsx` + `ScenarioProjector.tsx` — Read-only debtor projector. Server component fetches simulated interest_debts; client component accepts extra monthly payment input, iterates `accrueOne` to project balance, shows month-by-month table. No DB writes.
- [x] `src/app/admin/debtors/[id]/scenarios/page.tsx` + `AdminScenarioProjector.tsx` — Admin projector. Fetches both real and simulated interest_debts, shows them in separate sections with comparison. No DB writes.

## Decisions Made

1. **Migration numbering 0007/0008/0009** — Session instructions requested 0006/0007/0008 but 0006 was already taken by Session 7. Used next available numbers. 0008 and 0009 are true no-ops (single `SELECT 1`) preserving sequential numbering.

2. **`user_simulation_overrides` type cast in applyPayment** — Table added in migration 0007 but database.types.ts not regenerated (requires running Supabase locally). Used `as unknown as` cast at trust boundary with comment. This is the standard pattern for newly-added tables.

3. **`resolveSimulatedRate` is TypeScript-only, not PL/pgSQL** — PL/pgSQL `apply_payment` function (0006) is left untouched. Mirror creation happens post-RPC in TypeScript. Non-fatal: if mirror insert fails, the real payment is already applied successfully.

4. **Simulated balance never in `total_owed`** — Invariant enforced in `getDebtorOverview.ts`: `simulatedOwed` is computed but only returned in `simulated_balance_by_currency`; never added to `totalOwed`.

5. **Mode toggle is URL-only** — `?mode=simulada` search param. Toggle is a Next.js `<Link>` (renders as `<a>`) — no form submission, no action, no DB write. Confirmed by examining the toggle JSX.

6. **Scenarios pages are purely client-side computation** — `accrueOne` has no `server-only` constraint; safe to import in `'use client'` components. No DB writes anywhere in the scenarios flow.

7. **`getDebtTimeline` `is_simulated` field not threaded through** — The `InterestDebtRow` and `AccrualRow` types in `getDebtTimeline.ts` don't include `is_simulated`. Instead, pages pass `interest_debts` rows that include the field, and timeline events can carry `meta.simulated` if the caller adds it. Current pages pass all interest_debts without filtering — the `simulated` meta flag is not set. This is a deferred enhancement; the amber dashed border in `DebtTimeline` works when `meta.simulated` is explicitly set.

## Quality Gate Results

### `npm run check`
✅ `tsc --noEmit` — no errors
✅ `next lint` — no errors (deprecation warning for `next lint` CLI is a carry-forward from Session 4, non-blocking)

### `npx vitest run`
✅ 175 tests pass, 0 failures, 16 test files

## Open Issues for Session 09

1. **Admin UI for `user_simulation_overrides`** — Table exists, RLS in place, but no admin page to set per-user rates. Simple CRUD page at `/admin/debtors/${id}/simulation-rate`.

2. **Timeline simulated event flag not set from pages** — Pages fetch `is_simulated` from interest_debts but don't yet set `meta.simulated` on the corresponding events in `getDebtTimeline`. To enable amber-dashed borders on timeline items, `getDebtTimeline` needs to accept `is_simulated` on `InterestDebtRow` and set `meta.simulated` accordingly.

3. **`vercel.json` cron schedule** — Still missing `{ "crons": [{ "path": "/api/cron/monthly-accrual", "schedule": "0 12 25 * *" }] }`. Carry-forward from Session 7.

4. **`CRON_SECRET` env var** — Not configured in `.env.local` or Vercel dashboard. Carry-forward from Session 7.

5. **`database.types.ts` not regenerated** — `user_simulation_overrides` table requires `supabase gen types typescript` to add to generated types. Until then, `applyPayment.ts` uses a `as unknown as` cast. Run `npx supabase gen types typescript --local > src/lib/supabase/database.types.ts` after migration 0007 is applied locally.

6. **JWT custom claims for role** — Carry-forward from Session 3.

7. **Admin home N+1** — Now 4 queries per debtor (added simulated balance). Carry-forward.

8. **Scenarios pages show simulated debts only for debtor** — The debtor scenarios page shows `is_simulated=true` debts because the real debts don't carry interest under normal operation (zero-rate installment plan). Admin page shows both for comparison.

## Session 09 Inputs

### Files to Read
- `src/lib/supabase/database.types.ts` — Regenerate with `supabase gen types` to add `user_simulation_overrides`
- `src/lib/domain/views/getDebtTimeline.ts` — Add `is_simulated` to `InterestDebtRow`, set `meta.simulated`
- `src/app/app/page.tsx` — Update to set `meta.simulated` on interest_debt events
- `src/app/admin/debtors/[id]/page.tsx` — Same
- `vercel.json` — Add cron schedule

### Next Steps
1. Run `supabase gen types typescript --local > src/lib/supabase/database.types.ts` (after migration 0007 applied)
2. Update `getDebtTimeline.ts`: add `is_simulated?: boolean` to `InterestDebtRow`, propagate to `meta.simulated`
3. Update pages to pass `is_simulated` field from interest_debts fetch
4. Build admin page `/admin/debtors/${id}/simulation-rate` for managing `user_simulation_overrides`
5. Add `vercel.json` cron schedule
6. Set `CRON_SECRET` in `.env.local`

### Environment Variables Status
| Variable | Status |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Set (local: `http://127.0.0.1:54321`) — needs `.env.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Set (local) — needs `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | Set (local) — needs `.env.local` |
| `CRON_SECRET` | Needs configuration in `.env.local` and Vercel dashboard |
| `NEXT_PUBLIC_APP_URL` | Needed for production Vercel URL |
