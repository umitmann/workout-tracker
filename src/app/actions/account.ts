'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { AccountActionState } from '@/lib/accountTypes'
import { saveAccountProfileCore, type AccountActionClient } from './accountCores'

export async function saveAccountProfileAction(
  _previousState: AccountActionState | null,
  formData: FormData,
): Promise<AccountActionState> {
  const client = (await createServerSupabaseClient()) as unknown as AccountActionClient
  const result = await saveAccountProfileCore(client, formData)
  if (result.success) {
    revalidatePath('/account')
    revalidatePath('/dashboard')
    revalidatePath('/', 'layout')
  }
  return result
}
