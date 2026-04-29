export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ reason?: string }>
}

const REASON_MESSAGES: Record<string, string> = {
  token_not_found: 'El enlace de invitación no es válido.',
  token_expired: 'El enlace de invitación ha expirado. Solicite uno nuevo al administrador.',
  token_consumed: 'Este enlace de invitación ya fue utilizado.',
  email_mismatch: 'Su cuenta de Google no coincide con el correo de la invitación.',
  unknown: 'Ocurrió un error al procesar la invitación.',
}

export default async function InviteErrorPage({ searchParams }: Props) {
  const { reason } = await searchParams
  const message = REASON_MESSAGES[reason ?? 'unknown'] ?? REASON_MESSAGES.unknown

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-md">
        <h1 className="mb-4 text-center text-xl font-bold text-red-600">
          Error al aceptar invitación
        </h1>
        <p className="mb-4 text-center text-gray-700">{message}</p>
        <p className="text-center text-sm text-gray-500">
          Contacte al administrador para obtener un nuevo enlace.
        </p>
      </div>
    </main>
  )
}
