# Session 05: Payments and FIFO Application (Phase 1)

Paste this into a new Claude Code session:

```md
# Continuity
Continue from Session 04 artifacts.

# Mission
Debtors submit payments (status pending), admins approve or register directly, and approved payments apply FIFO to oldest pending installments with full audit via `payment_applications`.

# Repository anchors
- supabase/migrations/0001_init.sql (payments, payment_applications, installments)
- docs/architecture/payment-pipeline.md
- src/lib/domain/payments/ (to create)
- src/app/(debtor)/pay/, src/app/admin/payments/, src/app/admin/debtors/[id]/register-payment/ (to create)

# Tasks
1. Implement `src/lib/domain/payments/submitPayment.ts` (debtor): inserts `payments` row with `status='pending'`, `currency`, `created_by = auth.uid()`, `amount_minor`. Validates the debtor has at least one open debt in that currency.
2. Implement `src/lib/domain/payments/applyPayment.ts` (server-internal). In a single transaction:
   a. `SELECT ... FOR UPDATE` the payment row.
   b. Iterate the debtor's `installments` where `status='pending'` and currency matches, ordered by `due_date ASC, sequence_number ASC`.
   c. For each: allocate `min(remaining_payment, installment.remaining_amount)`. Insert a `payment_applications` row (`target_type='installment'`, `target_id=installment.id`, `applied_amount`). Decrement `installment.remaining_amount`.
   d. If `installment.remaining_amount == 0` set `status='paid'`. (Phase 1 only — partial-pay conversion comes in Session 07.)
   e. If payment exhausts before the installment is fully covered, the installment stays `pending` with reduced `remaining_amount`.
   f. After loop, set `payment.status='approved'` and `applied_at=now()`. If allocation_total < payment.amount, raise an error and roll back (no excess allowed in Phase 1).
   Returns a structured `{ applications: [...], leftover_minor: 0 }`.
3. Implement `approvePayment(payment_id)` admin server action wrapping `applyPayment`.
4. Implement `registerPaymentDirect(debtor_id, amount_minor, currency)` admin server action: inserts payment with `created_by = admin.id`, then immediately calls `applyPayment`.
5. UI: `/app/pay` (debtor submission form), `/admin/payments` (queue of pending with one-click approve and inline preview of allocation), `/admin/debtors/[id]/register-payment` (direct register form).
6. Tests:
   - exact-match payment: 147875 against installment of 147875 → installment.status='paid', one application row.
   - overflow: 295750 against two installments of 147875 each → both paid, two applications.
   - excess in Phase 1: 200000 against single installment of 147875 → error, transaction rolled back, no rows changed.
   - currency mismatch is rejected before any write.
   - concurrent `applyPayment` on the same debtor is serialized correctly (simulate via two transactions).

# Deliverables
- src/lib/domain/payments/{submitPayment,applyPayment,approvePayment,registerPaymentDirect}.ts + tests
- src/app/(debtor)/pay/page.tsx, src/app/admin/payments/page.tsx, src/app/admin/debtors/[id]/register-payment/page.tsx
- docs/roadmap/alextepresta/session-05-handoff.md

# Quality gates
- `npm run check`
- `npx vitest run` (all FIFO tests above must pass)

# Exit criteria
- Debtor pays exactly one installment → that installment is `paid`, with one `payment_applications` row whose `applied_amount` equals the installment amount.
- Debtor pays 2× one installment → first paid, second's `remaining_amount` reduced; full audit reconstructible from `payment_applications`.
- Admin direct registration produces identical state to debtor-submit + admin-approve.
```
