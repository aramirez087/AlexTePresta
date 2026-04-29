'use server'
import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/session'
import { applyPayment } from './applyPayment'

const registerPaymentDirectSchema = z.object({
  debtor_id: z.string().uuid(),
  currency: z.enum(['CRC', 'USD']),
  amount_minor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  notes: z.string().max(500).optional(),
})

export const registerPaymentDirect = action
  .schema(registerPaymentDirectSchema)
  .action(async ({ parsedInput: { debtor_id, currency, amount_minor, notes } }) => {
    const admin_user = await requireAdmin()
    const admin = createAdminClient()

    const { data: debts } = await admin
      .from('debts')
      .select('id')
      .eq('debtor_id', debtor_id)
      .eq('currency', currency)
      .eq('status', 'active')
      .limit(1)

    if (!debts || debts.length === 0) {
      throw new Error(`El deudor no tiene deudas activas en ${currency}`)
    }

    const { data, error } = await admin
      .from('payments')
      .insert({
        debtor_id,
        currency,
        amount_minor,
        status: 'pending',
        created_by: admin_user.id,
        notes: notes ?? null,
      })
      .select('id')
      .single()

    if (error) throw new Error(`Error al registrar pago: ${error.message}`)

    // boundary: PostgREST select returns unknown shape; function contract guarantees id field
    const row = data as { id: string }
    const result = await applyPayment(admin, row.id)
    return { paymentId: row.id, ...result }
  })
