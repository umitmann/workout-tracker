import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data } = await supabase.auth.exchangeCodeForSession(code)
    const user = data.user

    if (user) {
      const registrationEnabled = process.env.REGISTRATION_ENABLED === 'true'
      const createdAt = new Date(user.created_at).getTime()
      const isNewUser = Date.now() - createdAt < 10_000

      if (!registrationEnabled && isNewUser) {
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/?error=registration_disabled`)
      }
    }
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}
