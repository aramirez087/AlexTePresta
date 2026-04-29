# ADR 0002 — Money Representation

**Status:** Accepted  
**Date:** 2026-04-28  
**Deciders:** Alexander Ramirez

---

## Context

Financial applications that store monetary values as floating-point numbers accumulate rounding errors. For example:

```js
0.1 + 0.2 === 0.30000000000000004  // true in JavaScript
```

Over many compound-interest accrual periods, these errors compound and produce incorrect balances. The application tracks loans denominated in CRC (Costa Rican colones, subdivided into céntimos, 1/100) and USD (US dollars, subdivided into cents, 1/100).

The payment pipeline applies money to installments with exact equality checks (`remaining_amount_minor = 0` to mark an installment paid). A floating-point error of even 1 unit in a minor-unit comparison would incorrectly leave an installment marked as partially unpaid.

---

## Decision

1. **All monetary amounts are stored as `bigint` (PostgreSQL `bigint`, TypeScript `bigint`) in minor units.** One CRC = 100 céntimos; one USD = 100 cents. The value `₡10 000,00` is stored as `1000000n` (one million céntimos).

2. **All intermediate monetary arithmetic uses `decimal.js`** with precision set to 40 significant digits and half-even rounding mode:
   ```ts
   import Decimal from 'decimal.js'
   Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN })
   ```

3. **Results are rounded to `bigint` minor units before persistence.** The only point of precision loss is the final `toFixed(0)` → `BigInt(...)` conversion.

4. **Half-even (banker's) rounding is used for all monetary rounding.** When the dropped digit is exactly 0.5, round to the nearest even digit. This avoids systematic upward bias over many accrual periods.

5. **`bigint` values are converted to `string` at all trust boundaries** (Server Action return values, API JSON responses, URL query parameters). Code at these boundaries must include a one-line comment naming the boundary:
   ```ts
   // boundary: JSON serialization — bigint cannot be natively serialized
   const amountStr = amount.toString()
   ```

6. **The UI always formats monetary values with `Intl.NumberFormat`:**
   ```ts
   new Intl.NumberFormat('es-CR', {
     style: 'currency',
     currency: 'CRC',
   }).format(Number(amount_minor) / 100)
   ```
   Note: `Intl.NumberFormat` accepts `number`, so the conversion from `bigint` to `number` for display is acceptable because display values are not used in arithmetic.

---

## Rationale

**`bigint` for storage** eliminates floating-point errors in storage and comparison. Two `bigint` values representing the same minor amount are always strictly equal.

**`decimal.js` for arithmetic** provides arbitrary-precision decimal arithmetic with configurable rounding modes. The compound-interest formula `balance * (1 + rate / 12)` produces an irrational number of decimal places for most inputs; `decimal.js` holds the full precision until the final rounding step.

**Half-even rounding** is the IEEE 754 default and matches GAAP/accounting standards. Systematic rounding bias accumulates into material errors over hundreds of monthly accruals at 24% annual rates. Half-even is unbiased across large samples.

---

## Consequences

### Positive

- Exact integer arithmetic for all storage and comparison operations.
- No silent rounding errors in the payment pipeline (installment paid/unpaid check is exact).
- Half-even rounding is auditable and matches accounting standards.
- `bigint` type in TypeScript prevents accidental arithmetic with `number` variables — the compiler rejects `bigint + number`.

### Negative / Mitigations

- **`bigint` JSON serialization:** `JSON.stringify(1000n)` throws `TypeError`. Mitigation: every trust boundary converts `bigint` to `string` with an explicit comment. A lint rule (or Zod schema with `.transform()`) enforces this at the serialization layer.
- **`Intl.NumberFormat` requires `number`:** Dividing minor units by 100 for display requires converting `bigint` to `number`. For display purposes only, this is safe because the value is rounded to 2 decimal places and not used in further arithmetic. Values up to `Number.MAX_SAFE_INTEGER` (~9 quadrillion) are representable without loss — far beyond any realistic loan amount.
- **`decimal.js` adds a dependency:** `decimal.js` is a 30 KB minified library. Acceptable for a financial app where correctness outweighs bundle size.
- **Minor-unit factor is always 100 for CRC and USD:** If a third currency with a different minor-unit factor (e.g., JPY, which has no cents) is ever added, the display logic must be updated. This is considered out of scope for all current phases.
