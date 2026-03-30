import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from './supabase-server'

// Service-role client — no cookies, safe to use inside unstable_cache
function createServiceSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// Memoised per-request — multiple DAL calls on the same page share one getUser() round-trip
const getAuthContext = cache(async () => {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
})

export async function getRecentWorkouts(limit = 5) {
  const { supabase, user } = await getAuthContext()
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
  const { supabase, user } = await getAuthContext()
  if (!user) return null

  const [{ data: workout }, { data: sets }] = await Promise.all([
    supabase
      .from('workouts')
      .select('id, date, status, template_id')
      .eq('id', workoutId)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('sets')
      .select('id, exercise_id, weight, reps, duration_minutes, distance, exercises(name)')
      .eq('workout_id', workoutId)
      .order('created_at', { ascending: true }),
  ])

  if (!workout) return null
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

export async function getUserTemplates() {
  const { supabase, user } = await getAuthContext()
  if (!user) return []

  const { data } = await supabase
    .from('routines')
    .select('id, name, created_at, routine_exercises(id, exercise_id, sets, reps, weight, order, exercises(id, name, category))')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return (data ?? []) as unknown as RoutineWithExercises[]
}

export async function getTemplate(routineId: string | number) {
  const { supabase, user } = await getAuthContext()
  if (!user) return null

  const { data } = await supabase
    .from('routines')
    .select('id, name, created_at, routine_exercises(id, exercise_id, sets, reps, weight, order, exercises(id, name, category))')
    .eq('id', routineId)
    .eq('user_id', user.id)
    .single()

  return data as unknown as RoutineWithExercises | null
}

export type WorkoutStatus = 'planned' | 'in_progress' | 'completed'

export type WorkoutCalendarEntry = {
  id: number
  date: string
  status: WorkoutStatus
  template_id: string | null
  set_count: number
}

export type ExerciseHistoryPoint = {
  date: string
  maxWeight: number | null
  maxReps: number | null
  totalVolume: number | null
  setCount: number
}

export async function getMonthWorkouts(year: number, month: number): Promise<WorkoutCalendarEntry[]> {
  const { supabase, user } = await getAuthContext()
  if (!user) return []

  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data } = await supabase
    .from('workouts')
    .select('id, date, status, template_id, sets(id)')
    .eq('user_id', user.id)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true })

  return (data ?? []).map((w: any) => ({
    id: w.id,
    date: w.date,
    status: w.status as WorkoutStatus,
    template_id: w.template_id ?? null,
    set_count: w.sets?.length ?? 0,
  }))
}

export type LastExercisePerformance = {
  date: string
  sets: { weight: number | null; reps: number | null }[]
}

export async function getLastExercisePerformance(exerciseId: number): Promise<LastExercisePerformance | null> {
  const { supabase, user } = await getAuthContext()
  if (!user) return null

  // Get recent completed workouts (desc) for this user
  const { data: completedWorkouts } = await supabase
    .from('workouts')
    .select('id, date')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .order('date', { ascending: false })
    .limit(50)

  if (!completedWorkouts?.length) return null

  const workoutIds = completedWorkouts.map((w: any) => w.id)

  const { data: sets } = await supabase
    .from('sets')
    .select('workout_id, weight, reps')
    .eq('exercise_id', exerciseId)
    .in('workout_id', workoutIds)
    .order('id', { ascending: true })

  if (!sets?.length) return null

  // Group sets by workout, preserving insertion order
  const setsByWorkout = new Map<number, { weight: number | null; reps: number | null }[]>()
  for (const s of sets as any[]) {
    if (!setsByWorkout.has(s.workout_id)) setsByWorkout.set(s.workout_id, [])
    setsByWorkout.get(s.workout_id)!.push({ weight: s.weight, reps: s.reps })
  }

  // Return all sets from the most recent completed workout that has this exercise
  for (const w of completedWorkouts) {
    if (setsByWorkout.has(w.id)) {
      return {
        date: w.date,
        sets: setsByWorkout.get(w.id)!,
      }
    }
  }

  return null
}

