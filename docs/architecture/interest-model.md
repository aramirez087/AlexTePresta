# Interest Model

## Monthly Compound Formula

```
monthly_rate = Decimal(annual_rate) / Decimal(12)
accrued_minor = ROUND_HALF_EVEN(Decimal(opening_balance_minor) * monthly_rate)
closing_minor = opening_balance_minor + accrued_minor
```

All intermediate arithmetic uses `decimal.js` with `Decimal.set({ precision: 40 })`. The final value is cast to `bigint` using half-even (banker's) rounding before persistence in `interest_accruals`.

## Rate Snapshot

`interest_rate` on `interest_debts` is a `text` decimal string (e.g. `"0.24"`) captured from `settings.default_annual_rate` at the moment the `interest_debts` row is created. Admin changes to `settings.default_annual_rate` do **not** retroactively alter existing `interest_debts`. Each row carries its own fixed rate for its lifetime.

## Real vs Simulated Mode

- `is_simulated = false` rows represent actual outstanding obligations factored into FIFO allocation.
- `is_simulated = true` rows are informational only — they are never included in FIFO payment application or real balance calculations.
- `interest_accruals.mode` (`'real'` | `'simulated'`) records which track an accrual belongs to.

## Idempotency

The monthly accrual cron uses:

```sql
INSERT INTO interest_accruals (interest_debt_id, period, opening_balance_minor, accrued_amount_minor, closing_balance_minor, mode)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (interest_debt_id, period, mode) DO NOTHING;
```

The `UNIQUE (interest_debt_id, period, mode)` constraint makes second invocations a strict no-op with no side effects. Re-running the cron for any historical period is safe.

`period` is always `'YYYY-MM'` derived from wall-clock UTC date at cron execution time.

## Rounding Example

- `opening_balance_minor = 47875` (CRC céntimos)
- `annual_rate = "0.24"`, `monthly_rate = 0.02`
- `accrued = ROUND_HALF_EVEN(47875 × 0.02) = ROUND_HALF_EVEN(957.5) = 958`
  - Half-even rule: 957.5 rounds to 958 (nearest even digit in the ones place)
- `closing_balance_minor = 48833`

This exact assertion appears as a unit test in Session 7.

## Balance Update After Accrual

After inserting the `interest_accruals` row, the cron updates the parent `interest_debts` row:

```sql
UPDATE interest_debts
SET current_balance_minor = $closing_minor
WHERE id = $interest_debt_id;
```

This keeps `current_balance_minor` current for display and for the FIFO allocation loop.
