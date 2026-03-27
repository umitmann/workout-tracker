'use server'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type SetPayload = {
  exercise_id: number
  weight: number | null
  reps: number | null
  duration_minutes?: number | null
  distance?: number | null
}

export async function startWorkout() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('workouts')
    .insert({ user_id: user.id, date: today })
    .select('id')
    .single()

  if (error || !data) redirect('/dashboard')

  redirect(`/workout/${data.id}`)
}

export async function finishWorkout(workoutId: number, sets: SetPayload[]) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: workout } = await supabase
    .from('workouts')
    .select('id')
    .eq('id', workoutId)
    .eq('user_id', user.id)
    .single()

  if (!workout) redirect('/dashboard')

  // Clear any previously saved sets, then bulk-insert current state
  await supabase.from('sets').delete().eq('workout_id', workoutId)

  if (sets.length > 0) {
    await supabase.from('sets').insert(
      sets.map((s) => ({
        workout_id: workoutId,
        exercise_id: s.exercise_id,
        user_id: user.id,
        weight: s.weight,
        reps: s.reps,
        duration_minutes: s.duration_minutes ?? null,
        distance: s.distance ?? null,
      })),
    )
  }

  revalidatePath('/dashboard')
  redirect('/dashboard')
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
  redirect('/dashboard')
}
