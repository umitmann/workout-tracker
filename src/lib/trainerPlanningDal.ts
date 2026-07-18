import 'server-only'

import { requireQueryData } from './dataAccessError'
import type { RoutineWithExercises } from './dal'
import { isCalendarDate } from './personalTrainerAccess'
import { getServerAuthContext } from './serverAuth'
import { listTrainerRelationshipAudit } from './trainerRelationshipDal'
import type { TrainerRelationshipSummary } from './trainerRelationshipTypes'
import { isUpcomingTraineeAgendaPlan } from './trainerPlanningTypes'
import type {
  AttributedWorkoutPlan,
  WorkoutPlanDetail,
  WorkoutPlanExercise,
  WorkoutPlanStatus,
  WorkoutPlanSummary,
} from './trainerPlanningTypes'
import { isUuid } from './trainerValidation'

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

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function nullableNumber(value: unknown): number | null {
  return value == null ? null : finiteNumber(value)
}

function planStatus(value: unknown): WorkoutPlanStatus | null {
  return ['scheduled', 'cancelled', 'started', 'completed'].includes(String(value))
    ? String(value) as WorkoutPlanStatus
    : null
}

function normalizeSummary(value: unknown): WorkoutPlanSummary | null {
  const row = record(value)
  if (!row) return null
  const status = planStatus(row.status)
  const planId = typeof row.plan_id === 'string' ? row.plan_id.toLowerCase() : ''
  const date = typeof row.scheduled_date === 'string' ? row.scheduled_date : ''
  const title = typeof row.title === 'string' ? row.title : ''
  const workoutId = nullableNumber(row.workout_id)
  const exerciseCount = finiteNumber(row.exercise_count)
  if (
    !isUuid(planId)
    || !isCalendarDate(date)
    || !title
    || !status
    || exerciseCount == null
    || exerciseCount < 0
  ) {
    return null
  }
  return {
    plan_id: planId,
    scheduled_date: date,
    title,
    status,
    trainer_assigned: row.trainer_assigned === true,
    assigned_by_me: row.assigned_by_me === true,
    workout_id: workoutId,
    exercise_count: exerciseCount,
  }
}

function normalizeSetDetails(value: unknown): { reps: number | null; weight: number | null }[] | null {
  if (value == null) return null
  if (!Array.isArray(value)) return null
  return value.map((entry) => {
    const detail = record(entry)
    return {
      reps: nullableNumber(detail?.reps) as number | null,
      weight: nullableNumber(detail?.weight),
    }
  })
}

function normalizeExercise(value: unknown): WorkoutPlanExercise | null {
  const row = record(value)
  if (!row) return null
  const exerciseId = finiteNumber(row.exercise_id)
  const sets = finiteNumber(row.sets)
  const order = finiteNumber(row.order)
  const exerciseName = typeof row.exercise_name === 'string' ? row.exercise_name : ''
  if (
    exerciseId == null
    || exerciseId <= 0
    || sets == null
    || sets < 1
    || order == null
    || order < 0
    || !exerciseName
  ) {
    return null
  }
  return {
    exercise_id: exerciseId,
    exercise_name: exerciseName,
    sets,
    reps: nullableNumber(row.reps),
    weight: nullableNumber(row.weight),
    duration_minutes: nullableNumber(row.duration_minutes),
    distance: nullableNumber(row.distance),
    set_details: normalizeSetDetails(row.set_details),
    tempo: typeof row.tempo === 'string' ? row.tempo : null,
    rest_seconds: nullableNumber(row.rest_seconds),
    order,
  }
}

function normalizeDetail(value: unknown): WorkoutPlanDetail | null {
  const row = record(value)
  if (!row) return null
  const status = planStatus(row.status)
  const planId = typeof row.plan_id === 'string' ? row.plan_id.toLowerCase() : ''
  const date = typeof row.scheduled_date === 'string' ? row.scheduled_date : ''
  const title = typeof row.title === 'string' ? row.title : ''
  const rawExercises = Array.isArray(row.exercises) ? row.exercises : []
  const exercises = rawExercises.map(normalizeExercise).filter((item): item is WorkoutPlanExercise => item != null)
  if (!isUuid(planId) || !isCalendarDate(date) || !title || !status || exercises.length !== rawExercises.length) {
    return null
  }
  return {
    plan_id: planId,
    scheduled_date: date,
    title,
    instructions: typeof row.instructions === 'string' ? row.instructions : null,
    status,
    trainer_assigned: row.trainer_assigned === true,
    assigned_by_me: row.assigned_by_me === true,
    workout_id: nullableNumber(row.workout_id),
    exercises,
  }
}

