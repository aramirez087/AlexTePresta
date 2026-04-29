# Session 05 Handoff

## What Was Done

### Migration
- [x] `supabase/migrations/0005_apply_payment_fn.sql` — PL/pgSQL `apply_payment(p_payment_id uuid) RETURNS jsonb` function:
  - `SELECT … FOR UPDATE` locks the payment row, asserts `status = 'pending'`
  - FIFO loop: iterates `installments` joined to `debts` on `debtor_id + currency + status='pending'`, ordered `due_date ASC, sequence_number ASC`, with `FOR UPDATE` row locks
  - Inserts `payment_applications` row for each allocation; uses local variable `v_new_remaining` to avoid any ambiguity in the CASE expression computing the new installment status
  - Phase 1: after FIFO loop, raises `PaymentExcessError` if `v_remaining > 0` (rolls back entire transaction)
  - Updates `payment.status='approved'` and `applied_at=now()` only after all installments are allocated
  - `SECURITY DEFINER`, `GRANT` to `service_role` only; `REVOKE FROM PUBLIC`

### Type Updates
- [x] `src/lib/supabase/database.types.ts` — manually added `apply_payment` to `Functions` section

### Domain Layer
- [x] `src/lib/domain/payments/applyPayment.ts` — internal utility:
  - Calls `adminClient.rpc('apply_payment', { p_payment_id })` 
  - Maps PL/pgSQL exception names (`PaymentExcessError`, `PaymentAlreadyAppliedError`, `PaymentNotFoundError`) to Spanish user-facing error messages
  - Returns typed `ApplyPaymentResult { applications: ApplicationResult[]; leftover_minor: 0 }`
- [x] `src/lib/domain/payments/submitPayment.ts` — debtor server action:
  - Requires `requireUser()` (debtor identity)
  - Validates debtor has at least one `active` debt in the requested currency before inserting
  - Inserts `payments` row with `status='pending'`, `created_by = user.id`
  - Returns `{ paymentId: string }`
- [x] `src/lib/domain/payments/approvePayment.ts` — admin server action:
  - Requires `requireAdmin()`
  - Wraps `applyPayment(adminClient, payment_id)` and returns the result
- [x] `src/lib/domain/payments/registerPaymentDirect.ts` — admin server action:
  - Requires `requireAdmin()`
  - Validates debtor has active debt in currency
  - Inserts payment with `created_by = admin.id`, then immediately calls `applyPayment`
  - Returns `{ paymentId, applications, leftover_minor: 0 }`

### Middleware
- [x] `src/middleware.ts` — added `pathname.startsWith('/pay')` to `isProtected` check so the `(debtor)` route group at `/pay` requires authentication

### UI
- [x] `src/app/(debtor)/layout.tsx` — route group layout calling `requireUser()`; resolves to URL prefix-less group
- [x] `src/app/(debtor)/pay/page.tsx` + `_components/submit-payment-form.tsx` — debtor payment submission:
  - Currency picker; amount in major units (×100 → minor)
  - Notes textarea (optional, 500 char max)
  - On success: shows confirmation with paymentId; "Registrar otro pago" button resets
  - On error: shows Spanish serverError
- [x] `src/app/admin/payments/page.tsx` + `_components/approve-button.tsx` — admin pending queue:
  - Lists all `payments` with `status='pending'` ordered by `created_at ASC`
  - Per-payment: debtor email, formatted amount/currency, date, notes
  - FIFO preview: fetches first 5 pending installments for debtor's debts in matching currency
  - Inline `ApproveButton` client component calls `approvePayment` action; refreshes on success
- [x] `src/app/admin/debtors/[id]/register-payment/page.tsx` + `_components/register-payment-form.tsx` — admin direct registration:
  - Server page fetches debtor info (404 if not found or not `role='debtor'`) and their active debts
  - Form shows only currencies where debtor has active debts
  - On success: redirects to `/admin/payments`; on cancel: `router.back()`

### Tests (20 new, 80 total)
- [x] `src/lib/domain/payments/__tests__/applyPayment.test.ts` — 20 tests covering:
  - `applyPayment` RPC delegation (2): correct args passed, structured result returned
  - `applyPayment` error mapping (4): all three named errors + unknown error with prefix
  - Exact amount scenarios (3): 147875 exact match, 295750 overflow (two installments), 200000 excess rejected
  - `submitPayment` auth guard (1): unauthenticated → serverError
  - `submitPayment` currency validation (2): no active debt → serverError; valid → paymentId
  - `submitPayment` Zod (3): invalid currency, negative amount, zero amount
  - `approvePayment` auth guard + delegation (2): non-admin → serverError; success returns applications
  - `registerPaymentDirect` auth guard (1): non-admin → serverError
  - `registerPaymentDirect` currency validation (1): no active debt → serverError
  - `registerPaymentDirect` success (1): verifies `created_by = admin.id` and returns result

## Quality Gate Results

