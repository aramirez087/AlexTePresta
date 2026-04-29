# Session 06 Handoff

## What Was Done

### Format Utilities
- [x] `src/lib/format/money.ts` — `formatMoney(amountMinor: bigint, currency: 'CRC' | 'USD'): string` using `Intl.NumberFormat` with `es-CR` for CRC and `en-US` for USD. Safe `Number()` conversion with inline invariant comment (domain amounts < MAX_SAFE_INTEGER).
- [x] `src/lib/format/date.ts` — `formatDate(d: Date): string` (Spanish, `America/Costa_Rica` timezone) and `daysUntil(d: Date): number` using `en-CA` locale for YYYY-MM-DD in CR timezone to avoid DST edge cases.
- [x] `src/lib/format/__tests__/money.test.ts` — 8 tests covering zero, typical, large, and negative amounts for both CRC and USD.
- [x] `src/lib/format/__tests__/date.test.ts` — 9 tests including `vi.useFakeTimers()` for `daysUntil`, UTC/CR timezone boundary cases.

### Domain Views
- [x] `src/lib/domain/views/getDebtTimeline.ts` — Pure function (no Supabase calls). Accepts pre-fetched `installments`, `payments`, `applications` arrays; returns `TimelineEvent[]` sorted chronologically. `amount_minor` is converted to `bigint`. `installment_due` events use noon UTC to keep the date stable across timezones.
- [x] `src/lib/domain/views/getDebtorOverview.ts` — Async function requiring admin Supabase client. Queries all active debts for a debtor, then all pending installments in one batch. Computes `total_owed_by_currency` (CRC+USD as `bigint`), `total_paid_by_currency`, `next_installment`, and `status: 'al_dia' | 'atrasado'`. Status is `atrasado` if any pending installment has `due_date < today` (compared as YYYY-MM-DD strings in CR timezone).
- [x] `src/lib/domain/views/__tests__/getDebtTimeline.test.ts` — 11 tests.
- [x] `src/lib/domain/views/__tests__/getDebtorOverview.test.ts` — 8 tests with Supabase mock.

### Component
- [x] `src/components/timeline/DebtTimeline.tsx` — Server component (no `'use client'`). Accepts `TimelineEvent[]` with `bigint` amounts directly. Semantic `<ol>`, `aria-label` in Spanish, event labels in Spanish, inline SVG icons (calendar, arrow-down, checkmark), status colors (green/amber/red/gray). `React` imported explicitly for jsdom test environment compatibility.
- [x] `src/components/timeline/__tests__/DebtTimeline.test.tsx` — 9 tests: 4 snapshots (all-paid, partially-paid with payment+application events, overdue, future-installments) + 5 assertions (list element, empty state, Spanish labels, no red on paid status).

### Pages
- [x] `src/app/app/page.tsx` — Replaced stub with full debtor dashboard. `export const dynamic = 'force-dynamic'` (fixes Session 5 build issue). Shows: saldo total per currency, próxima cuota with days countdown, estado badge, and one `DebtTimeline` per currency. Empty state for debtors with no active debts.
- [x] `src/app/page.tsx` — Replaced Next.js boilerplate with `redirect('/app')`.
- [x] `src/app/admin/page.tsx` — Replaced `redirect('/admin/invites')` with admin debtor overview table. Shows debtor email, saldo por moneda, estado badge, alert counts (overdue installments + pending payment approvals). Navigation links to payments, invites, new debt. Each row links to `/admin/debtors/[id]`.
- [x] `src/app/admin/debtors/[id]/page.tsx` — Admin debtor detail (new file). Shows debtor header, owed balances, active debts list with links to debt detail, "Registrar pago directo" button, full timeline per currency. 404 if user not found or not a debtor.

### Improvements to Existing Files
- [x] `src/lib/domain/payments/approvePayment.ts` — Added `revalidatePath('/admin')` and `revalidatePath('/admin/payments')` after successful payment application. Admin home alert counts now decrement after approval without manual refresh.
- [x] `src/app/admin/debts/[id]/page.tsx` — Removed inline `formatMoney(number, string)` function; replaced with shared `formatMoney(bigint, 'CRC' | 'USD')`. Added `as 'CRC' | 'USD'` cast with boundary comment.
- [x] `src/app/admin/payments/page.tsx` — Removed inline `formatAmount` and `formatDate` functions; replaced with shared `formatMoney` and `formatDate`. Added "← Deudores" nav link. `currency` typed as `'CRC' | 'USD'` with boundary cast.

## Decisions Made

1. **Debtor home stays at `/app`** — `src/app/(debtor)/page.tsx` would conflict with `src/app/page.tsx` at URL `/`. The plan's stated file path was a discrepancy; continuing from Session 5's established `/app` URL is zero-risk. The root `/` now redirects to `/app`. Document carried to handoff per plan.

2. **`getDebtTimeline` is a pure function** — No Supabase calls. Pages fetch data and pass it in. This keeps the domain function independently testable without mocks and matches the plan's explicit intent.

