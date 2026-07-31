'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import {
  saveDailyReadinessCore,
  type ReadinessActionClient,
  type ReadinessActionState,
} from './readinessCores'

export async function saveDailyReadinessAction(
  _previousState: ReadinessActionState | null,
  formData: FormData,
): Promise<ReadinessActionState> {
  const client = await createServerSupabaseClient() as unknown as ReadinessActionClient
  const result = await saveDailyReadinessCore(client, formData)
  if (result.success) revalidatePath('/dashboard')
  return result
}
