import 'server-only'

import { requireQueryData } from './dataAccessError'
import { isCalendarDate } from './personalTrainerAccess'
import { getServerAuthContext } from './serverAuth'
import { isUuid } from './trainerValidation'

export type TrainerCompletedWorkout = {
  id: number
  date: string
  status: 'completed'
  title: string | null
  set_count: number
  exercise_count: number
}

export type TrainerCompletedWorkoutSet = {
  workout_id: number
  workout_date: string
  exercise_id: number
  exercise_name: string
  set_number: number
  weight: number | null
  reps: number | null
  duration_minutes: number | null
  distance: number | null
  rest_seconds: number | null
  difficulty: number | null
}

export type TrainerBodyweight = {
  date: string
  weight: number
}

type UnknownRecord = Record<string, unknown>

async function getAuthenticatedClient() {
  const context = await getServerAuthContext()
  if (!context.user) throw new Error('Authentication required')
  return context.supabase
}

function record(value: unknown): UnknownRecord | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null
}

function numberValue(value: unknown): number | null {
  const result = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(result) ? result : null
}

function nullableNumber(value: unknown): number | null {
  return value == null ? null : numberValue(value)
}

function assertRelationshipAndRange(relationshipId: string, from: string, to: string) {
  if (!isUuid(relationshipId) || !isCalendarDate(from) || !isCalendarDate(to) || from > to) {
    throw new Error('Invalid delegated result request')
  }
}

export async function listTrainerCompletedWorkouts(
  relationshipId: string,
  from: string,
  to: string,
): Promise<TrainerCompletedWorkout[]> {
  assertRelationshipAndRange(relationshipId, from, to)
  const supabase = await getAuthenticatedClient()
  const result = await supabase.rpc('trainer_get_completed_workouts', {
    p_relationship_id: relationshipId,
    p_from: from,
    p_to: to,
  })
  const rows = requireQueryData(result, 'load shared completed workouts') ?? []
  if (!Array.isArray(rows)) throw new Error('Invalid completed workout response')
  return rows.flatMap((value) => {
    const row = record(value)
    const id = numberValue(row?.id)
    const setCount = numberValue(row?.set_count)
    const exerciseCount = numberValue(row?.exercise_count)
    const date = typeof row?.date === 'string' ? row.date : ''
    if (
      id == null
      || id <= 0
      || setCount == null
      || exerciseCount == null
      || !isCalendarDate(date)
      || row?.status !== 'completed'
    ) return []
    return [{
      id,
      date,
      status: 'completed' as const,
      title: typeof row.title === 'string' ? row.title : null,
      set_count: setCount,
      exercise_count: exerciseCount,
    }]
  })
}

export async function listTrainerCompletedWorkoutSets(
  relationshipId: string,
  workoutId: number,
): Promise<TrainerCompletedWorkoutSet[]> {
  if (!isUuid(relationshipId) || !Number.isSafeInteger(workoutId) || workoutId <= 0) {
    throw new Error('Invalid delegated workout detail request')
  }
  const supabase = await getAuthenticatedClient()
  const result = await supabase.rpc('trainer_get_completed_workout_sets', {
    p_relationship_id: relationshipId,
    p_workout_id: workoutId,
  })
  const rows = requireQueryData(result, 'load shared completed workout detail') ?? []
  if (!Array.isArray(rows)) throw new Error('Invalid completed workout detail response')
  return rows.flatMap((value) => {
    const row = record(value)
    if (!row) return []
    const id = numberValue(row.workout_id)
    const date = typeof row.workout_date === 'string' ? row.workout_date : ''
    const exerciseId = numberValue(row.exercise_id)
    const setNumber = numberValue(row.set_number)
    const exerciseName = typeof row.exercise_name === 'string' ? row.exercise_name : ''
    if (
      id == null
      || id <= 0
      || !isCalendarDate(date)
      || exerciseId == null
      || exerciseId <= 0
      || setNumber == null
      || setNumber < 1
      || !exerciseName
    ) return []
    return [{
      workout_id: id,
      workout_date: date,
      exercise_id: exerciseId,
      exercise_name: exerciseName,
      set_number: setNumber,
      weight: nullableNumber(row.weight),
      reps: nullableNumber(row.reps),
      duration_minutes: nullableNumber(row.duration_minutes),
      distance: nullableNumber(row.distance),
      rest_seconds: nullableNumber(row.rest_seconds),
      difficulty: nullableNumber(row.difficulty),
    }]
  })
}

export async function listTrainerBodyweights(
  relationshipId: string,
  from: string,
  to: string,
): Promise<TrainerBodyweight[]> {
  assertRelationshipAndRange(relationshipId, from, to)
  const supabase = await getAuthenticatedClient()
  const result = await supabase.rpc('trainer_get_bodyweights', {
    p_relationship_id: relationshipId,
    p_from: from,
    p_to: to,
  })
  const rows = requireQueryData(result, 'load shared bodyweight') ?? []
  if (!Array.isArray(rows)) throw new Error('Invalid bodyweight response')
  return rows.flatMap((value) => {
    const row = record(value)
    const date = typeof row?.date === 'string' ? row.date : ''
    const weight = numberValue(row?.weight)
    return isCalendarDate(date) && weight != null && weight > 0
      ? [{ date, weight }]
      : []
  })
}
