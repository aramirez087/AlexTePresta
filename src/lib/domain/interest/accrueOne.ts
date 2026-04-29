import Decimal from 'decimal.js'

export function accrueOne(
  opening: bigint,
  monthlyRate: Decimal,
): { accrued_minor: bigint; closing_minor: bigint } {
  if (opening === 0n) return { accrued_minor: 0n, closing_minor: 0n }

  const accruedDec = new Decimal(opening.toString()).mul(monthlyRate)
  // Round accrued amount half-even (banker's rounding) to minor units
  const accrued_minor = BigInt(
    accruedDec.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toFixed(0),
  )
  return { accrued_minor, closing_minor: opening + accrued_minor }
}
