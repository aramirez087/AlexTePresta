// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('server-only', () => ({}))

beforeEach(() => {
  vi.resetModules()
})

describe('browser client', () => {
  it('throws when NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
    const saved = process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    const { createClient } = await import('../browser')
    expect(() => createClient()).toThrow('NEXT_PUBLIC_SUPABASE_URL')
    process.env.NEXT_PUBLIC_SUPABASE_URL = saved
  })

  it('throws when NEXT_PUBLIC_SUPABASE_ANON_KEY is missing', async () => {
    const saved = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const { createClient } = await import('../browser')
    expect(() => createClient()).toThrow('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved
  })
})

describe('admin client', () => {
  it('throws when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
    const saved = process.env.SUPABASE_SERVICE_ROLE_KEY
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const { createAdminClient } = await import('../admin')
    expect(() => createAdminClient()).toThrow('SUPABASE_SERVICE_ROLE_KEY')
    process.env.SUPABASE_SERVICE_ROLE_KEY = saved
  })

  it('throws when called in browser context', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
    // @ts-expect-error — simulating browser environment for test
    globalThis.window = {}
    const { createAdminClient } = await import('../admin')
    try {
      expect(() => createAdminClient()).toThrow('browser context')
    } finally {
      // @ts-expect-error — restoring Node environment after test
      delete globalThis.window
    }
  })
})
