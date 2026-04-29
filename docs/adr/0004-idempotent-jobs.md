# ADR 0004 — Idempotent Scheduled Jobs

**Status:** Accepted  
**Date:** 2026-04-28  
**Deciders:** Alexander Ramirez

---

## Context

AlexTePresta has two scheduled jobs:

1. **Installment generation** — creates the full installment schedule rows for a new debt. This runs synchronously when a debt is created (not a background cron), but the same function may be called from a retry or an admin "regenerate" action.

2. **Monthly accrual cron** — runs once per calendar month to apply compound interest to all active `interest_debts` rows. This is a Vercel cron job and can be invoked multiple times for the same period due to:
   - Vercel cron retry on non-2xx response
   - Manual operator re-run (for backfill or debugging)
   - Clock drift in the cron scheduler
   - Two cron invocations within the same minute (theoretical edge case)

A non-idempotent installment generator would create duplicate installment rows. A non-idempotent accrual cron would double-count interest, inflating balances and damaging trust.

---

## Decision

**All scheduled jobs are idempotent on their natural key.** Re-running any job for any historical or current period is safe and has no side effects beyond the first successful run.

### Idempotency Keys

| Job | Natural key | Constraint location |
|-----|-------------|---------------------|
| Installment generation | `(debt_id, sequence_number)` | `UNIQUE (debt_id, sequence_number)` on `installments` |
| Monthly accrual | `(interest_debt_id, period, mode)` | `UNIQUE (interest_debt_id, period, mode)` on `interest_accruals` |

### Insert Pattern

Both jobs use `INSERT ... ON CONFLICT (...) DO NOTHING`:

```sql
-- Installment generation
INSERT INTO installments (debt_id, sequence_number, due_date, amount_minor, remaining_amount_minor)
VALUES ($1, $2, $3, $4, $4)
ON CONFLICT (debt_id, sequence_number) DO NOTHING;

-- Accrual cron
INSERT INTO interest_accruals (
  interest_debt_id, period,
  opening_balance_minor, accrued_amount_minor, closing_balance_minor,
  mode
) VALUES (...)
ON CONFLICT (interest_debt_id, period, mode) DO NOTHING
RETURNING id;
```

For the accrual cron, the `RETURNING id` clause is used to detect whether the insert was a no-op:

```ts
const { data } = await supabase
  .from('interest_accruals')
  .insert({ ... })
  .select('id')
  .single()

if (data === null) {
  // Conflict: already accrued this period. Skip balance update.
  return
}

// Insert succeeded: update current_balance_minor on interest_debts
await supabase
  .from('interest_debts')
  .update({ current_balance_minor: closingMinor })
  .eq('id', interestDebtId)
```

This two-step pattern ensures `current_balance_minor` is only updated once per period.

### Unique Constraints Must Precede Job Runs

The unique constraints are established in the initial migration (`supabase/migrations/0001_init.sql`). The installment generation function and accrual cron both depend on these constraints being in place. Migration order is enforced by the numeric prefix (`0001_`, `0002_`, etc.).

---

## Rationale

**`ON CONFLICT DO NOTHING` is the simplest correct pattern.** Alternatives considered:

- **`ON CONFLICT DO UPDATE`** — would silently overwrite a legitimate accrual row if the second invocation computed a different value (e.g., due to a rate change). Rejected: idempotency requires the second invocation to be a pure no-op.
- **Application-level guard (`SELECT` before `INSERT`)** — susceptible to TOCTOU race conditions under concurrent invocations. Rejected: the database unique constraint is the only reliable guard.
- **Distributed lock (Redis, etc.)** — unnecessary complexity for a cron that runs at most once per month. Rejected.

**Natural keys over surrogate idempotency tokens.** The natural keys (`debt_id + sequence_number`, `interest_debt_id + period + mode`) are already meaningful domain concepts. Using them as idempotency keys avoids a separate token generation and storage step.

---

## Consequences

### Positive

- Re-running the accrual cron for any historical period (e.g., backfilling a month missed due to a Vercel outage) is safe and produces correct results.
- Re-running installment generation for an existing debt (e.g., after an admin "regenerate" action) inserts only the missing rows and skips existing ones.
- Production incidents caused by double-execution are eliminated as an entire class.
- Easy to verify: run the cron twice in development and assert that `interest_accruals` has exactly one row per `(interest_debt_id, period, mode)`.

### Negative / Mitigations

- **The unique constraint must be in place before the first job run.** Migration order enforces this; the constraint is in `0001_init.sql`. If a migration is rolled back and re-applied, the `ON CONFLICT` logic handles the re-run correctly.
- **`DO NOTHING` silently swallows legitimate re-computation needs.** If an accrual row was inserted with incorrect values (e.g., due to a formula bug), a fix requires either deleting the incorrect row (with admin tooling) before re-running, or applying a correction row in a subsequent period. Mitigation: the accrual formula is unit-tested with exact-amount assertions before any production data is processed (Session 7 requirement).
- **`period` derives from wall-clock time at cron execution.** If the cron runs near midnight UTC on the last day of the month, it will use the current month as the period, not the next month. This is the intended behavior. The cron schedule (`0 2 25 * *`) runs safely mid-month, well away from month boundaries.
