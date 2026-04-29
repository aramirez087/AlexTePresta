import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runMonthlyAccrual } from '@/lib/domain/interest/runMonthlyAccrual'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  // Compute period in Costa Rica timezone (UTC-6, no DST); en-CA gives 'YYYY-MM-DD'
  const period = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica',
    year: 'numeric',
    month: '2-digit',
  })
    .format(now)
    .slice(0, 7)

  const admin = createAdminClient()

  try {
    const realSummary = await runMonthlyAccrual(admin, period, 'real')
    const simSummary = await runMonthlyAccrual(admin, period, 'simulated')
    console.log(`[cron/monthly-accrual] period=${period}`, { real: realSummary, simulated: simSummary })
    return NextResponse.json({ period, real: realSummary, simulated: simSummary })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron/monthly-accrual] fatal:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
