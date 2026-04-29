import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/session'
import { RegisterPaymentForm } from './_components/register-payment-form'

export default async function RegisterPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  const { id: debtorId } = await params
  const admin = createAdminClient()

  const { data: debtor } = await admin
    .from('users')
    .select('email, role')
    .eq('id', debtorId)
    .single()

  // boundary: PostgREST column select — TypeScript can't infer partial-select row shape
  const debtorRow = debtor as { email: string; role: string } | null
  if (!debtorRow || debtorRow.role !== 'debtor') notFound()

  const { data: activeDebts } = await admin
    .from('debts')
    .select('id, currency')
    .eq('debtor_id', debtorId)
    .eq('status', 'active')

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Registrar pago directo</h1>
      <p className="mb-6 text-sm text-gray-500">
        Deudor: <span className="font-medium">{debtorRow.email}</span>
      </p>
      <RegisterPaymentForm
        debtorId={debtorId}
        activeDebts={activeDebts ?? []}
      />
    </main>
  )
}
