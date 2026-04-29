import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export function createAdminClient() {
  // boundary: server-only guard — service role key must never reach the browser
  if (typeof window !== 'undefined') {
    throw new Error('Admin Supabase client cannot be used in browser context')
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
  return createClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
