'use server'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getUserTemplates, RoutineWithExercises } from '@/lib/dal'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { saveTemplateExercisesCore, TemplateExercisePayload } from './cores'
import { mergeWorkoutSetsIntoTemplate, NextTimeTemplateExercise, NextTimeSet } from '@/lib/nextTimeTemplate'

export type { TemplateExercisePayload } from './cores'

type RoutineExerciseSnapshotRow = {
  exercise_id: number
  sets: number
  reps: number | null
  weight: number | null
  duration_minutes: number | null
  distance: number | null
  set_details: { weight: number | null; reps: number | null }[] | null
  tempo: string | null
  rest_seconds: number | null
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
  return { id: data.id as string }
}

export async function saveTemplateExercises(
  routineId: string,
  name: string,
  exercises: TemplateExercisePayload[],
) {
  return saveTemplateExercisesCore(await createServerSupabaseClient(), routineId, name, exercises)
}

export async function deleteTemplate(routineId: string) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data, error } = await supabase
    .from('routines')
    .delete()
    .eq('id', routineId)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle()

  if (error || !data) {
    return { error: error?.message ?? 'Template not found or access denied' }
  }
  revalidatePath('/workouts')
  return { success: true }
}

// Called from client components to get templates for the import picker
export async function fetchUserTemplates(): Promise<RoutineWithExercises[]> {
  return getUserTemplates()
}

// Updates only the template linked to the caller's own workout. The template's
// existing tempo/rest/order metadata is preserved; current workout sets replace
// weight/reps/duration prescriptions and newly-added exercises append.
export async function updateLinkedTemplateFromWorkout(workoutId: number) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: workout, error: workoutError } = await supabase
    .from('workouts')
    .select('id, template_id')
    .eq('id', workoutId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (workoutError || !workout?.template_id) return { error: workoutError?.message ?? 'This workout is not linked to one of your templates' }

  const { data: routine, error: routineError } = await supabase
    .from('routines')
    .select('id, name, routine_exercises(exercise_id, sets, reps, weight, duration_minutes, distance, set_details, tempo, rest_seconds, order)')
    .eq('id', workout.template_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (routineError || !routine) return { error: routineError?.message ?? 'Template not found or access denied' }

  const { data: sets, error: setsError } = await supabase
    .from('sets')
    .select('exercise_id, weight, reps, duration_minutes, distance')
    .eq('workout_id', workoutId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
  if (setsError) return { error: setsError.message }
  if (!sets?.length) return { error: 'Add at least one set before updating the template' }

  const routineRows = (routine.routine_exercises ?? []) as RoutineExerciseSnapshotRow[]
  const existing = routineRows.map((row): NextTimeTemplateExercise => ({
    exerciseId: row.exercise_id,
    sets: row.sets,
    reps: row.reps,
    weight: row.weight,
    duration_minutes: row.duration_minutes,
    distance: row.distance,
    set_details: row.set_details,
    tempo: row.tempo,
    rest_seconds: row.rest_seconds,
    order: row.order,
  }))
  const merged = mergeWorkoutSetsIntoTemplate(existing, sets as NextTimeSet[])
  return saveTemplateExercisesCore(supabase, String(routine.id), routine.name, merged)
}
