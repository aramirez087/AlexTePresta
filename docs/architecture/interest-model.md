# AlexTePresta — Interest Model

This document specifies the compound-interest formula, rounding rules, real vs simulated mode, and cron idempotency for Phase 2 and Phase 3. All column references match [data-model.md](./data-model.md).

## Monthly Compound Formula

Interest accrues monthly. The formula for a single period:

```
monthly_rate      = Decimal(annual_rate) / Decimal(12)
accrued_minor     = ROUND_HALF_EVEN(Decimal(opening_balance_minor) * monthly_rate)
closing_minor     = opening_balance_minor + accrued_minor
```

### Implementation Notes

- All intermediate arithmetic uses `decimal.js` with precision set to 40 significant digits:
  ```ts
  Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN })
  ```
- The final `accrued_minor` value is cast to `bigint` after rounding. This is the only point where precision is lost.
- `annual_rate` is read from `interest_debts.interest_rate` (a decimal string snapshot), not from live `settings`. The rate on an existing `interest_debts` row is immutable after creation.
- `opening_balance_minor` for a given period equals `closing_balance_minor` from the previous period's `interest_accruals` row. For the first period after an `interest_debts` is created, `opening_balance_minor = principal_minor`.

### Rounding Rule: Half-Even (Banker's Rounding)

Half-even rounding is used for all monetary computations. When the digit to be dropped is exactly 0.5, the preceding digit is rounded to the nearest even number. This avoids systematic upward bias that accumulates over many accrual periods.

**Example (from PRD §7):**

```
opening_balance_minor = 47875       (CRC céntimos)
annual_rate           = 0.24
monthly_rate          = 0.24 / 12  = 0.02

accrued_exact         = 47875 × 0.02 = 957.5
ROUND_HALF_EVEN(957.5) = 958        (9 is odd → round up to even 8… wait)
```

Detailed half-even check: `957.5` → the digit before the `.5` is `7` (odd) → round up to `958`. Result: `accrued_minor = 958`.

```
closing_balance_minor = 47875 + 958 = 48833
```

This exact assertion is required as a unit test in Session 7:

```ts
// Session 7 unit test anchor
expect(accrue({ opening: 47875n, annualRate: '0.24' })).toEqual({
  accrued: 958n,
  closing: 48833n,
})
```

---

## Real vs Simulated Mode

The interest model operates on two parallel tracks:

| Track | `interest_debts.is_simulated` | `interest_accruals.mode` | Effect |
|-------|-------------------------------|--------------------------|--------|
| Real | `false` | `'real'` | Actual obligation; participates in FIFO payment allocation |
| Simulated | `true` | `'simulated'` | Informational only; never participates in FIFO; UI shows amber banner |

### Real Track (Phase 2)

- Created by the partial-payment pipeline when `remaining_minor < installment.remaining_amount_minor`.
- `interest_rate` snapshot is taken from `settings.default_annual_rate` at creation time.
- Monthly accrual cron updates `current_balance_minor` and inserts `interest_accruals` rows with `mode = 'real'`.
- Payments reduce `current_balance_minor` via the FIFO pipeline (Step 8 in Phase 2).

### Simulated Track (Phase 3)

- Created by the simulation engine when `settings.simulation_mode = true`.
- Each real `interest_debts` row gets a mirror row (`is_simulated = true`, `mirror_of = real_id`) using `settings.simulated_annual_rate`.
- Monthly accrual cron also processes simulated rows, inserting `interest_accruals` with `mode = 'simulated'`.
- Toggling simulation mode off does NOT delete simulated rows — they remain for historical comparison.
- Simulated rows are never included in FIFO payment allocation. The check `AND is_simulated = false` in the pipeline's `SELECT ... FOR UPDATE` enforces this.

---

## Accrual Cron Specification

### Trigger

The accrual cron runs once per calendar month. Recommended schedule: day 25 of each month at 02:00 UTC (avoids end-of-month ambiguity and runs after all due dates in the month have passed).

On Vercel: monthly granularity is achievable on the free plan using `0 2 25 * *`.

### Period Derivation

The `period` field in `interest_accruals` is derived from the wall-clock UTC date at the time the cron executes:

```ts
const period = new Date().toISOString().slice(0, 7) // 'YYYY-MM'
```

The cron route must log the derived `period` value at the start of each run.

### Idempotency

The `UNIQUE (interest_debt_id, period, mode)` constraint on `interest_accruals` is the primary idempotency mechanism:

```sql
INSERT INTO interest_accruals (
  interest_debt_id,
  period,
  opening_balance_minor,
  accrued_amount_minor,
  closing_balance_minor,
  mode
) VALUES (...)
ON CONFLICT (interest_debt_id, period, mode) DO NOTHING;
```

A second invocation of the cron for the same `(interest_debt_id, period, mode)` triple is a strict no-op. No side effects, no balance updates, no errors.

**Important:** The cron must NOT update `current_balance_minor` on `interest_debts` inline. Instead:

1. Insert the `interest_accruals` row (idempotent).
2. If the insert succeeded (not a conflict), THEN update `current_balance_minor = closing_balance_minor`.
3. If the insert was a no-op conflict, skip the balance update entirely.

This two-step pattern ensures `current_balance_minor` is only updated once per period even if the cron is invoked multiple times.

### Authorization

The cron route at `/api/cron/accrue` is protected by a shared secret:

```
Authorization: Bearer $CRON_SECRET
```

Vercel passes this header automatically when the cron is configured. Any request without the correct `CRON_SECRET` must return `401` without processing.

### Cron Processing Order

For each period, process all active `interest_debts` rows where `is_simulated = false` (real track) first, then all `is_simulated = true` rows (simulated track). This ordering is not strictly required for correctness but produces predictable logs.

---

## Rate Snapshot Guarantee

The `interest_rate` column on `interest_debts` stores the annual rate as a decimal string (e.g., `"0.24"`) at the moment the sub-debt is created. This snapshot is immutable:

- Admin changes to `settings.default_annual_rate` apply only to future partial-payment conversions.
- All accrual computations read `interest_debts.interest_rate`, not `settings.default_annual_rate`.
- This matches standard loan agreement practice: the rate at origination governs the loan's lifetime.

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| `current_balance_minor = 0` at accrual time | `accrued_minor = 0`, `closing = 0`; insert row with zeroes; no-op for balance |
| Payment arrives on the same day as accrual | Order determined by database transaction timestamps; no special case needed |
| `interest_debts.status = 'settled'` | Exclude from accrual cron query: `WHERE status = 'active'` |
| Cron runs before the first month is complete | Inserts a valid accrual for a partial month; this is acceptable — the cron period key prevents double-accrual |
| Two cron invocations in the same minute | Second invocation hits `ON CONFLICT DO NOTHING`; exactly one row per period |
