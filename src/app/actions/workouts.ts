'use server'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getWorkoutWithSets, getMonthWorkouts, getMonthWorkoutsWithPreviews, WorkoutCalendarEntry, WorkoutPreviewExercise, MonthWorkoutsWithPreviews } from '@/lib/dal'
import { saveWorkoutProgressCore, completeWorkoutCore, startWorkoutCore, startWorkoutFromTemplateCore, logWorkoutForDateCore, SetPayload } from './cores'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// ADR-0005: the server never decides "today" — the client always passes its
// own local calendar date (via localDateStr()). date is required precisely
// so no call site can silently reintroduce a server-clock fallback.

// Type lives in dal.ts — re-exported here so existing imports keep working
export type { WorkoutPreviewExercise, MonthWorkoutsWithPreviews } from '@/lib/dal'

export async function fetchWorkoutPreview(workoutId: number): Promise<WorkoutPreviewExercise[]> {
  const workout = await getWorkoutWithSets(workoutId)
  if (!workout) return []

  const grouped = new Map<number, WorkoutPreviewExercise>()
  for (const s of workout.sets) {
    const existing = grouped.get(s.exercise_id)
    if (!existing) {
      grouped.set(s.exercise_id, {
        exerciseId: s.exercise_id,
        exerciseName: (s.exercises as unknown as { name: string } | null)?.name ?? String(s.exercise_id),
        setCount: 1,
        firstSetReps: s.reps,
        firstSetWeight: s.weight,
      })
    } else {
      existing.setCount++
    }
  }
  return Array.from(grouped.values())
}

export type { SetPayload } from './cores'

export async function startWorkout(date: string) {
  return startWorkoutCore(await createServerSupabaseClient(), date)
}

export async function startWorkoutFromTemplate(templateId: string | number, date: string) {
  return startWorkoutFromTemplateCore(await createServerSupabaseClient(), templateId, date)
}

// Creates an in_progress workout for any date (for logging in hindsight or today)
export async function logWorkoutForDate(date: string, templateId?: string) {
  return logWorkoutForDateCore(await createServerSupabaseClient(), date, templateId)
}

// Creates a planned workout for a future date
export async function scheduleWorkout(date: string, templateId?: string) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data, error } = await supabase
    .from('workouts')
    .insert({ user_id: user.id, date, status: 'planned', template_id: templateId ?? null })
    .select('id')
    .single()

  if (error || !data) return { error: error?.message ?? 'Failed to schedule' }
  revalidatePath('/workouts')
  return { id: data.id as number }
}

// Transitions a planned workout to in_progress, pre-populates sets, redirects to logger
export async function startPlannedWorkout(workoutId: number) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: workout } = await supabase
    .from('workouts')
    .select('id, template_id')
    .eq('id', workoutId)
    .eq('user_id', user.id)
    .single()

  if (!workout) redirect('/workouts')

  await supabase.from('workouts').update({ status: 'in_progress' }).eq('id', workout.id)
  redirect(`/workout/${workout.id}`)
}

// Saves sets without completing — stays in_progress, no redirect
export async function saveWorkoutProgress(workoutId: number, sets: SetPayload[]) {
  return saveWorkoutProgressCore(await createServerSupabaseClient(), workoutId, sets)
}

// Saves sets and marks workout as completed — updates exercise history, redirects to calendar
export async function completeWorkout(workoutId: number, sets: SetPayload[]) {
  return completeWorkoutCore(await createServerSupabaseClient(), workoutId, sets)
}

export async function deleteWorkout(workoutId: number) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  await supabase
    .from('workouts')
    .delete()
    .eq('id', workoutId)
    .eq('user_id', user.id)

  revalidatePath('/dashboard')
  revalidatePath('/workouts')
  redirect('/dashboard')
}

// Thin client-callable wrapper so CalendarView can fetch months without router.push
export async function fetchMonthWorkouts(year: number, month: number): Promise<WorkoutCalendarEntry[]> {
  return getMonthWorkouts(year, month)
}

export async function fetchMonthWorkoutsWithPreviews(year: number, month: number): Promise<MonthWorkoutsWithPreviews> {
  return getMonthWorkoutsWithPreviews(year, month)
}

// Soft-delete — no redirect, caller patches local UI state
export async function deleteWorkoutSoft(workoutId: number): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('workouts')
    .delete()
    .eq('id', workoutId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  revalidatePath('/workouts')
  return {}
}

export async function reopenWorkout(workoutId: number) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  await supabase
    .from('workouts')
    .update({ status: 'in_progress' })
    .eq('id', workoutId)
    .eq('user_id', user.id)

  redirect(`/workout/${workoutId}`)
}

// Legacy — kept for any remaining references; prefer completeWorkout
export async function finishWorkout(workoutId: number, sets: SetPayload[]) {
  return completeWorkout(workoutId, sets)
}
