import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from './supabase-server'
import { selectBestSession, aggregateHistory, buildPreviews } from './dalCores'
import type { SessionSetRow, WorkoutRef, DatedSet } from './dalCores'
import { localDateStr, dateNDaysBefore } from './localDate'

// True only when a query failed because a column does not exist (e.g. a not-yet
// migrated rest_seconds). Postgres undefined_column = 42703; PostgREST surfaces
// it via code or a "does not exist" message mentioning the column.
export function isMissingColumnError(error: unknown, column: string): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: string; message?: string }
  if (e.code === '42703') return true
  const msg = (e.message ?? '').toLowerCase()
  return msg.includes(column.toLowerCase()) && msg.includes('does not exist')
}

// True only when an RPC call failed because the function does not exist yet
// (not-yet-migrated). PostgREST surfaces this as PGRST202; Postgres itself as
// undefined_function = 42883. Any other error (e.g. a real constraint
// violation inside the function) must NOT be treated as "try the fallback".
export function isMissingFunctionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: string; message?: string }
  if (e.code === 'PGRST202' || e.code === '42883') return true
  const msg = (e.message ?? '').toLowerCase()
  return msg.includes('function') && msg.includes('does not exist')
}

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

  const [{ data: workout }, setsResult] = await Promise.all([
    supabase
      .from('workouts')
      .select('id, date, status, template_id')
      .eq('id', workoutId)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('sets')
      .select('id, exercise_id, weight, reps, duration_minutes, distance, rest_seconds, exercises(name, category)')
      .eq('workout_id', workoutId)
      .order('created_at', { ascending: true }),
  ])

  if (!workout) return null

  // Fall back gracefully ONLY if the rest_seconds column has not been migrated
  // yet — a genuine error must not silently blank out the sets (that could wipe
  // real data on the next save).
  let sets: any = setsResult.data
  if (setsResult.error && isMissingColumnError(setsResult.error, 'rest_seconds')) {
    const { data } = await supabase
      .from('sets')
      .select('id, exercise_id, weight, reps, duration_minutes, distance, exercises(name, category)')
      .eq('workout_id', workoutId)
      .order('created_at', { ascending: true })
    sets = data
  }

  return { ...workout, sets: sets ?? [] }
}

