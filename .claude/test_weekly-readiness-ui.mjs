import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('trainer dialog preserves day scheduling and adds a bounded flexible-week composer', async () => {
  const dialog = await source('../src/app/trainer/clients/[id]/ScheduleWorkoutDialog.tsx')
  assert.match(dialog, /Specific day/)
  assert.match(dialog, /Flexible week/)
  assert.match(dialog, /Scheduled date/)
  assert.match(dialog, /Week beginning/)
  assert.match(dialog, /weeklyTemplates\.length < 7/)
  assert.match(dialog, /You may choose the same template more than once/)
  assert.match(dialog, /assignTrainerWeekAction/)
  assert.match(dialog, /name="routineId"/)
})

test('trainee agenda makes pending weekly work and day choice explicit', async () => {
  const agenda = await source('../src/app/dashboard/WorkoutPlanAgenda.tsx')
  assert.match(agenda, /pendingCount/)
  assert.match(agenda, /left this week/)
  assert.match(agenda, /Choose your training day/)
  assert.match(agenda, /chooseWorkoutPlanDateAction/)
  assert.match(agenda, /Start today/)
  assert.match(agenda, /This training week has passed/)
  assert.match(agenda, /min=\{plan\.week_start\}/)
  assert.match(agenda, /max=\{plan\.week_end\}/)
})

test('daily readiness is an accessible private five-choice dashboard control', async () => {
  const [card, dashboard, dal] = await Promise.all([
    source('../src/app/dashboard/DailyReadinessCard.tsx'),
    source('../src/app/dashboard/page.tsx'),
    source('../src/lib/readinessDal.ts'),
  ])
  assert.match(card, /How are you feeling today\?/)
  assert.match(card, /Private to you/)
  assert.match(card, /READINESS_OPTIONS\.map/)
  assert.match(card, /aria-pressed/)
  assert.match(card, /saveDailyReadinessAction/)
  assert.match(dashboard, /getTodayReadiness/)
  assert.match(dashboard, /readinessAvailable/)
  assert.match(dashboard, /<DailyReadinessCard/)
  assert.match(dal, /^import ['"]server-only['"]/)
  assert.doesNotMatch(dal, /\.from\(['"]daily_readiness_checkins/)
})

test('weekly and readiness server actions revalidate without trusting browser identity', async () => {
  const [planning, readiness] = await Promise.all([
    source('../src/app/actions/trainerPlanning.ts'),
    source('../src/app/actions/readiness.ts'),
  ])
  assert.match(planning, /assignTrainerWeekCore/)
  assert.match(planning, /chooseWorkoutPlanDateCore/)
  assert.match(planning, /revalidatePlanningViews/)
  assert.match(readiness, /saveDailyReadinessCore/)
  assert.match(readiness, /revalidatePath\('\/dashboard'\)/)
  assert.doesNotMatch(readiness, /userId|user_id/)
})
