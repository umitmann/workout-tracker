import 'server-only'

import { getServerAuthContext } from './serverAuth'
import { selectBestSession, aggregateHistory, buildPreviews } from './dalCores'
import type { SessionSetRow, WorkoutRef, DatedSet, PreviewSet } from './dalCores'
import { localDateStr, dateNDaysBefore } from './localDate'
import { isNoRowsError, requireQueryData } from './dataAccessError'
import { isMissingColumnError, isMissingFunctionError } from './schemaCompatibility'

export { isMissingColumnError, isMissingFunctionError } from './schemaCompatibility'

// Compatibility name retained for the established server-boundary contract;
// both references point at the single request-scoped verified auth cache.
const getAuthContext = getServerAuthContext

export async function getRecentWorkouts(limit = 5) {
  const { supabase, user } = await getServerAuthContext()
  if (!user) return []

  const result = await supabase
    .from('workouts')
    .select('id, date, sets(id)')
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .limit(limit)

  return requireQueryData(result, 'list recent workouts') ?? []
}

// Column combos to try, most-complete first, so either optional column
// (independently) not-yet-migrated still degrades to a working select —
// same shape as TEMPLATE_COL_VARIANTS below.
const SET_COLS = (opts: { restSeconds: boolean; difficulty: boolean }) =>
  `id, exercise_id, weight, reps, duration_minutes, distance,${opts.restSeconds ? ' rest_seconds,' : ''}${opts.difficulty ? ' difficulty,' : ''} exercises(name, category)`

const SET_COL_VARIANTS = [
  { restSeconds: true, difficulty: true },
  { restSeconds: true, difficulty: false },
  { restSeconds: false, difficulty: true },
  { restSeconds: false, difficulty: false },
]

function isMissingSetColumnError(error: unknown): boolean {
  return isMissingColumnError(error, 'rest_seconds') || isMissingColumnError(error, 'difficulty')
}

export async function getWorkoutWithSets(workoutId: number) {
  const { supabase, user } = await getServerAuthContext()
  if (!user) return null

  const [workoutResult, setsResult] = await Promise.all([
    supabase
      .from('workouts')
      .select('id, date, status, template_id, plan_id')
      .eq('id', workoutId)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('sets')
      .select(SET_COLS(SET_COL_VARIANTS[0]))
      .eq('workout_id', workoutId)
      .order('created_at', { ascending: true }),
  ])

  if (workoutResult.error) {
    if (isNoRowsError(workoutResult.error)) return null
    requireQueryData(workoutResult, 'load workout')
  }
  const workout = workoutResult.data
  if (!workout) return null

  // Fall back gracefully ONLY if a not-yet-migrated optional column
  // (rest_seconds and/or difficulty) caused the error — a genuine error must
  // not silently blank out the sets (that could wipe real data on the next
  // save). Tries each combo most-complete first until one succeeds.
  let sets: any = setsResult.data
  let error = setsResult.error
  for (let i = 1; error && isMissingSetColumnError(error) && i < SET_COL_VARIANTS.length; i++) {
    const { data, error: nextError } = await supabase
      .from('sets')
      .select(SET_COLS(SET_COL_VARIANTS[i]))
      .eq('workout_id', workoutId)
      .order('created_at', { ascending: true })
    sets = data
    error = nextError
  }
  if (error) requireQueryData({ data: sets, error }, 'load workout sets')

  return { ...workout, sets: sets ?? [] }
}

export type AvailableExercise = {
  id: number
  name: string
  category: string | null
  equipment: string | null
  muscles: string[] | null
  muscles_secondary: string[] | null
  creator_id?: string | null
  visibility?: 'platform' | 'public' | 'clients'
  video_url?: string | null
}

export async function getAllExercises(): Promise<AvailableExercise[]> {
  const { supabase, user } = await getAuthContext()
  if (!user) return []

  const enriched = await supabase.rpc('list_available_exercises_v2')
  if (!enriched.error) return (enriched.data ?? []) as AvailableExercise[]
  if (!isMissingFunctionError(enriched.error)) {
    return (requireQueryData(enriched, 'list available exercises') ?? []) as AvailableExercise[]
  }

  // Rolling-deploy fallback: Phase 18 remains readable while the additive
  // secondary-muscle RPC is being applied through the Supabase SQL Editor.
  const scoped = await supabase.rpc('list_available_exercises')
  if (!scoped.error) {
    return (scoped.data ?? []).map((exercise: Omit<AvailableExercise, 'muscles_secondary'>) => ({
      ...exercise,
      muscles_secondary: null,
    }))
  }
  if (!isMissingFunctionError(scoped.error)) {
    return (requireQueryData(scoped, 'list available exercises') ?? []) as AvailableExercise[]
  }

  // Safe rolling-deploy fallback until Phase 7 reaches the database. The
  // legacy policy exposes only the original authenticated catalog.
  const legacy = await supabase
    .from('exercises')
    .select('id, name, category, equipment, muscles, muscles_secondary')
    .order('name', { ascending: true })

  return (requireQueryData(legacy, 'list exercises') ?? []) as AvailableExercise[]
}

