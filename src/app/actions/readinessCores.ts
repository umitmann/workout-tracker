import { normalizeReadiness } from '@/lib/readinessTypes'

type ReadinessError = { message: string; code?: string | null }
type ReadinessResult = { data: unknown; error: ReadinessError | null }

export type ReadinessActionClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string } | null }
      error?: ReadinessError | null
    }>
  }
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<ReadinessResult>
}

export type ReadinessActionState = {
  success: boolean
  message: string
  readiness?: NonNullable<ReturnType<typeof normalizeReadiness>>
}

export async function saveDailyReadinessCore(
  client: ReadinessActionClient,
  formData: FormData,
): Promise<ReadinessActionState> {
  const { data: { user }, error: authError } = await client.auth.getUser()
  if (!user || authError) {
    return { success: false, message: 'Your session has expired. Sign in and try again.' }
  }

  const raw = formData.get('feeling')
  const feeling = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN
  if (!Number.isInteger(feeling) || feeling < 1 || feeling > 5) {
    return { success: false, message: 'Choose how you are feeling today.' }
  }

  const { data, error } = await client.rpc('set_my_daily_readiness', { p_feeling: feeling })
  if (error) return { success: false, message: 'We could not save your feeling. Try again.' }
  const first = Array.isArray(data) ? data[0] : data
  const readiness = normalizeReadiness(first)
  if (!readiness) return { success: false, message: 'Your feeling could not be confirmed. Refresh and try again.' }
  return { success: true, message: 'Feeling saved.', readiness }
}
