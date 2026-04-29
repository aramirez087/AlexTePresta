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

  it('returns 200 with summary when authenticated correctly', async () => {
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.processed).toBe(1)
    expect(body.skipped).toBe(0)
    expect(body.errors).toEqual([])
    expect(typeof body.period).toBe('string')
    expect(body.period).toMatch(/^\d{4}-\d{2}$/)
  })

  it('calls runMonthlyAccrual with computed CR-timezone period', async () => {
    vi.useFakeTimers()
    // 2024-01-15T20:00:00Z = 2024-01-15T14:00:00 Costa Rica (UTC-6) → period = '2024-01'
    vi.setSystemTime(new Date('2024-01-15T20:00:00Z'))

    await GET(makeRequest(`Bearer ${CRON_SECRET}`))

    expect(runMonthlyAccrual).toHaveBeenCalledWith(expect.anything(), '2024-01')
    vi.useRealTimers()
  })

  it('is idempotent: second call returns 200 with skipped count', async () => {
    vi.mocked(runMonthlyAccrual).mockResolvedValueOnce({ processed: 0, skipped: 2, errors: [] })
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.skipped).toBe(2)
    expect(body.processed).toBe(0)
  })

  it('returns 500 when runMonthlyAccrual throws', async () => {
    vi.mocked(runMonthlyAccrual).mockRejectedValueOnce(new Error('DB connection failed'))
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toContain('DB connection failed')
  })
})