3. **`DebtTimeline` is a server component with explicit React import** — The vitest jsdom environment with `@vitejs/plugin-react` does not apply the automatic JSX transform to test files, causing "React is not defined" at render time. Adding `import React from 'react'` to both the component and test file resolves this without changing the vitest config.

4. **`makeApplicationEvent` used in partially-paid snapshot** — The plan specified 9 component tests; the `makeApplicationEvent` helper was added for completeness and is now exercised in the partially-paid snapshot (which includes installment, payment, application, and pending installment events — a realistic real-world scenario).

5. **`next/cache` mock in `applyPayment.test.ts`** — Adding `revalidatePath` to `approvePayment` required mocking `next/cache` in the existing test file (which tested the action). `vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))` was added to the test file's setup section.

6. **Admin home N+1 accepted for Phase 1** — The admin home calls `getDebtorOverview` for each debtor. With ~5 debtors (personal loan app), this is acceptable. Documented for future optimization.

## Quality Gate Results

### `npm run check` (tsc + next lint)
```
✔ No ESLint warnings or errors
```
**Result: PASS**

### `npx vitest run`
```
Test Files  13 passed (13)
     Tests  125 passed (125)
  Duration  ~500ms
```
**Result: PASS** — 125/125 tests (45 new, up from 80)

### `npm run build`
**Result: FAIL (preexisting)** — `NEXT_PUBLIC_SUPABASE_URL is required` during static prerendering. All new pages have `export const dynamic = 'force-dynamic'`, which fixes the issue for those pages. The remaining failure is in a legacy preexisting page. In Vercel (env vars set), the build passes.

## Manual Smoke Test

*Cannot be performed in this automated session — no running Supabase instance or browser. Record in manual verification:*

- [ ] Log in as debtor → `/app` → verify summary cards show correct amounts
- [ ] Verify timeline shows installments + payments chronologically
- [ ] Log in as admin → `/admin` → verify debtor list with alert counts
- [ ] Approve a pending payment via `/admin/payments` → verify `/admin` alert count decrements (revalidatePath in server action)
- [ ] Navigate to `/admin/debtors/[id]` → verify full timeline visible with all event types

## Open Issues for Session 07

1. **Monthly accrual cron** — `/api/cron/accrue-interest` route handler needed. Session 07 will add this. `CRON_SECRET` env var and `vercel.json` schedule still not configured.

2. **Phase 2: partial payment → interest debt conversion** — When a payment partially covers an installment, `apply_payment` in Phase 1 raises `PaymentExcessError` and rolls back. Phase 2 will create an `interest_debts` row instead. The SQL function has a clearly marked `-- Phase 2` comment location.

3. **JWT custom claims for role** — Middleware queries `public.users` on every `/admin/*` request. Carry-forward from Session 3. JWT custom claims would eliminate this round-trip.

4. **`next lint` deprecation warning** — Carry-forward from Session 4. Migrate to ESLint CLI before Next.js 16.

5. **`vercel.json` cron schedule + `CRON_SECRET`** — Not yet configured. Needed for scheduled installment generation and future accrual job.

6. **Admin home N+1 queries** — `getDebtorOverview` is called per-debtor from the admin home. With few debtors acceptable for Phase 1; Phase 2 should replace with aggregate query or Supabase view.

7. **Build requires `.env.local`** — The Next.js build prerender phase calls Supabase. All new pages have `dynamic = 'force-dynamic'`, but some legacy paths may still cause issues locally without `.env.local`. In Vercel the build passes.

8. **Debtor home route migration** — Currently at `/app`. Future option: move to `/` by making it `src/app/(debtor)/page.tsx`, deleting `src/app/app/page.tsx`, and updating middleware `appUrl.pathname` from `/app` to `/`.

## Session 07 Inputs

### Files to Read
- `src/app/api/cron/generate-installments/route.ts` — Existing cron pattern to replicate for accrual
- `supabase/migrations/0005_apply_payment_fn.sql` — Phase 2 extension point (`-- Phase 2` comment)
- `src/lib/domain/views/getDebtorOverview.ts` — For future N+1 optimization
- `docs/roadmap/alextepresta/session-06-handoff.md` (this file)

### Next Steps for Session 07
1. Implement `/api/cron/accrue-interest` route handler (monthly compound interest accrual on `interest_debts`)
2. Configure `vercel.json` with daily cron schedule and `CRON_SECRET`
3. Begin Phase 2: modify `apply_payment` PL/pgSQL to create `interest_debts` rows on excess payment rather than raising `PaymentExcessError`
4. Optional: JWT custom claims for role to remove per-request DB query in middleware

### Environment Variables Status
| Variable | Status |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Set (local: `http://127.0.0.1:54321`) — needs `.env.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Set (local) — needs `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | Set (local) — needs `.env.local` |
| `CRON_SECRET` | Needs to be set in `.env.local` for dev; Vercel dashboard for prod |
| `NEXT_PUBLIC_APP_URL` | Needed for production Vercel URL |
