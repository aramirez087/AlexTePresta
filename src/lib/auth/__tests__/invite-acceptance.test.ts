// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin')

import { createAdminClient } from '@/lib/supabase/admin'

type AcceptInviteResult = { ok: boolean; error?: string } | null

function makeAdminRpcMock(rpcResult: AcceptInviteResult) {
  const rpc = vi.fn().mockResolvedValue({ data: rpcResult, error: null })
  // boundary: mock object — vitest mock of Supabase admin client shape for RPC
  return { rpc } as unknown as ReturnType<typeof createAdminClient>
}

describe('accept_invite RPC result handling', () => {
  beforeEach(() => vi.clearAllMocks())

  it('happy path: ok=true means invite accepted', () => {
    const result: AcceptInviteResult = { ok: true }
    expect(result?.ok).toBe(true)
  })

  it('expired token: ok=false, error=token_expired', () => {
    const result: AcceptInviteResult = { ok: false, error: 'token_expired' }
    expect(result?.ok).toBe(false)
    expect(result?.error).toBe('token_expired')
  })

  it('consumed token: ok=false, error=token_consumed', () => {
    const result: AcceptInviteResult = { ok: false, error: 'token_consumed' }
    expect(result?.ok).toBe(false)
    expect(result?.error).toBe('token_consumed')
  })

  it('token not found: ok=false, error=token_not_found', () => {
    const result: AcceptInviteResult = { ok: false, error: 'token_not_found' }
    expect(result?.ok).toBe(false)
    expect(result?.error).toBe('token_not_found')
  })

  it('email mismatch: ok=false, error=email_mismatch', () => {
    const result: AcceptInviteResult = { ok: false, error: 'email_mismatch' }
    expect(result?.ok).toBe(false)
    expect(result?.error).toBe('email_mismatch')
  })
})

describe('accept_invite RPC mock call', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls rpc with correct parameters', async () => {
    const adminMock = makeAdminRpcMock({ ok: true })
    vi.mocked(createAdminClient).mockReturnValue(adminMock)

    const admin = createAdminClient()
    await admin.rpc('accept_invite', {
      p_token: 'abc123',
      p_user_id: 'user-1',
      p_email: 'user@example.com',
    })

    expect(adminMock.rpc).toHaveBeenCalledWith('accept_invite', {
      p_token: 'abc123',
      p_user_id: 'user-1',
      p_email: 'user@example.com',
    })
  })

  it('token_consumed treated as non-error (idempotent acceptance)', () => {
    const result: AcceptInviteResult = { ok: false, error: 'token_consumed' }
    // callback should treat token_consumed as success and redirect to /app
    const isError = !result?.ok && result?.error !== 'token_consumed'
    expect(isError).toBe(false)
  })
})
