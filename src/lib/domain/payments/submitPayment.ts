'use server'
import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/session'

const submitPaymentSchema = z.object({
  currency: z.enum(['CRC', 'USD']),
  amount_minor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  notes: z.string().max(500).optional(),
})

export const submitPayment = action
  .schema(submitPaymentSchema)
  .action(async ({ parsedInput: { currency, amount_minor, notes } }) => {
    const user = await requireUser()
    const admin = createAdminClient()

    const { data: debts } = await admin
      .from('debts')
      .select('id')
      .eq('debtor_id', user.id)
      .eq('currency', currency)
      .eq('status', 'active')
      .limit(1)

    if (!debts || debts.length === 0) {
      throw new Error(`No tienes deudas activas en ${currency}`)
    }

    const { data, error } = await admin
      .from('payments')
      .insert({
        debtor_id: user.id,
        currency,
        amount_minor,
        status: 'pending',
        created_by: user.id,
        notes: notes ?? null,
      })
      .select('id')
      .single()

    if (error) throw new Error(`Error al registrar pago: ${error.message}`)

    // boundary: PostgREST select returns unknown shape; function contract guarantees id field
    const row = data as { id: string }
    return { paymentId: row.id }
  })
