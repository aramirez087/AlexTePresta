'use server'
import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/session'
import { applyPayment } from './applyPayment'

const approvePaymentSchema = z.object({
  payment_id: z.string().uuid(),
})

export const approvePayment = action
  .schema(approvePaymentSchema)
  .action(async ({ parsedInput: { payment_id } }) => {
    await requireAdmin()
    const admin = createAdminClient()
    return await applyPayment(admin, payment_id)
  })
