const MINOR_DIVISORS: Record<'CRC' | 'USD', number> = { CRC: 100, USD: 100 }
const LOCALES: Record<'CRC' | 'USD', string> = { CRC: 'es-CR', USD: 'en-US' }

export function formatMoney(amountMinor: bigint, currency: 'CRC' | 'USD'): string {
  const divisor = MINOR_DIVISORS[currency]
  // safe: domain amounts never exceed Number.MAX_SAFE_INTEGER
  // (₡90 quadrillion would be required to overflow — well beyond any personal loan)
  const major = Number(amountMinor) / divisor
  return new Intl.NumberFormat(LOCALES[currency], {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(major)
}
