import { isCalendarDate } from './personalTrainerAccess'
import { isUuid } from './trainerValidation'
import { isMonday } from './weeklyPlanning'

type PlanningValidationResult<T> =
  | { success: true; data: T }
  | { success: false }

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function normalizedUuid(formData: FormData, key: string): string {
  return textValue(formData, key).toLowerCase()
}

export function parseTrainerPlanAssignment(formData: FormData): PlanningValidationResult<{
  relationshipId: string
  routineId: string
  scheduledDate: string
  title: string | null
  instructions: string | null
}> {
  const relationshipId = normalizedUuid(formData, 'relationshipId')
  const routineId = normalizedUuid(formData, 'routineId')
  const scheduledDate = textValue(formData, 'scheduledDate')
  const title = textValue(formData, 'title')
  const instructions = textValue(formData, 'instructions')

  if (
    !isUuid(relationshipId)
    || !isUuid(routineId)
    || !isCalendarDate(scheduledDate)
    || title.length > 120
    || instructions.length > 2000
  ) {
    return { success: false }
  }

  return {
    success: true,
    data: {
      relationshipId,
      routineId,
      scheduledDate,
      title: title || null,
      instructions: instructions || null,
    },
  }
}

export function parseWorkoutPlanTransition(formData: FormData): PlanningValidationResult<{
  planId: string
}> {
  const planId = normalizedUuid(formData, 'planId')
  return isUuid(planId)
    ? { success: true, data: { planId } }
    : { success: false }
}

export function parseTrainerWeekAssignment(formData: FormData): PlanningValidationResult<{
  relationshipId: string
  routineIds: string[]
  weekStart: string
  instructions: string | null
}> {
  const relationshipId = normalizedUuid(formData, 'relationshipId')
  const routineIds = formData.getAll('routineId').map((value) => (
    typeof value === 'string' ? value.trim().toLowerCase() : ''
  ))
  const weekStart = textValue(formData, 'weekStart')
  const instructions = textValue(formData, 'instructions')
  if (
    !isUuid(relationshipId)
    || routineIds.length < 1
    || routineIds.length > 7
    || routineIds.some((routineId) => !isUuid(routineId))
    || !isMonday(weekStart)
    || instructions.length > 2000
  ) return { success: false }

  return {
    success: true,
    data: {
      relationshipId,
      routineIds,
      weekStart,
      instructions: instructions || null,
    },
  }
}

export function parseWorkoutPlanDateChoice(formData: FormData): PlanningValidationResult<{
  planId: string
  selectedDate: string
}> {
  const planId = normalizedUuid(formData, 'planId')
  const selectedDate = textValue(formData, 'selectedDate')
  return isUuid(planId) && isCalendarDate(selectedDate)
    ? { success: true, data: { planId, selectedDate } }
    : { success: false }
}
