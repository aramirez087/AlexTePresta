// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/admin')
vi.mock('@/lib/auth/session')

import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin, requireUser } from '@/lib/auth/session'
import { ForbiddenError, AuthRequiredError } from '@/lib/auth/errors'
import { applyPayment } from '@/lib/domain/payments/applyPayment'
import { submitPayment } from '@/lib/domain/payments/submitPayment'
import { approvePayment } from '@/lib/domain/payments/approvePayment'
import { registerPaymentDirect } from '@/lib/domain/payments/registerPaymentDirect'

const ADMIN_USER = { id: 'admin-uuid-1', email: 'admin@test.com' }
const DEBTOR_USER = { id: 'debtor-uuid-1', email: 'debtor@test.com' }
const PAYMENT_ID = '00000000-0000-0000-0000-000000000010'
const DEBTOR_ID = '00000000-0000-0000-0000-000000000099'
const INSTALLMENT_ID_1 = '00000000-0000-0000-0000-000000000011'
const INSTALLMENT_ID_2 = '00000000-0000-0000-0000-000000000012'
const DEBT_ID = '00000000-0000-0000-0000-000000000001'

// Chainable from mock that returns empty interest_debts so simulation path is a no-op.
// Used in tests that only care about the RPC result, not mirror creation.
function makeEmptyFromMock() {
  const isResolved = vi.fn().mockResolvedValue({ data: [], error: null })
  const eqSim = vi.fn().mockReturnValue({ is: isResolved })
  const inIds = vi.fn().mockReturnValue({ eq: eqSim })
  const select = vi.fn().mockReturnValue({ in: inIds })
  const from = vi.fn().mockReturnValue({ select })
  return from
}

function makeRpcMock(result: { data: unknown; error: null | { message: string } }) {
  const rpc = vi.fn().mockResolvedValue(result)
  const from = makeEmptyFromMock()
  // boundary: mock object — vitest mock of Supabase admin client shape
  return { rpc, from } as unknown as ReturnType<typeof createAdminClient>
}

function makeAdminClientMock(opts: {
  debtsResult?: { data: { id: string }[] | null; error: null }
  insertResult?: { data: { id: string } | null; error: null | { message: string } }
  rpcResult?: { data: unknown; error: null | { message: string } }
}) {
  const single = vi.fn().mockResolvedValue(opts.insertResult ?? { data: null, error: null })
  const selectInsert = vi.fn().mockReturnValue({ single })
  const insert = vi.fn().mockReturnValue({ select: selectInsert })

  const limit = vi.fn().mockResolvedValue(opts.debtsResult ?? { data: [], error: null })
  const eqStatus = vi.fn().mockReturnValue({ limit })
  const eqCurrency = vi.fn().mockReturnValue({ eq: eqStatus })
  const eqDebtor = vi.fn().mockReturnValue({ eq: eqCurrency })
  const selectDebts = vi.fn().mockReturnValue({ eq: eqDebtor })
  const from = vi.fn().mockReturnValue({ select: selectDebts, insert })

  const rpc = vi.fn().mockResolvedValue(opts.rpcResult ?? { data: null, error: null })
  // boundary: mock object — vitest mock of Supabase admin client shape
  return { from, rpc } as unknown as ReturnType<typeof createAdminClient>
}

