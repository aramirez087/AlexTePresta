// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@supabase/ssr')

import { createServerClient } from '@supabase/ssr'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'

function makeRequest(pathname: string) {
  return new NextRequest(`http://localhost:3000${pathname}`)
}

function makeSupabaseMock(userId: string | null, role: string | null) {
  const single = vi.fn().mockResolvedValue(
    role ? { data: { role }, error: null } : { data: null, error: null }
  )
  const eq = vi.fn().mockReturnValue({ single })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  const user = userId ? { id: userId, email: `${userId}@example.com` } : null

  // boundary: mock object — vitest mock of Supabase SSR client shape
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from,
  } as unknown as ReturnType<typeof createServerClient>
}

describe('middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  })

  it('redirects unauthenticated user from /admin to /login', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeSupabaseMock(null, null))
    const response = await middleware(makeRequest('/admin'))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/login')
    expect(response.headers.get('location')).toContain('next=%2Fadmin')
  })

  it('redirects unauthenticated user from /app to /login', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeSupabaseMock(null, null))
    const response = await middleware(makeRequest('/app'))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/login')
    expect(response.headers.get('location')).toContain('next=%2Fapp')
  })

  it('passes through authenticated admin to /admin', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeSupabaseMock('admin-1', 'admin'))
    const response = await middleware(makeRequest('/admin'))
    expect(response.status).toBe(200)
  })

  it('redirects authenticated debtor from /admin to /app', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeSupabaseMock('debtor-1', 'debtor'))
    const response = await middleware(makeRequest('/admin'))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/app')
  })

  it('passes through authenticated user to /login (no redirect loop)', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeSupabaseMock('user-1', 'debtor'))
    const response = await middleware(makeRequest('/login'))
    expect(response.status).toBe(200)
  })

  it('passes through unauthenticated user to /login', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeSupabaseMock(null, null))
    const response = await middleware(makeRequest('/login'))
    expect(response.status).toBe(200)
  })
})
