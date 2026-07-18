import type { SetDetail } from './dal'

export type WorkoutPlanStatus = 'scheduled' | 'cancelled' | 'started' | 'completed'

export type WorkoutPlanSummary = {
  plan_id: string
  scheduled_date: string
  title: string
  status: WorkoutPlanStatus
  trainer_assigned: boolean
  assigned_by_me: boolean
  workout_id: number | null
  exercise_count: number
}

/**
 * The participant plan RPC also returns plans a trainer assigned to a client.
 * A personal agenda contains self-scheduled plans and plans received from a
 * trainer, never the plans the current dual-role user assigned to somebody
 * else.
 */
export function isTraineeAgendaPlan(
  plan: Pick<WorkoutPlanSummary, 'trainer_assigned' | 'assigned_by_me'>,
): boolean {
  return !plan.trainer_assigned || !plan.assigned_by_me
}

/** Upcoming means actionable: not a cancelled plan and not retained history. */
export function isUpcomingTraineeAgendaPlan(
  plan: Pick<WorkoutPlanSummary, 'trainer_assigned' | 'assigned_by_me' | 'status'>,
): boolean {
  return isTraineeAgendaPlan(plan) && (plan.status === 'scheduled' || plan.status === 'started')
}

export type WorkoutPlanExercise = {
  exercise_id: number
  exercise_name: string
  sets: number
  reps: number | null
  weight: number | null
  duration_minutes: number | null
  distance: number | null
  set_details: SetDetail[] | null
  tempo: string | null
  rest_seconds: number | null
  order: number
}

export type WorkoutPlanDetail = {
  plan_id: string
  scheduled_date: string
  title: string
  instructions: string | null
  status: WorkoutPlanStatus
  trainer_assigned: boolean
  assigned_by_me: boolean
  workout_id: number | null
  exercises: WorkoutPlanExercise[]
}

export type AttributedWorkoutPlan = WorkoutPlanDetail & {
  assigned_by_name: string | null
}

export type TrainerPlanningActionState = {
  success: boolean
  message: string
  planId?: string
  workoutId?: number
}
