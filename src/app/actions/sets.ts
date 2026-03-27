'use server'

import { createServerSupabaseClient } from '@/lib/supabase-server'

type SetData = {
  weight?: number | null
  reps?: number | null
  duration_minutes?: number | null
  distance?: number | null
}

export async function addSet(workoutId: number, exerciseId: number, data: SetData) {
  const supabase = await createServerSupabaseClient()
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

export async function deleteSet(setId: number) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  await supabase
    .from('sets')
    .delete()
    .eq('id', setId)
    .eq('user_id', user.id)

  return { success: true }
}
