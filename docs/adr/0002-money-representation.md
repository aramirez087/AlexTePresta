# ADR 0002 — Money Representation

**Status**: Accepted

## Context

Floating-point arithmetic produces rounding errors that compound over many accrual periods. Using JavaScript `number` for monetary values is a well-known source of financial bugs (e.g., `0.1 + 0.2 !== 0.3`). The app handles compound interest calculations over potentially years of accruals.

## Decision

**All monetary amounts are stored as `bigint` in minor units (céntimos for CRC, cents for USD). `decimal.js` is used for intermediate arithmetic. Results are rounded half-even (banker's rounding) to integer minor units before persistence.**

Concretely:
- PostgreSQL columns: `bigint`
- TypeScript values: `bigint`
- `decimal.js` with `Decimal.set({ precision: 40 })` for accrual arithmetic
- `Intl.NumberFormat` with locale `'es-CR'` for display (divides by 100)

## Consequences

**Positive:**
- Exact integer arithmetic for storage; no silent rounding drift.
- Half-even rounding matches GAAP/accounting standard and avoids systematic bias over many periods.
- `bigint` arithmetic in TypeScript is exact for the magnitude of amounts in this app.

**Negative:**
- `bigint` cannot be serialized to JSON natively — serialization produces a `TypeError`. All server action responses and API routes must convert `bigint` to `string` at trust boundaries. These conversions are documented with `// boundary: JSON serialization`.
- All UI display code must divide minor units by the currency's minor-unit factor (100 for both CRC and USD) using `Intl.NumberFormat`.
- Supabase JS client returns `bigint` columns as `string` by default (PostgreSQL `bigint` → JSON `string`). The app layer must parse these strings back to `bigint` at the trust boundary. Documented with `// boundary: Supabase bigint`.
