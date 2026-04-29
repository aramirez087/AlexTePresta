// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

import { runMonthlyAccrual } from '../runMonthlyAccrual'
import type { createAdminClient } from '@/lib/supabase/admin'

const PERIOD = '2024-01'
const DEBT_ID_1 = '00000000-0000-0000-0001-000000000001'
const DEBT_ID_2 = '00000000-0000-0000-0001-000000000002'

type DebtRow = { id: string; current_balance_minor: number; interest_rate: string }

// Build a chainable fetch mock: .select(...).eq(...).eq(...) → resolves to result
function makeFetchChain(data: DebtRow[]) {
  const resolved = vi.fn().mockResolvedValue({ data, error: null })
  const eq1 = vi.fn().mockReturnValue({ eq: resolved })
  const select = vi.fn().mockReturnValue({ eq: eq1 })
  return { select }
}

// Build idempotency check chain: .select('id').eq(...).eq(...).eq(...).maybeSingle()
function makeAccrualCheckChain(existing: { id: string } | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: existing, error: null })
  const eq3 = vi.fn().mockReturnValue({ maybeSingle })
  const eq2 = vi.fn().mockReturnValue({ eq: eq3 })
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
  const select = vi.fn().mockReturnValue({ eq: eq1 })
  return { select }
}

// Build insert mock for interest_accruals
function makeInsertChain(error?: string) {
  const insert = vi.fn().mockResolvedValue({
    error: error ? { message: error } : null,
  })
  return { insert }
}

// Build update mock for interest_debts balance update: .update(...).eq('id', ...)
function makeUpdateChain(error?: string) {
  const eq = vi.fn().mockResolvedValue({
    error: error ? { message: error } : null,
  })
  const update = vi.fn().mockReturnValue({ eq })
  return { update }
}

// Create a client whose `from` returns each provided mock in sequence
function makeClient(fromReturns: unknown[]): ReturnType<typeof createAdminClient> {
  let idx = 0
  const from = vi.fn().mockImplementation(() => fromReturns[idx++] ?? {})
  // boundary: mock object — vitest mock of Supabase admin client shape
  return { from } as unknown as ReturnType<typeof createAdminClient>
}

