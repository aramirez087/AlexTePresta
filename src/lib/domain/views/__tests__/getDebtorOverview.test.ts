// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

import { getDebtorOverview } from '../getDebtorOverview'
import type { createAdminClient } from '@/lib/supabase/admin'

const DEBTOR_ID = '00000000-0000-0000-0099-000000000001'
const DEBT_ID_CRC = '00000000-0000-0000-0001-000000000001'
const DEBT_ID_USD = '00000000-0000-0000-0001-000000000002'
const INST_ID_1 = '00000000-0000-0000-0002-000000000001'
const INST_ID_2 = '00000000-0000-0000-0002-000000000002'
const IDEBT_ID_1 = '00000000-0000-0000-0003-000000000001'
const IDEBT_ID_SIM_1 = '00000000-0000-0000-0004-000000000001'

type MockDebt = {
  id: string
  currency: string
  description: string | null
  total_amount_minor: number
  total_installments: number
  installment_amount_minor: number
  status: string
}

type MockInstallment = {
  id: string
  due_date: string
  amount_minor: number
  remaining_amount_minor: number
  status: string
  sequence_number: number
  debt_id: string
}

type MockInterestDebt = {
  id: string
  debt_id: string
  current_balance_minor: number
}

function makeAdminClient(
  debts: MockDebt[],
  installments: MockInstallment[],
  realInterestDebts: MockInterestDebt[] = [],
  simulatedInterestDebts: MockInterestDebt[] = [],
): ReturnType<typeof createAdminClient> {
  const installmentsOrderSeq = vi.fn().mockResolvedValue({ data: installments, error: null })
  const installmentsOrderDate = vi.fn().mockReturnValue({ order: installmentsOrderSeq })
  const installmentsIn = vi.fn().mockReturnValue({ order: installmentsOrderDate })
  const installmentsSelect = vi.fn().mockReturnValue({ in: installmentsIn })

  const debtsEq2 = vi.fn().mockResolvedValue({ data: debts, error: null })
  const debtsEq1 = vi.fn().mockReturnValue({ eq: debtsEq2 })
  const debtsSelect = vi.fn().mockReturnValue({ eq: debtsEq1 })

  // Real interest_debts: .select().in().eq('is_simulated', false).eq('status', 'active') → Promise
  const realResolved = vi.fn().mockResolvedValue({ data: realInterestDebts, error: null })
  const realEqSim = vi.fn().mockReturnValue({ eq: realResolved })
  const realIn = vi.fn().mockReturnValue({ eq: realEqSim })
  const realSelect = vi.fn().mockReturnValue({ in: realIn })

  // Simulated interest_debts: .select().in().eq('is_simulated', true).eq('status', 'active') → Promise
  const simResolved = vi.fn().mockResolvedValue({ data: simulatedInterestDebts, error: null })
  const simEqSim = vi.fn().mockReturnValue({ eq: simResolved })
  const simIn = vi.fn().mockReturnValue({ eq: simEqSim })
  const simSelect = vi.fn().mockReturnValue({ in: simIn })

  let interestDebtsCallCount = 0
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'debts') return { select: debtsSelect }
    if (table === 'installments') return { select: installmentsSelect }
    if (table === 'interest_debts') {
      interestDebtsCallCount++
      return interestDebtsCallCount === 1
        ? { select: realSelect }
        : { select: simSelect }
    }
    return { select: vi.fn() }
  })

  // boundary: mock object — vitest mock of Supabase admin client shape
  return { from } as unknown as ReturnType<typeof createAdminClient>
}

