// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { getDebtTimeline, type GetDebtTimelineParams } from '../getDebtTimeline'

const INST_ID_1 = '00000000-0000-0000-0001-000000000001'
const INST_ID_2 = '00000000-0000-0000-0001-000000000002'
const INST_ID_3 = '00000000-0000-0000-0001-000000000003'
const PMT_ID_1 = '00000000-0000-0000-0002-000000000001'
const PMT_ID_2 = '00000000-0000-0000-0002-000000000002'
const APP_ID_1 = '00000000-0000-0000-0003-000000000001'
const APP_ID_2 = '00000000-0000-0000-0003-000000000002'
const IDEBT_ID_1 = '00000000-0000-0000-0004-000000000001'
const ACCRUAL_ID_1 = '00000000-0000-0000-0005-000000000001'

function makeParams(overrides: Partial<GetDebtTimelineParams> = {}): GetDebtTimelineParams {
  return {
    installments: [],
    payments: [],
    applications: [],
    currency: 'CRC',
    ...overrides,
  }
}

describe('getDebtTimeline', () => {
  it('returns empty array for empty params', () => {
    expect(getDebtTimeline(makeParams())).toEqual([])
  })

  it('returns one installment_due event for a single pending installment', () => {
    const params = makeParams({
      installments: [
        {
          id: INST_ID_1,
          due_date: '2024-06-01',
          amount_minor: 147875,
          remaining_amount_minor: 147875,
          status: 'pending',
          sequence_number: 1,
        },
      ],
    })
    const events = getDebtTimeline(params)
    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe('installment_due')
    expect(events[0].ref_id).toBe(INST_ID_1)
  })

  it('converts installment amount_minor to bigint', () => {
    const params = makeParams({
      installments: [
        {
          id: INST_ID_1,
          due_date: '2024-06-01',
          amount_minor: 147875,
          remaining_amount_minor: 147875,
          status: 'pending',
          sequence_number: 1,
        },
      ],
    })
    const events = getDebtTimeline(params)
    expect(typeof events[0].amount_minor).toBe('bigint')
    expect(events[0].amount_minor).toBe(147875n)
  })

  it('returns one payment_received event for a single payment', () => {
    const params = makeParams({
      payments: [
        {
          id: PMT_ID_1,
          created_at: '2024-06-05T10:00:00Z',
          applied_at: null,
          amount_minor: 147875,
          currency: 'CRC',
          status: 'pending',
          notes: null,
        },
      ],
    })
    const events = getDebtTimeline(params)
    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe('payment_received')
    expect(events[0].ref_id).toBe(PMT_ID_1)
  })

  it('returns one payment_application event for a single application', () => {
    const params = makeParams({
      applications: [
        {
          id: APP_ID_1,
          payment_id: PMT_ID_1,
          target_id: INST_ID_1,
          applied_amount_minor: 147875,
          created_at: '2024-06-05T10:01:00Z',
        },
      ],
    })
    const events = getDebtTimeline(params)
    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe('payment_application')
    expect(events[0].status).toBe('applied')
  })

  it('sorts events chronologically: payment before far-future installment', () => {
    const params = makeParams({
      installments: [
        {
          id: INST_ID_1,
          due_date: '2025-01-01',
          amount_minor: 147875,
          remaining_amount_minor: 147875,
          status: 'pending',
          sequence_number: 1,
        },
      ],
      payments: [
        {
          id: PMT_ID_1,
          created_at: '2024-06-05T10:00:00Z',
          applied_at: null,
          amount_minor: 100000,
          currency: 'CRC',
          status: 'approved',
          notes: null,
        },
      ],
    })
    const events = getDebtTimeline(params)
    expect(events[0].kind).toBe('payment_received')
    expect(events[1].kind).toBe('installment_due')
  })

  it('returns 7 events for 3 installments + 2 payments + 2 applications in date order', () => {
    const params = makeParams({
      installments: [
        { id: INST_ID_1, due_date: '2024-03-01', amount_minor: 10000, remaining_amount_minor: 0, status: 'paid', sequence_number: 1 },
        { id: INST_ID_2, due_date: '2024-04-01', amount_minor: 10000, remaining_amount_minor: 0, status: 'paid', sequence_number: 2 },
        { id: INST_ID_3, due_date: '2024-05-01', amount_minor: 10000, remaining_amount_minor: 10000, status: 'pending', sequence_number: 3 },
      ],
      payments: [
        { id: PMT_ID_1, created_at: '2024-03-05T10:00:00Z', applied_at: '2024-03-05T10:01:00Z', amount_minor: 10000, currency: 'CRC', status: 'approved', notes: null },
        { id: PMT_ID_2, created_at: '2024-04-05T10:00:00Z', applied_at: '2024-04-05T10:01:00Z', amount_minor: 10000, currency: 'CRC', status: 'approved', notes: null },
      ],
      applications: [
        { id: APP_ID_1, payment_id: PMT_ID_1, target_id: INST_ID_1, applied_amount_minor: 10000, created_at: '2024-03-05T10:01:00Z' },
        { id: APP_ID_2, payment_id: PMT_ID_2, target_id: INST_ID_2, applied_amount_minor: 10000, created_at: '2024-04-05T10:01:00Z' },
      ],
    })
    const events = getDebtTimeline(params)
    expect(events).toHaveLength(7)
    for (let i = 1; i < events.length; i++) {
      expect(events[i].date.getTime()).toBeGreaterThanOrEqual(events[i - 1].date.getTime())
    }
  })

  it('preserves installment status (paid, pending, overdue)', () => {
    const params = makeParams({
      installments: [
        { id: INST_ID_1, due_date: '2024-01-01', amount_minor: 10000, remaining_amount_minor: 0, status: 'paid', sequence_number: 1 },
        { id: INST_ID_2, due_date: '2024-02-01', amount_minor: 10000, remaining_amount_minor: 10000, status: 'overdue', sequence_number: 2 },
        { id: INST_ID_3, due_date: '2024-03-01', amount_minor: 10000, remaining_amount_minor: 10000, status: 'pending', sequence_number: 3 },
      ],
    })
    const events = getDebtTimeline(params)
    expect(events[0].status).toBe('paid')
    expect(events[1].status).toBe('overdue')
    expect(events[2].status).toBe('pending')
  })

  it('preserves payment status pending', () => {
    const params = makeParams({
      payments: [
        { id: PMT_ID_1, created_at: '2024-06-01T10:00:00Z', applied_at: null, amount_minor: 10000, currency: 'CRC', status: 'pending', notes: null },
      ],
    })
    const events = getDebtTimeline(params)
    expect(events[0].status).toBe('pending')
  })

  it('populates meta.sequence_number for installment events', () => {
    const params = makeParams({
      installments: [
        { id: INST_ID_1, due_date: '2024-06-01', amount_minor: 10000, remaining_amount_minor: 10000, status: 'pending', sequence_number: 5 },
      ],
    })
    const events = getDebtTimeline(params)
    expect(events[0].meta?.sequence_number).toBe(5)
  })

  it('sets application status to applied regardless of source', () => {
    const params = makeParams({
      applications: [
        { id: APP_ID_1, payment_id: PMT_ID_1, target_id: INST_ID_1, applied_amount_minor: 5000, created_at: '2024-06-01T10:00:00Z' },
      ],
    })
    const events = getDebtTimeline(params)
    expect(events[0].status).toBe('applied')
  })

  it('converted installment produces installment_converted event kind', () => {
    const params = makeParams({
      installments: [
        { id: INST_ID_1, due_date: '2024-06-01', amount_minor: 147875, remaining_amount_minor: 0, status: 'converted', sequence_number: 1 },
      ],
    })
    const events = getDebtTimeline(params)
    expect(events[0].kind).toBe('installment_converted')
    expect(events[0].status).toBe('converted')
  })

  it('generates interest_debt_created event from interest_debt row', () => {
    const params = makeParams({
      interest_debts: [
        {
          id: IDEBT_ID_1,
          source_installment_id: INST_ID_1,
          principal_minor: 47875,
          current_balance_minor: 48833,
          interest_rate: '0.24',
          created_at: '2024-06-05T10:02:00Z',
        },
      ],
    })
    const events = getDebtTimeline(params)
    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe('interest_debt_created')
    expect(events[0].amount_minor).toBe(47875n)
    expect(events[0].status).toBe('active')
    expect(events[0].ref_id).toBe(IDEBT_ID_1)
    expect(events[0].meta?.interest_rate).toBe('0.24')
  })

  it('generates interest_accrued event from accrual row', () => {
    const params = makeParams({
      accruals: [
        {
          id: ACCRUAL_ID_1,
          interest_debt_id: IDEBT_ID_1,
          period: '2024-01',
          accrued_amount_minor: 958,
          closing_balance_minor: 48833,
          created_at: '2024-01-25T10:00:00Z',
        },
      ],
    })
    const events = getDebtTimeline(params)
    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe('interest_accrued')
    expect(events[0].amount_minor).toBe(958n)
    expect(events[0].status).toBe('applied')
    expect(events[0].meta?.period).toBe('2024-01')
    expect(events[0].meta?.closing_balance_minor).toBe(48833n)
  })

  it('sorts interest events chronologically with other events', () => {
    const params = makeParams({
      installments: [
        { id: INST_ID_1, due_date: '2024-06-01', amount_minor: 147875, remaining_amount_minor: 0, status: 'converted', sequence_number: 1 },
      ],
      interest_debts: [
        {
          id: IDEBT_ID_1,
          source_installment_id: INST_ID_1,
          principal_minor: 47875,
          current_balance_minor: 48833,
          interest_rate: '0.24',
          created_at: '2024-06-10T10:00:00Z',
        },
      ],
      accruals: [
        {
          id: ACCRUAL_ID_1,
          interest_debt_id: IDEBT_ID_1,
          period: '2024-07',
          accrued_amount_minor: 958,
          closing_balance_minor: 48833,
          created_at: '2024-07-25T10:00:00Z',
        },
      ],
    })
    const events = getDebtTimeline(params)
    expect(events).toHaveLength(3)
    expect(events[0].kind).toBe('installment_converted') // June 1
    expect(events[1].kind).toBe('interest_debt_created') // June 10
    expect(events[2].kind).toBe('interest_accrued')      // July 25
  })

  it('returns empty array when only interest_debts and accruals arrays are empty', () => {
    const params = makeParams({ interest_debts: [], accruals: [] })
    expect(getDebtTimeline(params)).toEqual([])
  })
})
