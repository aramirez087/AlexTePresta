'use server'
import { z } from 'zod'
import { randomBytes } from 'crypto'
import { action } from '@/lib/safe-action'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/session'

export const createInvite = action
  .schema(z.object({ email: z.string().email() }))
  .action(async ({ parsedInput: { email } }) => {
    const inviter = await requireAdmin()
    // randomBytes(32) → 64-char hex = 256-bit token
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('invites')
      .insert({
        email,
        token,
        expires_at: expiresAt,
        inviter_id: inviter.id,
      })
      .select('token')
      .single()

    if (error) throw new Error(`Error al crear la invitación: ${error.message}`)

    return { token: data.token }
  })
