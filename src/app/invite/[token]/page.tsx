export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const ERROR_MESSAGES: Record<string, string> = {
  token_not_found: 'El enlace de invitación no es válido.',
  token_expired:
    'El enlace de invitación ha expirado. Solicite uno nuevo al administrador.',
  token_consumed: 'Este enlace de invitación ya fue utilizado.',
  email_mismatch:
    'Su cuenta de Google no coincide con el correo de la invitación.',
}

interface Props {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params

  const admin = createAdminClient()
  const { data: invite, error } = await admin
    .from('invites')
    .select('email, expires_at, consumed_at, inviter_id')
    .eq('token', token)
    .single()

  if (error || !invite) {
    return <ErrorPage message={ERROR_MESSAGES.token_not_found} />
  }

  if (new Date(invite.expires_at) < new Date()) {
    return <ErrorPage message={ERROR_MESSAGES.token_expired} />
  }

  if (invite.consumed_at) {
    return <ErrorPage message={ERROR_MESSAGES.token_consumed} />
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    // Guard: prevent an admin from accidentally downgrading their own role
    const existingResult = await admin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()
    // boundary: PostgREST column select — TypeScript can't infer partial-select row shape
    const existingUser = existingResult.data as { role: string } | null

    if (existingUser?.role === 'admin') {
      return (
        <ErrorPage message="Esta cuenta es administradora y no puede aceptar una invitación de deudor." />
      )
    }

    const { data: rpcData } = await admin.rpc('accept_invite', {
      p_token: token,
      p_user_id: user.id,
      p_email: user.email ?? '',
    })
    // boundary: accept_invite returns Json; we own the function and know the shape
    const result = rpcData as { ok: boolean; error?: string } | null

    if (!result?.ok) {
      const msg = ERROR_MESSAGES[result?.error ?? ''] ?? 'Error desconocido.'
      return <ErrorPage message={msg} />
    }

    redirect('/app')
  }

  // Not signed in — persist token in a short-lived HttpOnly cookie, then route through OAuth
  const cookieStore = await cookies()
  cookieStore.set('pending_invite', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 15 * 60,
    path: '/',
  })

  redirect('/login?next=/app')
}

function ErrorPage({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-md">
        <h1 className="mb-4 text-center text-xl font-bold text-red-600">
          Invitación inválida
        </h1>
        <p className="mb-4 text-center text-gray-700">{message}</p>
        <p className="text-center text-sm text-gray-500">
          Contacte al administrador para obtener un nuevo enlace.
        </p>
      </div>
    </main>
  )
}
