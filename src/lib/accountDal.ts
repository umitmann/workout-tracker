import 'server-only'

import { requireQueryData } from './dataAccessError'
import { getServerAuthContext } from './serverAuth'
import type { AccountProfile } from './accountTypes'

export async function getOwnAccountProfile(): Promise<AccountProfile | null> {
  const { supabase, user } = await getServerAuthContext()
  if (!user) return null

  const result = await supabase
    .from('profiles')
    .select('user_id, display_name, avatar_url, time_zone, created_at, updated_at')
    .eq('user_id', user.id)
    .maybeSingle()

  return requireQueryData(result, 'load account profile') as AccountProfile | null
}
