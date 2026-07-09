// Internal action cores — NOT a 'use server' module, so nothing here is
// reachable via the server-action POST boundary. The exported 'use server'
// actions in workouts.ts/sets.ts/templates.ts are thin wrappers that construct
// the real Supabase client and delegate here; tests inject a fake client.
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { isMissingColumnError, isMissingFunctionError, SetDetail } from '@/lib/dal'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type SupabaseServerClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

export type SetData = {
  weight?: number | null
  reps?: number | null
  duration_minutes?: number | null
  distance?: number | null
  rest_seconds?: number | null
}

export type SetPayload = SetData & {
  exercise_id: number
  weight: number | null
  reps: number | null
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

// A non-negative numeric field: null stays null (legitimate — §4.7/§4.8,
// "displays — for weight/reps"); anything that isn't a finite, non-negative
// number (NaN, ±Infinity, negatives) is coerced to null rather than
// rejecting the whole set — the same per-field convention as
// logBodyWeight's `Number.isFinite(weight) && weight > 0` guard
// (bodyweight.ts), loosened to allow 0 (a 0kg/bodyweight set is legitimate).
function cleanNonNegative(value: number | null | undefined): number | null {
  if (value == null) return null
  return Number.isFinite(value) && value >= 0 ? value : null
}

// Sanitizes the numeric fields of a set payload in place of validation
// rejection: every field is independently coerced to null when non-finite
// or negative, so one bad field never discards an otherwise-valid set.
// Shared by addSet and toSetRow (the saveWorkoutProgress/completeWorkout
// snapshot path) so both server-action entry points enforce the same contract.
export function validateSet<T extends SetData>(set: T): T {
  return {
    ...set,
    weight: cleanNonNegative(set.weight),
    reps: cleanNonNegative(set.reps),
    duration_minutes: cleanNonNegative(set.duration_minutes),
    distance: cleanNonNegative(set.distance),
    rest_seconds: cleanNonNegative(set.rest_seconds),
  }
}

function toSetRow(raw: SetPayload, workoutId: number, userId: string) {
  const s = validateSet(raw)
  return {
    workout_id: workoutId,
    user_id: userId,
    exercise_id: s.exercise_id,
    weight: s.weight,
    reps: s.reps,
    duration_minutes: s.duration_minutes ?? null,
    distance: s.distance ?? null,
    rest_seconds: s.rest_seconds ?? null,
  }
}

// Inserts sets, degrading gracefully if the rest_seconds column has not been
// migrated yet (retries once without it). Surfaces any other error rather
// than swallowing it — callers must not treat a failed insert as success.
// Returns the inserted rows' ids so the fallback path in saveSetSnapshot can
// delete only the *old* rows, never the ones it just wrote.
async function insertSets(
  supabase: SupabaseServerClient,
  rows: ReturnType<typeof toSetRow>[],
): Promise<{ ids: number[]; error?: string }> {
  if (rows.length === 0) return { ids: [] }
  const { data, error } = await supabase.from('sets').insert(rows).select('id')
  if (!error) return { ids: (data ?? []).map((r: { id: number }) => r.id) }
  if (isMissingColumnError(error, 'rest_seconds')) {
    const stripped = rows.map(({ rest_seconds, ...rest }) => rest)
    const retry = await supabase.from('sets').insert(stripped).select('id')
    if (retry.error) return { ids: [], error: retry.error.message }
    return { ids: (retry.data ?? []).map((r: { id: number }) => r.id) }
  }
  return { ids: [], error: error.message }
}

// ADR-0004: replaces a workout's entire set snapshot atomically. Tries the
// `save_workout_sets` RPC (a single Postgres transaction) first; if that
// function hasn't been migrated yet, falls back to insert-new-before-delete-
// old: the new snapshot lands before the old one is removed, and the delete
// explicitly excludes the just-inserted ids, so a failure at any point
// leaves the DB with the old sets intact (or, at worst, both old and new —
// never neither). See docs/database.md "Phase 8" and ADR-0004.
async function saveSetSnapshot(
  supabase: SupabaseServerClient,
  workoutId: number,
  userId: string,
  sets: SetPayload[],
): Promise<{ error?: string }> {
  const rows = sets.map((s) => toSetRow(s, workoutId, userId))

  const { error: rpcError } = await supabase.rpc('save_workout_sets', {
    p_workout_id: workoutId,
    p_user_id: userId,
    p_sets: rows,
  })
  if (!rpcError) return {}
  if (!isMissingFunctionError(rpcError)) return { error: rpcError.message }

  // Fallback (RPC not migrated yet): insert-new-before-delete-old. If the
  // insert fails, stop here — the old snapshot is untouched and no delete fires.
  const inserted = await insertSets(supabase, rows)
  if (inserted.error) return { error: inserted.error }

  if (rows.length === 0) {
    // Intentionally-empty snapshot: delete-all IS the requested state.
    await supabase.from('sets').delete().eq('workout_id', workoutId).eq('user_id', userId)
    return {}
  }

  if (inserted.ids.length === 0) {
    // The insert committed but returned no representation (e.g. PostgREST
    // return=minimal), so the new rows' ids are unknown. An unfiltered delete
    // here would remove the rows just written — the exact wipe ADR-0004
    // forbids. Skip cleanup: old+new duplicates are self-healing on the next
    // successful save; an emptied workout is not.
    return {}
  }

  // .not(column, 'in', value) takes raw PostgREST syntax, not a JS array —
  // must be the parenthesized list literal "(1,2,3)".
  const { error: deleteError } = await supabase
    .from('sets')
    .delete()
    .eq('workout_id', workoutId)
    .eq('user_id', userId)
    .not('id', 'in', `(${inserted.ids.join(',')})`)
  // A failed cleanup delete leaves stale duplicate rows, not an emptied
  // workout — the next successful save replaces the whole snapshot anyway,
  // so this is a lesser, self-healing failure and not surfaced as an error.
  void deleteError

  return {}
}

// WP-14 (Finding L1): double-tapping "Start workout" (or otherwise firing
// startWorkout/logWorkoutForDate twice for the same date before the first
// request's redirect lands) previously inserted a second in_progress workout
// with zero sets — an orphan the user never asked for. Looks up an existing
// in_progress workout for (user, date) with no sets yet, and returns its id
// so callers can redirect there instead of inserting a duplicate.
//
// Deliberately scoped to startWorkout/logWorkoutForDate only — scheduleWorkout
// (status 'planned') is a separate path per the WP-14 spec and stays
// unguarded: a user may legitimately plan more than one workout for a future
// date, and a planned workout is not the "orphaned in_progress" problem this
// guard targets.
//
// A workout WITH sets is real, logged progress: it is never reused, never
// deleted, never silently redirected into — only an empty in_progress
// workout is a safe, no-op-equivalent duplicate. If the lookup itself fails
// (network/DB error) or returns malformed data, this resolves to null so the
// caller falls back to its normal insert path rather than throwing or
// blocking workout creation on a non-critical read.
async function findReusableInProgressWorkout(
  supabase: SupabaseServerClient,
  userId: string,
  date: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from('workouts')
    .select('id, template_id, sets(id)')
    .eq('user_id', userId)
    .eq('date', date)
    .eq('status', 'in_progress')

  if (error || !Array.isArray(data)) return null

  // Only a blank, template-free workout is a no-op-equivalent duplicate. An
  // empty workout carrying a template_id came from "Start now" on a template
  // (§1.2 — its exercises live in logger local state, not the sets table);
  // adopting it from the blank "Start workout" path would surprise the user
  // with template exercises they didn't ask for — or, worse, hide them.
  const empty = data.find(
    (row: { id: number; template_id?: string | null; sets?: { id: number }[] | null }) =>
      row.template_id == null && !(row.sets && row.sets.length > 0),
  )
  return empty ? empty.id : null
}

// ADR-0005: the caller (client) always supplies the local calendar date —
// these cores never compute "today" themselves, which would use the
// server's clock/timezone rather than the user's.
export async function startWorkoutCore(supabase: SupabaseServerClient, date: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const reusableId = await findReusableInProgressWorkout(supabase, user.id, date)
  if (reusableId != null) redirect(`/workout/${reusableId}`)

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

// Creates an in_progress workout for any date (for logging in hindsight or
// today) — same duplicate-workout guard as startWorkoutCore (WP-14, Finding
// L1). templateId is only used on the insert path; a reused empty workout's
// existing template_id (if any) is left untouched — this guard is about
// avoiding a duplicate empty workout row, not reconciling templates.
export async function logWorkoutForDateCore(
  supabase: SupabaseServerClient,
  date: string,
  templateId?: string,
) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const reusableId = await findReusableInProgressWorkout(supabase, user.id, date)
  if (reusableId != null) redirect(`/workout/${reusableId}`)

  const { data: workout } = await supabase
    .from('workouts')
    .insert({ user_id: user.id, date, status: 'in_progress', template_id: templateId ?? null })
    .select('id')
    .single()

  if (!workout) redirect('/workouts')

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

  const result = await saveSetSnapshot(supabase, workoutId, user.id, sets)
  if (result.error) return { error: result.error }
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

  const result = await saveSetSnapshot(supabase, workoutId, user.id, sets)
  if (result.error) return { error: result.error }

  const { error: statusError } = await supabase
    .from('workouts')
    .update({ status: 'completed' })
    .eq('id', workout.id)
  // Sets are saved at this point; a failed status flip must surface (the
  // client shows the error and the user can re-tap Done) rather than
  // redirecting as if the workout completed.
  if (statusError) return { error: statusError.message }
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
      ...validateSet(data),
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

// Save (or clear) the user's note for an exercise — clearing deletes the row
// rather than upserting an empty string, keeping "no note" a single state.
export async function saveExerciseNoteCore(
  supabase: SupabaseServerClient,
  exerciseId: number,
  note: string,
): Promise<{ error?: string; success?: true }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const trimmed = note.trim()

  if (trimmed === '') {
    const { error } = await supabase
      .from('exercise_notes')
      .delete()
      .eq('user_id', user.id)
      .eq('exercise_id', exerciseId)
    if (error) return { error: error.message }
    return { success: true }
  }

  const { error } = await supabase
    .from('exercise_notes')
    .upsert(
      { user_id: user.id, exercise_id: exerciseId, note: trimmed, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,exercise_id' },
    )
  if (error) return { error: error.message }
  return { success: true }
}

// Logs (or overwrites) the user's bodyweight for a given date. One entry per
// day. `Number.isFinite(weight) && weight > 0` is the pre-existing guard
// (moved here unchanged) that validateSet's per-field coercion is modelled
// on — a bodyweight of NaN/Infinity/0/negative is rejected outright rather
// than silently coerced, because there is no "legitimate null" case here the
// way there is for a set's weight/reps.
export async function logBodyWeightCore(
  supabase: SupabaseServerClient,
  weight: number,
  // ADR-0005: required — the client supplies its local day; no server fallback.
  date: string,
): Promise<{ error?: string; success?: true }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  if (!Number.isFinite(weight) || weight <= 0) return { error: 'Enter a valid weight' }

  const { error } = await supabase
    .from('body_weights')
    .upsert({ user_id: user.id, date, weight }, { onConflict: 'user_id,date' })

  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  return { success: true }
}
