import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/session'
import { ApproveButton } from './_components/approve-button'
import { formatMoney } from '@/lib/format/money'
import { formatDate } from '@/lib/format/date'

type PendingPayment = {
  id: string
  debtor_id: string
  currency: 'CRC' | 'USD'
  amount_minor: number
  notes: string | null
  created_at: string
  debtor_email: string
  preview_installments: {
    id: string
    due_date: string
    remaining_amount_minor: number
    sequence_number: number
  }[]
}

export default async function AdminPaymentsPage() {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: payments } = await admin
    .from('payments')
    .select('id, debtor_id, currency, amount_minor, notes, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (!payments || payments.length === 0) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-4">
          <Link href="/admin" className="text-sm text-blue-600 hover:underline">
            ← Deudores
          </Link>
        </div>
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Pagos pendientes</h1>
        <p className="text-gray-500">No hay pagos pendientes de aprobación.</p>
      </main>
    )
  }

  // Fetch debtor emails and FIFO preview installments for each pending payment
  const enriched: PendingPayment[] = await Promise.all(
    payments.map(async (p) => {
      const { data: userRow } = await admin
        .from('users')
        .select('email')
        .eq('id', p.debtor_id)
        .single()
      // boundary: PostgREST column select — TypeScript can't infer partial-select row shape
      const debtor_email = (userRow as { email: string } | null)?.email ?? p.debtor_id

      const { data: installments } = await admin
        .from('installments')
        .select('id, due_date, remaining_amount_minor, sequence_number, debt_id')
        .eq('status', 'pending')
        .order('due_date', { ascending: true })
        .order('sequence_number', { ascending: true })
        .limit(5)

      // Filter to installments belonging to this debtor's debts in matching currency
      const debtIds = await admin
        .from('debts')
        .select('id')
        .eq('debtor_id', p.debtor_id)
        .eq('currency', p.currency)
        .eq('status', 'active')

      const validDebtIds = new Set((debtIds.data ?? []).map((d) => d.id))
      const preview_installments = (installments ?? [])
        .filter((i) => validDebtIds.has(i.debt_id))
        .slice(0, 5)
        .map(({ id, due_date, remaining_amount_minor, sequence_number }) => ({
          id,
          due_date,
          remaining_amount_minor,
          sequence_number,
        }))

      // boundary: DB currency column is untyped string; domain only uses CRC/USD
      return { ...p, currency: p.currency as 'CRC' | 'USD', debtor_email, preview_installments }
    }),
  )

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-4">
        <Link href="/admin" className="text-sm text-blue-600 hover:underline">
          ← Deudores
        </Link>
      </div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Pagos pendientes</h1>
      <div className="space-y-6">
        {enriched.map((p) => (
          <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-gray-900">{p.debtor_email}</p>
                <p className="text-sm text-gray-500">
                  {formatMoney(BigInt(p.amount_minor), p.currency)} · {p.currency} ·{' '}
                  {formatDate(new Date(p.created_at))}
                </p>
                {p.notes && <p className="mt-1 text-sm text-gray-600">{p.notes}</p>}
              </div>
              <ApproveButton paymentId={p.id} />
            </div>

            {p.preview_installments.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium uppercase text-gray-400">
                  Cuotas que se aplicarían (FIFO)
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                      <th className="pb-1 pr-4">#</th>
                      <th className="pb-1 pr-4">Vencimiento</th>
                      <th className="pb-1 text-right">Pendiente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.preview_installments.map((i) => (
                      <tr key={i.id} className="border-b border-gray-50">
                        <td className="py-1 pr-4 text-gray-700">{i.sequence_number}</td>
                        <td className="py-1 pr-4 text-gray-700">
                          {formatDate(new Date(i.due_date + 'T12:00:00Z'))}
                        </td>
                        <td className="py-1 text-right text-gray-700">
                          {formatMoney(BigInt(i.remaining_amount_minor), p.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  )
}
