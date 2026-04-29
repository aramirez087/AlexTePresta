'use server'
import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/session'

const createDebtSchema = z.object({
  debtor_id: z.string().uuid(),
  total_amount_minor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  total_installments: z.number().int().min(1).max(120),
  installment_amount_minor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  due_day: z.number().int().min(1).max(28),
  currency: z.enum(['CRC', 'USD']),
  start_month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Formato YYYY-MM requerido'),
  description: z.string().max(500).optional(),
})

export const createDebt = action
  .schema(createDebtSchema)
  .action(
    async ({
      parsedInput: {
        debtor_id,
        total_amount_minor,
        total_installments,
        installment_amount_minor,
        due_day,
        currency,
        start_month,
        description,
      },
    }) => {
      const admin_user = await requireAdmin()

      const total = BigInt(total_amount_minor)
      const installAmt = BigInt(installment_amount_minor)

      const diff = total - installAmt * BigInt(total_installments)
      const absDiff = diff < 0n ? -diff : diff
      if (absDiff > BigInt(total_installments)) {
        throw new Error(
          `Invariante de redondeo violado: residual ${diff} excede ±${total_installments}`,
        )
      }

      const admin = createAdminClient()

      const { data: debtorData } = await admin
        .from('users')
        .select('role')
        .eq('id', debtor_id)
        .single()
      // boundary: PostgREST column select — TypeScript can't infer partial-select row shape
      const debtor = debtorData as { role: string } | null
      if (!debtor) throw new Error('El deudor no existe')
      if (debtor.role !== 'debtor') throw new Error('El usuario no tiene rol de deudor')

      const { data, error } = await admin.rpc('create_debt_with_installments', {
        p_debtor_id: debtor_id,
        p_currency: currency,
        // boundary: bigint→number for RPC arg; safe because Zod constrains amount < MAX_SAFE_INTEGER
        p_total_amount_minor: Number(total),
        p_total_installments: total_installments,
        p_installment_amount_minor: Number(installAmt),
        p_due_day: due_day,
        p_start_month: start_month,
        p_description: description ?? null,
        p_created_by: admin_user.id,
      })

      if (error) throw new Error(`Error al crear la deuda: ${error.message}`)

      // boundary: RPC returns uuid as Json (unknown); function RETURNS uuid which is always a string
      return { debtId: data as string }
    },
  )
