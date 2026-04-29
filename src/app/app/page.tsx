import { requireUser } from '@/lib/auth/session'
import { currentRole } from '@/lib/auth/session'

export default async function AppPage() {
  const user = await requireUser()
  const role = await currentRole()

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-4 text-2xl font-bold text-gray-900">AlexTePresta</h1>
      <p className="text-gray-600">Bienvenido, {user.email}</p>
      <p className="mt-1 text-sm text-gray-400">Rol: {role ?? 'desconocido'}</p>
    </main>
  )
}
