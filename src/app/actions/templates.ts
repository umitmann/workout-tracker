'use server'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getUserTemplates, RoutineWithExercises } from '@/lib/dal'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { saveTemplateExercisesCore, TemplateExercisePayload } from './cores'

export type { TemplateExercisePayload } from './cores'

export async function createTemplate(name: string) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data, error } = await supabase
    .from('routines')
    .insert({ user_id: user.id, name, is_preset: false })
    .select('id')
    .single()

  if (error || !data) return { error: error?.message ?? 'Failed to create' }
  revalidatePath('/workouts')
  return { id: data.id as number }
}

export async function saveTemplateExercises(
  routineId: number,
  name: string,
  exercises: TemplateExercisePayload[],
) {
  return saveTemplateExercisesCore(await createServerSupabaseClient(), routineId, name, exercises)
}

export async function deleteTemplate(routineId: number) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  await supabase.from('routines').delete().eq('id', routineId).eq('user_id', user.id)
  revalidatePath('/workouts')
  redirect('/workouts')
}

// Called from client components to get templates for the import picker
export async function fetchUserTemplates(): Promise<RoutineWithExercises[]> {
  return getUserTemplates()
}
