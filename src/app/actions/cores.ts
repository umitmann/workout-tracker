// Internal action cores — NOT a 'use server' module, so nothing here is
// reachable via the server-action POST boundary. The exported 'use server'
// actions in workouts.ts/sets.ts/templates.ts are thin wrappers that construct
// the real Supabase client and delegate here; tests inject a fake client.
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { isMissingColumnError, SetDetail } from '@/lib/dal'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type SupabaseServerClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

export type SetPayload = {
  exercise_id: number
  weight: number | null
  reps: number | null
  duration_minutes?: number | null
  distance?: number | null
  rest_seconds?: number | null
}

export type SetData = {
  weight?: number | null
  reps?: number | null
  duration_minutes?: number | null
  distance?: number | null
}

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

// Inserts sets, degrading gracefully if the rest_seconds column has not been
// migrated yet (retries once without it rather than failing the whole save).
async function insertSets(
  supabase: SupabaseServerClient,
  workoutId: number,
  userId: string,
  sets: SetPayload[],
) {
  if (sets.length === 0) return
  const rows = sets.map((s) => ({
    workout_id: workoutId,
    user_id: userId,
    exercise_id: s.exercise_id,
    weight: s.weight,
    reps: s.reps,
    duration_minutes: s.duration_minutes ?? null,
    distance: s.distance ?? null,
    rest_seconds: s.rest_seconds ?? null,
  }))

  const { error } = await supabase.from('sets').insert(rows)
  if (error && isMissingColumnError(error, 'rest_seconds')) {
    // rest_seconds column not migrated yet — retry without it rather than fail.
    const stripped = rows.map(({ rest_seconds, ...rest }) => rest)
    await supabase.from('sets').insert(stripped)
  }
}

// ADR-0005: the caller (client) always supplies the local calendar date —
// these cores never compute "today" themselves, which would use the
// server's clock/timezone rather than the user's.
export async function startWorkoutCore(supabase: SupabaseServerClient, date: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data, error } = await supabase
    .from('workouts')
    .insert({ user_id: user.id, date, status: 'in_progress' })
    .select('id')
    .single()

  if (error || !data) redirect('/dashboard')

  redirect(`/workout/${data.id}`)
}

export async function startWorkoutFromTemplateCore(
  supabase: SupabaseServerClient,
  templateId: string | number,
  date: string,
) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: workout, error: workoutError } = await supabase
    .from('workouts')
    .insert({ user_id: user.id, date, status: 'in_progress', template_id: templateId })
    .select('id')
    .single()

  if (workoutError || !workout) redirect('/dashboard')

  redirect(`/workout/${workout.id}`)
}

export async function saveWorkoutProgressCore(
  supabase: SupabaseServerClient,
  workoutId: number,
  sets: SetPayload[],
) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: workout } = await supabase
    .from('workouts')
    .select('id')
    .eq('id', workoutId)
    .eq('user_id', user.id)
    .single()

  if (!workout) return { error: 'Not found' }

  await supabase.from('sets').delete().eq('workout_id', workoutId)
  await insertSets(supabase, workoutId, user.id, sets)

  return { success: true }
}

export async function completeWorkoutCore(
  supabase: SupabaseServerClient,
  workoutId: number,
  sets: SetPayload[],
) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: workout } = await supabase
    .from('workouts')
    .select('id')
    .eq('id', workoutId)
    .eq('user_id', user.id)
    .single()

  if (!workout) redirect('/workouts')

  await supabase.from('sets').delete().eq('workout_id', workoutId)
  await insertSets(supabase, workoutId, user.id, sets)

  await supabase.from('workouts').update({ status: 'completed' }).eq('id', workout.id)
  revalidatePath('/dashboard')
  revalidatePath('/workouts')
  redirect('/dashboard')
}

export async function addSetCore(
  supabase: SupabaseServerClient,
  workoutId: number,
  exerciseId: number,
  data: SetData,
) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: workout } = await supabase
    .from('workouts')
    .select('id')
    .eq('id', workoutId)
    .eq('user_id', user.id)
    .single()

  if (!workout) return { error: 'Workout not found' }

  const { data: set, error } = await supabase
    .from('sets')
    .insert({
      workout_id: workoutId,
      exercise_id: exerciseId,
      user_id: user.id,
      ...data,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  return { id: set.id as number }
}

export async function deleteSetCore(supabase: SupabaseServerClient, setId: number) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  await supabase
    .from('sets')
    .delete()
    .eq('id', setId)
    .eq('user_id', user.id)

  return { success: true }
}

export async function saveTemplateExercisesCore(
  supabase: SupabaseServerClient,
  routineId: number,
  name: string,
  exercises: TemplateExercisePayload[],
) {
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