// ---------------------------------------------------------------------------
// applyPayment — RPC delegation
// ---------------------------------------------------------------------------
describe('applyPayment — RPC delegation', () => {
  it('passes payment_id to apply_payment RPC', async () => {
    const successData = { applications: [], leftover_minor: 0 }
    const mock = makeRpcMock({ data: successData, error: null })
    await applyPayment(mock, PAYMENT_ID)
    expect(mock.rpc).toHaveBeenCalledWith('apply_payment', { p_payment_id: PAYMENT_ID })
  })

  it('returns structured result on success', async () => {
    const successData = {
      applications: [
        { target_id: INSTALLMENT_ID_1, target_type: 'installment', applied_amount_minor: 147875 },
      ],
      leftover_minor: 0,
    }
    const mock = makeRpcMock({ data: successData, error: null })
    const result = await applyPayment(mock, PAYMENT_ID)
    expect(result.applications).toHaveLength(1)
    expect(result.leftover_minor).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// applyPayment — error mapping
// ---------------------------------------------------------------------------
describe('applyPayment — error mapping', () => {
  it('maps PaymentExcessError to Spanish message', async () => {
    const mock = makeRpcMock({
      data: null,
      error: { message: 'PaymentExcessError: payment x has 52125 minor units unallocated' },
    })
    await expect(applyPayment(mock, PAYMENT_ID)).rejects.toThrow(/excede/i)
  })

  it('maps PaymentAlreadyAppliedError to Spanish message', async () => {
    const mock = makeRpcMock({
      data: null,
      error: { message: 'PaymentAlreadyAppliedError: payment x is not pending' },
    })
    await expect(applyPayment(mock, PAYMENT_ID)).rejects.toThrow(/ya fue procesado/i)
  })

  it('maps PaymentNotFoundError to Spanish message', async () => {
    const mock = makeRpcMock({
      data: null,
      error: { message: 'PaymentNotFoundError: payment x not found' },
    })
    await expect(applyPayment(mock, PAYMENT_ID)).rejects.toThrow(/no encontrado/i)
  })

  it('rethrows unknown errors with prefix', async () => {
    const mock = makeRpcMock({
      data: null,
      error: { message: 'connection timeout' },
    })
    await expect(applyPayment(mock, PAYMENT_ID)).rejects.toThrow(/Error al aplicar pago/i)
  })
})

// ---------------------------------------------------------------------------
// applyPayment — exact amount scenarios (mock RPC)
// ---------------------------------------------------------------------------
describe('applyPayment — exact amount scenarios', () => {
  it('exact match: 147875 → single application of 147875', async () => {
    const successData = {
      applications: [
        { target_id: INSTALLMENT_ID_1, target_type: 'installment', applied_amount_minor: 147875 },
      ],
      leftover_minor: 0,
    }
    const mock = makeRpcMock({ data: successData, error: null })
    const result = await applyPayment(mock, PAYMENT_ID)
    expect(result.applications).toHaveLength(1)
    expect(result.applications[0].applied_amount_minor).toBe(147875)
    expect(result.applications[0].target_id).toBe(INSTALLMENT_ID_1)
    expect(result.leftover_minor).toBe(0)
  })

  it('overflow: 295750 → two applications of 147875 each', async () => {
    const successData = {
      applications: [
        { target_id: INSTALLMENT_ID_1, target_type: 'installment', applied_amount_minor: 147875 },
        { target_id: INSTALLMENT_ID_2, target_type: 'installment', applied_amount_minor: 147875 },
      ],
      leftover_minor: 0,
    }
    const mock = makeRpcMock({ data: successData, error: null })
    const result = await applyPayment(mock, PAYMENT_ID)
    expect(result.applications).toHaveLength(2)
    const total = result.applications.reduce((sum, a) => sum + a.applied_amount_minor, 0)
    expect(total).toBe(295750)
    expect(result.leftover_minor).toBe(0)
  })

  it('excess in Phase 2: 200000 against single 147875 installment with no interest_debts → throws', async () => {
    const mock = makeRpcMock({
      data: null,
      error: { message: 'PaymentExcessError: payment x has 52125 minor units unallocated' },
    })
    await expect(applyPayment(mock, PAYMENT_ID)).rejects.toThrow(/excede/i)
  })
})

// ---------------------------------------------------------------------------
// applyPayment — Phase 2 partial payment scenarios (mock RPC)
// ---------------------------------------------------------------------------
describe('applyPayment — Phase 2 partial payment', () => {
  it('PRD §7: 100000 against 147875 installment → success, no excess error', async () => {
    // Phase 2: partial payment converts remaining 47875 to interest_debt internally;
    // the RPC returns the installment application only (conversion is a DB side-effect)
    const successData = {
      applications: [
        { target_id: INSTALLMENT_ID_1, target_type: 'installment', applied_amount_minor: 100000 },
      ],
      leftover_minor: 0,
    }
    const mock = makeRpcMock({ data: successData, error: null })
    const result = await applyPayment(mock, PAYMENT_ID)
    expect(result.leftover_minor).toBe(0)
    expect(result.applications).toHaveLength(1)
    expect(result.applications[0].target_type).toBe('installment')
    expect(result.applications[0].applied_amount_minor).toBe(100000)
  })

  it('interest_debt FIFO: payment applied to interest_debt returns target_type=interest_debt', async () => {
    const INTEREST_DEBT_ID = '00000000-0000-0000-0000-000000000099'
    const successData = {
      applications: [
        { target_id: INTEREST_DEBT_ID, target_type: 'interest_debt', applied_amount_minor: 47875 },
      ],
      leftover_minor: 0,
    }
    const mock = makeRpcMock({ data: successData, error: null })
    const result = await applyPayment(mock, PAYMENT_ID)
    expect(result.applications[0].target_type).toBe('interest_debt')
    expect(result.applications[0].applied_amount_minor).toBe(47875)
  })

  it('mixed: installment + interest_debt applications in single payment', async () => {
    const INTEREST_DEBT_ID = '00000000-0000-0000-0000-000000000099'
    const successData = {
      applications: [
        { target_id: INSTALLMENT_ID_1, target_type: 'installment', applied_amount_minor: 147875 },
        { target_id: INTEREST_DEBT_ID, target_type: 'interest_debt', applied_amount_minor: 47875 },
      ],
      leftover_minor: 0,
    }
    const mock = makeRpcMock({ data: successData, error: null })
    const result = await applyPayment(mock, PAYMENT_ID)
    expect(result.applications).toHaveLength(2)
    expect(result.applications[0].target_type).toBe('installment')
    expect(result.applications[1].target_type).toBe('interest_debt')
    expect(result.leftover_minor).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// applyPayment — simulated mirror creation
// ---------------------------------------------------------------------------
describe('applyPayment — simulated mirror creation', () => {
  const REAL_DEBT_ID = '00000000-0000-0000-0005-000000000001'

  it('creates simulated mirror when partial payment triggers conversion', async () => {
    const successData = {
      applications: [
        { target_id: INSTALLMENT_ID_1, target_type: 'installment', applied_amount_minor: 100000 },
      ],
      leftover_minor: 0,
    }

    let mirrorInsertCapture: Record<string, unknown> | null = null

    // Chain: interest_debts real query → returns one real debt
    const isResolved = vi.fn().mockResolvedValue({
      data: [{
        id: REAL_DEBT_ID,
        debt_id: DEBT_ID,
        source_installment_id: INSTALLMENT_ID_1,
        principal_minor: 47875,
        interest_rate: '0.24',
      }],
      error: null,
    })
    const eqSimFalse = vi.fn().mockReturnValue({ is: isResolved })
    const inIds = vi.fn().mockReturnValue({ eq: eqSimFalse })
    const selectRealDebts = vi.fn().mockReturnValue({ in: inIds })

    // payments query → returns debtor_id
    const paymentSingle = vi.fn().mockResolvedValue({ data: { debtor_id: DEBTOR_ID }, error: null })
    const eqPaymentId = vi.fn().mockReturnValue({ single: paymentSingle })
    const selectPayment = vi.fn().mockReturnValue({ eq: eqPaymentId })

    // existing mirror check → returns null (no existing mirror)
    const mirrorMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const eqMirrorOf = vi.fn().mockReturnValue({ maybeSingle: mirrorMaybeSingle })
    const selectMirrorCheck = vi.fn().mockReturnValue({ eq: eqMirrorOf })

    // user_simulation_overrides query → no override
    const overrideMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const eqOverrideUser = vi.fn().mockReturnValue({ maybeSingle: overrideMaybeSingle })
    const selectOverride = vi.fn().mockReturnValue({ eq: eqOverrideUser })

    // settings query → returns simulated rate '0.36'
    const settingMaybeSingle = vi.fn().mockResolvedValue({ data: { value: '0.36' }, error: null })
    const eqSettingKey = vi.fn().mockReturnValue({ maybeSingle: settingMaybeSingle })
    const selectSetting = vi.fn().mockReturnValue({ eq: eqSettingKey })

    // mirror insert
    const insertMirror = vi.fn().mockImplementation((row: Record<string, unknown>) => {
      mirrorInsertCapture = row
      return Promise.resolve({ error: null })
    })

    let fromCallCount = 0
    const from = vi.fn().mockImplementation((table: string) => {
      fromCallCount++
      if (table === 'interest_debts' && fromCallCount === 1) return { select: selectRealDebts }
      if (table === 'payments') return { select: selectPayment }
      if (table === 'interest_debts' && fromCallCount === 3) return { select: selectMirrorCheck }
      if (table === 'user_simulation_overrides') return { select: selectOverride }
      if (table === 'settings') return { select: selectSetting }
      if (table === 'interest_debts') return { insert: insertMirror }
      return {}
    })

    const rpc = vi.fn().mockResolvedValue({ data: successData, error: null })
    // boundary: mock object — vitest mock of Supabase admin client shape
    const mock = { rpc, from } as unknown as ReturnType<typeof createAdminClient>

    await applyPayment(mock, PAYMENT_ID)

    expect(mirrorInsertCapture).not.toBeNull()
    expect(mirrorInsertCapture!['is_simulated']).toBe(true)
    expect(mirrorInsertCapture!['mirror_of']).toBe(REAL_DEBT_ID)
    expect(mirrorInsertCapture!['interest_rate']).toBe('0.36')
    expect(mirrorInsertCapture!['principal_minor']).toBe(47875)
  })

  it('skips mirror creation when mirror already exists', async () => {
    const successData = {
      applications: [
        { target_id: INSTALLMENT_ID_1, target_type: 'installment', applied_amount_minor: 100000 },
      ],
      leftover_minor: 0,
    }

    let mirrorInsertCalled = false

    const isResolved = vi.fn().mockResolvedValue({
      data: [{
        id: REAL_DEBT_ID,
        debt_id: DEBT_ID,
        source_installment_id: INSTALLMENT_ID_1,
        principal_minor: 47875,
        interest_rate: '0.24',
      }],
      error: null,
    })
    const eqSimFalse = vi.fn().mockReturnValue({ is: isResolved })
    const inIds = vi.fn().mockReturnValue({ eq: eqSimFalse })
    const selectRealDebts = vi.fn().mockReturnValue({ in: inIds })

    const paymentSingle = vi.fn().mockResolvedValue({ data: { debtor_id: DEBTOR_ID }, error: null })
    const eqPaymentId = vi.fn().mockReturnValue({ single: paymentSingle })
    const selectPayment = vi.fn().mockReturnValue({ eq: eqPaymentId })

    // existing mirror check → returns existing mirror
    const mirrorMaybeSingle = vi.fn().mockResolvedValue({ data: { id: 'existing-mirror-uuid' }, error: null })
    const eqMirrorOf = vi.fn().mockReturnValue({ maybeSingle: mirrorMaybeSingle })
    const selectMirrorCheck = vi.fn().mockReturnValue({ eq: eqMirrorOf })

    const insertMirror = vi.fn().mockImplementation(() => {
      mirrorInsertCalled = true
      return Promise.resolve({ error: null })
    })

    let fromCallCount = 0
    const from = vi.fn().mockImplementation((table: string) => {
      fromCallCount++
      if (table === 'interest_debts' && fromCallCount === 1) return { select: selectRealDebts }
      if (table === 'payments') return { select: selectPayment }
      if (table === 'interest_debts') return { select: selectMirrorCheck, insert: insertMirror }
      return {}
    })

    const rpc = vi.fn().mockResolvedValue({ data: successData, error: null })
    // boundary: mock object — vitest mock of Supabase admin client shape
    const mock = { rpc, from } as unknown as ReturnType<typeof createAdminClient>

    await applyPayment(mock, PAYMENT_ID)

    expect(mirrorInsertCalled).toBe(false)
  })

  it('uses real rate as fallback when no override and no settings value found', async () => {
    const successData = {
      applications: [
        { target_id: INSTALLMENT_ID_1, target_type: 'installment', applied_amount_minor: 100000 },
      ],
      leftover_minor: 0,
    }

    let mirrorInsertCapture: Record<string, unknown> | null = null

    const isResolved = vi.fn().mockResolvedValue({
      data: [{
        id: REAL_DEBT_ID,
        debt_id: DEBT_ID,
        source_installment_id: INSTALLMENT_ID_1,
        principal_minor: 47875,
        interest_rate: '0.24',
      }],
      error: null,
    })
    const eqSimFalse = vi.fn().mockReturnValue({ is: isResolved })
    const inIds = vi.fn().mockReturnValue({ eq: eqSimFalse })
    const selectRealDebts = vi.fn().mockReturnValue({ in: inIds })

    const paymentSingle = vi.fn().mockResolvedValue({ data: { debtor_id: DEBTOR_ID }, error: null })
    const eqPaymentId = vi.fn().mockReturnValue({ single: paymentSingle })
    const selectPayment = vi.fn().mockReturnValue({ eq: eqPaymentId })

    const mirrorMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const eqMirrorOf = vi.fn().mockReturnValue({ maybeSingle: mirrorMaybeSingle })
    const selectMirrorCheck = vi.fn().mockReturnValue({ eq: eqMirrorOf })

    // No user override
    const overrideMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const eqOverrideUser = vi.fn().mockReturnValue({ maybeSingle: overrideMaybeSingle })
    const selectOverride = vi.fn().mockReturnValue({ eq: eqOverrideUser })

    // No settings value either
    const settingMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const eqSettingKey = vi.fn().mockReturnValue({ maybeSingle: settingMaybeSingle })
    const selectSetting = vi.fn().mockReturnValue({ eq: eqSettingKey })

    const insertMirror = vi.fn().mockImplementation((row: Record<string, unknown>) => {
      mirrorInsertCapture = row
      return Promise.resolve({ error: null })
    })

    let fromCallCount = 0
    const from = vi.fn().mockImplementation((table: string) => {
      fromCallCount++
      if (table === 'interest_debts' && fromCallCount === 1) return { select: selectRealDebts }
      if (table === 'payments') return { select: selectPayment }
      if (table === 'interest_debts' && fromCallCount === 3) return { select: selectMirrorCheck }
      if (table === 'user_simulation_overrides') return { select: selectOverride }
      if (table === 'settings') return { select: selectSetting }
      if (table === 'interest_debts') return { insert: insertMirror }
      return {}
    })

    const rpc = vi.fn().mockResolvedValue({ data: successData, error: null })
    // boundary: mock object — vitest mock of Supabase admin client shape
    const mock = { rpc, from } as unknown as ReturnType<typeof createAdminClient>

    await applyPayment(mock, PAYMENT_ID)

    expect(mirrorInsertCapture).not.toBeNull()
    // Falls back to real debt's rate '0.24'
    expect(mirrorInsertCapture!['interest_rate']).toBe('0.24')
  })
})

// ---------------------------------------------------------------------------
// submitPayment — auth guard
// ---------------------------------------------------------------------------
describe('submitPayment — auth guard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns serverError when unauthenticated', async () => {
    vi.mocked(requireUser).mockRejectedValue(new AuthRequiredError())
    const result = await submitPayment({ currency: 'CRC', amount_minor: 147875 })
    expect(result?.serverError).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// submitPayment — currency validation
// ---------------------------------------------------------------------------
describe('submitPayment — currency validation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns serverError when no active debt in currency', async () => {
    vi.mocked(requireUser).mockResolvedValue(
      DEBTOR_USER as unknown as Awaited<ReturnType<typeof requireUser>>,
    )
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdminClientMock({ debtsResult: { data: [], error: null } }),
    )
    const result = await submitPayment({ currency: 'CRC', amount_minor: 147875 })
    expect(result?.serverError).toBeDefined()
    expect(result?.serverError).toMatch(/deudas activas/i)
  })

  it('returns paymentId on valid submission', async () => {
    vi.mocked(requireUser).mockResolvedValue(
      DEBTOR_USER as unknown as Awaited<ReturnType<typeof requireUser>>,
    )
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdminClientMock({
        debtsResult: { data: [{ id: DEBT_ID }], error: null },
        insertResult: { data: { id: PAYMENT_ID }, error: null },
      }),
    )
    const result = await submitPayment({ currency: 'CRC', amount_minor: 147875 })
    expect(result?.data?.paymentId).toBe(PAYMENT_ID)
  })
})

// ---------------------------------------------------------------------------
// submitPayment — Zod validation
// ---------------------------------------------------------------------------
describe('submitPayment — Zod validation', () => {
  it('rejects invalid currency EUR', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await submitPayment({ currency: 'EUR' as any, amount_minor: 147875 })
    expect(result?.validationErrors).toBeDefined()
  })

  it('rejects negative amount', async () => {
    const result = await submitPayment({ currency: 'CRC', amount_minor: -1 })
    expect(result?.validationErrors).toBeDefined()
  })

  it('rejects zero amount', async () => {
    const result = await submitPayment({ currency: 'CRC', amount_minor: 0 })
    expect(result?.validationErrors).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// approvePayment — auth guard + delegation
// ---------------------------------------------------------------------------
describe('approvePayment — auth guard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns serverError when non-admin calls approvePayment', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new ForbiddenError())
    const result = await approvePayment({ payment_id: PAYMENT_ID })
    expect(result?.serverError).toBeDefined()
  })

  it('delegates to applyPayment RPC and returns result', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      ADMIN_USER as unknown as Awaited<ReturnType<typeof requireAdmin>>,
    )
    const successData = {
      applications: [
        { target_id: INSTALLMENT_ID_1, target_type: 'installment', applied_amount_minor: 147875 },
      ],
      leftover_minor: 0,
    }
    vi.mocked(createAdminClient).mockReturnValue(makeRpcMock({ data: successData, error: null }))
    const result = await approvePayment({ payment_id: PAYMENT_ID })
    expect(result?.data?.applications).toHaveLength(1)
    expect(result?.data?.leftover_minor).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// registerPaymentDirect — auth guard + currency validation + success
// ---------------------------------------------------------------------------
describe('registerPaymentDirect — auth guard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns serverError when non-admin calls registerPaymentDirect', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new ForbiddenError())
    const result = await registerPaymentDirect({
      debtor_id: DEBTOR_ID,
      currency: 'CRC',
      amount_minor: 147875,
    })
    expect(result?.serverError).toBeDefined()
  })
})

describe('registerPaymentDirect — currency validation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns serverError when debtor has no active debt in currency', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      ADMIN_USER as unknown as Awaited<ReturnType<typeof requireAdmin>>,
    )
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdminClientMock({ debtsResult: { data: [], error: null } }),
    )
    const result = await registerPaymentDirect({
      debtor_id: DEBTOR_ID,
      currency: 'CRC',
      amount_minor: 147875,
    })
    expect(result?.serverError).toBeDefined()
    expect(result?.serverError).toMatch(/deudas activas/i)
  })
})

