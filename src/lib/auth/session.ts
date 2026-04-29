import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { AuthRequiredError, ForbiddenError } from './errors'

// Validates the session against the Supabase Auth server (not just the local cookie)
export async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new AuthRequiredError()
  return user
}

// Returns the user only if they have the 'admin' role in public.users
export async function requireAdmin() {
  const user = await requireUser()
  const supabase = await createClient()
  const result = await supabase.from('users').select('role').eq('id', user.id).single()
  // boundary: PostgREST column select — TypeScript can't infer partial-select row shape
  const data = result.data as { role: string } | null
  if (!data || data.role !== 'admin') throw new ForbiddenError()
  return user
}

// Returns the role from public.users, or null if unauthenticated / not in public.users
export async function currentRole(): Promise<'admin' | 'debtor' | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const result = await supabase.from('users').select('role').eq('id', user.id).single()
  // boundary: PostgREST column select — TypeScript can't infer partial-select row shape
  const data = result.data as { role: string } | null
  return (data?.role as 'admin' | 'debtor') ?? null
}