export async function getExercise(id: number) {
  const { supabase, user } = await getServerAuthContext()
  if (!user) return null

  const result = await supabase
    .from('exercises')
    .select('*')
    .eq('id', id)
    .single()

  if (isNoRowsError(result.error)) return null
  return requireQueryData(result, 'load exercise')
}

export async function getExerciseDetails(id: number) {
  const { supabase, user } = await getServerAuthContext()
  if (!user) return null

  const result = await supabase
    .from('exercises')
    .select('id, name, category, equipment, muscles, muscles_secondary, images, instructions, video_url, creator_id, visibility')
    .eq('id', id)
    .single()

  if (isMissingColumnError(result.error, 'video_url')) {
    const legacy = await supabase
      .from('exercises')
      .select('id, name, category, equipment, muscles, muscles_secondary, images, instructions')
      .eq('id', id)
      .single()
    if (isNoRowsError(legacy.error)) return null
    return requireQueryData(legacy, 'load exercise details')
  }
  if (isNoRowsError(result.error)) return null
  return requireQueryData(result, 'load exercise details')
}

const TEMPLATE_COLS = (opts: { tempo: boolean; setDetails: boolean; restSeconds: boolean }) =>
  `id, name, created_at, routine_exercises(id, exercise_id, sets, reps, weight, duration_minutes, distance,${opts.setDetails ? ' set_details,' : ''}${opts.tempo ? ' tempo,' : ''}${opts.restSeconds ? ' rest_seconds,' : ''} order, exercises(id, name, category))`

// Column combos to try, most-complete first, so unmigrated columns degrade.
const TEMPLATE_COL_VARIANTS = [
  { tempo: true, setDetails: true, restSeconds: true },
  { tempo: false, setDetails: true, restSeconds: true },
  { tempo: true, setDetails: false, restSeconds: true },
  { tempo: false, setDetails: false, restSeconds: true },
  { tempo: true, setDetails: true, restSeconds: false },
  { tempo: false, setDetails: true, restSeconds: false },
  { tempo: true, setDetails: false, restSeconds: false },
  { tempo: false, setDetails: false, restSeconds: false },
]

function isMissingTemplateColumnError(error: unknown): boolean {
  return (
    isMissingColumnError(error, 'tempo') ||
    isMissingColumnError(error, 'set_details') ||
    isMissingColumnError(error, 'rest_seconds')
  )
}

export async function getUserTemplates() {
  const { supabase, user } = await getServerAuthContext()
  if (!user) return []

  for (let index = 0; index < TEMPLATE_COL_VARIANTS.length; index++) {
    const variant = TEMPLATE_COL_VARIANTS[index]
    const result = await supabase
      .from('routines')
      .select(TEMPLATE_COLS(variant))
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (!result.error) return (result.data ?? []) as unknown as RoutineWithExercises[]
    if (
      !isMissingTemplateColumnError(result.error) ||
      index === TEMPLATE_COL_VARIANTS.length - 1
    ) {
      return (requireQueryData(result, 'list workout templates') ?? []) as unknown as RoutineWithExercises[]
    }
  }
  throw new Error('Template column fallback exhausted without a result')
}

