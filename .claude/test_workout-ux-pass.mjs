import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const {
  buildWorkoutNavigationSnapshot,
  shouldSaveWorkoutNavigationSnapshot,
  workoutNavigationSnapshotsEqual,
} = await import('../src/lib/workoutNavigationSnapshot.ts')
const { normalizeWorkoutPreferences, DEFAULT_WORKOUT_PREFERENCES } = await import('../src/lib/workoutPreferences.ts')

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

function strengthSet(overrides = {}) {
  return {
    localId: 'set-1',
    exerciseId: 7,
    exerciseName: 'Squat',
    exerciseCategory: 'strength',
    weight: 60,
    reps: 8,
    duration_minutes: null,
    distance: null,
    rest_seconds: null,
    difficulty: null,
    note: null,
    done: true,
    ...overrides,
  }
}

test('navigation snapshot commits an open uniform edit without changing completion state', () => {
  const base = [
    strengthSet(),
    strengthSet({ localId: 'set-2', done: false }),
  ]

  const result = buildWorkoutNavigationSnapshot(base, {
    edit: {
      localId: 'set-1',
      fields: { weight: '70', reps: '10', duration_minutes: '', distance: '' },
      note: '  hard final rep  ',
      valueMode: 'uniform',
    },
  })

  assert.deepEqual(result.map((set) => ({ id: set.localId, weight: set.weight, reps: set.reps, done: set.done, note: set.note })), [
    { id: 'set-1', weight: 70, reps: 10, done: true, note: 'hard final rep' },
    { id: 'set-2', weight: 70, reps: 10, done: false, note: null },
  ])
})

test('navigation snapshot adds a typed pending set exactly once and keeps it pending', () => {
  const result = buildWorkoutNavigationSnapshot([], {
    pending: {
      fields: { weight: '42.5', reps: '9', duration_minutes: '', distance: '' },
      exercise: { id: 9, name: 'Bench press', category: 'strength' },
      wasEdited: true,
      localId: 'draft-set',
    },
  })

  assert.equal(result.length, 1)
  assert.deepEqual(result[0], strengthSet({
    localId: 'draft-set',
    exerciseId: 9,
    exerciseName: 'Bench press',
    weight: 42.5,
    reps: 9,
    done: false,
  }))

  assert.deepEqual(buildWorkoutNavigationSnapshot(result, {
    pending: {
      fields: { weight: '42.5', reps: '9', duration_minutes: '', distance: '' },
      exercise: { id: 9, name: 'Bench press', category: 'strength' },
      wasEdited: false,
      localId: 'ignored',
    },
  }), result)
})

test('navigation snapshots compare semantically so a clean minimize does not save twice', () => {
  const current = [strengthSet(), strengthSet({ localId: 'set-2', done: false })]
  const equivalentCopy = current.map((set) => ({ ...set }))

  assert.equal(workoutNavigationSnapshotsEqual(current, equivalentCopy), true)
  assert.equal(workoutNavigationSnapshotsEqual(current, [
    { ...equivalentCopy[0], reps: 9 },
    equivalentCopy[1],
  ]), false)
  assert.equal(workoutNavigationSnapshotsEqual(current, [...equivalentCopy].reverse()), false)
})

test('navigation only skips snapshots that were really queued, including initial template sets', () => {
  const current = [strengthSet()]

  assert.equal(shouldSaveWorkoutNavigationSnapshot(current, current.map((set) => ({ ...set })), false), false)
  assert.equal(shouldSaveWorkoutNavigationSnapshot(current, null, false), true)
  assert.equal(shouldSaveWorkoutNavigationSnapshot(current, current, true), true)
  assert.equal(shouldSaveWorkoutNavigationSnapshot(current, [{ ...current[0], weight: 70 }], false), true)
})

test('workout preferences reduce invalid legacy values to safe, simple defaults', () => {
  assert.deepEqual(normalizeWorkoutPreferences(null), DEFAULT_WORKOUT_PREFERENCES)
  assert.deepEqual(normalizeWorkoutPreferences({
    autoStartRest: false,
    restMode: 'variable',
    restTarget: 9999,
    distanceUnit: 'm',
    guideRestBetweenSets: false,
  }), {
    autoStartRest: false,
    restMode: 'variable',
    restTarget: 600,
    distanceUnit: 'm',
    guideRestBetweenSets: false,
  })
})

