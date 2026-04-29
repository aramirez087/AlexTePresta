export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireUser } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDebtorOverview } from '@/lib/domain/views/getDebtorOverview'
import { getDebtTimeline } from '@/lib/domain/views/getDebtTimeline'
import { DebtTimeline } from '@/components/timeline/DebtTimeline'
import { formatMoney } from '@/lib/format/money'
import { daysUntil } from '@/lib/format/date'

export default async function DebtorHomePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>
}) {
  const user = await requireUser()
  const admin = createAdminClient()
  const overview = await getDebtorOverview(admin, user.id)
  const { mode } = await searchParams
  const isSimulatedMode = mode === 'simulada'

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
      .eq('debtor_id', user.id)
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

  const crcOwed = overview.total_owed_by_currency.CRC
  const usdOwed = overview.total_owed_by_currency.USD
  const hasCRC = crcOwed > 0n
  const hasUSD = usdOwed > 0n

  const crcSim = overview.simulated_balance_by_currency.CRC
  const usdSim = overview.simulated_balance_by_currency.USD

  const next = overview.next_installment
  const nextDays = next ? daysUntil(new Date(next.due_date + 'T12:00:00Z')) : null

  return (
    <main className="mx-auto max-w-2xl p-6">
      {isSimulatedMode && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Escenario simulado — no afecta lo que debes
        </div>
      )}

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Estado de cuenta</h1>
        <div className="flex items-center gap-3">
          <Link
            href={isSimulatedMode ? '/app' : '/app?mode=simulada'}
            className="text-xs text-amber-600 hover:underline"
          >
            {isSimulatedMode ? 'Ver datos reales' : 'Ver escenario simulado'}
          </Link>
          <Link
            href="/scenarios"
            className="text-xs text-gray-500 hover:underline"
          >
            Proyección
          </Link>
          <Link
            href="/pay"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Registrar pago
          </Link>
        </div>
      </div>

      {overview.debts.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <p className="text-gray-500">No tienes deudas activas registradas.</p>
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase text-gray-500">Saldo total</p>
              <div className="mt-2 space-y-1">
                {hasCRC && (
                  <p className="text-lg font-bold text-gray-900">{formatMoney(crcOwed, 'CRC')}</p>
                )}
                {hasUSD && (
                  <p className="text-lg font-bold text-gray-900">{formatMoney(usdOwed, 'USD')}</p>
                )}
                {!hasCRC && !hasUSD && (
                  <p className="text-lg font-bold text-green-600">Al día ✓</p>
                )}
              </div>
              {isSimulatedMode && (crcSim > 0n || usdSim > 0n) && (
                <div className="mt-2 border-t border-amber-200 pt-2">
                  <p className="text-xs font-medium uppercase text-amber-600">Interés simulado</p>
                  {crcSim > 0n && (
                    <p className="text-sm font-semibold text-amber-700">{formatMoney(crcSim, 'CRC')}</p>
                  )}
                  {usdSim > 0n && (
                    <p className="text-sm font-semibold text-amber-700">{formatMoney(usdSim, 'USD')}</p>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase text-gray-500">Próxima cuota</p>
              {next ? (
                <div className="mt-2">
                  <p className="text-lg font-bold text-gray-900">
                    {formatMoney(next.amount_minor, next.currency)}
                  </p>
                  <p className="text-sm text-gray-500">
                    {nextDays === 0
                      ? 'Vence hoy'
                      : nextDays !== null && nextDays < 0
                        ? `Vencida hace ${Math.abs(nextDays)} día${Math.abs(nextDays) === 1 ? '' : 's'}`
                        : nextDays !== null
                          ? `en ${nextDays} día${nextDays === 1 ? '' : 's'}`
                          : ''}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-400">Sin cuotas pendientes</p>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase text-gray-500">Estado</p>
              <div className="mt-2">
                {overview.status === 'al_dia' ? (
                  <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
                    Al día
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
                    Atrasado
                  </span>
                )}
              </div>
            </div>
          </div>

          {timelines.map(({ currency, events }) => (
            <div
              key={currency}
              className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <h2 className="mb-4 text-base font-semibold text-gray-900">
                Historial de movimientos{timelines.length > 1 ? ` — ${currency}` : ''}
              </h2>
              <DebtTimeline events={events} />
            </div>
          ))}
        </>
      )}
    </main>
  )
}
