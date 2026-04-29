// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server')

import { requireUser, requireAdmin, currentRole } from '@/lib/auth/session'
import { AuthRequiredError, ForbiddenError } from '@/lib/auth/errors'
import { createClient } from '@/lib/supabase/server'

type MockSingle = ReturnType<typeof vi.fn>

function makeSupabaseMock(
  userId: string | null,
  email: string | null,
  role: string | null
) {
  const single: MockSingle = vi.fn().mockResolvedValue(
    role !== null ? { data: { role }, error: null } : { data: null, error: { message: 'not found' } }
  )
  const eq = vi.fn().mockReturnValue({ single })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })

  const user = userId ? { id: userId, email } : null

  return {
    // boundary: mock object — vitest mock of Supabase client shape
    mock: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
      from,
    } as unknown as Awaited<ReturnType<typeof createClient>>,
    single,
    from,
  }
}

describe('requireUser', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the user when authenticated', async () => {
    const { mock } = makeSupabaseMock('user-1', 'test@example.com', 'debtor')
    vi.mocked(createClient).mockResolvedValue(mock)
    const user = await requireUser()
    expect(user.id).toBe('user-1')
  })

  it('throws AuthRequiredError when no session', async () => {
    const { mock } = makeSupabaseMock(null, null, null)
    vi.mocked(createClient).mockResolvedValue(mock)
    await expect(requireUser()).rejects.toThrow(AuthRequiredError)
  })
})

describe('requireAdmin', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the user when they are admin', async () => {
    const { mock } = makeSupabaseMock('admin-1', 'admin@example.com', 'admin')
    vi.mocked(createClient).mockResolvedValue(mock)
    const user = await requireAdmin()
    expect(user.id).toBe('admin-1')
  })

  it('throws ForbiddenError for a debtor', async () => {
    const { mock } = makeSupabaseMock('debtor-1', 'debtor@example.com', 'debtor')
    vi.mocked(createClient).mockResolvedValue(mock)
    await expect(requireAdmin()).rejects.toThrow(ForbiddenError)
  })

  it('throws AuthRequiredError for unauthenticated user', async () => {
    const { mock } = makeSupabaseMock(null, null, null)
    vi.mocked(createClient).mockResolvedValue(mock)
    await expect(requireAdmin()).rejects.toThrow(AuthRequiredError)
  })
})

describe('currentRole', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns admin for an admin user', async () => {
    const { mock } = makeSupabaseMock('admin-1', 'admin@example.com', 'admin')
    vi.mocked(createClient).mockResolvedValue(mock)
    expect(await currentRole()).toBe('admin')
  })

  it('returns debtor for a debtor user', async () => {
    const { mock } = makeSupabaseMock('debtor-1', 'debtor@example.com', 'debtor')
    vi.mocked(createClient).mockResolvedValue(mock)
    expect(await currentRole()).toBe('debtor')
  })

  it('returns null when not authenticated', async () => {
    const { mock } = makeSupabaseMock(null, null, null)
    vi.mocked(createClient).mockResolvedValue(mock)
    expect(await currentRole()).toBeNull()
  })

  it('returns null when user is not in public.users', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: null })
    const eq = vi.fn().mockReturnValue({ single })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })
    // boundary: mock object — vitest mock of Supabase client shape
    const mock = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'ghost-1', email: 'ghost@example.com' } } }),
      },
      from,
    } as unknown as Awaited<ReturnType<typeof createClient>>
    vi.mocked(createClient).mockResolvedValue(mock)
    expect(await currentRole()).toBeNull()
  })
})
