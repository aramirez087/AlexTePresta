# ADR 0004 — Idempotent Scheduled Jobs

**Status**: Accepted

## Context

Vercel cron jobs can be invoked multiple times for the same period due to retries, clock drift, or operator re-runs. A non-idempotent job would create duplicate installments or double-count accrued interest. The correction cost (finding and deleting duplicate rows) is high.

## Decision

**All scheduled jobs are idempotent on their natural key. Jobs use `INSERT ... ON CONFLICT DO NOTHING`.**

| Job | Natural Key | Unique Constraint |
|-----|-------------|-------------------|
| Installment generation | `(debt_id, sequence_number)` | `UNIQUE (debt_id, sequence_number)` on `installments` |
| Monthly interest accrual | `(interest_debt_id, period, mode)` | `UNIQUE (interest_debt_id, period, mode)` on `interest_accruals` |

`period` format is `'YYYY-MM'`. The cron derives `period` from UTC wall-clock date at execution time.

## Consequences

**Positive:**
- Re-running any cron job for any historical period is safe.
- Idempotency removes an entire class of production incidents (duplicate records, double charges).
- Backfilling missed periods manually requires no extra guard against double-execution.

**Negative:**
- The unique constraints must be in place before the first job run — migration order matters. Both constraints are established in `supabase/migrations/0001_init.sql`. Any `supabase db reset` must replay this migration before any job runs.
- `ON CONFLICT DO NOTHING` silently discards the duplicate insert. If a bug causes incorrect values to be inserted in the first run, subsequent runs will not overwrite them. Corrections require a manual UPDATE migration.
