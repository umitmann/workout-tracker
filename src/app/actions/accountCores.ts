import { parseAccountProfileForm } from '@/lib/accountValidation'
import type { AccountActionState } from '@/lib/accountTypes'

type ActionUser = { id: string }
type ActionError = { message?: string; code?: string | null }
type RpcResult = { data: unknown; error: ActionError | null }

export type AccountActionClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: ActionUser | null }
      error?: ActionError | null
    }>
    updateUser: (input: { data: Record<string, unknown> }) => Promise<{
      data: { user: unknown }
      error: ActionError | null
    }>
  }
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<RpcResult>
}

export async function saveAccountProfileCore(
  supabase: AccountActionClient,
  formData: FormData,
): Promise<AccountActionState> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { success: false, message: 'Your session has expired. Sign in and try again.' }
  }

  const parsed = parseAccountProfileForm(formData)
  if (!parsed.success) {
    return {
      success: false,
      message: 'Check the highlighted fields and try again.',
      fieldErrors: parsed.fieldErrors,
    }
  }

  const input = parsed.data
  const { error } = await supabase.rpc('save_my_profile', {
    p_display_name: input.displayName,
    p_avatar_url: input.avatarUrl,
    p_time_zone: input.timeZone,
  })
  if (error) {
    return {
      success: false,
      message: error.code === '22023'
        ? 'The account settings contain an invalid value.'
        : 'We could not save your account settings. Try again shortly.',
    }
  }

  // The private profile is authoritative. Mirroring the two presentation
  // fields into auth metadata keeps the shell identity current without adding
  // a profile query to every route. A metadata outage must not undo a profile
  // save that has already committed.
  const { error: metadataError } = await supabase.auth.updateUser({
    data: {
      display_name: input.displayName,
      avatar_url: input.avatarUrl,
    },
  })

  return {
    success: true,
    message: metadataError
      ? 'Account settings saved. Your menu name may update after you sign in again.'
      : 'Account settings saved.',
  }
}
