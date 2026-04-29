export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDebtorOverview } from '@/lib/domain/views/getDebtorOverview'
import { formatMoney } from '@/lib/format/money'

export default async function AdminHomePage() {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: debtors } = await admin
    .from('users')
    .select('id, email')
    .eq('role', 'debtor')
    .order('email', { ascending: true })

  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica',
  }).format(new Date())

  const rows = await Promise.all(
    (debtors ?? []).map(async (debtor) => {
      const overview = await getDebtorOverview(admin, debtor.id)

      const overdueCount = overview.debts.reduce((sum, debt) => {
        const next = debt.next_pending_installment
        if (next && next.due_date < todayStr) return sum + 1
        return sum
      }, 0)

      const { count: pendingPayments } = await admin
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('debtor_id', debtor.id)
        .eq('status', 'pending')

      return {
        debtor,
        overview,
        overdueCount,
        pendingPayments: pendingPayments ?? 0,
      }
    }),
  )

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Deudores</h1>
        <nav className="flex gap-3">
          <Link
            href="/admin/payments"
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            Pagos pendientes
          </Link>
          <Link
            href="/admin/invites"
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            Invitaciones
          </Link>
          <Link
            href="/admin/debts/new"
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Nueva deuda
          </Link>
        </nav>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <p className="text-gray-500">No hay deudores registrados.</p>
          <Link
            href="/admin/invites"
            className="mt-3 inline-block text-sm text-blue-600 hover:underline"
          >
            Invitar un deudor →
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Deudor</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                  Saldo total
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Alertas</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(({ debtor, overview, overdueCount, pendingPayments }) => {
                const crc = overview.total_owed_by_currency.CRC
                const usd = overview.total_owed_by_currency.USD
                const hasCRC = crc > 0n
                const hasUSD = usd > 0n
                return (
                  <tr key={debtor.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{debtor.email}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-900">
                      {hasCRC && <div>{formatMoney(crc, 'CRC')}</div>}
                      {hasUSD && <div>{formatMoney(usd, 'USD')}</div>}
                      {!hasCRC && !hasUSD && (
                        <span className="text-green-600">Al día</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {overview.status === 'al_dia' ? (
                        <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          Al día
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          Atrasado
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {overdueCount > 0 && (
                        <div className="text-red-600">
                          {overdueCount} cuota{overdueCount === 1 ? '' : 's'} vencida
                          {overdueCount === 1 ? '' : 's'}
                        </div>
                      )}
                      {pendingPayments > 0 && (
                        <div className="text-amber-600">
                          {pendingPayments} pago{pendingPayments === 1 ? '' : 's'} pendiente
                          {pendingPayments === 1 ? '' : 's'}
                        </div>
                      )}
                      {overdueCount === 0 && pendingPayments === 0 && (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      <Link
                        href={`/admin/debtors/${debtor.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        Ver deudor →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