function assertDateRange(from: string, to: string) {
  if (!isCalendarDate(from) || !isCalendarDate(to) || from > to) {
    throw new Error('Invalid workout plan date range')
  }
}

export async function listMyWorkoutPlans(from: string, to: string): Promise<WorkoutPlanSummary[]> {
  assertDateRange(from, to)
  const supabase = await getAuthenticatedClient()
  const result = await supabase.rpc('list_my_workout_plans', {
    p_from: from,
    p_to: to,
  })
  const rows = requireQueryData(result, 'load workout plans') ?? []
  if (!Array.isArray(rows)) throw new Error('Invalid workout plan response')
  return rows.map(normalizeSummary).filter((item): item is WorkoutPlanSummary => item != null)
}

export async function getWorkoutPlan(planId: string): Promise<WorkoutPlanDetail | null> {
  const normalizedId = planId.trim().toLowerCase()
  if (!isUuid(normalizedId)) return null
  const supabase = await getAuthenticatedClient()
  const result = await supabase.rpc('get_workout_plan', { p_plan_id: normalizedId })
  const rows = requireQueryData(result, 'load workout plan') ?? []
  const first = Array.isArray(rows) ? rows[0] : rows
  return first == null ? null : normalizeDetail(first)
}

async function planAttribution(
  relationships: TrainerRelationshipSummary[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  await Promise.all(relationships.map(async (relationship) => {
    try {
      const events = await listTrainerRelationshipAudit(relationship.relationship_id)
      for (const event of events) {
        const value = event.details.plan_id
        if (typeof value === 'string' && isUuid(value)) {
          map.set(value.toLowerCase(), relationship.counterparty_display_name)
        }
      }
    } catch {
      // Attribution is display-only. The plan RPC remains the authorization
      // boundary, so an unavailable audit trail must not hide a valid plan.
    }
  }))
  return map
}

export async function listAttributedWorkoutPlanDetails(
  from: string,
  to: string,
  relationships: TrainerRelationshipSummary[],
  limit = 12,
): Promise<AttributedWorkoutPlan[]> {
  const summaries = (await listMyWorkoutPlans(from, to))
    .filter(isUpcomingTraineeAgendaPlan)
    .slice(0, Math.max(0, Math.min(limit, 30)))
  const [attribution, details] = await Promise.all([
    planAttribution(relationships),
    Promise.all(summaries.map((plan) => getWorkoutPlan(plan.plan_id))),
  ])
  return details
    .filter((plan): plan is WorkoutPlanDetail => plan != null)
    .filter(isUpcomingTraineeAgendaPlan)
    .map((plan) => ({
      ...plan,
      assigned_by_name: plan.trainer_assigned
        ? attribution.get(plan.plan_id) ?? 'Your trainer'
        : null,
    }))
}

export async function listTrainerRelationshipPlans(
  relationshipId: string,
  from: string,
  to: string,
): Promise<WorkoutPlanSummary[]> {
  if (!isUuid(relationshipId)) return []
  const [plans, events] = await Promise.all([
    listMyWorkoutPlans(from, to),
    listTrainerRelationshipAudit(relationshipId),
  ])
  const relationshipPlanIds = new Set(
    events
      .map((event) => event.details.plan_id)
      .filter((value): value is string => typeof value === 'string' && isUuid(value))
      .map((value) => value.toLowerCase()),
  )
  return plans.filter((plan) => relationshipPlanIds.has(plan.plan_id))
}

export async function getWorkoutPlanAsRoutine(planId: string): Promise<RoutineWithExercises | null> {
  const plan = await getWorkoutPlan(planId)
  if (!plan) return null
  return {
    id: plan.plan_id,
    name: plan.title,
    created_at: `${plan.scheduled_date}T00:00:00`,
    routine_exercises: plan.exercises.map((exercise) => ({
      id: `${plan.plan_id}:${exercise.order}`,
      exercise_id: exercise.exercise_id,
      sets: exercise.sets,
      reps: exercise.reps,
      weight: exercise.weight,
      duration_minutes: exercise.duration_minutes,
      distance: exercise.distance,
      set_details: exercise.set_details,
      tempo: exercise.tempo,
      rest_seconds: exercise.rest_seconds,
      order: exercise.order,
      exercises: {
        id: exercise.exercise_id,
        name: exercise.exercise_name,
        category: null,
      },
    })),
  }
}
