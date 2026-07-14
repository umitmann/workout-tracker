import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('privacy-safe 404 gives unauthorized and missing resources a clear heading', async () => {
  const notFound = await source('../src/app/not-found.tsx')
  assert.match(notFound, /<h1[^>]*>Not found<\/h1>/i)
  assert.match(notFound, /does not exist or you do not have access/i)
  assert.doesNotMatch(notFound, /email|user_id|relationship_id/i)
})

test('trainer application hints do not pollute exact accessible field names', async () => {
  const form = await source('../src/app/trainers/apply/TrainerProfileForm.tsx')
  assert.match(form, /<label htmlFor="trainer-specialties"[^>]*>\s*Specialties\s*<\/label>/)
  assert.match(form, /id="trainer-specialties"[\s\S]+aria-describedby="trainer-specialties-hint"/)
  assert.match(form, /id="trainer-specialties-hint"/)
  assert.match(form, /<label htmlFor="trainer-bio"[^>]*>\s*Public bio\s*<\/label>/)
})

test('connection status has one unambiguous active text node', async () => {
  const card = await source('../src/app/connections/ConnectionCard.tsx')
  assert.match(card, /A connection alone does not share workout results or bodyweight/)
  assert.doesNotMatch(card, />\s*An active connection does not share workout results/)
  assert.match(
    card,
    /acceptState\?\.success && relationship\.status === 'active'[\s\S]+\? 'Connected'/,
  )
})

test('calendar month controls meet the 44px product touch target', async () => {
  const calendar = await source('../src/app/workouts/CalendarView.tsx')
  assert.match(calendar, /aria-label="Previous month"[\s\S]+min-h-11 min-w-11/)
  assert.match(calendar, /aria-label="Next month"[\s\S]+min-h-11 min-w-11/)
})

test('successful plan start redirects from the server action to the created workout', async () => {
  const action = await source('../src/app/actions/trainerPlanning.ts')
  assert.match(action, /import \{ redirect \} from ['"]next\/navigation['"]/)
  assert.match(
    action,
    /startWorkoutPlanCore[\s\S]+if \(result\.success && result\.workoutId\)[\s\S]+redirect\(`\/workout\/\$\{result\.workoutId\}`\)/,
  )
})

test('workout assignment success exposes one unambiguous confirmation', async () => {
  const dialog = await source('../src/app/trainer/clients/[id]/ScheduleWorkoutDialog.tsx')
  assert.match(dialog, /<strong[^>]*>Assignment confirmed<\/strong>/)
  assert.doesNotMatch(dialog, /<strong[^>]*>Workout assigned<\/strong>/)
})

test('calendar captions use WCAG-safe foreground colors', async () => {
  const calendar = await source('../src/app/workouts/CalendarView.tsx')
  assert.match(
    calendar,
    /DAY_NAMES\.map[\s\S]+text-zinc-600 dark:text-zinc-400[\s\S]+\{d\}/,
  )
  for (const label of ['Completed', 'In progress', 'Planned']) {
    assert.match(
      calendar,
      new RegExp(`text-zinc-600 dark:text-zinc-400[^>]*>${label}<`),
    )
  }
})

test('bodyweight captions use WCAG-safe foreground colors', async () => {
  const card = await source('../src/app/dashboard/BodyweightCard.tsx')
  for (const label of ['Bodyweight', 'Export for PT']) {
    assert.match(
      card,
      new RegExp(`text-zinc-600 dark:text-zinc-400[^>]*>${label}<`),
    )
  }
})

test('trainer result views fail closed when consent changes during a read', async () => {
  const page = await source('../src/app/trainer/clients/[id]/page.tsx')
  assert.match(page, /isAuthorizationDenied/)
  assert.match(page, /workoutReadDenied/)
  assert.match(page, /bodyweightReadDenied/)
  assert.match(
    page,
    /workoutResultsShared\s*=\s*relationship\.workout_results_access\s*&&\s*!workoutReadDenied/,
  )
  assert.match(
    page,
    /bodyweightShared\s*=\s*relationship\.bodyweight_access\s*&&\s*!bodyweightReadDenied/,
  )
})

test('consent mutations invalidate trainer workspace summaries and details', async () => {
  const actions = await source('../src/app/actions/trainerRelationships.ts')
  assert.match(actions, /revalidatePath\('\/trainer\/clients'\)/)
  assert.match(actions, /revalidatePath\(`\/trainer\/clients\/\$\{relationshipId\}`\)/)
})

test('the PT Requests dashboard action opens the request inbox it names', async () => {
  const dashboard = await source('../src/app/dashboard/page.tsx')
  assert.match(
    dashboard,
    /<Link href="\/trainer\/connections"[^>]*>[\s\S]*?\{ptRequestsLabel\}[\s\S]*?<\/Link>/,
  )
})

test('relationship cards keep a stable key when pending changes to active', async () => {
  const inbox = await source('../src/app/trainer/connections/page.tsx')
  assert.match(inbox, /const current = \[\.\.\.pending, \.\.\.active\]/)
  assert.match(
    inbox,
    /current\.map\(\(relationship\) => <ConnectionCard key=\{relationship\.relationship_id\}/,
  )
  assert.equal(
    (inbox.match(/<ConnectionCard key=\{relationship\.relationship_id\}/g) ?? []).length,
    1,
  )
})

test('past trainee relationships are compact audit links, not actionable cards', async () => {
  const page = await source('../src/app/connections/page.tsx')
  assert.equal(
    (page.match(/<ConnectionCard key=\{relationship\.relationship_id\}/g) ?? []).length,
    1,
  )
  assert.match(page, /past\.map\(\(relationship\) => \(\s*<li/)
  assert.match(page, /href=\{`\/connections\/\$\{relationship\.relationship_id\}`\}/)
})

test('terminal relationship feedback survives before the card becomes history', async () => {
  const [card, actions, page] = await Promise.all([
    source('../src/app/connections/ConnectionCard.tsx'),
    source('../src/app/actions/trainerRelationships.ts'),
    source('../src/app/connections/page.tsx'),
  ])
  assert.match(card, /const effectiveStatus = endState\?\.success/)
  assert.match(card, /declineState\?\.success[\s\S]+['"]declined['"]/)
  assert.match(card, /statusClass\[effectiveStatus\]/)
  assert.match(
    actions,
    /endTrainerRelationshipCore[\s\S]+revalidateRelationshipViews\(formData, \{ participantPages: false \}\)/,
  )
  assert.match(card, /const persistedTerminalState[\s\S]+Connection ended/)
  assert.match(page, /const featured = current\.length > 0 \? current : historic\.slice\(0, 1\)/)
  assert.match(page, /const past = current\.length > 0 \? historic : historic\.slice\(1\)/)
})