describe('runMonthlyAccrual', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns empty summary when there are no active interest_debts', async () => {
    const client = makeClient([makeFetchChain([])])
    const result = await runMonthlyAccrual(client, PERIOD)
    expect(result).toEqual({ processed: 0, skipped: 0, errors: [] })
  })

  it('processes one new debt: inserts accrual and updates balance', async () => {
    const debt: DebtRow = { id: DEBT_ID_1, current_balance_minor: 47875, interest_rate: '0.24' }
    const client = makeClient([
      makeFetchChain([debt]),          // initial select
      makeAccrualCheckChain(null),     // no existing accrual
      makeInsertChain(),               // insert accrual
      makeUpdateChain(),               // update balance
    ])
    const result = await runMonthlyAccrual(client, PERIOD)
    expect(result.processed).toBe(1)
    expect(result.skipped).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it('idempotency: skips when accrual for same period already exists', async () => {
    const debt: DebtRow = { id: DEBT_ID_1, current_balance_minor: 47875, interest_rate: '0.24' }
    const client = makeClient([
      makeFetchChain([debt]),
      makeAccrualCheckChain({ id: 'existing-accrual-id' }),
    ])
    const result = await runMonthlyAccrual(client, PERIOD)
    expect(result.processed).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.errors).toHaveLength(0)
  })

  it('PRD §7: 47875 at 24% annual → accrued=958, closing=48833', async () => {
    const debt: DebtRow = { id: DEBT_ID_1, current_balance_minor: 47875, interest_rate: '0.24' }
    let capturedInsert: Record<string, unknown> | null = null

    const insertMock = vi.fn().mockImplementation((row: Record<string, unknown>) => {
      capturedInsert = row
      return Promise.resolve({ error: null })
    })
    const eq3 = vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })
    const eq2 = vi.fn().mockReturnValue({ eq: eq3 })
    const eq1Check = vi.fn().mockReturnValue({ eq: eq2 })
    const selectCheck = vi.fn().mockReturnValue({ eq: eq1Check })

    const eqUpdate = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: eqUpdate })

    const eqFetch2 = vi.fn().mockResolvedValue({ data: [debt], error: null })
    const eqFetch1 = vi.fn().mockReturnValue({ eq: eqFetch2 })
    const selectFetch = vi.fn().mockReturnValue({ eq: eqFetch1 })

    let fromCallCount = 0
    const from = vi.fn().mockImplementation(() => {
      fromCallCount++
      if (fromCallCount === 1) return { select: selectFetch }       // initial fetch
      if (fromCallCount === 2) return { select: selectCheck }       // check existing
      if (fromCallCount === 3) return { insert: insertMock }        // insert accrual
      return { update: updateFn }                                    // update balance
    })
    // boundary: mock object — vitest mock of Supabase admin client shape
    const client = { from } as unknown as ReturnType<typeof createAdminClient>

    await runMonthlyAccrual(client, PERIOD)

    expect(capturedInsert).not.toBeNull()
    expect(capturedInsert!['accrued_amount_minor']).toBe(958)
    expect(capturedInsert!['closing_balance_minor']).toBe(48833)
    expect(capturedInsert!['opening_balance_minor']).toBe(47875)
    expect(capturedInsert!['period']).toBe(PERIOD)
    expect(capturedInsert!['mode']).toBe('real')
  })

  it('two-period replay: period 1 → closing 48833; period 2 → closing 49810', async () => {
    const debt1: DebtRow = { id: DEBT_ID_1, current_balance_minor: 47875, interest_rate: '0.24' }
    const debt2: DebtRow = { id: DEBT_ID_1, current_balance_minor: 48833, interest_rate: '0.24' }

    const inserts: Array<Record<string, unknown>> = []
    const makeCapturingInsert = () => ({
      insert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
        inserts.push(row)
        return Promise.resolve({ error: null })
      }),
    })

    const client1 = makeClient([
      makeFetchChain([debt1]),
      makeAccrualCheckChain(null),
      makeCapturingInsert(),
      makeUpdateChain(),
    ])
    await runMonthlyAccrual(client1, '2024-01')

    const client2 = makeClient([
      makeFetchChain([debt2]),
      makeAccrualCheckChain(null),
      makeCapturingInsert(),
      makeUpdateChain(),
    ])
    await runMonthlyAccrual(client2, '2024-02')

    expect(inserts[0]['closing_balance_minor']).toBe(48833)
    expect(inserts[1]['closing_balance_minor']).toBe(49810)
  })

  it('error resilience: DB insert failure is collected, other debts still processed', async () => {
    const debt1: DebtRow = { id: DEBT_ID_1, current_balance_minor: 47875, interest_rate: '0.24' }
    const debt2: DebtRow = { id: DEBT_ID_2, current_balance_minor: 100000, interest_rate: '0.24' }

    let fromCallCount = 0
    const from = vi.fn().mockImplementation(() => {
      fromCallCount++
      if (fromCallCount === 1) return makeFetchChain([debt1, debt2])
      if (fromCallCount === 2) return makeAccrualCheckChain(null)     // debt1 check
      if (fromCallCount === 3) return makeInsertChain('connection error') // debt1 insert fails
      if (fromCallCount === 4) return makeAccrualCheckChain(null)     // debt2 check
      if (fromCallCount === 5) return makeInsertChain()               // debt2 insert OK
      return makeUpdateChain()                                         // debt2 update
    })
    // boundary: mock object — vitest mock of Supabase admin client shape
    const client = { from } as unknown as ReturnType<typeof createAdminClient>

    const result = await runMonthlyAccrual(client, PERIOD)
    expect(result.processed).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain(DEBT_ID_1)
  })
})

