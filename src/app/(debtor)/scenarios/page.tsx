export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireUser } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { ScenarioProjector } from './ScenarioProjector'

export default async function DebtorScenariosPage() {
  const user = await requireUser()
  const admin = createAdminClient()

  const { data: debtsData } = await admin
    .from('debts')
    .select('id, currency')
    .eq('debtor_id', user.id)
    .eq('status', 'active')

  const activeDebts = debtsData ?? []
  const debtIds = activeDebts.map((d) => d.id)

  const { data: interestDebtsData } = debtIds.length > 0
    ? await admin
        .from('interest_debts')
        .select('id, debt_id, current_balance_minor, interest_rate')
        .in('debt_id', debtIds)
        .eq('is_simulated', true)
        .eq('status', 'active')
    : { data: [] }

  const debtCurrencyMap = new Map(activeDebts.map((d) => [d.id, d.currency as 'CRC' | 'USD']))

  const interestDebts = (interestDebtsData ?? []).map((d) => ({
    id: d.id,
    current_balance_minor: d.current_balance_minor,
    interest_rate: d.interest_rate,
    currency: debtCurrencyMap.get(d.debt_id) ?? ('CRC' as 'CRC' | 'USD'),
  }))

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6">
        <Link href="/app" className="text-sm text-blue-600 hover:underline">
          �� Volver a estado de cuenta
        </Link>
      </div>

      <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
        Escenario simulado — no afecta lo que debes
      </div>

      <h1 className="mb-6 text-2xl font-bold text-gray-900">Proyección de intereses</h1>

      <p className="mb-6 text-sm text-gray-500">
        Esta proyección es puramente ilustrativa. Los montos mostrados no reflejan lo que debes
        actualmente. Ajusta el pago extra mensual para ver cómo afectaría el saldo simulado.
      </p>

      <ScenarioProjector interestDebts={interestDebts} />
    </main>
  )
}
