import 'server-only'

import { requireQueryData } from './dataAccessError'
import { normalizeReadiness, type DailyReadiness } from './readinessTypes'
import { getServerAuthContext } from './serverAuth'

export async function getTodayReadiness(): Promise<DailyReadiness | null> {
  const { user, supabase } = await getServerAuthContext()
  if (!user) throw new Error('Authentication required')
  const result = await supabase.rpc('get_my_daily_readiness')
  const data = requireQueryData(result, 'load today readiness')
  const first = Array.isArray(data) ? data[0] : data
  return first == null ? null : normalizeReadiness(first)
}
