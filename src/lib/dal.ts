import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from './supabase-server'

// Service-role client — no cookies, safe to use inside unstable_cache
function createServiceSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function getRecentWorkouts(limit = 5) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('workouts')
    .select('id, date, sets(id)')
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .limit(limit)

  return data ?? []
}

export async function getWorkoutWithSets(workoutId: number) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: workout } = await supabase
    .from('workouts')
    .select('id, date')
    .eq('id', workoutId)
    .eq('user_id', user.id)
    .single()

  if (!workout) return null

  const { data: sets } = await supabase
    .from('sets')
    .select('id, exercise_id, weight, reps, duration_minutes, distance, exercises(name)')
    .eq('workout_id', workoutId)
    .order('created_at', { ascending: true })

  return { ...workout, sets: sets ?? [] }
}

export const getAllExercises = unstable_cache(
  async () => {
    const supabase = createServiceSupabaseClient()

    const { data } = await supabase
      .from('exercises')
      .select('id, name, category, equipment')
      .order('name', { ascending: true })

    return data ?? []
  },
  ['all-exercises'],
  { revalidate: false },
)

export async function getExercise(id: number) {
  const supabase = await createServerSupabaseClient()

  const { data } = await supabase
    .from('exercises')
    .select('*')
    .eq('id', id)
    .single()

  return data
}

export async function getExerciseDetails(id: number) {
  const supabase = await createServerSupabaseClient()

  const { data } = await supabase
    .from('exercises')
    .select('id, name, category, equipment, muscles, muscles_secondary, images, instructions')
    .eq('id', id)
    .single()

  return data
}
