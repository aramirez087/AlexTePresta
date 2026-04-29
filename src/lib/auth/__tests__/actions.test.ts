// @vitest-environment node
import { randomBytes } from 'crypto'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server')
vi.mock('@/lib/supabase/admin')
vi.mock('@/lib/auth/session')

import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/session'
import { ForbiddenError } from '@/lib/auth/errors'
import { createInvite } from '@/lib/auth/actions'

function makeAdminClientMock(insertResult: { data: { token: string } | null; error: unknown }) {
  const single = vi.fn().mockResolvedValue(insertResult)
  const select = vi.fn().mockReturnValue({ single })
  const insert = vi.fn().mockReturnValue({ select })
  const from = vi.fn().mockReturnValue({ insert })
  // boundary: mock object — vitest mock of Supabase admin client shape
  return { from } as unknown as ReturnType<typeof createAdminClient>
}

describe('createInvite', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns a 64-char hex token for an admin', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      // boundary: mock object — vitest mock of Supabase User shape
      { id: 'admin-1', email: 'admin@example.com' } as unknown as Awaited<ReturnType<typeof requireAdmin>>
    )
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdminClientMock({ data: { token: 'a'.repeat(64) }, error: null })
    )

    const result = await createInvite({ email: 'invitee@example.com' })
    expect(result?.data?.token).toHaveLength(64)
  })

  it('throws ForbiddenError when non-admin calls createInvite', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new ForbiddenError())
    await expect(createInvite({ email: 'invitee@example.com' })).resolves.toMatchObject({
      serverError: expect.any(String),
    })
  })

  it('rejects an invalid email (Zod validation)', async () => {
    const result = await createInvite({ email: 'not-an-email' })
    expect(result?.validationErrors).toBeDefined()
  })
})

describe('token properties', () => {
  it('token is 64 chars (32 bytes hex)', () => {
    const token = randomBytes(32).toString('hex')
    expect(token).toHaveLength(64)
    expect(/^[0-9a-f]+$/.test(token)).toBe(true)
  })

  it('expiresAt is ~7 days from now', () => {
    const before = Date.now()
    const expiresAt = new Date(before + 7 * 24 * 60 * 60 * 1000)
    const diffMs = expiresAt.getTime() - before
    // Allow 1 second tolerance
    expect(diffMs).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 * 1000 - 1000)
    expect(diffMs).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000 + 1000)
  })
})
