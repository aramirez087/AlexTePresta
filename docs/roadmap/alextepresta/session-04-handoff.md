# Session 04 Handoff

## What Was Done

### Migration
- [x] `supabase/migrations/0004_create_debt_fn.sql` — PL/pgSQL `create_debt_with_installments` function:
  - Inserts into `debts` then iterates `1..p_total_installments` generating each installment row
  - Due date computed with `make_date` using zero-indexed month arithmetic (avoids month-edge-case clamping)
  - `ON CONFLICT (debt_id, sequence_number) DO NOTHING` for idempotency
  - GRANT restricted to `service_role` only; PUBLIC revoked

### Domain Layer
- [x] `src/lib/domain/installments/generateForDebt.ts`:
  - `computeDueDate(startMonth, dueDay, sequenceNumber)` — pure, no imports
  - `computeInstallments(debtId, params)` — pure, returns typed `InstallmentInsertRow[]`
  - `generateForDebt(adminClient, debtId, params)` — upserts with `ignoreDuplicates: true` for back-fill use
- [x] `src/lib/domain/debts/createDebt.ts` — `'use server'` action:
  - Zod schema: `debtor_id`, `currency` (`CRC|USD`), `total_amount_minor`, `total_installments` (1–120), `installment_amount_minor`, `due_day` (1–28), `start_month` (`YYYY-MM`), `description`
  - Rounding invariant: `|total - installAmt × N| ≤ N`; throws if violated
  - Verifies debtor exists with role='debtor'
  - Calls `create_debt_with_installments` RPC atomically
  - Returns `{ debtId: string }`

### Type Updates
- [x] `src/lib/supabase/database.types.ts` — manually added `create_debt_with_installments` to `Functions` section

### TypeScript Config
- [x] `tsconfig.json` — bumped `target` from `ES2017` to `ES2020` to support BigInt literal syntax (`0n`)

### Safe-Action Client
- [x] `src/lib/safe-action.ts` — added `handleServerError` to forward `Error.message` as `serverError` (prevents generic "Something went wrong" swallowing domain error details)

### Admin UI
- [x] `src/app/admin/page.tsx` — redirects to `/admin/invites` (fixes 404 from Session 3)
- [x] `src/app/admin/debts/new/page.tsx` — server component: fetches debtors, renders form
- [x] `src/app/admin/debts/new/_components/create-debt-form.tsx` — client component:
  - Currency picker; amount fields accept major units (e.g., ₡5,915.00), converted to minor units (×100) before calling action
  - `due_day` capped at 28 with Spanish help text
  - On success: redirects to `/admin/debts/[uuid]`
  - On error: shows `serverError` in red
- [x] `src/app/admin/debts/[id]/page.tsx` — server component:
  - Debt header with debtor, currency, status, totals
  - Running totals: Pagado / Pendiente / Total
  - Installment schedule table: #, Vencimiento, Monto, Pendiente, Estado (in Spanish)
  - Status badges with color coding

### Cron Route
- [x] `src/app/api/cron/generate-installments/route.ts` — GET handler:
  - Requires `Authorization: Bearer $CRON_SECRET` header; 401 if absent/wrong
  - Scans all active debts for missing installments and back-fills via `generateForDebt`
  - Returns `{ backfilled: N, errors: [...] }` — always 200 even if nothing to do
  - Errors per-debt are collected and returned without aborting the loop

### Tests (29 new, 60 total)
- [x] `src/lib/domain/installments/__tests__/generateForDebt.test.ts` — 16 tests:
  - `computeDueDate`: 6 cases (first installment, sequential, year boundary Nov→Jan, Dec→Jan, single-digit padding)
  - `computeInstallments`: 7 cases (count, sequence, dates, amounts, statuses, debt_id, PRD example)
  - `generateForDebt`: 3 cases (upsert called with correct args + `ignoreDuplicates: true`, second call also goes to DB, error propagation)
- [x] `src/lib/domain/debts/__tests__/createDebt.test.ts` — 13 tests:
  - Rounding invariant: 4 cases (PRD pass, tolerance boundary pass, two over-tolerance fails)
  - Auth guard: non-admin returns serverError
  - Debtor validation: not-found and non-debtor-role
  - Zod validation: EUR currency, bad start_month format (no padding, month 13), due_day > 28, total_installments > 120
  - RPC call parameters: verifies all 9 args for PRD example

## Quality Gate Results

### `npm run check` (tsc + next lint)
```
✔ No ESLint warnings or errors
```
**Result: PASS**

