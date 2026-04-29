export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminScenarioProjector } from './AdminScenarioProjector'

export default async function AdminDebtorScenariosPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  const { id } = await params
  const admin = createAdminClient()

  const { data: debtor } = await admin
    .from('users')
    .select('id, email, role')
    .eq('id', id)
    .single()

  // boundary: PostgREST column select — TypeScript can't infer partial-select row shape
  const debtorRow = debtor as { id: string; email: string; role: string } | null
  if (!debtorRow || debtorRow.role !== 'debtor') notFound()

  const { data: debtsData } = await admin
    .from('debts')
    .select('id, currency')
    .eq('debtor_id', id)
    .eq('status', 'active')

  const activeDebts = debtsData ?? []
  const debtIds = activeDebts.map((d) => d.id)
  const debtCurrencyMap = new Map(activeDebts.map((d) => [d.id, d.currency as 'CRC' | 'USD']))

  const { data: allInterestDebts } = debtIds.length > 0
    ? await admin
        .from('interest_debts')
        .select('id, debt_id, current_balance_minor, interest_rate, is_simulated')
        .in('debt_id', debtIds)
        .eq('status', 'active')
    : { data: [] }

  const toProjectorInput = (d: {
    id: string
    debt_id: string
    current_balance_minor: number
    interest_rate: string
  }) => ({
    id: d.id,
    current_balance_minor: d.current_balance_minor,
    interest_rate: d.interest_rate,
    currency: debtCurrencyMap.get(d.debt_id) ?? ('CRC' as 'CRC' | 'USD'),
  })

  const realDebts = (allInterestDebts ?? [])
    .filter((d) => !d.is_simulated)
    .map(toProjectorInput)

  const simulatedDebts = (allInterestDebts ?? [])
    .filter((d) => d.is_simulated)
    .map(toProjectorInput)

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center gap-4">
        <Link href={`/admin/debtors/${id}`} className="text-sm text-blue-600 hover:underline">
          ← Volver al deudor
        </Link>
      </div>

      <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
        Escenario simulado — no afecta lo que debes
      </div>

      <h1 className="mb-2 text-2xl font-bold text-gray-900">Proyección de intereses</h1>
      <p className="mb-6 text-sm text-gray-500">{debtorRow.email}</p>

      <AdminScenarioProjector realDebts={realDebts} simulatedDebts={simulatedDebts} />
    </main>
  )
}