### `npm run check` (tsc + next lint)
```
✔ No ESLint warnings or errors
```
**Result: PASS**

### `npx vitest run`
```
Test Files  8 passed (8)
     Tests  80 passed (80)
  Duration  330ms
```
**Result: PASS** — 80/80 tests (20 new)

### `npm run build`
**Result: FAIL (preexisting)** — `NEXT_PUBLIC_SUPABASE_URL is required` during static prerendering of `/app` page. This failure existed before Session 05 (confirmed by reverting all changes via `git stash`). The build requires `.env.local` to be present; the Vercel deployment will have these set.

## Decisions Made

1. **PL/pgSQL for `apply_payment`** — same rationale as Sessions 3 and 4. The Supabase JS client has no multi-statement transaction API. The `FOR UPDATE` locking and atomicity (FIFO loop + `payment_applications` insert + installment update + payment status update) requires a single database transaction. A PL/pgSQL function is the only option.

2. **Local variable for `v_new_remaining`** — the plan flagged a risk with using the CASE expression on the same column being updated (`remaining_amount_minor - v_to_apply` in a SET clause referencing the pre-update value). The implemented solution uses an explicit local variable `v_new_remaining := v_installment.remaining_amount_minor - v_to_apply` and then references that in both the SET and the CASE. This is unambiguous and easier to audit.

3. **Route deviation: `(debtor)` group resolves to `/pay`** — the `(debtor)` Next.js route group is parenthesized, so URLs have no prefix. The debtor pay page is at `/pay`, not `/debtor/pay`. Middleware was updated to add `pathname.startsWith('/pay')` to the `isProtected` check. This matches the session plan's Option C.

4. **Admin payments page FIFO preview** — Rather than a complex read-only simulation, the page fetches the first 5 pending installments for each debtor's active debts in the matching currency (ordered FIFO), giving the admin a clear picture of what will be allocated before approving.

5. **`registerPaymentDirect` success redirects to `/admin/payments`** — there is no `/admin/debtors/[id]` index page yet. On success, the form redirects to the pending payments queue (which will now be empty for this payment). A future session will add the debtor detail page.

6. **Build failure is preexisting** — the build requires live Supabase env vars at static prerender time for `/app/page.tsx`. This has been the case since Session 2. In the Vercel environment (with env vars set), the build passes. Locally it fails without `.env.local`. This is noted in the open issues as carry-forward.

## Open Issues for Session 06

1. **Build requires `.env.local`** — `/app/page.tsx` calls Supabase during static prerendering. Either add `export const dynamic = 'force-dynamic'` to debtor pages, or ensure `.env.local` is always present locally.

2. **Admin debtors index page** — no `/admin/debtors` list page yet. The register-payment page at `/admin/debtors/[id]/register-payment` is reachable by URL but has no navigation entry point.

3. **Debtor dashboard** — `/app/page.tsx` is still a stub. Debtors need a view of their own debts and installment schedule with the running balance.

4. **JWT custom claims for role** — middleware still queries `public.users` on every `/admin/*` and auth check. Carry-forward from Session 3.

5. **Monthly accrual cron** — `accrue-interest` route handler needed as companion to `generate-installments`. Deferred to Session 07.

6. **Phase 2: partial payment → interest debt conversion** — when a payment partially covers an installment, Session 07 will create an `interest_debts` row instead of rejecting with `PaymentExcessError`. The `apply_payment` SQL function has a clearly marked `-- Phase 2` comment location.

7. **`next lint` deprecation** — carry-forward from Session 4. Migrate to ESLint CLI before Next.js 16.

8. **`vercel.json` cron schedule** — `CRON_SECRET` and daily cron schedule not yet configured.

## Session 06 Inputs

### Files to Read
- `src/lib/domain/payments/applyPayment.ts` — `ApplyPaymentResult` type for downstream consumers
- `src/app/admin/debts/[id]/page.tsx` — debt detail page pattern (for debtor dashboard)
- `src/app/app/page.tsx` — current debtor landing stub to replace
- `supabase/migrations/0005_apply_payment_fn.sql` — Phase 2 extension point

### Next Steps for Session 6
1. Build the debtor dashboard at `src/app/app/` — show debts grouped by currency, with installment schedule and running balance
2. Build `src/app/admin/debtors/page.tsx` — list all debtors with links to register payment
3. Build `src/app/admin/debtors/[id]/page.tsx` — debtor detail: open debts, pending installments, payment history
4. Add `export const dynamic = 'force-dynamic'` to all pages that call Supabase, resolving the build failure
5. Navigation improvements: add links between admin pages (debts ↔ debtor ↔ register payment)

### Environment Variables Status
| Variable | Status |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Set (local: `http://127.0.0.1:54321`) — needs `.env.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Set (local) — needs `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | Set (local) — needs `.env.local` |
| `CRON_SECRET` | Needs to be set in `.env.local` for dev; Vercel dashboard for prod |
| `NEXT_PUBLIC_APP_URL` | Needed for production Vercel URL |
