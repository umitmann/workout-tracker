'use server'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getUserTemplates, isMissingColumnError, RoutineWithExercises, SetDetail } from '@/lib/dal'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type TemplateExercisePayload = {
  exerciseId: number
  sets: number
  reps: number | null
  weight: number | null
  duration_minutes: number | null
  distance: number | null
  set_details: SetDetail[] | null
  tempo: string | null
  order: number
}

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
  client?: Awaited<ReturnType<typeof createServerSupabaseClient>>,
) {
  const supabase = client ?? (await createServerSupabaseClient())
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: routine } = await supabase
    .from('routines')
    .select('id')
    .eq('id', routineId)
    .eq('user_id', user.id)
    .single()

  if (!routine) return { error: 'Not found' }

  // Update name
  await supabase.from('routines').update({ name }).eq('id', routineId)

  // Replace exercises
  await supabase.from('routine_exercises').delete().eq('routine_id', routineId)

  if (exercises.length > 0) {
    const rows: Record<string, unknown>[] = exercises.map((e) => ({
      routine_id: routineId,
      exercise_id: e.exerciseId,
      sets: e.sets,
      reps: e.reps,
      weight: e.weight,
      duration_minutes: e.duration_minutes,
      distance: e.distance,
      set_details: e.set_details,
      tempo: e.tempo,
      order: e.order,
    }))
    // Retry, dropping optional columns that haven't been migrated yet.
    let attempt = rows
    let lastError: string | null = null
    for (let i = 0; i < 3; i++) {
      const { error } = await supabase.from('routine_exercises').insert(attempt)
      if (!error) { lastError = null; break }
      lastError = error.message
      if (isMissingColumnError(error, 'tempo')) {
        attempt = attempt.map(({ tempo, ...rest }) => rest)
      } else if (isMissingColumnError(error, 'set_details')) {
        attempt = attempt.map(({ set_details, ...rest }) => rest)
      } else {
        break
      }
    }
    if (lastError) return { error: lastError }
  }

  revalidatePath('/workouts')
  return { success: true }
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