export async function getTemplate(routineId: string | number) {
  const { supabase, user } = await getServerAuthContext()
  if (!user) return null

  for (let index = 0; index < TEMPLATE_COL_VARIANTS.length; index++) {
    const variant = TEMPLATE_COL_VARIANTS[index]
    const result = await supabase
      .from('routines')
      .select(TEMPLATE_COLS(variant))
      .eq('id', routineId)
      .eq('user_id', user.id)
      .single()
    if (!result.error) return result.data as unknown as RoutineWithExercises | null
    if (isNoRowsError(result.error)) return null
    if (
      !isMissingTemplateColumnError(result.error) ||
      index === TEMPLATE_COL_VARIANTS.length - 1
    ) {
      return requireQueryData(result, 'load workout template') as unknown as RoutineWithExercises | null
    }
  }
  throw new Error('Template column fallback exhausted without a result')
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
  sets: { reps: number | null; weight: number | null }[]
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
  const { supabase, user } = await getServerAuthContext()
  if (!user) return []

  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const result = await supabase
    .from('workouts')
    .select('id, date, status, template_id, sets(id)')
    .eq('user_id', user.id)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true })

  const data = requireQueryData(result, 'list calendar workouts')
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
  const { supabase, user } = await getServerAuthContext()
  if (!user) return { entries: [], previews: {} }

  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const result = await supabase
    .from('workouts')
    .select('id, date, status, template_id, sets(id, exercise_id, weight, reps, exercises(name))')
    .eq('user_id', user.id)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true })

  const rows = (requireQueryData(result, 'list calendar workouts with previews') ?? []) as any[]

  const entries: WorkoutCalendarEntry[] = rows.map((w) => ({
    id: w.id,
    date: w.date,
    status: w.status as WorkoutStatus,
    template_id: w.template_id ?? null,
    set_count: w.sets?.length ?? 0,
  }))

  type CalendarPreviewSetRow = {
    id: number
    exercise_id: number
    weight: number | null
    reps: number | null
    exercises: { name: string } | null
  }
  const setsByWorkout = new Map<number, PreviewSet[]>()
  for (const w of rows) {
    const orderedSets = [...((w.sets ?? []) as CalendarPreviewSetRow[])]
      .sort((a, b) => a.id - b.id)
    setsByWorkout.set(
      w.id,
      orderedSets.map((s) => ({
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
  sets: { weight: number | null; reps: number | null; duration_minutes: number | null; distance: number | null }[]
}

export async function getLastExercisePerformance(exerciseId: number): Promise<LastExercisePerformance | null> {
  const { supabase, user } = await getServerAuthContext()
  if (!user) return null

  // Find the most recent completed workout that actually contains this
  // exercise, keyed by exercise_id via sets -> workouts — NOT a fixed window
  // of the 50 most-recent workouts (an exercise rotated out for 50+ sessions
  // must still resolve to its real last session, same as all-time Best,
  // which has no such cap). `workouts!inner(...)` makes the join filtering
  // (user_id/status) exclude non-matching sets rows rather than just nulling
  // the embedded relation.
  const { data: latest } = await supabase
    .from('sets')
    .select('workout_id, workouts!inner(date, status, user_id)')
    .eq('exercise_id', exerciseId)
    .eq('workouts.user_id', user.id)
    .eq('workouts.status', 'completed')
    .order('date', { foreignTable: 'workouts', ascending: false })
    .limit(1)

  const latestRow = (latest as any)?.[0]
  if (!latestRow) return null

  const workoutId = latestRow.workout_id as number
  const date = latestRow.workouts.date as string

  // duration_minutes/distance are selected alongside weight/reps (WP-11,
  // checklist §19.8) so LastPerfModal can render cardio columns instead of
  // hardcoding weight/reps and showing em-dashes for every cardio set.
  const { data: sets } = await supabase
    .from('sets')
    .select('weight, reps, duration_minutes, distance')
    .eq('exercise_id', exerciseId)
    .eq('workout_id', workoutId)
    .order('id', { ascending: true })

  if (!sets?.length) return null

  return {
    date,
    sets: (sets as any[]).map((s) => ({
      weight: s.weight,
      reps: s.reps,
      duration_minutes: s.duration_minutes ?? null,
      distance: s.distance ?? null,
    })),
  }
}

// `today` is the caller's local calendar date (YYYY-MM-DD, from
// localDateStr() client-side) — the "last N days" window is a user-facing
// concept (checklist §7.8) so its boundary must be *my* days, not the
// server process's own clock/timezone (ADR-0005). All current call sites
// pass it explicitly; the fallback (localDateStr() evaluated here, on the
// server) only protects a future caller that forgets to, and would use the
// server's day rather than the user's — not a correct substitute.
export async function getBestExercisePerformance(exerciseId: number, limitDays?: number, today?: string): Promise<LastExercisePerformance | null> {
  const { supabase, user } = await getServerAuthContext()
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

  // duration_minutes/distance selected alongside weight/reps (WP-11,
  // checklist §19.8) — see getLastExercisePerformance above for rationale.
  const { data: sets } = await supabase
    .from('sets')
    .select('id, workout_id, weight, reps, duration_minutes, distance')
    .eq('exercise_id', exerciseId)
    .in('workout_id', workoutIds)
    .order('id', { ascending: true })

  const best = selectBestSession((sets ?? []) as SessionSetRow[], completedWorkouts as WorkoutRef[])
  if (!best) return null
  // This call site always selects duration_minutes/distance above, so
  // selectBestSession's generic (optional-field) SessionSet shape is always
  // fully populated here — normalize to LastExercisePerformance's contract.
  return {
    date: best.date,
    sets: best.sets.map((s) => ({
      weight: s.weight,
      reps: s.reps,
      duration_minutes: s.duration_minutes ?? null,
      distance: s.distance ?? null,
    })),
  }
}

export async function getExerciseHistory(exerciseId: number, limitDays = 90, today?: string): Promise<ExerciseHistoryPoint[]> {
  const { supabase, user } = await getServerAuthContext()
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
  const { supabase, user } = await getServerAuthContext()
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
  const { supabase, user } = await getServerAuthContext()
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
  const { supabase, user } = await getServerAuthContext()
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
  const { supabase, user } = await getServerAuthContext()
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
  id: string
  exercise_id: number
  sets: number
  reps: number | null
  weight: number | null
  duration_minutes: number | null
  distance: number | null
  set_details: SetDetail[] | null
  tempo: string | null // PT-prescribed DRUH tempo, "down-rest-up-hold"
  rest_seconds: number | null // PT-prescribed rest target (seconds); null = use the global stepper
  order: number
  exercises: { id: number; name: string; category: string | null }
}

export type RoutineWithExercises = {
  id: string
  name: string
  created_at: string
  routine_exercises: RoutineExerciseRow[]
}