test('minimize and save-and-leave share one final snapshot and wait for every queued save', async () => {
  const logger = await source('../src/app/workout/[id]/WorkoutLogger.tsx')
  assert.match(logger, /buildWorkoutNavigationSnapshot/)
  assert.match(logger, /async function flushNavigationSnapshot/)
  assert.match(logger, /workoutNavigationSnapshotsEqual\(snapshot, localSets\)/)
  assert.match(logger, /shouldSaveWorkoutNavigationSnapshot\(snapshot, lastQueuedSnapshotRef\.current, queueState\.dirty\)/)
  assert.match(logger, /if \(needsSave\)\s*\{[\s\S]{0,120}await saveQueueRef\.current\.enqueue\(key, snapshot\)/)
  assert.match(logger, /lastQueuedSnapshotRef\.current = snapshot/)
  assert.match(logger, /await saveQueueRef\.current\.idle\(key\)/)
  assert.match(logger, /if \(state\.pending \|\| state\.dirty \|\| state\.error\) return null/)
  assert.match(logger, /<Link[\s\S]{0,180}href="\/dashboard"[\s\S]{0,180}prefetch=\{true\}/)
  assert.doesNotMatch(logger, /window\.location\.href = ['"]\/dashboard['"]/)
})

test('the minimized workout validates cheaply and prefetches both resume links', async () => {
  const [dock, actions] = await Promise.all([
    source('../src/components/ActiveWorkoutDock.tsx'),
    source('../src/app/actions/workouts.ts'),
  ])
  assert.equal((dock.match(/prefetch=\{true\}/g) ?? []).length, 2)

  const validationStart = actions.indexOf('export async function validateActiveWorkoutSession')
  const validationEnd = actions.indexOf('\nexport async function ', validationStart + 1)
  const validationBody = actions.slice(validationStart, validationEnd)
  assert.doesNotMatch(validationBody, /getWorkoutWithSets/)
  assert.match(validationBody, /\.from\('sets'\)[\s\S]*?\.limit\(1\)[\s\S]*?\.maybeSingle\(\)/)
  assert.doesNotMatch(validationBody, /count:\s*'exact'/)
})

test('authenticated screens stay in the private in-memory router cache while browsing a workout', async () => {
  const [config, logger, worker] = await Promise.all([
    source('../next.config.ts'),
    source('../src/app/workout/[id]/WorkoutLogger.tsx'),
    source('../public/sw.js'),
  ])
  assert.match(config, /staleTimes:\s*\{[\s\S]*?dynamic:\s*300/)
  assert.match(logger, /router\.prefetch\('\/dashboard',\s*\{/)
  assert.match(logger, /onInvalidate:\s*\(\)\s*=>\s*\{[\s\S]{0,80}warmDashboard\(\)/)
  assert.match(worker, /pathname\.startsWith\('\/dashboard'\)/)
  assert.match(worker, /pathname\.startsWith\('\/workout'\)/)
  assert.match(worker, /if \(isPrivateOrDynamic\(url\.pathname\)\) return/)
})

test('active workout renders before the authorized exercise catalog is requested', async () => {
  const [page, logger, actions] = await Promise.all([
    source('../src/app/workout/[id]/page.tsx'),
    source('../src/app/workout/[id]/WorkoutLogger.tsx'),
    source('../src/app/actions/exercises.ts'),
  ])
  assert.doesNotMatch(page, /getAllExercises/)
  assert.match(actions, /fetchAvailableExercises/)
  assert.match(logger, /loadExerciseCatalog/)
  assert.match(logger, /catalogState/)
})

test('visible exercises load last-session performance in one batched action', async () => {
  const [dal, actions, logger] = await Promise.all([
    source('../src/lib/dal.ts'),
    source('../src/app/actions/exercises.ts'),
    source('../src/app/workout/[id]/WorkoutLogger.tsx'),
  ])
  assert.match(dal, /getLastExercisePerformances/)
  assert.match(actions, /fetchLastExercisePerformances/)
  assert.match(logger, /fetchLastExercisePerformances\(missingPerformanceIds\)/)
  assert.doesNotMatch(logger, /exerciseOrder\.forEach\([\s\S]{0,300}fetchLastExercisePerformance/)
})

test('workout settings have one clear home and the workout exposes a compact contextual entry point', async () => {
  const [account, preferenceCard, logger, navigation, workouts] = await Promise.all([
    source('../src/app/account/page.tsx'),
    source('../src/app/account/WorkoutPreferencesCard.tsx'),
    source('../src/app/workout/[id]/WorkoutLogger.tsx'),
    source('../src/lib/appNavigation.ts'),
    source('../src/app/workouts/page.tsx'),
  ])
  assert.match(account, /WorkoutPreferencesCard/)
  assert.match(preferenceCard, /Training defaults/)
  assert.match(preferenceCard, /On this device/)
  assert.match(logger, /Workout settings/)
  assert.match(logger, /aria-label="Workout settings"/)
  assert.equal((logger.match(/<GuidedVoiceSettingsFields/g) ?? []).length, 1)
  assert.match(navigation, /label: 'Templates'/)
  assert.match(workouts, /title="Workout templates"/)
})

test('set reload order has a deterministic id tie-breaker', async () => {
  const dal = await source('../src/lib/dal.ts')
  const start = dal.indexOf('export async function getWorkoutWithSets')
  const end = dal.indexOf('export type AvailableExercise', start)
  const body = dal.slice(start, end)
  assert.match(body, /\.order\('created_at', \{ ascending: true \}\)\s*\.order\('id', \{ ascending: true \}\)/)
})
