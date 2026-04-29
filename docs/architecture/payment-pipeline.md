# AlexTePresta — Payment Pipeline

This document specifies the payment application pipeline for Phase 1 (FIFO, no interest) and Phase 2 (partial-payment → InterestDebt conversion). All column references match [data-model.md](./data-model.md).

## Invariants

1. `payment_applications` rows are never updated or deleted. They are the immutable event source for reconstructing account state.
2. A payment may only be applied once. Attempting to apply an already-approved payment must fail at the database lock level.
3. All monetary arithmetic uses `bigint` minor units. No `number` conversions inside the pipeline.
4. Currency must match between payment and target debts. Cross-currency application is an error.

---

## Phase 1 — FIFO (No Interest)

Applies when the payment amount is sufficient to cover one or more complete installments and no partial-payment conversion is needed.

```
function applyPayment(paymentId: uuid):
  // Step 1: Authorize
  caller must be admin OR the debtor who owns the payment.
  Call requireAdmin() or requireUser(payment.debtor_id).

  // Step 2: Begin transaction
  BEGIN TRANSACTION

  // Step 3: Lock payment row
  SELECT * FROM payments
    WHERE id = $paymentId
    FOR UPDATE
  → Assert status = 'pending'. If not, ROLLBACK and raise PaymentAlreadyAppliedError.

  // Step 4: Resolve debtor
  debtor_id = payment.debtor_id
  currency   = payment.currency

  // Step 5: Lock candidate installments
  SELECT i.*
    FROM installments i
    JOIN debts d ON d.id = i.debt_id
    WHERE d.debtor_id = $debtor_id
      AND d.currency  = $currency
      AND i.status    = 'pending'
    ORDER BY i.due_date ASC, i.sequence_number ASC
    FOR UPDATE
  → This lock prevents concurrent applyPayment calls for the same debtor from interleaving.

  // Step 6: Initialize remainder
  remaining_minor = payment.amount_minor

  // Step 7: FIFO loop
  FOR EACH installment IN locked_installments:
    IF remaining_minor = 0: BREAK

    to_apply = MIN(remaining_minor, installment.remaining_amount_minor)

    // 7a: Record application (immutable)
    INSERT INTO payment_applications (
      payment_id           = $paymentId,
      target_type          = 'installment',
      target_id            = installment.id,
      applied_amount_minor = to_apply
    )

    // 7b: Update installment
    UPDATE installments
      SET remaining_amount_minor = remaining_amount_minor - to_apply
      WHERE id = installment.id

    // 7c: Mark paid if fully covered
    IF installment.remaining_amount_minor - to_apply = 0:
      UPDATE installments SET status = 'paid' WHERE id = installment.id

    remaining_minor = remaining_minor - to_apply

  // Step 8: Reject excess (Phase 1 rule)
  IF remaining_minor > 0:
    ROLLBACK
    RAISE PaymentExcessError(leftover = remaining_minor)

  // Step 9: Approve payment
  UPDATE payments
    SET status     = 'approved',
        applied_at = now()
    WHERE id = $paymentId

  // Step 10: Commit
  COMMIT

  RETURN { applications: [...], leftover_minor: 0 }
```

**Transaction boundary:** Steps 2–10 form one atomic transaction. The `SELECT ... FOR UPDATE` in Steps 3 and 5 prevents concurrent `applyPayment` calls for the same debtor from interleaving and creating double-application bugs.

---

## Phase 2 — Partial-Payment Conversion

Extends Phase 1. When a payment partially covers an installment, the unpaid remainder is converted into a new `interest_debts` row at the current `default_annual_rate`. The installment is marked `converted` and removed from future FIFO consideration.

After all installments are processed, any leftover remainder is applied FIFO to existing active `interest_debts` in chronological order.

