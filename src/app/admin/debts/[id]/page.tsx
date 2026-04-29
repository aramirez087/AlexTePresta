import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { formatMoney } from '@/lib/format/money'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  paid: 'Pagado',
  converted: 'Convertida',
  overdue: 'Vencida',
}

export default async function DebtDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  const admin = createAdminClient()

  const { data: debt } = await admin
    .from('debts')
    .select('*, debtor:users!debts_debtor_id_fkey(email)')
    .eq('id', id)
    .single()

  if (!debt) notFound()

  const { data: installments } = await admin
    .from('installments')
    .select('*')
    .eq('debt_id', id)
    .order('sequence_number')

  const rows = installments ?? []

  const paid = rows
    .filter((i) => i.status === 'paid')
    .reduce((sum, i) => sum + BigInt(i.amount_minor - i.remaining_amount_minor), 0n)

  const pending = rows
    .filter((i) => i.status !== 'paid')
    .reduce((sum, i) => sum + BigInt(i.remaining_amount_minor), 0n)

  // boundary: DB currency column is untyped string; domain only uses CRC/USD
  const currency = debt.currency as 'CRC' | 'USD'

  // boundary: debtor is a joined row — Supabase returns it as an object, not typed by default
  const debtor = debt.debtor as { email: string } | null

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <Link href="/admin/debts/new" className="text-sm text-blue-600 hover:underline">
          ← Nueva deuda
        </Link>
      </div>

      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">
          {debt.description ?? 'Deuda'}
        </h1>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="font-medium text-gray-500">Deudor</dt>
            <dd className="text-gray-900">{debtor?.email ?? debt.debtor_id}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">Moneda</dt>
            <dd className="text-gray-900">{currency}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">Estado</dt>
            <dd className="text-gray-900">{STATUS_LABELS[debt.status] ?? debt.status}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">Monto total</dt>
            <dd className="text-gray-900">{formatMoney(BigInt(debt.total_amount_minor), currency)}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">Cuotas</dt>
            <dd className="text-gray-900">{debt.total_installments}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">Día de vencimiento</dt>
            <dd className="text-gray-900">{debt.due_day}</dd>
          </div>
        </dl>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-4 text-center">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Pagado</p>
          <p className="mt-1 text-lg font-semibold text-green-600">
            {formatMoney(paid, currency)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Pendiente</p>
          <p className="mt-1 text-lg font-semibold text-amber-600">
            {formatMoney(pending, currency)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Total</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {formatMoney(BigInt(debt.total_amount_minor), currency)}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">#</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Vencimiento</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Monto</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Pendiente</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((installment) => (
              <tr key={installment.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-900">{installment.sequence_number}</td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {new Intl.DateTimeFormat('es-CR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    timeZone: 'UTC',
                  }).format(new Date(installment.due_date))}
                </td>
                <td className="px-4 py-3 text-right text-sm text-gray-900">
                  {formatMoney(BigInt(installment.amount_minor), currency)}
                </td>
                <td className="px-4 py-3 text-right text-sm text-gray-900">
                  {formatMoney(BigInt(installment.remaining_amount_minor), currency)}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      installment.status === 'paid'
                        ? 'bg-green-100 text-green-700'
                        : installment.status === 'overdue'
                          ? 'bg-red-100 text-red-700'
                          : installment.status === 'converted'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {STATUS_LABELS[installment.status] ?? installment.status}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-400">
                  No hay cuotas generadas para esta deuda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  )
}
