export const dynamic = 'force-dynamic'

import { requireAdmin } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { CreateInviteForm } from './_components/create-invite-form'

export default async function InvitesPage() {
  await requireAdmin()

  const admin = createAdminClient()
  const { data: invites } = await admin
    .from('invites')
    .select('id, email, token, expires_at, consumed_at, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Invitaciones</h1>
      <div className="mb-8">
        <CreateInviteForm />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Invitaciones enviadas</h2>
        </div>
        {!invites || invites.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-gray-500">
            No hay invitaciones creadas.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
              <tr>
                <th className="px-6 py-3">Correo</th>
                <th className="px-6 py-3">Estado</th>
                <th className="px-6 py-3">Vence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invites.map((invite) => {
                const isExpired = new Date(invite.expires_at) < new Date()
                const status = invite.consumed_at
                  ? 'Utilizada'
                  : isExpired
                    ? 'Expirada'
                    : 'Pendiente'
                const statusColor = invite.consumed_at
                  ? 'text-green-600'
                  : isExpired
                    ? 'text-red-500'
                    : 'text-blue-600'

                return (
                  <tr key={invite.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{invite.email}</td>
                    <td className={`px-6 py-4 font-medium ${statusColor}`}>{status}</td>
                    <td className="px-6 py-4 text-gray-500">
                      {new Date(invite.expires_at).toLocaleDateString('es-CR')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </main>
  )
}
