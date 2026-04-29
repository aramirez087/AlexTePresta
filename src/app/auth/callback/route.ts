import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/app'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  const pendingToken = request.cookies.get('pending_invite')?.value

  if (pendingToken) {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user?.email) {
      const admin = createAdminClient()
      const { data: rpcData } = await admin.rpc('accept_invite', {
        p_token: pendingToken,
        p_user_id: user.id,
        p_email: user.email,
      })
      // boundary: accept_invite returns Json; we own the function and know the shape
      const result = rpcData as { ok: boolean; error?: string } | null

      const clearCookie = (response: NextResponse) => {
        response.cookies.set('pending_invite', '', { maxAge: 0, path: '/' })
        return response
      }

      // token_consumed means a prior attempt already accepted — treat as success
      if (!result?.ok && result?.error !== 'token_consumed') {
        const reason = result?.error ?? 'unknown'
        return clearCookie(
          NextResponse.redirect(`${origin}/invite/error?reason=${reason}`)
        )
      }

      return clearCookie(NextResponse.redirect(`${origin}${next}`))
    }
  }

  return NextResponse.redirect(`${origin}${next}`)
}