describe('getDebtorOverview', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns empty result when debtor has no active debts', async () => {
    const client = makeAdminClient([], [])
    const result = await getDebtorOverview(client, DEBTOR_ID)
    expect(result.debts).toHaveLength(0)
    expect(result.total_owed_by_currency.CRC).toBe(0n)
    expect(result.total_owed_by_currency.USD).toBe(0n)
    expect(result.real_balance_by_currency.CRC).toBe(0n)
    expect(result.simulated_balance_by_currency.CRC).toBe(0n)
    expect(result.status).toBe('al_dia')
    expect(result.next_installment).toBeNull()
  })

  it('computes total_owed for CRC debt with pending installments', async () => {
    const debts: MockDebt[] = [
      { id: DEBT_ID_CRC, currency: 'CRC', description: 'Préstamo', total_amount_minor: 300000, total_installments: 3, installment_amount_minor: 100000, status: 'active' },
    ]
    const installments: MockInstallment[] = [
      { id: INST_ID_1, due_date: '2025-06-01', amount_minor: 100000, remaining_amount_minor: 100000, status: 'pending', sequence_number: 1, debt_id: DEBT_ID_CRC },
      { id: INST_ID_2, due_date: '2025-07-01', amount_minor: 100000, remaining_amount_minor: 100000, status: 'pending', sequence_number: 2, debt_id: DEBT_ID_CRC },
    ]
    const client = makeAdminClient(debts, installments)
    const result = await getDebtorOverview(client, DEBTOR_ID)
    expect(result.total_owed_by_currency.CRC).toBe(200000n)
  })

  it('includes paid amount in total_paid_by_currency', async () => {
    const debts: MockDebt[] = [
      { id: DEBT_ID_CRC, currency: 'CRC', description: null, total_amount_minor: 200000, total_installments: 2, installment_amount_minor: 100000, status: 'active' },
    ]
    const installments: MockInstallment[] = [
      { id: INST_ID_1, due_date: '2025-04-01', amount_minor: 100000, remaining_amount_minor: 0, status: 'paid', sequence_number: 1, debt_id: DEBT_ID_CRC },
      { id: INST_ID_2, due_date: '2025-05-01', amount_minor: 100000, remaining_amount_minor: 100000, status: 'pending', sequence_number: 2, debt_id: DEBT_ID_CRC },
    ]
    const client = makeAdminClient(debts, installments)
    const result = await getDebtorOverview(client, DEBTOR_ID)
    expect(result.total_paid_by_currency.CRC).toBe(100000n)
    expect(result.total_owed_by_currency.CRC).toBe(100000n)
  })

  it('returns atrasado when installment due_date is in the past', async () => {
    const debts: MockDebt[] = [
      { id: DEBT_ID_CRC, currency: 'CRC', description: null, total_amount_minor: 100000, total_installments: 1, installment_amount_minor: 100000, status: 'active' },
    ]
    const installments: MockInstallment[] = [
      { id: INST_ID_1, due_date: '2020-01-01', amount_minor: 100000, remaining_amount_minor: 100000, status: 'overdue', sequence_number: 1, debt_id: DEBT_ID_CRC },
    ]
    const client = makeAdminClient(debts, installments)
    const result = await getDebtorOverview(client, DEBTOR_ID)
    expect(result.status).toBe('atrasado')
  })

  it('returns al_dia when all installments are in the future', async () => {
    const debts: MockDebt[] = [
      { id: DEBT_ID_CRC, currency: 'CRC', description: null, total_amount_minor: 100000, total_installments: 1, installment_amount_minor: 100000, status: 'active' },
    ]
    const installments: MockInstallment[] = [
      { id: INST_ID_1, due_date: '2099-01-01', amount_minor: 100000, remaining_amount_minor: 100000, status: 'pending', sequence_number: 1, debt_id: DEBT_ID_CRC },
    ]
    const client = makeAdminClient(debts, installments)
    const result = await getDebtorOverview(client, DEBTOR_ID)
    expect(result.status).toBe('al_dia')
  })

  it('next_installment points to the earliest pending installment', async () => {
    const debts: MockDebt[] = [
      { id: DEBT_ID_CRC, currency: 'CRC', description: null, total_amount_minor: 200000, total_installments: 2, installment_amount_minor: 100000, status: 'active' },
    ]
    const installments: MockInstallment[] = [
      { id: INST_ID_1, due_date: '2025-06-01', amount_minor: 100000, remaining_amount_minor: 100000, status: 'pending', sequence_number: 1, debt_id: DEBT_ID_CRC },
      { id: INST_ID_2, due_date: '2025-07-01', amount_minor: 100000, remaining_amount_minor: 100000, status: 'pending', sequence_number: 2, debt_id: DEBT_ID_CRC },
    ]
    const client = makeAdminClient(debts, installments)
    const result = await getDebtorOverview(client, DEBTOR_ID)
    expect(result.next_installment?.due_date).toBe('2025-06-01')
  })

  it('populates both CRC and USD totals for multi-currency debtor', async () => {
    const debts: MockDebt[] = [
      { id: DEBT_ID_CRC, currency: 'CRC', description: null, total_amount_minor: 100000, total_installments: 1, installment_amount_minor: 100000, status: 'active' },
      { id: DEBT_ID_USD, currency: 'USD', description: null, total_amount_minor: 50000, total_installments: 1, installment_amount_minor: 50000, status: 'active' },
    ]
    const installments: MockInstallment[] = [
      { id: INST_ID_1, due_date: '2025-06-01', amount_minor: 100000, remaining_amount_minor: 100000, status: 'pending', sequence_number: 1, debt_id: DEBT_ID_CRC },
      { id: INST_ID_2, due_date: '2025-06-01', amount_minor: 50000, remaining_amount_minor: 50000, status: 'pending', sequence_number: 1, debt_id: DEBT_ID_USD },
    ]
    const client = makeAdminClient(debts, installments)
    const result = await getDebtorOverview(client, DEBTOR_ID)
    expect(result.total_owed_by_currency.CRC).toBe(100000n)
    expect(result.total_owed_by_currency.USD).toBe(50000n)
  })

  it('total_owed_by_currency values are bigint', async () => {
    const debts: MockDebt[] = [
      { id: DEBT_ID_CRC, currency: 'CRC', description: null, total_amount_minor: 100000, total_installments: 1, installment_amount_minor: 100000, status: 'active' },
    ]
    const installments: MockInstallment[] = [
      { id: INST_ID_1, due_date: '2025-06-01', amount_minor: 100000, remaining_amount_minor: 100000, status: 'pending', sequence_number: 1, debt_id: DEBT_ID_CRC },
    ]
    const client = makeAdminClient(debts, installments)
    const result = await getDebtorOverview(client, DEBTOR_ID)
    expect(typeof result.total_owed_by_currency.CRC).toBe('bigint')
    expect(typeof result.total_owed_by_currency.USD).toBe('bigint')
  })

  it('includes active real interest_debt balances in total_owed_by_currency', async () => {
    const debts: MockDebt[] = [
      { id: DEBT_ID_CRC, currency: 'CRC', description: null, total_amount_minor: 147875, total_installments: 1, installment_amount_minor: 147875, status: 'active' },
    ]
    const installments: MockInstallment[] = [
      { id: INST_ID_1, due_date: '2025-06-01', amount_minor: 147875, remaining_amount_minor: 0, status: 'converted', sequence_number: 1, debt_id: DEBT_ID_CRC },
    ]
    const realInterestDebts: MockInterestDebt[] = [
      { id: IDEBT_ID_1, debt_id: DEBT_ID_CRC, current_balance_minor: 47875 },
    ]
    const client = makeAdminClient(debts, installments, realInterestDebts)
    const result = await getDebtorOverview(client, DEBTOR_ID)
    expect(result.real_balance_by_currency.CRC).toBe(47875n)
    // total_owed includes the real interest_debt balance (installment is converted, remaining=0)
    expect(result.total_owed_by_currency.CRC).toBe(47875n)
  })

  it('real_balance_by_currency values are bigint', async () => {
    const debts: MockDebt[] = [
      { id: DEBT_ID_CRC, currency: 'CRC', description: null, total_amount_minor: 100000, total_installments: 1, installment_amount_minor: 100000, status: 'active' },
    ]
    const realInterestDebts: MockInterestDebt[] = [
      { id: IDEBT_ID_1, debt_id: DEBT_ID_CRC, current_balance_minor: 47875 },
    ]
    const client = makeAdminClient(debts, [], realInterestDebts)
    const result = await getDebtorOverview(client, DEBTOR_ID)
    expect(typeof result.real_balance_by_currency.CRC).toBe('bigint')
    expect(typeof result.real_balance_by_currency.USD).toBe('bigint')
  })

  // ---------------------------------------------------------------------------
  // Simulation-specific tests
  // ---------------------------------------------------------------------------

  it('simulated_balance_by_currency is 0 when no simulated debts exist', async () => {
    const debts: MockDebt[] = [
      { id: DEBT_ID_CRC, currency: 'CRC', description: null, total_amount_minor: 100000, total_installments: 1, installment_amount_minor: 100000, status: 'active' },
    ]
    const client = makeAdminClient(debts, [])
    const result = await getDebtorOverview(client, DEBTOR_ID)
    expect(result.simulated_balance_by_currency.CRC).toBe(0n)
    expect(result.simulated_balance_by_currency.USD).toBe(0n)
  })

  it('simulated_balance_by_currency reflects simulated debt balance', async () => {
    const debts: MockDebt[] = [
      { id: DEBT_ID_CRC, currency: 'CRC', description: null, total_amount_minor: 147875, total_installments: 1, installment_amount_minor: 147875, status: 'active' },
    ]
    const simulatedDebts: MockInterestDebt[] = [
      { id: IDEBT_ID_SIM_1, debt_id: DEBT_ID_CRC, current_balance_minor: 49311 },
    ]
    const client = makeAdminClient(debts, [], [], simulatedDebts)
    const result = await getDebtorOverview(client, DEBTOR_ID)
    expect(result.simulated_balance_by_currency.CRC).toBe(49311n)
  })

  it('total_owed_by_currency does NOT include simulated balance', async () => {
    const debts: MockDebt[] = [
      { id: DEBT_ID_CRC, currency: 'CRC', description: null, total_amount_minor: 147875, total_installments: 1, installment_amount_minor: 147875, status: 'active' },
    ]
    const installments: MockInstallment[] = [
      { id: INST_ID_1, due_date: '2025-06-01', amount_minor: 147875, remaining_amount_minor: 0, status: 'converted', sequence_number: 1, debt_id: DEBT_ID_CRC },
    ]
    const realDebts: MockInterestDebt[] = [
      { id: IDEBT_ID_1, debt_id: DEBT_ID_CRC, current_balance_minor: 47875 },
    ]
    const simulatedDebts: MockInterestDebt[] = [
      { id: IDEBT_ID_SIM_1, debt_id: DEBT_ID_CRC, current_balance_minor: 49311 },
    ]
    const client = makeAdminClient(debts, installments, realDebts, simulatedDebts)
    const result = await getDebtorOverview(client, DEBTOR_ID)
    // total_owed includes real interest debt but NOT simulated
    expect(result.total_owed_by_currency.CRC).toBe(47875n)
    expect(result.simulated_balance_by_currency.CRC).toBe(49311n)
  })

  it('real and simulated balances can diverge at different rates', async () => {
    const debts: MockDebt[] = [
      { id: DEBT_ID_CRC, currency: 'CRC', description: null, total_amount_minor: 147875, total_installments: 1, installment_amount_minor: 147875, status: 'active' },
    ]
    // real 24% annual → 47875 × 0.02 = 957.5 → 958 → 48833
    // simulated 36% annual → 47875 × 0.03 = 1436.25 → 1436 → 49311
    const realDebts: MockInterestDebt[] = [
      { id: IDEBT_ID_1, debt_id: DEBT_ID_CRC, current_balance_minor: 48833 },
    ]
    const simulatedDebts: MockInterestDebt[] = [
      { id: IDEBT_ID_SIM_1, debt_id: DEBT_ID_CRC, current_balance_minor: 49311 },
    ]
    const client = makeAdminClient(debts, [], realDebts, simulatedDebts)
    const result = await getDebtorOverview(client, DEBTOR_ID)
    expect(result.real_balance_by_currency.CRC).toBe(48833n)
    expect(result.simulated_balance_by_currency.CRC).toBe(49311n)
    // The two are different
    expect(result.real_balance_by_currency.CRC).not.toBe(result.simulated_balance_by_currency.CRC)
  })
})
