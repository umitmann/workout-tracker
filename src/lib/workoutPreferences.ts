export type WorkoutPreferences = {
  autoStartRest: boolean
  restMode: 'fixed' | 'variable'
  restTarget: number
  distanceUnit: 'km' | 'm'
  guideRestBetweenSets: boolean
}

export const DEFAULT_WORKOUT_PREFERENCES: WorkoutPreferences = {
  autoStartRest: true,
  restMode: 'fixed',
  restTarget: 90,
  distanceUnit: 'km',
  guideRestBetweenSets: true,
}

export const WORKOUT_PREFERENCES_EVENT = 'wt:workout-preferences'

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function normalizeWorkoutPreferences(value: unknown): WorkoutPreferences {
  const input = value && typeof value === 'object' ? value as Partial<WorkoutPreferences> : {}
  return {
    autoStartRest: typeof input.autoStartRest === 'boolean'
      ? input.autoStartRest
      : DEFAULT_WORKOUT_PREFERENCES.autoStartRest,
    restMode: input.restMode === 'variable' ? 'variable' : 'fixed',
    restTarget: finiteNumber(input.restTarget)
      ? Math.min(600, Math.max(5, Math.round(input.restTarget)))
      : DEFAULT_WORKOUT_PREFERENCES.restTarget,
    distanceUnit: input.distanceUnit === 'm' ? 'm' : 'km',
    guideRestBetweenSets: typeof input.guideRestBetweenSets === 'boolean'
      ? input.guideRestBetweenSets
      : DEFAULT_WORKOUT_PREFERENCES.guideRestBetweenSets,
  }
}

function parseStored(storage: Storage, key: string): unknown {
  const raw = storage.getItem(key)
  if (raw == null) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

export function readWorkoutPreferences(storage?: Storage): WorkoutPreferences {
  const target = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage)
  if (!target) return DEFAULT_WORKOUT_PREFERENCES
  return normalizeWorkoutPreferences({
    autoStartRest: parseStored(target, 'wt.autoStartRest'),
    restMode: parseStored(target, 'wt.restMode'),
    restTarget: parseStored(target, 'wt.restTarget'),
    distanceUnit: parseStored(target, 'wt.distanceUnit'),
    guideRestBetweenSets: parseStored(target, 'wt.guideRestBetweenSets'),
  })
}

export function writeWorkoutPreferences(preferences: WorkoutPreferences, storage?: Storage): void {
  const target = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage)
  if (!target) return
  const normalized = normalizeWorkoutPreferences(preferences)
  target.setItem('wt.autoStartRest', JSON.stringify(normalized.autoStartRest))
  target.setItem('wt.restMode', JSON.stringify(normalized.restMode))
  target.setItem('wt.restTarget', JSON.stringify(normalized.restTarget))
  target.setItem('wt.distanceUnit', JSON.stringify(normalized.distanceUnit))
  target.setItem('wt.guideRestBetweenSets', JSON.stringify(normalized.guideRestBetweenSets))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(WORKOUT_PREFERENCES_EVENT, { detail: normalized }))
  }
}
