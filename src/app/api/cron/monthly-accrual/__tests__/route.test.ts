// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn().mockReturnValue({}) }))
vi.mock('@/lib/domain/interest/runMonthlyAccrual', () => ({
  runMonthlyAccrual: vi.fn().mockResolvedValue({ processed: 1, skipped: 0, errors: [] }),
}))

import { GET } from '../route'
import { runMonthlyAccrual } from '@/lib/domain/interest/runMonthlyAccrual'

const CRON_SECRET = 'test-cron-secret-abc'

function makeRequest(authHeader?: string): NextRequest {
  const headers: HeadersInit = authHeader ? { Authorization: authHeader } : {}
  return new NextRequest('http://localhost/api/cron/monthly-accrual', { headers })
}

describe('GET /api/cron/monthly-accrual', () => {
  const originalCronSecret = process.env.CRON_SECRET

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = CRON_SECRET
  })

  afterEach(() => {
    process.env.CRON_SECRET = originalCronSecret
  })

  it('returns 401 when no Authorization header is provided', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 401 when wrong secret is provided', async () => {
    const res = await GET(makeRequest('Bearer wrong-secret'))
    expect(res.status).toBe(401)
  })

  it('returns 401 when CRON_SECRET env var is not set', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`))
    expect(res.status).toBe(401)
  })

  it('returns 200 with real and simulated summaries when authenticated', async () => {
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.real.processed).toBe(1)
    expect(body.real.skipped).toBe(0)
    expect(body.real.errors).toEqual([])
    expect(body.simulated.processed).toBe(1)
    expect(typeof body.period).toBe('string')
    expect(body.period).toMatch(/^\d{4}-\d{2}$/)
  })

  it('calls runMonthlyAccrual twice: once real, once simulated', async () => {
    await GET(makeRequest(`Bearer ${CRON_SECRET}`))
    expect(runMonthlyAccrual).toHaveBeenCalledTimes(2)
    expect(runMonthlyAccrual).toHaveBeenNthCalledWith(1, expect.anything(), expect.any(String), 'real')
    expect(runMonthlyAccrual).toHaveBeenNthCalledWith(2, expect.anything(), expect.any(String), 'simulated')
  })

  it('calls runMonthlyAccrual with computed CR-timezone period', async () => {
    vi.useFakeTimers()
    // 2024-01-15T20:00:00Z = 2024-01-15T14:00:00 Costa Rica (UTC-6) → period = '2024-01'
    vi.setSystemTime(new Date('2024-01-15T20:00:00Z'))

    await GET(makeRequest(`Bearer ${CRON_SECRET}`))

    expect(runMonthlyAccrual).toHaveBeenCalledWith(expect.anything(), '2024-01', 'real')
    vi.useRealTimers()
  })

  it('is idempotent: second call returns 200 with skipped counts', async () => {
    vi.mocked(runMonthlyAccrual)
      .mockResolvedValueOnce({ processed: 0, skipped: 2, errors: [] })
      .mockResolvedValueOnce({ processed: 0, skipped: 1, errors: [] })
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.real.skipped).toBe(2)
    expect(body.simulated.skipped).toBe(1)
  })

  it('returns 500 when runMonthlyAccrual throws', async () => {
    vi.mocked(runMonthlyAccrual).mockRejectedValueOnce(new Error('DB connection failed'))
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toContain('DB connection failed')
  })
})
