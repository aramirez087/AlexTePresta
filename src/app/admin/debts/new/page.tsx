export const dynamic = 'force-dynamic'

import { requireAdmin } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { CreateDebtForm } from './_components/create-debt-form'

export default async function NewDebtPage() {
  await requireAdmin()
  const admin = createAdminClient()
  const { data: debtors } = await admin
    .from('users')
    .select('id, email')
    .eq('role', 'debtor')
    .order('email')

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Nueva deuda</h1>
      <CreateDebtForm debtors={debtors ?? []} />
    </main>
  )
}
