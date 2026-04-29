export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDebtorOverview } from '@/lib/domain/views/getDebtorOverview'
import { getDebtTimeline } from '@/lib/domain/views/getDebtTimeline'
import { DebtTimeline } from '@/components/timeline/DebtTimeline'
import { formatMoney } from '@/lib/format/money'

export default async function AdminDebtorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ mode?: string }>
}) {
  await requireAdmin()
  const { id } = await params
  const { mode } = await searchParams
  const isSimulatedMode = mode === 'simulada'
  const admin = createAdminClient()

  const { data: debtor } = await admin
    .from('users')
    .select('id, email, role')
    .eq('id', id)
    .single()

  // boundary: PostgREST column select — TypeScript can't infer partial-select row shape
  const debtorRow = debtor as { id: string; email: string; role: string } | null
  if (!debtorRow || debtorRow.role !== 'debtor') notFound()

  const overview = await getDebtorOverview(admin, id)

  const debtIds = overview.debts.map((d) => d.id)

  const [installmentsRes, paymentsRes, interestDebtsRes] = await Promise.all([
    debtIds.length > 0
      ? admin
          .from('installments')
          .select('id, due_date, amount_minor, remaining_amount_minor, status, sequence_number, debt_id')
          .in('debt_id', debtIds)
          .order('due_date', { ascending: true })
      : Promise.resolve({ data: [] }),
    admin
      .from('payments')
      .select('id, created_at, applied_at, amount_minor, currency, status, notes')
      .eq('debtor_id', id)
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: true }),
    debtIds.length > 0
      ? admin
          .from('interest_debts')
          .select('id, debt_id, source_installment_id, principal_minor, current_balance_minor, interest_rate, created_at, is_simulated')
          .in('debt_id', debtIds)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] }),
  ])

  const allPayments = paymentsRes.data ?? []
  const paymentIds = allPayments.map((p) => p.id)

  const applicationsRes =
    paymentIds.length > 0
      ? await admin
          .from('payment_applications')
          .select('id, payment_id, target_id, applied_amount_minor, created_at')
          .in('payment_id', paymentIds)
          .order('created_at', { ascending: true })
      : { data: [] }

  const allInterestDebts = interestDebtsRes.data ?? []

  const accrualsRes =
    allInterestDebts.length > 0
      ? await admin
          .from('interest_accruals')
          .select('id, interest_debt_id, period, accrued_amount_minor, closing_balance_minor, created_at')
          .in('interest_debt_id', allInterestDebts.map((d) => d.id))
          .order('created_at', { ascending: true })
      : { data: [] }

  const allAccruals = accrualsRes.data ?? []

  const currencies = [...new Set(overview.debts.map((d) => d.currency))] as ('CRC' | 'USD')[]

  const timelines = currencies.map((currency) => {
    const currencyDebtIds = new Set(
      overview.debts.filter((d) => d.currency === currency).map((d) => d.id),
    )
    const installments = (installmentsRes.data ?? []).filter((i) =>
      currencyDebtIds.has(i.debt_id),
    )
    const payments = allPayments.filter((p) => p.currency === currency)
    const paymentIdSet = new Set(payments.map((p) => p.id))
    const applications = (applicationsRes.data ?? []).filter((a) =>
      paymentIdSet.has(a.payment_id),
    )
    const interest_debts = allInterestDebts.filter((d) => currencyDebtIds.has(d.debt_id ?? ''))
    const accruals = allAccruals.filter((a) =>
      interest_debts.some((d) => d.id === a.interest_debt_id),
    )
    const events = getDebtTimeline({ installments, payments, applications, currency, interest_debts, accruals })
    return { currency, events }
  })

  const crc = overview.total_owed_by_currency.CRC
  const usd = overview.total_owed_by_currency.USD
  const crcSim = overview.simulated_balance_by_currency.CRC
  const usdSim = overview.simulated_balance_by_currency.USD

  return (
    <main className="mx-auto max-w-4xl p-6">
      {isSimulatedMode && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Escenario simulado — no afecta lo que debes
        </div>
      )}

      <div className="mb-6">
        <Link href="/admin" className="text-sm text-blue-600 hover:underline">
          ← Volver a deudores
        </Link>
      </div>

      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{debtorRow.email}</h1>
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-600">
              {crc > 0n && <span>Saldo CRC: {formatMoney(crc, 'CRC')}</span>}
              {usd > 0n && <span>Saldo USD: {formatMoney(usd, 'USD')}</span>}
              {crc === 0n && usd === 0n && (
                <span className="text-green-600">Sin saldo pendiente</span>
              )}
              {isSimulatedMode && crcSim > 0n && (
                <span className="text-amber-600">Simulado CRC: {formatMoney(crcSim, 'CRC')}</span>
              )}
              {isSimulatedMode && usdSim > 0n && (
                <span className="text-amber-600">Simulado USD: {formatMoney(usdSim, 'USD')}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={isSimulatedMode ? `/admin/debtors/${id}` : `/admin/debtors/${id}?mode=simulada`}
              className="text-xs text-amber-600 hover:underline"
            >
              {isSimulatedMode ? 'Ver datos reales' : 'Ver escenario simulado'}
            </Link>
            <Link
              href={`/admin/debtors/${id}/scenarios`}
              className="text-xs text-gray-500 hover:underline"
            >
              Proyección
            </Link>
            {overview.status === 'al_dia' ? (
              <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
                Al día
              </span>
            ) : (
              <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
                Atrasado
              </span>
            )}
          </div>
        </div>
      </div>

      {overview.debts.length > 0 && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-gray-900">Deudas activas</h2>
          <ul className="divide-y divide-gray-100">
            {overview.debts.map((debt) => (
              <li key={debt.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <span className="font-medium text-gray-900">
                    {debt.description ?? 'Deuda sin descripción'}
                  </span>
                  <span className="ml-2 text-gray-500">
                    {formatMoney(debt.installment_amount_minor, debt.currency)}/mes ·{' '}
                    {debt.total_installments} cuotas
                  </span>
                </div>
                <Link
                  href={`/admin/debts/${debt.id}`}
                  className="text-blue-600 hover:underline"
                >
                  Ver deuda →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-6">
        <Link
          href={`/admin/debtors/${id}/register-payment`}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Registrar pago directo
        </Link>
      </div>

      {timelines.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-400">Sin movimientos registrados.</p>
        </div>
      ) : (
        timelines.map(({ currency, events }) => (
          <div
            key={currency}
            className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <h2 className="mb-4 text-base font-semibold text-gray-900">
              Historial de movimientos{timelines.length > 1 ? ` — ${currency}` : ''}
            </h2>
            <DebtTimeline events={events} />
          </div>
        ))
      )}
    </main>
  )
}
