// @vitest-environment node
import { describe, it, expect } from 'vitest'
import Decimal from 'decimal.js'
import { accrueOne } from '../accrueOne'

const MONTHLY_RATE_24PCT = new Decimal('0.02') // 0.24 / 12

describe('accrueOne', () => {
  it('PRD §7 canonical: 47875 * 0.02 = 957.5 → rounds up to 958 (half-even, 958 is even)', () => {
    const result = accrueOne(47875n, MONTHLY_RATE_24PCT)
    expect(result.accrued_minor).toBe(958n)
    expect(result.closing_minor).toBe(48833n)
  })

  it('zero principal returns zeros', () => {
    const result = accrueOne(0n, MONTHLY_RATE_24PCT)
    expect(result.accrued_minor).toBe(0n)
    expect(result.closing_minor).toBe(0n)
  })

  it('exact integer result (no rounding needed): 100000 * 0.02 = 2000', () => {
    const result = accrueOne(100000n, MONTHLY_RATE_24PCT)
    expect(result.accrued_minor).toBe(2000n)
    expect(result.closing_minor).toBe(102000n)
  })

  it('half-even tie rounds DOWN to even: 125 * 0.02 = 2.5 → 2 (2 is even)', () => {
    const result = accrueOne(125n, MONTHLY_RATE_24PCT)
    expect(result.accrued_minor).toBe(2n)
    expect(result.closing_minor).toBe(127n)
  })

  it('two-period compounding period 1: 47875 → 48833', () => {
    const { closing_minor } = accrueOne(47875n, MONTHLY_RATE_24PCT)
    expect(closing_minor).toBe(48833n)
  })

  it('two-period compounding period 2: 48833 * 0.02 = 976.66 → rounds to 977, closing = 49810', () => {
    const { accrued_minor, closing_minor } = accrueOne(48833n, MONTHLY_RATE_24PCT)
    expect(accrued_minor).toBe(977n)
    expect(closing_minor).toBe(49810n)
  })

  it('large value: does not throw or lose precision', () => {
    const large = 999_999_999_999n
    const result = accrueOne(large, MONTHLY_RATE_24PCT)
    expect(result.accrued_minor).toBeGreaterThan(0n)
    expect(result.closing_minor).toBe(large + result.accrued_minor)
  })
})