// ---------------------------------------------------------------------------
// runMonthlyAccrual — simulated mode
// ---------------------------------------------------------------------------
describe('runMonthlyAccrual — simulated mode', () => {
  beforeEach(() => vi.clearAllMocks())

  it('empty simulated debts → no-op', async () => {
    const client = makeClient([makeFetchChain([])])
    const result = await runMonthlyAccrual(client, PERIOD, 'simulated')
    expect(result).toEqual({ processed: 0, skipped: 0, errors: [] })
  })

  it('processes simulated debt: accrual row has mode=simulated', async () => {
    const debt: DebtRow = { id: DEBT_ID_1, current_balance_minor: 47875, interest_rate: '0.36' }
    let capturedInsert: Record<string, unknown> | null = null

    const insertMock = vi.fn().mockImplementation((row: Record<string, unknown>) => {
      capturedInsert = row
      return Promise.resolve({ error: null })
    })

    const eq3 = vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })
    const eq2 = vi.fn().mockReturnValue({ eq: eq3 })
    const eq1Check = vi.fn().mockReturnValue({ eq: eq2 })
    const selectCheck = vi.fn().mockReturnValue({ eq: eq1Check })

    const eqUpdate = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: eqUpdate })

    const eqFetch2 = vi.fn().mockResolvedValue({ data: [debt], error: null })
    const eqFetch1 = vi.fn().mockReturnValue({ eq: eqFetch2 })
    const selectFetch = vi.fn().mockReturnValue({ eq: eqFetch1 })

    let fromCallCount = 0
    const from = vi.fn().mockImplementation(() => {
      fromCallCount++
      if (fromCallCount === 1) return { select: selectFetch }
      if (fromCallCount === 2) return { select: selectCheck }
      if (fromCallCount === 3) return { insert: insertMock }
      return { update: updateFn }
    })
    // boundary: mock object — vitest mock of Supabase admin client shape
    const client = { from } as unknown as ReturnType<typeof createAdminClient>

    const result = await runMonthlyAccrual(client, PERIOD, 'simulated')
    expect(result.processed).toBe(1)
    expect(capturedInsert).not.toBeNull()
    expect(capturedInsert!['mode']).toBe('simulated')
  })

  it('idempotency per mode: second call same period+simulated is skipped', async () => {
    const debt: DebtRow = { id: DEBT_ID_1, current_balance_minor: 47875, interest_rate: '0.36' }
    const client = makeClient([
      makeFetchChain([debt]),
      makeAccrualCheckChain({ id: 'existing-sim-accrual' }),
    ])
    const result = await runMonthlyAccrual(client, PERIOD, 'simulated')
    expect(result.skipped).toBe(1)
    expect(result.processed).toBe(0)
  })

  it('divergence: real 24% → accrued=958, simulated 36% → accrued=1436 (47875 opening)', async () => {
    // Real: 47875 × 0.02 = 957.5 → 958 (ROUND_HALF_EVEN rounds .5 to even → 958)
    // Simulated: 47875 × 0.03 = 1436.25 → 1436
    const realDebt: DebtRow = { id: DEBT_ID_1, current_balance_minor: 47875, interest_rate: '0.24' }
    const simDebt: DebtRow = { id: DEBT_ID_2, current_balance_minor: 47875, interest_rate: '0.36' }

    const realInserts: Array<Record<string, unknown>> = []
    const simInserts: Array<Record<string, unknown>> = []

    function makeCapturingInsert(target: Array<Record<string, unknown>>) {
      return {
        insert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
          target.push(row)
          return Promise.resolve({ error: null })
        }),
      }
    }

    const clientReal = makeClient([
      makeFetchChain([realDebt]),
      makeAccrualCheckChain(null),
      makeCapturingInsert(realInserts),
      makeUpdateChain(),
    ])
    await runMonthlyAccrual(clientReal, PERIOD, 'real')

    const clientSim = makeClient([
      makeFetchChain([simDebt]),
      makeAccrualCheckChain(null),
      makeCapturingInsert(simInserts),
      makeUpdateChain(),
    ])
    await runMonthlyAccrual(clientSim, PERIOD, 'simulated')

    expect(realInserts[0]['accrued_amount_minor']).toBe(958)
    expect(realInserts[0]['closing_balance_minor']).toBe(48833)
    expect(simInserts[0]['accrued_amount_minor']).toBe(1436)
    expect(simInserts[0]['closing_balance_minor']).toBe(49311)
    expect(realInserts[0]['mode']).toBe('real')
    expect(simInserts[0]['mode']).toBe('simulated')
  })
})
