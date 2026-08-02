export const ACTIVE_WORKOUT_STORAGE_KEY = 'wt.activeWorkoutSession'
export const ACTIVE_WORKOUT_EVENT = 'wt:active-workout'
export const ACTIVE_WORKOUT_SESSION_VERSION = 2 as const

export type ActiveWorkoutSummary = {
  exerciseName: string
  setNumber: number
  exerciseSetCount: number
  completedSets: number
  totalSets: number
  prescription: string | null
  allSetsComplete: boolean
}

export type ActiveRestSession = {
  startedAt: number
  initialElapsed: number
  mode: 'fixed' | 'variable'
  target: number
  ownerExerciseId: number
  ownerSetIndex: number
}

export type ActiveWorkoutSession = {
  version: typeof ACTIVE_WORKOUT_SESSION_VERSION
  workoutId: number
  date: string
  updatedAt: number
  rest: ActiveRestSession | null
  summary: ActiveWorkoutSummary
}

type SetIdentity = { localId: string; exerciseId: number }
type RestOwner = Pick<ActiveRestSession, 'ownerExerciseId' | 'ownerSetIndex'>
type SummarySet = {
  exerciseId: number
  exerciseName: string
  exerciseCategory: string | null
  weight: number | null
  reps: number | null
  duration_minutes: number | null
  distance: number | null
  done: boolean
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function normalizeRest(value: unknown): ActiveRestSession | null {
  if (!value || typeof value !== 'object') return null
  const rest = value as Partial<ActiveRestSession>
  if (
    !finiteNonNegative(rest.startedAt)
    || !finiteNonNegative(rest.initialElapsed)
    || !finiteNonNegative(rest.target)
    || !Number.isInteger(rest.ownerExerciseId)
    || (rest.ownerExerciseId ?? 0) <= 0
    || !Number.isInteger(rest.ownerSetIndex)
    || (rest.ownerSetIndex ?? -1) < 0
    || (rest.mode !== 'fixed' && rest.mode !== 'variable')
  ) return null
  return rest as ActiveRestSession
}

function boundedText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
}

function positiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0
}

function normalizeSummary(value: unknown): ActiveWorkoutSummary | null {
  if (!value || typeof value !== 'object') return null
  const summary = value as Partial<ActiveWorkoutSummary>
  if (
    !boundedText(summary.exerciseName, 160)
    || !positiveInteger(summary.setNumber)
    || !positiveInteger(summary.exerciseSetCount)
    || summary.setNumber > summary.exerciseSetCount
    || !finiteNonNegative(summary.completedSets)
    || !positiveInteger(summary.totalSets)
    || summary.completedSets > summary.totalSets
    || (summary.prescription !== null && !boundedText(summary.prescription, 80))
    || typeof summary.allSetsComplete !== 'boolean'
  ) return null
  return summary as ActiveWorkoutSummary
}

function compactNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
}

function prescriptionForSet(set: SummarySet): string | null {
  if (set.exerciseCategory === 'cardio') {
    const parts: string[] = []
    if (set.duration_minutes != null && Number.isFinite(set.duration_minutes)) {
      parts.push(`${compactNumber(set.duration_minutes)} min`)
    }
    if (set.distance != null && Number.isFinite(set.distance)) {
      parts.push(`${compactNumber(set.distance)} km`)
    }
    return parts.length > 0 ? parts.join(' · ') : null
  }

  if (set.weight != null && Number.isFinite(set.weight) && set.reps != null && Number.isFinite(set.reps)) {
    return `${compactNumber(set.weight)} kg × ${compactNumber(set.reps)}`
  }
  if (set.weight != null && Number.isFinite(set.weight)) return `${compactNumber(set.weight)} kg`
  if (set.reps != null && Number.isFinite(set.reps)) return `${compactNumber(set.reps)} reps`
  return null
}

