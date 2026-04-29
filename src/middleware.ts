import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/lib/supabase/database.types'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  // Must use getUser() (server-validated), not getSession() (local cookie only)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  const isProtected =
    pathname.startsWith('/app') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/pay')
  if (!user && isProtected) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('next', pathname)
    const redirectResponse = NextResponse.redirect(loginUrl)
    supabaseResponse.cookies
      .getAll()
      .forEach((cookie) => redirectResponse.cookies.set(cookie.name, cookie.value, cookie))
    return redirectResponse
  }

  if (user && pathname.startsWith('/admin')) {
    const result = await supabase.from('users').select('role').eq('id', user.id).single()
    // boundary: PostgREST column select — TypeScript can't infer partial-select row shape
    const data = result.data as { role: string } | null
    if (!data || data.role !== 'admin') {
      const appUrl = request.nextUrl.clone()
      appUrl.pathname = '/app'
      appUrl.search = ''
      const redirectResponse = NextResponse.redirect(appUrl)
      supabaseResponse.cookies
        .getAll()
        .forEach((cookie) => redirectResponse.cookies.set(cookie.name, cookie.value, cookie))
      return redirectResponse
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
