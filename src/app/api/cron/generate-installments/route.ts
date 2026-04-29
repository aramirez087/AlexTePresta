import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateForDebt } from '@/lib/domain/installments/generateForDebt'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data: debts, error } = await admin
    .from('debts')
    .select('id, total_installments, installment_amount_minor, due_day, start_month')
    .eq('status', 'active')

  if (error) {
    console.error('[cron] failed to fetch debts:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let backfilled = 0
  const errors: string[] = []

  for (const debt of debts ?? []) {
    const { count } = await admin
      .from('installments')
      .select('id', { count: 'exact', head: true })
      .eq('debt_id', debt.id)

    if ((count ?? 0) < debt.total_installments) {
      try {
        await generateForDebt(admin, debt.id, {
          totalInstallments: debt.total_installments,
          // boundary: DB returns number; convert to bigint for domain layer
          installmentAmountMinor: BigInt(debt.installment_amount_minor),
          dueDay: debt.due_day,
          startMonth: debt.start_month,
        })
        backfilled++
      } catch (err) {
        errors.push(`debt ${debt.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  console.log(`[cron] backfilled ${backfilled} debts, ${errors.length} errors`)
  return NextResponse.json({ backfilled, errors })
}