export const getAllExercises = unstable_cache(
  async () => {
    const supabase = createServiceSupabaseClient()

    const { data } = await supabase
      .from('exercises')
      .select('id, name, category, equipment, muscles')
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

const TEMPLATE_COLS = (opts: { tempo: boolean; setDetails: boolean }) =>
  `id, name, created_at, routine_exercises(id, exercise_id, sets, reps, weight, duration_minutes, distance,${opts.setDetails ? ' set_details,' : ''}${opts.tempo ? ' tempo,' : ''} order, exercises(id, name, category))`

// Column combos to try, most-complete first, so unmigrated columns degrade.
const TEMPLATE_COL_VARIANTS = [
  { tempo: true, setDetails: true },
  { tempo: false, setDetails: true },
  { tempo: true, setDetails: false },
  { tempo: false, setDetails: false },
]

export async function getUserTemplates() {
  const { supabase, user } = await getAuthContext()
  if (!user) return []

  for (const variant of TEMPLATE_COL_VARIANTS) {
    const result = await supabase
      .from('routines')
      .select(TEMPLATE_COLS(variant))
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (!result.error) return (result.data ?? []) as unknown as RoutineWithExercises[]
    if (!isMissingColumnError(result.error, 'tempo') && !isMissingColumnError(result.error, 'set_details')) break
  }
  return []
}

export async function getTemplate(routineId: string | number) {
  const { supabase, user } = await getAuthContext()
  if (!user) return null

  for (const variant of TEMPLATE_COL_VARIANTS) {
    const result = await supabase
      .from('routines')
      .select(TEMPLATE_COLS(variant))
      .eq('id', routineId)
      .eq('user_id', user.id)
      .single()
    if (!result.error) return result.data as unknown as RoutineWithExercises | null
    if (!isMissingColumnError(result.error, 'tempo') && !isMissingColumnError(result.error, 'set_details')) break
  }
  return null
}

export type WorkoutStatus = 'planned' | 'in_progress' | 'completed'

export type WorkoutCalendarEntry = {
  id: number
  date: string
  status: WorkoutStatus
  template_id: string | null
  set_count: number
}

export type WorkoutPreviewExercise = {
  exerciseId: number
  exerciseName: string
  setCount: number
  firstSetReps: number | null
  firstSetWeight: number | null
}

export type MonthWorkoutsWithPreviews = {
  entries: WorkoutCalendarEntry[]
  previews: Record<number, WorkoutPreviewExercise[]>
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

export async function getMonthWorkoutsWithPreviews(
  year: number,
  month: number,
): Promise<MonthWorkoutsWithPreviews> {
  const { supabase, user } = await getAuthContext()
  if (!user) return { entries: [], previews: {} }

  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data } = await supabase
    .from('workouts')
    .select('id, date, status, template_id, sets(id, exercise_id, weight, reps, exercises(name))')
    .eq('user_id', user.id)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true })

  const rows = (data ?? []) as any[]

  const entries: WorkoutCalendarEntry[] = rows.map((w) => ({
    id: w.id,
    date: w.date,
    status: w.status as WorkoutStatus,
    template_id: w.template_id ?? null,
    set_count: w.sets?.length ?? 0,
  }))

  const setsByWorkout = new Map<number, { exercise_id: number; exercise_name: string; weight: number | null; reps: number | null }[]>()
  for (const w of rows) {
    setsByWorkout.set(
      w.id,
      (w.sets ?? []).map((s: any) => ({
        exercise_id: s.exercise_id,
        exercise_name: s.exercises?.name ?? String(s.exercise_id),
        weight: s.weight,
        reps: s.reps,
      })),
    )
  }

  const previews = buildPreviews(rows, setsByWorkout)

  return { entries, previews }
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

// `today` is the caller's local calendar date (YYYY-MM-DD, from
// localDateStr() client-side) — the "last N days" window is a user-facing
// concept (checklist §7.8) so its boundary must be *my* days, not the
// server process's own clock/timezone (ADR-0005). All current call sites
// pass it explicitly; the fallback (localDateStr() evaluated here, on the
// server) only protects a future caller that forgets to, and would use the
// server's day rather than the user's — not a correct substitute.
export async function getBestExercisePerformance(exerciseId: number, limitDays?: number, today?: string): Promise<LastExercisePerformance | null> {
  const { supabase, user } = await getAuthContext()
  if (!user) return null

  let query = supabase
    .from('workouts')
    .select('id, date')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .order('date', { ascending: false })

  if (limitDays != null) {
    query = (query as any).gte('date', dateNDaysBefore(today ?? localDateStr(), limitDays))
  }

  const { data: completedWorkouts } = await query
  if (!completedWorkouts?.length) return null

  const workoutIds = completedWorkouts.map((w: any) => w.id)

  const { data: sets } = await supabase
    .from('sets')
    .select('id, workout_id, weight, reps')
    .eq('exercise_id', exerciseId)
    .in('workout_id', workoutIds)
    .order('id', { ascending: true })

  return selectBestSession((sets ?? []) as SessionSetRow[], completedWorkouts as WorkoutRef[])
}

export async function getExerciseHistory(exerciseId: number, limitDays = 90, today?: string): Promise<ExerciseHistoryPoint[]> {
  const { supabase, user } = await getAuthContext()
  if (!user) return []

  const sinceStr = dateNDaysBefore(today ?? localDateStr(), limitDays)

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

  const dated: DatedSet[] = (sets as any[])
    .filter((s) => dateById.has(s.workout_id))
    .map((s) => ({ date: dateById.get(s.workout_id)!, weight: s.weight, reps: s.reps }))

  return aggregateHistory(dated)
}

// ─── Report / export queries ─────────────────────────────────────────────────

export type RangeWorkoutRow = {
  id: number
  date: string
  sets: {
    exercise_id: number
    weight: number | null
    reps: number | null
    duration_minutes: number | null
    distance: number | null
    rest_seconds: number | null
    exercises: { name: string; category: string | null } | null
  }[]
}

// Completed workouts (with sets + exercise names) between two YYYY-MM-DD dates.
export async function getWorkoutsInRange(from: string, to: string): Promise<RangeWorkoutRow[]> {
  const { supabase, user } = await getAuthContext()
  if (!user) return []

  const withRest =
    'id, date, sets(exercise_id, weight, reps, duration_minutes, distance, rest_seconds, created_at, exercises(name, category))'
  const withoutRest =
    'id, date, sets(exercise_id, weight, reps, duration_minutes, distance, created_at, exercises(name, category))'

  const build = (cols: string) =>
    supabase
      .from('workouts')
      .select(cols)
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true })

  let result = await build(withRest)
  if (result.error && isMissingColumnError(result.error, 'rest_seconds')) {
    result = await build(withoutRest) // rest_seconds not migrated yet
  }

  return ((result.data ?? []) as any[]).map((w: any) => ({
    id: w.id,
    date: w.date,
    sets: [...(w.sets ?? [])]
      .sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)))
      .map((s: any) => ({
        exercise_id: s.exercise_id,
        weight: s.weight,
        reps: s.reps,
        duration_minutes: s.duration_minutes,
        distance: s.distance,
        rest_seconds: s.rest_seconds ?? null,
        exercises: s.exercises ?? null,
      })),
  }))
}

