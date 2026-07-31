export const ACTIVE_WORKOUT_STORAGE_KEY = 'wt.activeWorkoutSession'
export const ACTIVE_WORKOUT_EVENT = 'wt:active-workout'

export type ActiveRestSession = {
  startedAt: number
  initialElapsed: number
  mode: 'fixed' | 'variable'
  target: number
  ownerExerciseId: number
  ownerSetIndex: number
}

export type ActiveWorkoutSession = {
  workoutId: number
  date: string
  updatedAt: number
  rest: ActiveRestSession | null
}

type SetIdentity = { localId: string; exerciseId: number }
type RestOwner = Pick<ActiveRestSession, 'ownerExerciseId' | 'ownerSetIndex'>

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

export function normalizeActiveWorkoutSession(value: unknown): ActiveWorkoutSession | null {
  if (!value || typeof value !== 'object') return null
  const session = value as Partial<ActiveWorkoutSession>
  if (
    !Number.isInteger(session.workoutId)
    || (session.workoutId ?? 0) <= 0
    || typeof session.date !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/.test(session.date)
    || !finiteNonNegative(session.updatedAt)
  ) return null
  return {
    workoutId: session.workoutId as number,
    date: session.date,
    updatedAt: session.updatedAt,
    rest: normalizeRest(session.rest),
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
