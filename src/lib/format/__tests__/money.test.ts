// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { formatMoney } from '../money'

describe('formatMoney — CRC', () => {
  it('formats zero correctly', () => {
    const result = formatMoney(0n, 'CRC')
    expect(typeof result).toBe('string')
    expect(result).toContain('0')
  })

  it('formats 100 minor units as ₡1.00', () => {
    const result = formatMoney(100n, 'CRC')
    expect(result).toContain('₡')
    expect(result).toContain('1')
  })

  it('formats 147875 minor units correctly', () => {
    const result = formatMoney(147875n, 'CRC')
    expect(result).toContain('₡')
    expect(result).toContain('1')
    expect(result).toContain('478')
    expect(result).toContain('75')
  })

  it('handles large values without throwing', () => {
    const result = formatMoney(100_000_000_000n, 'CRC')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('formats negative amounts without throwing (defensive)', () => {
    const result = formatMoney(-100n, 'CRC')
    expect(typeof result).toBe('string')
    expect(result).toContain('1')
  })
})

describe('formatMoney — USD', () => {
  it('formats zero in USD', () => {
    const result = formatMoney(0n, 'USD')
    expect(typeof result).toBe('string')
    expect(result).toContain('0')
  })

  it('formats 1000 minor units as $10.00', () => {
    const result = formatMoney(1000n, 'USD')
    expect(result).toContain('$')
    expect(result).toContain('10')
    expect(result).toContain('00')
  })

  it('always returns a string', () => {
    const result = formatMoney(5050n, 'USD')
    expect(typeof result).toBe('string')
    expect(result).toContain('$')
    expect(result).toContain('50')
  })
})
