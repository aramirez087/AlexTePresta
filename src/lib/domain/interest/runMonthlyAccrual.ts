import 'server-only'
import Decimal from 'decimal.js'
import type { createAdminClient } from '@/lib/supabase/admin'
import { accrueOne } from './accrueOne'

export type AccrualSummary = {
  processed: number
  skipped: number
  errors: string[]
}

export async function runMonthlyAccrual(
  adminClient: ReturnType<typeof createAdminClient>,
  period: string,
  mode: 'real' | 'simulated' = 'real',
): Promise<AccrualSummary> {
  const { data: debts } = await adminClient
    .from('interest_debts')
    .select('id, current_balance_minor, interest_rate')
    .eq('is_simulated', mode === 'simulated')
    .eq('status', 'active')

  let processed = 0
  let skipped = 0
  const errors: string[] = []

  for (const debt of debts ?? []) {
    try {
      const { data: existing } = await adminClient
        .from('interest_accruals')
        .select('id')
        .eq('interest_debt_id', debt.id)
        .eq('period', period)
        .eq('mode', mode)
        .maybeSingle()

      if (existing) {
        skipped++
        continue
      }

      const annualRate = new Decimal(debt.interest_rate)
      const monthlyRate = annualRate.div(12)
      // boundary: DB returns number for bigint columns; domain amounts < MAX_SAFE_INTEGER
      const opening = BigInt(debt.current_balance_minor)
      const { accrued_minor, closing_minor } = accrueOne(opening, monthlyRate)

      const { error: insertError } = await adminClient.from('interest_accruals').insert({
        interest_debt_id: debt.id,
        period,
        opening_balance_minor: Number(opening),
        accrued_amount_minor: Number(accrued_minor),
        closing_balance_minor: Number(closing_minor),
        mode,
      })

      if (insertError) throw new Error(insertError.message)

      const { error: updateError } = await adminClient
        .from('interest_debts')
        .update({ current_balance_minor: Number(closing_minor) })
        .eq('id', debt.id)

      if (updateError) throw new Error(updateError.message)

      processed++
    } catch (err) {
      errors.push(`${debt.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { processed, skipped, errors }
}