describe('registerPaymentDirect — success', () => {
  beforeEach(() => vi.clearAllMocks())

  it('inserts payment with created_by = admin.id, applies, returns paymentId', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      ADMIN_USER as unknown as Awaited<ReturnType<typeof requireAdmin>>,
    )
    const successData = {
      applications: [
        { target_id: INSTALLMENT_ID_1, target_type: 'installment', applied_amount_minor: 147875 },
      ],
      leftover_minor: 0,
    }

    const rpc = vi.fn().mockResolvedValue({ data: successData, error: null })
    const single = vi.fn().mockResolvedValue({ data: { id: PAYMENT_ID }, error: null })
    const selectInsert = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select: selectInsert })
    const limit = vi.fn().mockResolvedValue({ data: [{ id: DEBT_ID }], error: null })
    const eqStatus = vi.fn().mockReturnValue({ limit })
    const eqCurrency = vi.fn().mockReturnValue({ eq: eqStatus })
    const eqDebtor = vi.fn().mockReturnValue({ eq: eqCurrency })
    const selectDebts = vi.fn().mockReturnValue({ eq: eqDebtor })
    // interest_debts query from applyPayment simulation path → no real debts found (no-op)
    const emptyFrom = makeEmptyFromMock()
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'interest_debts') return emptyFrom(table)
      return { select: selectDebts, insert }
    })
    // boundary: mock object — vitest mock of Supabase admin client shape
    const mock = { from, rpc } as unknown as ReturnType<typeof createAdminClient>
    vi.mocked(createAdminClient).mockReturnValue(mock)

    const result = await registerPaymentDirect({
      debtor_id: DEBTOR_ID,
      currency: 'CRC',
      amount_minor: 147875,
    })

    expect(result?.data?.paymentId).toBe(PAYMENT_ID)
    expect(result?.data?.applications).toHaveLength(1)

    // Verify insert was called with created_by = admin's id
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ created_by: ADMIN_USER.id }),
    )
  })
})
