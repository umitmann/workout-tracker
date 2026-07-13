import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('trainer planning and result reads stay in server-only DTO DALs behind narrow RPCs', async () => {
  const [planningDal, resultDal] = await Promise.all([
    source('../src/lib/trainerPlanningDal.ts'),
    source('../src/lib/trainerResultDal.ts'),
  ])

  for (const dal of [planningDal, resultDal]) {
    assert.match(dal, /^import ['"]server-only['"]/)
    assert.doesNotMatch(dal, /SUPABASE_SERVICE_ROLE_KEY|createServiceSupabaseClient/)
    assert.doesNotMatch(dal, /\.from\(['"](?:workouts|sets|body_weights|workout_plans)/)
  }
  for (const rpc of ['list_my_workout_plans', 'get_workout_plan']) {
    assert.match(planningDal, new RegExp(`['"]${rpc}['"]`))
  }
  for (const rpc of [
    'trainer_get_completed_workouts',
    'trainer_get_completed_workout_sets',
    'trainer_get_bodyweights',
  ]) {
    assert.match(resultDal, new RegExp(`['"]${rpc}['"]`))
  }
})

test('trainer workspace has a protected client list and relationship-scoped client page', async () => {
  const [listPage, detailPage] = await Promise.all([
    source('../src/app/trainer/clients/page.tsx'),
    source('../src/app/trainer/clients/[id]/page.tsx'),
  ])
  for (const page of [listPage, detailPage]) {
    assert.match(page, /getServerAuthContext\(\)/)
    assert.match(page, /if \(!user\) redirect\('\/'\)/)
  }
  assert.match(listPage, /my_role === ['"]trainer['"]/)
  assert.match(detailPage, /relationship\.my_role !== ['"]trainer['"]/)
  assert.match(detailPage, /Access ended/)
  assert.match(detailPage, /Results are not shared/)
  assert.match(detailPage, /Results temporarily unavailable/)
  assert.match(detailPage, /Bodyweight temporarily unavailable/)
  assert.match(detailPage, /Completed workouts/)
  assert.match(detailPage, /Client calendar/)
})

test('scheduling UI is an accessible, bounded dialog with clear snapshot language', async () => {
  const dialog = await source('../src/app/trainer/clients/[id]/ScheduleWorkoutDialog.tsx')
  assert.match(dialog, /<Modal[\s\S]+title="Schedule workout"/)
  assert.match(dialog, /Workout template/)
  assert.match(dialog, /Scheduled date/)
  assert.match(dialog, /name="title"[\s\S]+maxLength=\{120\}/)
  assert.match(dialog, /name="instructions"[\s\S]+maxLength=\{2000\}/)
  assert.match(dialog, /fixed snapshot/i)
  assert.match(dialog, /Workout assigned/)
  assert.match(dialog, /function ScheduleWorkoutModal/)
  assert.match(dialog, /open && \(\s*<ScheduleWorkoutModal/)
})

test('trainee dashboard exposes trainer plans with attribution, detail, and one start action', async () => {
  const [dashboard, agenda, planningDal] = await Promise.all([
    source('../src/app/dashboard/page.tsx'),
    source('../src/app/dashboard/WorkoutPlanAgenda.tsx'),
    source('../src/lib/trainerPlanningDal.ts'),
  ])
  assert.match(dashboard, /listAttributedWorkoutPlanDetails/)
  assert.match(dashboard, /planReadFailed/)
  assert.match(dashboard, /<WorkoutPlanAgenda[\s\S]+loadFailed=\{planReadFailed\}/)
  assert.match(agenda, /Assigned by/)
  assert.match(agenda, /startWorkoutPlanAction/)
  assert.match(agenda, /router\.push\(`\/workout\/\$\{state\.workoutId\}`\)/)
  assert.match(agenda, /The prescription is fixed/i)
  assert.match(agenda, /function WorkoutPlanModal/)
  assert.match(agenda, /selected && \([\s\S]+<WorkoutPlanModal[\s\S]+key=\{selected\.plan_id\}/)
  assert.match(agenda, /Plans temporarily unavailable/)
  assert.match(planningDal, /try\s*\{[\s\S]+listTrainerRelationshipAudit[\s\S]+\}\s*catch\s*\{/)
  assert.match(planningDal, /attribution\.get\(plan\.plan_id\) \?\? ['"]Your trainer['"]/)
})

test('trainee accounts do not receive trainer workspace navigation by default', async () => {
  const dashboard = await source('../src/app/dashboard/page.tsx')
  assert.match(dashboard, /const hasTrainerRole = trainerRelationships\.some\(/)
  assert.match(dashboard, /relationship\.my_role === ['"]trainer['"]/)
  assert.match(dashboard, /showTrainerTools: hasTrainerRole/)
  assert.match(dashboard, /\{hasTrainerRole && \([\s\S]+href="\/trainer\/clients"/)
})

test('a started plan hydrates the logger from its immutable snapshot, not the trainer routine', async () => {
  const workoutPage = await source('../src/app/workout/[id]/page.tsx')
  assert.match(workoutPage, /getWorkoutPlanAsRoutine/)
  assert.match(workoutPage, /plan_id/)
})

test('trainee access manager keeps workout results and bodyweight independent', async () => {
  const manager = await source('../src/app/connections/ManageAccessDialog.tsx')
  assert.match(manager, /title="Trainer access"/)
  assert.match(manager, /type="checkbox"[\s\S]+Completed workout results/)
  assert.match(manager, /type="checkbox"[\s\S]+Bodyweight history/)
  assert.match(manager, /Save access/)
  assert.match(manager, /Access updated/)
})

test('the refreshed shell provides keyboard navigation, current-page semantics, and notification badges', async () => {
  const [shell, globals] = await Promise.all([
    source('../src/components/AppShell.tsx'),
    source('../src/app/globals.css'),
  ])
  assert.match(shell, /Skip to content/)
  assert.match(shell, /aria-current/)
  assert.match(shell, /aria-label="Primary navigation"/)
  assert.match(shell, /notificationCount/)
  assert.match(globals, /:focus-visible/)
  assert.match(globals, /prefers-reduced-motion/)
  assert.match(globals, /--color-brand/)
})