export async function getBestExercisePerformance(exerciseId: number, limitDays?: number): Promise<LastExercisePerformance | null> {
  const { supabase, user } = await getAuthContext()
  if (!user) return null

  let query = supabase
    .from('workouts')
    .select('id, date')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .order('date', { ascending: false })

  if (limitDays != null) {
    const since = new Date()
    since.setDate(since.getDate() - limitDays)
    query = (query as any).gte('date', since.toISOString().split('T')[0])
  }

  const { data: completedWorkouts } = await query
  if (!completedWorkouts?.length) return null

  const workoutIds = completedWorkouts.map((w: any) => w.id)
  const dateById = new Map(completedWorkouts.map((w: any) => [w.id, w.date as string]))

  const { data: sets } = await supabase
    .from('sets')
    .select('id, workout_id, weight, reps')
    .eq('exercise_id', exerciseId)
    .in('workout_id', workoutIds)
    .order('id', { ascending: true })

  if (!sets?.length) return null

  // Find the workout with the highest single-set weight
  let bestWorkoutId: number | null = null
  let bestWeight = -Infinity
  for (const s of sets as any[]) {
    if (s.weight != null && s.weight > bestWeight) {
      bestWeight = s.weight
      bestWorkoutId = s.workout_id
    }
  }

  // Fallback: if no weight data, use most recent workout that has this exercise
  if (bestWorkoutId == null) {
    const setsByWorkout = new Map<number, { weight: number | null; reps: number | null }[]>()
    for (const s of sets as any[]) {
      if (!setsByWorkout.has(s.workout_id)) setsByWorkout.set(s.workout_id, [])
      setsByWorkout.get(s.workout_id)!.push({ weight: s.weight, reps: s.reps })
    }
    for (const w of completedWorkouts as any[]) {
      if (setsByWorkout.has(w.id)) return { date: w.date, sets: setsByWorkout.get(w.id)! }
    }
    return null
  }

  return {
    date: dateById.get(bestWorkoutId)!,
    sets: (sets as any[])
      .filter((s) => s.workout_id === bestWorkoutId)
      .map((s) => ({ weight: s.weight, reps: s.reps })),
  }
}

export async function getExerciseHistory(exerciseId: number, limitDays = 90): Promise<ExerciseHistoryPoint[]> {
  const { supabase, user } = await getAuthContext()
  if (!user) return []

  const since = new Date()
  since.setDate(since.getDate() - limitDays)
  const sinceStr = since.toISOString().split('T')[0]

  // Step 1: get completed workout IDs + dates for this user in the window
  const { data: completedWorkouts } = await supabase
    .from('workouts')
    .select('id, date')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .gte('date', sinceStr)
    .order('date', { ascending: true })

  if (!completedWorkouts?.length) return []

  const workoutIds = completedWorkouts.map((w: any) => w.id)
  const dateById = new Map(completedWorkouts.map((w: any) => [w.id, w.date as string]))

  // Step 2: get sets for this exercise from those workouts
  const { data: sets } = await supabase
    .from('sets')
    .select('workout_id, weight, reps')
    .eq('exercise_id', exerciseId)
    .in('workout_id', workoutIds)

  if (!sets?.length) return []

  // Group by date
  const byDate = new Map<string, { weights: number[]; reps: number[]; volumes: number[]; count: number }>()
  for (const s of sets as any[]) {
    const date = dateById.get(s.workout_id)
    if (!date) continue
    if (!byDate.has(date)) byDate.set(date, { weights: [], reps: [], volumes: [], count: 0 })
    const entry = byDate.get(date)!
    entry.count++
    if (s.weight != null) entry.weights.push(s.weight)
    if (s.reps != null) entry.reps.push(s.reps)
    if (s.weight != null && s.reps != null) entry.volumes.push(s.weight * s.reps)
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, e]) => ({
      date,
      maxWeight: e.weights.length > 0 ? Math.max(...e.weights) : null,
      maxReps: e.reps.length > 0 ? Math.max(...e.reps) : null,
      totalVolume: e.volumes.length > 0 ? e.volumes.reduce((a, b) => a + b, 0) : null,
      setCount: e.count,
    }))
}

export type RoutineExerciseRow = {
  id: number
  exercise_id: number
  sets: number
  reps: number
  weight: number | null
  order: number
  exercises: { id: number; name: string; category: string | null }
}

export type RoutineWithExercises = {
  id: number
  name: string
  created_at: string
  routine_exercises: RoutineExerciseRow[]
}
