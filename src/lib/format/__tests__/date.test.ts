// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { formatDate, daysUntil } from '../date'

describe('formatDate', () => {
  it('contains Spanish month name enero for January date', () => {
    const result = formatDate(new Date('2024-01-15T12:00:00Z'))
    expect(result).toMatch(/enero/i)
  })

  it('shows diciembre for December, not enero (month boundary)', () => {
    const result = formatDate(new Date('2024-12-31T12:00:00Z'))
    expect(result).toMatch(/diciembre/i)
    expect(result).not.toMatch(/enero/i)
  })

  it('handles UTC midnight correctly — 2024-03-15T06:00:00Z is March 15 in CR (UTC-6)', () => {
    // 2024-03-15T06:00:00Z = 2024-03-15T00:00:00-06:00 — still March 15 in CR
    const result = formatDate(new Date('2024-03-15T06:00:00Z'))
    expect(result).toContain('15')
    expect(result).toMatch(/marzo/i)
  })

  it('shows March 14 when UTC date is March 15 at midnight (2024-03-15T00:00:00Z = March 14 in CR)', () => {
    // 2024-03-15T00:00:00Z = 2024-03-14T18:00:00-06:00 — March 14 in CR
    const result = formatDate(new Date('2024-03-15T00:00:00Z'))
    expect(result).toContain('14')
    expect(result).toMatch(/marzo/i)
  })

  it('always returns a string', () => {
    const result = formatDate(new Date('2024-06-15T12:00:00Z'))
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('daysUntil', () => {
  beforeEach(() => {
    // Pin "today" to 2024-06-01T12:00:00Z (noon UTC = morning in CR, still June 1)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-01T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns positive number for future date', () => {
    const future = new Date('2024-06-15T12:00:00Z')
    expect(daysUntil(future)).toBeGreaterThan(0)
  })

  it('returns negative number for past date', () => {
    const past = new Date('2024-05-20T12:00:00Z')
    expect(daysUntil(past)).toBeLessThan(0)
  })

  it('returns 0 for today (same calendar day in CR)', () => {
    const today = new Date('2024-06-01T18:00:00Z')
    expect(daysUntil(today)).toBe(0)
  })

  it('returns 30 for a date 30 days out', () => {
    const thirtyDaysOut = new Date('2024-07-01T12:00:00Z')
    expect(daysUntil(thirtyDaysOut)).toBe(30)
  })
})