### `npx vitest run`
```
Test Files  7 passed (7)
     Tests  60 passed (60)
  Duration  282ms
```
**Result: PASS** — 60/60 tests (29 new)

## Decisions Made

1. **PL/pgSQL RPC for atomic creation** — Supabase JS has no native multi-statement transaction API. The function `create_debt_with_installments` wraps the debt INSERT + all installment INSERTs in one transaction. Same pattern as `accept_invite` from Session 3.

2. **`generateForDebt` as back-fill path** — The PL/pgSQL path is authoritative at creation. The TypeScript `generateForDebt` function is for the cron back-fill path and future programmatic use. Both paths converge on the DB `UNIQUE (debt_id, sequence_number) DO NOTHING` constraint for idempotency.

3. **ES2020 target** — Bumped from ES2017 to support BigInt literal syntax (`0n`). The `lib: ["esnext"]` already included BigInt built-ins; only the `target` change was needed. Old `.tsbuildinfo` cache had to be deleted manually — the cache was masking the fix. Note this for CI (ensure clean builds, or add a pre-check step).

4. **`handleServerError` in safe-action client** — The default behavior hides error details with "Something went wrong." Adding a handler that forwards `e.message` makes domain errors (rounding invariant, debtor not found) visible in the UI and testable. This is safe because admin-only routes are the only callers so far; revisit when debtor-facing actions are added.

5. **Amount entry in major units** — The `CreateDebtForm` has users enter amounts as `₡5,915.00` (display units). The form converts to minor units (`×100`) before calling the action. This avoids confusion for non-technical users while keeping all internal math in minor units.

6. **Zero-indexed month arithmetic in SQL** — The PL/pgSQL function computes: `v_total_months := year * 12 + (month - 1)`, then `make_date(v_target_month / 12, (v_target_month % 12) + 1, due_day)`. This handles Dec→Jan year wrap correctly without needing interval arithmetic on dates.

## Open Issues for Session 05

1. **JWT custom claims for role** — Middleware still queries `public.users` on every `/admin/*` request. Carry-forward from Session 3.

2. **Email delivery for invites** — Carry-forward from Session 3.

3. **`next lint` deprecation** — `next lint` deprecated in Next.js 15.5+. Migrate to `eslint` CLI before Next.js 16.

4. **Debtor dashboard (`/app`)** — Still a stub. Debtors need a view of their own debts and installment schedule.

5. **Payment recording** — Phase 2: admin records a payment; FIFO pipeline applies it against pending installments and creates interest_debt entries on partial payment.

6. **Monthly accrual cron** �� Phase 2: `generate-installments` route will need a companion `accrue-interest` cron job.

7. **`vercel.json` cron schedule** — `CRON_SECRET` env var needs to be set in Vercel dashboard; cron schedule (daily at midnight) needs to be configured in `vercel.json`.

8. **Form UX — `<input type="month">`** — Safari on older iOS may not render the month picker correctly. Acceptable for admin-only tooling; add a plaintext fallback with `YYYY-MM` pattern validation if needed.

9. **Admin debts list** — There is no `/admin/debts` index page listing all debts. A future session should add this alongside navigation links.

## Session 05 Inputs

### Files to Read
- `src/lib/domain/debts/createDebt.ts` — server action pattern for payment recording
- `src/lib/domain/installments/generateForDebt.ts` — `computeInstallments` as reference for payment application logic
- `docs/architecture/payment-pipeline.md` — FIFO pipeline spec
- `supabase/migrations/0001_init.sql` — `payments`, `payment_applications`, `interest_debts` tables

### Next Steps for Session 5
1. Build payment recording server action (`src/lib/domain/payments/recordPayment.ts`)
2. Build FIFO payment application logic (`src/lib/domain/payments/applyPayment.ts`)
3. Build `/admin/debts/[id]/payments/new` page for admin to register a payment
4. Build debtor dashboard at `src/app/app/debts/` showing their own debts and installment schedule
5. Build the admin debts list at `src/app/admin/debts/page.tsx`

### Environment Variables Status
| Variable | Status |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Set (local: `http://127.0.0.1:54321`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Set (local) |
| `SUPABASE_SERVICE_ROLE_KEY` | Set (local) |
| `CRON_SECRET` | Needs to be set in `.env.local` for dev; Vercel dashboard for prod |
| `NEXT_PUBLIC_APP_URL` | Needed for production Vercel URL |
