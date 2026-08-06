import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const { previousSetAt, previousSetLabel, effortLabel } = await import('../src/lib/workoutLogPresentation.ts')

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

const performance = {
  sets: [
    { weight: 60, reps: 10, duration_minutes: null, distance: null },
    { weight: 65, reps: 8, duration_minutes: null, distance: null },
  ],
}

test('the logging table compares each set with the same prior set number', () => {
  assert.equal(previousSetLabel(performance, 0, 'strength'), '60×10')
  assert.equal(previousSetLabel(performance, 1, 'strength'), '65×8')
  assert.equal(previousSetAt(performance, 5), performance.sets[1])
  assert.equal(previousSetLabel(null, 0, 'strength'), '—')
})

test('cardio comparison and effort use short, scan-friendly labels', () => {
  assert.equal(previousSetLabel({ sets: [{ weight: null, reps: null, duration_minutes: 20, distance: 4.5 }] }, 0, 'cardio'), '20m · 4.5km')
  assert.equal(effortLabel(null), 'Rate effort')
  assert.equal(effortLabel(4), 'Effort 4/5')
})

test('active workout follows the compact logging hierarchy', async () => {
  const [logger, styles] = await Promise.all([
    source('../src/app/workout/[id]/WorkoutLogger.tsx'),
    source('../src/app/globals.css'),
  ])
  assert.match(logger, /data-testid="set-log-header"/)
  assert.match(logger, /data-testid="set-log-row"/)
  assert.match(logger, />Previous</)
  assert.match(logger, /previousSetLabel/)
  assert.match(logger, /aria-label={`More options for set/)
  assert.match(logger, /Mark set \$\{i \+ 1\} done/)
  assert.match(logger, /More exercise actions/)
  assert.match(logger, /aria-label={`Move \$\{group\.name\} up`}/)
  assert.match(logger, /aria-label={`Move \$\{group\.name\} down`}/)
  assert.match(logger, /aria-label={`Remove \$\{group\.name\} from workout`}/)
  assert.match(logger, /aria-label={`Remove set \$\{i \+ 1\}`}/)
  assert.match(logger, /Confirm remove set \$\{i \+ 1\}/)
  assert.match(logger, /Confirm remove \$\{grouped\[pendingDeleteExerciseId\]\.name\}/)
  assert.match(styles, /@container workout-log \(max-width: 20rem\)[\s\S]*?\.workout-log-previous\s*\{\s*display:\s*none/)
  assert.doesNotMatch(logger, /<DifficultyChip[\s\S]{0,80}<DifficultyChip/)
})

test('exercise discovery keeps advanced filters behind one explicit control', async () => {
  const picker = await source('../src/app/workout/[id]/ExercisePickerSheet.tsx')
  assert.match(picker, /showFilters/)
  assert.match(picker, /aria-expanded={showFilters}/)
  assert.match(picker, /Filters\{/)
  assert.match(picker, /min-h-12/)
  assert.match(picker, /aria-label={`Exercise details:/)
})

test('dashboard presents the pending plan before secondary check-in and history', async () => {
  const dashboard = await source('../src/app/dashboard/page.tsx')
  const plan = dashboard.indexOf('<WorkoutPlanAgenda')
  const readiness = dashboard.indexOf('<DailyReadinessCard')
  const calendar = dashboard.indexOf('training-calendar-heading')
  assert.ok(plan > 0 && readiness > plan && calendar > readiness)
  assert.doesNotMatch(dashboard, /quick-actions-title/)
})
