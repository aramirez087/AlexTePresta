// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin')
vi.mock('@/lib/auth/session')

import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/session'
import { ForbiddenError } from '@/lib/auth/errors'
import { createDebt } from '@/lib/domain/debts/createDebt'

type AdminMockOpts = {
  debtorResult: { data: { role: string } | null; error: null | { message: string } }
  rpcResult: { data: string | null; error: null | { message: string } }
}

function makeAdminClientMock({ debtorResult, rpcResult }: AdminMockOpts) {
  const single = vi.fn().mockResolvedValue(debtorResult)
  const eq = vi.fn().mockReturnValue({ single })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  const rpc = vi.fn().mockResolvedValue(rpcResult)
  // boundary: mock object — vitest mock of Supabase admin client shape
  return { from, rpc } as unknown as ReturnType<typeof createAdminClient>
}

const ADMIN_USER = { id: 'admin-uuid-1', email: 'admin@test.com' }
const DEBTOR_ID = '00000000-0000-0000-0000-000000000099'
const DEBT_UUID = '00000000-0000-0000-0000-000000000001'

const VALID_INPUT = {
  debtor_id: DEBTOR_ID,
  total_amount_minor: 591500,
  total_installments: 4,
  installment_amount_minor: 147875,
  due_day: 25,
  currency: 'CRC' as const,
  start_month: '2024-10',
}

describe('createDebt — rounding invariant', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes for PRD example: 591500 / 4 × 147875 (diff = 0)', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      ADMIN_USER as unknown as Awaited<ReturnType<typeof requireAdmin>>,
    )
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdminClientMock({
        debtorResult: { data: { role: 'debtor' }, error: null },
        rpcResult: { data: DEBT_UUID, error: null },
      }),
    )
    const result = await createDebt(VALID_INPUT)
    expect(result?.data?.debtId).toBe(DEBT_UUID)
  })

  it('passes when residual is within tolerance: 591503 / 4 × 147875 (diff = 3 ≤ 4)', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      ADMIN_USER as unknown as Awaited<ReturnType<typeof requireAdmin>>,
    )
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdminClientMock({
        debtorResult: { data: { role: 'debtor' }, error: null },
        rpcResult: { data: DEBT_UUID, error: null },
      }),
    )
    const result = await createDebt({ ...VALID_INPUT, total_amount_minor: 591503 })
    expect(result?.data?.debtId).toBe(DEBT_UUID)
  })

  it('fails when residual exceeds tolerance: 591500 / 4 × 147870 (diff = 20 > 4)', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      ADMIN_USER as unknown as Awaited<ReturnType<typeof requireAdmin>>,
    )
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdminClientMock({
        debtorResult: { data: { role: 'debtor' }, error: null },
        rpcResult: { data: DEBT_UUID, error: null },
      }),
    )
    const result = await createDebt({ ...VALID_INPUT, installment_amount_minor: 147870 })
    expect(result?.serverError).toBeDefined()
    expect(result?.serverError).toMatch(/invariante/i)
  })

  it('fails when residual exceeds tolerance: 591508 / 4 × 147875 (diff = 8 > 4)', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      ADMIN_USER as unknown as Awaited<ReturnType<typeof requireAdmin>>,
    )
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdminClientMock({
        debtorResult: { data: { role: 'debtor' }, error: null },
        rpcResult: { data: DEBT_UUID, error: null },
      }),
    )
    const result = await createDebt({ ...VALID_INPUT, total_amount_minor: 591508 })
    expect(result?.serverError).toBeDefined()
    expect(result?.serverError).toMatch(/invariante/i)
  })
})

describe('createDebt — auth guard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns serverError when non-admin calls createDebt', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new ForbiddenError())
    const result = await createDebt(VALID_INPUT)
    expect(result?.serverError).toBeDefined()
  })
})

describe('createDebt — debtor validation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns serverError when debtor not found', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      ADMIN_USER as unknown as Awaited<ReturnType<typeof requireAdmin>>,
    )
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdminClientMock({
        debtorResult: { data: null, error: null },
        rpcResult: { data: null, error: null },
      }),
    )
    const result = await createDebt(VALID_INPUT)
    expect(result?.serverError).toBeDefined()
    expect(result?.serverError).toMatch(/no existe/i)
  })

  it('returns serverError when user is not a debtor', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      ADMIN_USER as unknown as Awaited<ReturnType<typeof requireAdmin>>,
    )
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdminClientMock({
        debtorResult: { data: { role: 'admin' }, error: null },
        rpcResult: { data: null, error: null },
      }),
    )
    const result = await createDebt(VALID_INPUT)
    expect(result?.serverError).toBeDefined()
    expect(result?.serverError).toMatch(/rol de deudor/i)
  })
})

describe('createDebt — Zod validation', () => {
  it('rejects invalid currency EUR', async () => {
    const result = await createDebt({
      ...VALID_INPUT,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      currency: 'EUR' as any,
    })
    expect(result?.validationErrors).toBeDefined()
  })

  it('rejects start_month without zero padding: 2024-1', async () => {
    const result = await createDebt({ ...VALID_INPUT, start_month: '2024-1' })
    expect(result?.validationErrors).toBeDefined()
  })

  it('rejects start_month with month 13', async () => {
    const result = await createDebt({ ...VALID_INPUT, start_month: '2024-13' })
    expect(result?.validationErrors).toBeDefined()
  })

  it('rejects due_day > 28', async () => {
    const result = await createDebt({ ...VALID_INPUT, due_day: 29 })
    expect(result?.validationErrors).toBeDefined()
  })

  it('rejects total_installments > 120', async () => {
    const result = await createDebt({ ...VALID_INPUT, total_installments: 121 })
    expect(result?.validationErrors).toBeDefined()
  })
})

describe('createDebt — RPC call parameters', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls RPC with correct args for PRD example', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      ADMIN_USER as unknown as Awaited<ReturnType<typeof requireAdmin>>,
    )
    const single = vi.fn().mockResolvedValue({ data: { role: 'debtor' }, error: null })
    const eq = vi.fn().mockReturnValue({ single })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })
    const rpc = vi.fn().mockResolvedValue({ data: DEBT_UUID, error: null })
    // boundary: mock object — vitest mock of Supabase admin client shape
    const mock = { from, rpc } as unknown as ReturnType<typeof createAdminClient>
    vi.mocked(createAdminClient).mockReturnValue(mock)

    await createDebt(VALID_INPUT)

    expect(rpc).toHaveBeenCalledWith('create_debt_with_installments', {
      p_debtor_id: DEBTOR_ID,
      p_currency: 'CRC',
      p_total_amount_minor: 591500,
      p_total_installments: 4,
      p_installment_amount_minor: 147875,
      p_due_day: 25,
      p_start_month: '2024-10',
      p_description: null,
      p_created_by: ADMIN_USER.id,
    })
  })
})