```
function applyPayment(paymentId: uuid):
  // Steps 1–6: Identical to Phase 1

  // Step 7: Extended FIFO loop (replaces Phase 1 Step 7)
  FOR EACH installment IN locked_installments:
    IF remaining_minor = 0: BREAK

    IF remaining_minor >= installment.remaining_amount_minor:
      // Full or over-cover: same as Phase 1
      to_apply = installment.remaining_amount_minor

      INSERT INTO payment_applications (
        payment_id           = $paymentId,
        target_type          = 'installment',
        target_id            = installment.id,
        applied_amount_minor = to_apply
      )

      UPDATE installments
        SET remaining_amount_minor = 0, status = 'paid'
        WHERE id = installment.id

      remaining_minor = remaining_minor - to_apply

    ELSE:
      // Partial cover → conversion
      to_apply = remaining_minor

      INSERT INTO payment_applications (
        payment_id           = $paymentId,
        target_type          = 'installment',
        target_id            = installment.id,
        applied_amount_minor = to_apply
      )

      shortfall = installment.remaining_amount_minor - to_apply

      // Snapshot current rate at conversion time
      rate = SELECT value FROM settings WHERE key = 'default_annual_rate'

      INSERT INTO interest_debts (
        debt_id               = debt.id,         -- debt that owns this installment
        source_installment_id = installment.id,
        principal_minor       = shortfall,
        current_balance_minor = shortfall,
        interest_rate         = rate::text,       -- snapshot; never changes
        is_simulated          = false,
        status                = 'active'
      )

      UPDATE installments
        SET status                = 'converted',
            remaining_amount_minor = 0
        WHERE id = installment.id

      remaining_minor = 0
      BREAK

  // Step 8: Apply remainder to interest_debts (if any remains)
  IF remaining_minor > 0:
    SELECT id.*
      FROM interest_debts id
      JOIN debts d ON d.id = id.debt_id
      WHERE d.debtor_id   = $debtor_id
        AND d.currency     = $currency
        AND id.is_simulated = false
        AND id.status       = 'active'
      ORDER BY id.created_at ASC
      FOR UPDATE

    FOR EACH interest_debt IN locked_interest_debts:
      IF remaining_minor = 0: BREAK

      to_apply = MIN(remaining_minor, interest_debt.current_balance_minor)

      INSERT INTO payment_applications (
        payment_id           = $paymentId,
        target_type          = 'interest_debt',
        target_id            = interest_debt.id,
        applied_amount_minor = to_apply
      )

      UPDATE interest_debts
        SET current_balance_minor = current_balance_minor - to_apply
        WHERE id = interest_debt.id

      IF interest_debt.current_balance_minor - to_apply = 0:
        UPDATE interest_debts SET status = 'settled' WHERE id = interest_debt.id

      remaining_minor = remaining_minor - to_apply

  // Step 9: Reject excess
  IF remaining_minor > 0:
    ROLLBACK
    RAISE PaymentExcessError(leftover = remaining_minor)

  // Step 10: Approve payment
  UPDATE payments
    SET status     = 'approved',
        applied_at = now()
    WHERE id = $paymentId

  // Step 11: Commit
  COMMIT

  RETURN { applications: [...], leftover_minor: 0 }
```

**Transaction boundary:** Steps 2–11 form one atomic transaction. The `SELECT ... FOR UPDATE` in Steps 3, 5, and 8 prevent concurrent calls from interleaving.

---

## Error Taxonomy

| Error | Condition | Phase |
|-------|-----------|-------|
| `PaymentAlreadyAppliedError` | `payment.status != 'pending'` when locked | 1, 2 |
| `PaymentExcessError` | `remaining_minor > 0` after all FIFO loops | 1, 2 |
| `CurrencyMismatchError` | Payment currency does not match debtor's active debt currencies | 1, 2 |

---

## Rate Snapshot Guarantee

In Step 7's partial-conversion branch, the `interest_rate` is read from `settings` inside the same transaction that creates the `interest_debts` row. This means:

- The rate is consistent with the system state at the exact moment of conversion.
- Subsequent admin changes to `settings.default_annual_rate` never retroactively alter existing `interest_debts`.
- The `interest_rate` column on `interest_debts` is immutable after insert.

---

## Reconstruction Guarantee

To reconstruct the full account state at any point in time `T`:

1. Take all `payment_applications` rows where `payments.applied_at <= T`.
2. Sum `applied_amount_minor` grouped by `(target_type, target_id)`.
3. Subtract from each installment's `amount_minor` to get the effective `remaining_amount_minor`.
4. Subtract from each interest debt's `principal_minor` plus accruals up to `T` to get effective `current_balance_minor`.

This reconstruction must match the live database values exactly. If it does not, there is a pipeline bug.