export type BodyWeightRow = { date: string; weight: number }

// Bodyweight log entries between two dates. Tolerates the table not existing yet.
export async function getBodyWeightsInRange(from: string, to: string): Promise<BodyWeightRow[]> {
  const { supabase, user } = await getAuthContext()
  if (!user) return []

  const { data, error } = await supabase
    .from('body_weights')
    .select('date, weight')
    .eq('user_id', user.id)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true })

  if (error) return [] // table may not be migrated yet
  return (data ?? []) as BodyWeightRow[]
}

// Recent bodyweight entries for the dashboard widget (newest first).
export async function getRecentBodyWeights(limit = 30): Promise<BodyWeightRow[]> {
  const { supabase, user } = await getAuthContext()
  if (!user) return []

  const { data, error } = await supabase
    .from('body_weights')
    .select('date, weight')
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .limit(limit)

  if (error) return []
  return (data ?? []) as BodyWeightRow[]
}

export type SetDetail = { reps: number | null; weight: number | null }

// Per-user, per-exercise notes. Tolerates the table not existing yet.
export async function getExerciseNotes(exerciseIds: number[]): Promise<Record<number, string>> {
  const { supabase, user } = await getAuthContext()
  if (!user || exerciseIds.length === 0) return {}

  const { data, error } = await supabase
    .from('exercise_notes')
    .select('exercise_id, note')
    .eq('user_id', user.id)
    .in('exercise_id', exerciseIds)

  if (error) return {}
  const map: Record<number, string> = {}
  for (const r of (data ?? []) as { exercise_id: number; note: string | null }[]) {
    if (r.note) map[r.exercise_id] = r.note
  }
  return map
}

export type RoutineExerciseRow = {
  id: number
  exercise_id: number
  sets: number
  reps: number | null
  weight: number | null
  duration_minutes: number | null
  distance: number | null
  set_details: SetDetail[] | null
  tempo: string | null // PT-prescribed DRUH tempo, "down-rest-up-hold"
  order: number
  exercises: { id: number; name: string; category: string | null }
}

export type RoutineWithExercises = {
  id: number
  name: string
  created_at: string
  routine_exercises: RoutineExerciseRow[]
}