export function buildActiveWorkoutSummary(sets: SummarySet[]): ActiveWorkoutSummary | null {
  if (sets.length === 0) return null
  const activeSet = sets.find((set) => !set.done) ?? sets[sets.length - 1]
  const exerciseSets = sets.filter((set) => set.exerciseId === activeSet.exerciseId)
  return {
    exerciseName: activeSet.exerciseName,
    setNumber: Math.max(1, exerciseSets.indexOf(activeSet) + 1),
    exerciseSetCount: exerciseSets.length,
    completedSets: sets.filter((set) => set.done).length,
    totalSets: sets.length,
    prescription: prescriptionForSet(activeSet),
    allSetsComplete: sets.every((set) => set.done),
  }
}

export function isResumableWorkoutRecord(
  workout: { status: string; setCount: number } | null | undefined,
): boolean {
  return workout?.status === 'in_progress'
    && Number.isInteger(workout.setCount)
    && workout.setCount > 0
}

export function normalizeActiveWorkoutSession(value: unknown): ActiveWorkoutSession | null {
  if (!value || typeof value !== 'object') return null
  const session = value as Partial<ActiveWorkoutSession>
  const summary = normalizeSummary(session.summary)
  if (
    session.version !== ACTIVE_WORKOUT_SESSION_VERSION
    || !Number.isInteger(session.workoutId)
    || (session.workoutId ?? 0) <= 0
    || typeof session.date !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/.test(session.date)
    || !finiteNonNegative(session.updatedAt)
    || !summary
  ) return null
  return {
    version: ACTIVE_WORKOUT_SESSION_VERSION,
    workoutId: session.workoutId as number,
    date: session.date,
    updatedAt: session.updatedAt,
    rest: normalizeRest(session.rest),
    summary,
  }
}

export function elapsedRestSeconds(rest: ActiveRestSession, now = Date.now()): number {
  return Math.max(0, Math.floor(rest.initialElapsed + Math.max(0, now - rest.startedAt) / 1000))
}

export function restClockSeconds(rest: ActiveRestSession, now = Date.now()): number {
  const elapsed = elapsedRestSeconds(rest, now)
  return rest.mode === 'fixed' ? Math.max(0, Math.ceil(rest.target - elapsed)) : elapsed
}

export function restOwnerForSet(sets: SetIdentity[], localId: string): RestOwner | null {
  const target = sets.find((set) => set.localId === localId)
  if (!target) return null
  const siblings = sets.filter((set) => set.exerciseId === target.exerciseId)
  const ownerSetIndex = siblings.findIndex((set) => set.localId === localId)
  return ownerSetIndex < 0 ? null : { ownerExerciseId: target.exerciseId, ownerSetIndex }
}

export function findRestOwnerSet(sets: SetIdentity[], owner: RestOwner | null): string | null {
  if (!owner) return null
  return sets.filter((set) => set.exerciseId === owner.ownerExerciseId)[owner.ownerSetIndex]?.localId ?? null
}

export function readActiveWorkoutSession(): ActiveWorkoutSession | null {
  if (typeof window === 'undefined') return null
  try {
    return normalizeActiveWorkoutSession(JSON.parse(readActiveWorkoutSessionRaw() ?? 'null'))
  } catch {
    return null
  }
}

export function readActiveWorkoutSessionRaw(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(ACTIVE_WORKOUT_STORAGE_KEY)
  } catch {
    return null
  }
}

export function writeActiveWorkoutSession(session: ActiveWorkoutSession): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(ACTIVE_WORKOUT_STORAGE_KEY, JSON.stringify(session))
    window.dispatchEvent(new CustomEvent(ACTIVE_WORKOUT_EVENT, { detail: session }))
  } catch {
    // A blocked/quota-exhausted storage area must not break workout logging.
  }
}

export function clearActiveWorkoutSession(workoutId?: number): void {
  if (typeof window === 'undefined') return
  try {
    const current = readActiveWorkoutSession()
    if (workoutId != null && current?.workoutId !== workoutId) return
    window.localStorage.removeItem(ACTIVE_WORKOUT_STORAGE_KEY)
    window.dispatchEvent(new CustomEvent(ACTIVE_WORKOUT_EVENT, { detail: null }))
  } catch {
    // Best-effort cleanup in restricted storage environments.
  }
}
