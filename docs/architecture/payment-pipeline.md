# Payment Pipeline

The payment pipeline is a server action that applies an approved `Payment` to a debtor's outstanding obligations using FIFO order. The pipeline is wrapped in a single database transaction.

## Phase 1 — FIFO (No Interest)

All steps from 2–10 execute inside one atomic transaction.

1. Caller must hold admin role or be the debtor owner. Validate via `requireAdmin()` or `requireUser()`.
2. `BEGIN TRANSACTION`
3. `SELECT * FROM payments WHERE id = $id FOR UPDATE` — lock row; assert `status = 'pending'`.
4. Resolve `debtor_id` from the payment row.
5. `SELECT i.* FROM installments i JOIN debts d ON d.id = i.debt_id WHERE d.debtor_id = $debtor_id AND d.currency = $payment.currency AND i.status = 'pending' ORDER BY i.due_date ASC, i.sequence_number ASC FOR UPDATE` — locks all candidate rows to prevent concurrent double-application.
6. Initialize `remaining_minor = payment.amount_minor`.
7. For each installment in FIFO order:
   - a. If `remaining_minor = 0`, break.
   - b. `to_apply = MIN(remaining_minor, installment.remaining_amount_minor)`
   - c. `INSERT INTO payment_applications (payment_id, target_type='installment', target_id=installment.id, applied_amount_minor=to_apply)`
   - d. `UPDATE installments SET remaining_amount_minor -= to_apply WHERE id = installment.id`
   - e. If `installment.remaining_amount_minor = 0`: `UPDATE installments SET status = 'paid'`
   - f. `remaining_minor -= to_apply`
8. If `remaining_minor > 0`: **ROLLBACK** and raise `PaymentExcessError` (Phase 1 rejects excess payments).
9. `UPDATE payments SET status = 'approved', applied_at = now() WHERE id = $id`
10. `COMMIT`
11. Return `{ applications: [...], leftover_minor: 0 }`.

**Transaction boundary**: The `SELECT ... FOR UPDATE` in steps 3 and 5 prevents concurrent `applyPayment` calls for the same debtor from interleaving.

**Immutability**: `payment_applications` rows are never updated or deleted. They are the event source for reconstructing any account state.

## Phase 2 — Partial-Payment Conversion

Steps 1–6 are identical to Phase 1. Step 7 changes:

7. For each installment in FIFO order:
   - a. If `remaining_minor = 0`, break.
   - b. If `remaining_minor >= installment.remaining_amount_minor` (full coverage):
     - `to_apply = installment.remaining_amount_minor`
     - `INSERT INTO payment_applications (target_type='installment', target_id=installment.id, applied_amount_minor=to_apply)`
     - `UPDATE installments SET remaining_amount_minor = 0, status = 'paid'`
     - `remaining_minor -= to_apply`
   - c. Else (`remaining_minor < installment.remaining_amount_minor`) — **partial payment**:
     - `to_apply = remaining_minor`
     - `INSERT INTO payment_applications (target_type='installment', target_id=installment.id, applied_amount_minor=to_apply)`
     - `shortfall = installment.remaining_amount_minor - to_apply`
     - `rate = settings['default_annual_rate']` — snapshot from settings at this moment
     - `INSERT INTO interest_debts (debt_id=debt.id, source_installment_id=installment.id, principal_minor=shortfall, current_balance_minor=shortfall, interest_rate=rate, is_simulated=false)`
     - `UPDATE installments SET status = 'converted', remaining_amount_minor = 0`
     - `remaining_minor = 0`; break.

8. If `remaining_minor > 0` after the installments loop, apply FIFO to active `interest_debts`:
   - `SELECT * FROM interest_debts WHERE debt_id IN (debtor's debts) AND is_simulated = false AND status = 'active' ORDER BY created_at ASC FOR UPDATE`
   - For each: `to_apply = MIN(remaining_minor, current_balance_minor)`, `INSERT INTO payment_applications (target_type='interest_debt')`, `UPDATE interest_debts SET current_balance_minor -= to_apply`, if `current_balance_minor = 0` → `status = 'settled'`.

9. If `remaining_minor > 0` after both loops: ROLLBACK and raise `PaymentExcessError`.
10. `UPDATE payments SET status = 'approved', applied_at = now()`
11. `COMMIT`

## Error Types

- `PaymentExcessError` — payment amount exceeds total outstanding obligations; transaction rolled back, payment remains `pending`.
- `PaymentAlreadyAppliedError` — payment row is not in `pending` status; reject silently.
- `CurrencyMismatchError` — payment currency does not match any active debts (Phase 2+).
