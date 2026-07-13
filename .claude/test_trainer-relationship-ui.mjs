import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = await Promise.all(
  [
    '../src/app/actions/trainerRelationships.ts',
    '../src/app/actions/trainerRelationshipCores.ts',
    '../src/app/trainers/[id]/page.tsx',
    '../src/app/trainers/[id]/RequestTrainingButton.tsx',
    '../src/app/connections/page.tsx',
    '../src/app/connections/ConnectionCard.tsx',
    '../src/app/connections/PermissionControl.tsx',
    '../src/app/trainer/connections/page.tsx',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')),
)

const [
  actions,
  actionCores,
  trainerDetail,
  requestButton,
  traineePage,
  connectionCard,
  permissionControl,
  trainerPage,
] = files

test('relationship mutations stay behind Server Actions and narrow RPCs', () => {
  assert.match(actions, /^'use server'/)
  assert.doesNotMatch(actions, /\.from\(/)
  assert.doesNotMatch(actionCores, /\.from\(/)
  assert.doesNotMatch(actions + actionCores, /SUPABASE_SERVICE_ROLE_KEY/)
  for (const rpc of [
    'request_trainer_relationship',
    'accept_trainer_relationship',
    'decline_trainer_relationship',
    'end_trainer_relationship',
    'grant_trainer_access',
    'revoke_trainer_access',
  ]) {
    assert.match(actionCores, new RegExp(`['"]${rpc}['"]`))
  }
})
test('trainer profile exposes request state with explicit no-auto-sharing copy', () => {
  assert.match(trainerDetail, /getMyRelationshipForTrainerProfile\(id\)/)
  assert.match(trainerDetail, /Connecting does not share workouts or bodyweight automatically/)
  assert.match(requestButton, /Request training/)
  assert.match(requestButton, /Request pending/)
})

test('both participant pages perform a current verified-user check', () => {
  for (const page of [traineePage, trainerPage, trainerDetail]) {
    assert.match(page, /getServerAuthContext\(\)/)
    assert.match(page, /if \(!user\) redirect\('\/'\)/)
  }
})

test('trainee controls workout and bodyweight grants independently', () => {
  assert.match(connectionCard, /permission="workout_results\.read"/)
  assert.match(connectionCard, /permission="bodyweight\.read"/)
  assert.match(connectionCard, /An active connection does not share workout results or bodyweight by itself/)
  assert.match(permissionControl, /name="historyScope"/)
  assert.match(permissionControl, /value="from_now"/)
  assert.match(permissionControl, /value="all"/)
  assert.match(permissionControl, /Revoke access/)
})

test('Phase 3 UI does not import workout or bodyweight result readers', () => {
  const combined = files.join('\n')
  assert.doesNotMatch(combined, /trainer_get_completed_workouts|trainer_get_bodyweights/)
  assert.doesNotMatch(combined, /getWorkoutsInRange|getBodyWeightsInRange/)
  assert.match(connectionCard, /result-reading remains disabled/)
})
