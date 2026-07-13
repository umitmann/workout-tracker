import 'server-only'

import { cache } from 'react'
import { createServerSupabaseClient } from './supabase-server'

// React's cache is request-scoped for Server Components. All authorization
// checks still use Supabase Auth's verified getUser(), never cookie contents.
export const getServerAuthContext = cache(async () => {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  return { supabase, user, authError: error }
})
