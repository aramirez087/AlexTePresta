// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  computeDueDate,
  computeInstallments,
  generateForDebt,
} from '@/lib/domain/installments/generateForDebt'
import type { createAdminClient } from '@/lib/supabase/admin'

describe('computeDueDate', () => {
  it('returns correct date for first installment', () => {
    expect(computeDueDate('2024-10', 25, 1)).toBe('2024-10-25')
  })

  it('advances month correctly for subsequent installments', () => {
    expect(computeDueDate('2024-10', 25, 2)).toBe('2024-11-25')
    expect(computeDueDate('2024-10', 25, 3)).toBe('2024-12-25')
  })

  it('wraps year on December→January boundary', () => {
    expect(computeDueDate('2024-10', 25, 4)).toBe('2025-01-25')
  })

  it('wraps year from November start', () => {
    expect(computeDueDate('2024-11', 25, 1)).toBe('2024-11-25')
    expect(computeDueDate('2024-11', 25, 2)).toBe('2024-12-25')
    expect(computeDueDate('2024-11', 25, 3)).toBe('2025-01-25')
  })

  it('handles month 12 + 1 wrapping', () => {
    expect(computeDueDate('2024-12', 15, 1)).toBe('2024-12-15')
    expect(computeDueDate('2024-12', 15, 2)).toBe('2025-01-15')
  })

  it('pads single-digit month and day', () => {
    expect(computeDueDate('2024-01', 5, 1)).toBe('2024-01-05')
  })
})

describe('computeInstallments', () => {
  const DEBT_ID = '00000000-0000-0000-0000-000000000001'

  it('returns exactly N rows for N installments', () => {
    const rows = computeInstallments(DEBT_ID, {
      totalInstallments: 4,
      installmentAmountMinor: 147875n,
      dueDay: 25,
      startMonth: '2024-10',
    })
    expect(rows).toHaveLength(4)
  })

  it('sequence_numbers are 1..N monotonically', () => {
    const rows = computeInstallments(DEBT_ID, {
      totalInstallments: 4,
      installmentAmountMinor: 147875n,
      dueDay: 25,
      startMonth: '2024-10',
    })
    expect(rows.map((r) => r.sequence_number)).toEqual([1, 2, 3, 4])
  })

  it('due_dates are sorted ascending (each 1 month apart)', () => {
    const rows = computeInstallments(DEBT_ID, {
      totalInstallments: 4,
      installmentAmountMinor: 147875n,
      dueDay: 25,
      startMonth: '2024-10',
    })
    const dates = rows.map((r) => r.due_date)
    expect(dates).toEqual(['2024-10-25', '2024-11-25', '2024-12-25', '2025-01-25'])
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] > dates[i - 1]).toBe(true)
    }
  })

  it('amount_minor and remaining_amount_minor equal installmentAmountMinor as Number', () => {
    const rows = computeInstallments(DEBT_ID, {
      totalInstallments: 2,
      installmentAmountMinor: 147875n,
      dueDay: 25,
      startMonth: '2024-10',
    })
    for (const row of rows) {
      expect(row.amount_minor).toBe(147875)
      expect(row.remaining_amount_minor).toBe(147875)
    }
  })

  it('all statuses are pending', () => {
    const rows = computeInstallments(DEBT_ID, {
      totalInstallments: 3,
      installmentAmountMinor: 10000n,
      dueDay: 1,
      startMonth: '2025-03',
    })
    for (const row of rows) {
      expect(row.status).toBe('pending')
    }
  })

  it('all rows have the correct debt_id', () => {
    const rows = computeInstallments(DEBT_ID, {
      totalInstallments: 2,
      installmentAmountMinor: 50000n,
      dueDay: 10,
      startMonth: '2025-01',
    })
    for (const row of rows) {
      expect(row.debt_id).toBe(DEBT_ID)
    }
  })

  it('PRD example: Universidad Fidelitas ₡591500 / 4 installments of ₡147875 starting 2024-10 day 25', () => {
    const rows = computeInstallments(DEBT_ID, {
      totalInstallments: 4,
      installmentAmountMinor: 147875n,
      dueDay: 25,
      startMonth: '2024-10',
    })
    expect(rows).toHaveLength(4)
    expect(rows[0].due_date).toBe('2024-10-25')
    expect(rows[1].due_date).toBe('2024-11-25')
    expect(rows[2].due_date).toBe('2024-12-25')
    expect(rows[3].due_date).toBe('2025-01-25')
    for (const row of rows) {
      expect(row.amount_minor).toBe(147875)
      expect(row.remaining_amount_minor).toBe(147875)
      expect(row.status).toBe('pending')
    }
  })
})

describe('generateForDebt', () => {
  const DEBT_ID = '00000000-0000-0000-0000-000000000002'

  function makeAdminMock(upsertResult: { error: null | { message: string } }) {
    const upsert = vi.fn().mockResolvedValue(upsertResult)
    const from = vi.fn().mockReturnValue({ upsert })
    // boundary: mock object — vitest mock of Supabase admin client shape
    return { from, _upsert: upsert } as unknown as ReturnType<typeof createAdminClient> & {
      _upsert: ReturnType<typeof vi.fn>
    }
  }

  beforeEach(() => vi.clearAllMocks())

  it('calls upsert once with correct rows and ignoreDuplicates: true', async () => {
    const mock = makeAdminMock({ error: null })
    await generateForDebt(mock, DEBT_ID, {
      totalInstallments: 2,
      installmentAmountMinor: 100000n,
      dueDay: 15,
      startMonth: '2025-06',
    })
    expect(mock._upsert).toHaveBeenCalledTimes(1)
    const [rows, opts] = mock._upsert.mock.calls[0] as [unknown[], { ignoreDuplicates: boolean }]
    expect(rows).toHaveLength(2)
    expect(opts.ignoreDuplicates).toBe(true)
  })

  it('second call also invokes upsert (idempotency is DB-side)', async () => {
    const mock = makeAdminMock({ error: null })
    const params = {
      totalInstallments: 1,
      installmentAmountMinor: 50000n,
      dueDay: 1,
      startMonth: '2025-01',
    }
    await generateForDebt(mock, DEBT_ID, params)
    await generateForDebt(mock, DEBT_ID, params)
    expect(mock._upsert).toHaveBeenCalledTimes(2)
  })

  it('throws when upsert returns an error', async () => {
    const mock = makeAdminMock({ error: { message: 'DB error' } })
    await expect(
      generateForDebt(mock, DEBT_ID, {
        totalInstallments: 1,
        installmentAmountMinor: 1000n,
        dueDay: 1,
        startMonth: '2025-01',
      }),
    ).rejects.toThrow('Error al generar cuotas: DB error')
  })
})
