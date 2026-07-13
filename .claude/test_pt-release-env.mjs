import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  PT_E2E_RELEASE_REQUIRED,
  validatePtE2eReleaseEnv,
} from '../scripts/verify-pt-e2e-release-env.mjs'

function completeEnv() {
  return Object.fromEntries([
    ...PT_E2E_RELEASE_REQUIRED.map((name) => [name, `${name.toLowerCase()}-fixture`]),
    ['PT_E2E_BASE_URL', 'https://workout-tracker-staging.example.test'],
    ['PT_E2E_CONFIRM_DISPOSABLE_TARGET', 'yes'],
  ])
}

test('release E2E environment requires every dedicated multi-actor fixture', () => {
  assert.equal(new Set(PT_E2E_RELEASE_REQUIRED).size, PT_E2E_RELEASE_REQUIRED.length)
  for (const name of [
    'PT_E2E_TRAINEE_PASSWORD',
    'PT_E2E_TRAINER_PASSWORD',
    'PT_E2E_ADMIN_PASSWORD',
    'PT_PLAN_E2E_RELATIONSHIP_ID',
    'PT_PLAN_E2E_TEMPLATE_EXERCISE_MARKER',
  ]) {
    assert.ok(PT_E2E_RELEASE_REQUIRED.includes(name), `${name} must be required`)
  }

  const env = completeEnv()
  delete env.PT_E2E_OTHER_TRAINER_EMAIL
  const result = validatePtE2eReleaseEnv(env)
  assert.equal(result.ok, false)
  assert.match(result.message, /PT_E2E_OTHER_TRAINER_EMAIL/)
})

test('release E2E environment accepts an explicitly confirmed HTTPS staging target', () => {
  assert.deepEqual(validatePtE2eReleaseEnv(completeEnv()), {
    ok: true,
    baseUrl: 'https://workout-tracker-staging.example.test',
  })
})

test('release E2E environment refuses the production alias even when confirmed', () => {
  const env = completeEnv()
  env.PT_E2E_BASE_URL = 'https://workout-tracker-six-flame.vercel.app'
  const result = validatePtE2eReleaseEnv(env)
  assert.equal(result.ok, false)
  assert.match(result.message, /production/i)
})

test('release E2E environment requires explicit disposable-target confirmation', () => {
  const env = completeEnv()
  delete env.PT_E2E_CONFIRM_DISPOSABLE_TARGET
  const result = validatePtE2eReleaseEnv(env)
  assert.equal(result.ok, false)
  assert.match(result.message, /PT_E2E_CONFIRM_DISPOSABLE_TARGET=yes/)
})

test('release E2E environment allows local HTTP but rejects remote plaintext targets', () => {
  const local = completeEnv()
  local.PT_E2E_BASE_URL = 'http://127.0.0.1:3000'
  assert.equal(validatePtE2eReleaseEnv(local).ok, true)

  const remote = completeEnv()
  remote.PT_E2E_BASE_URL = 'http://staging.example.test'
  const result = validatePtE2eReleaseEnv(remote)
  assert.equal(result.ok, false)
  assert.match(result.message, /HTTPS/)
})

test('validation errors name variables but never echo credential values', () => {
  const env = completeEnv()
  env.PT_E2E_TRAINEE_PASSWORD = 'super-secret-value'
  env.PT_E2E_BASE_URL = 'not a url'
  const result = validatePtE2eReleaseEnv(env)
  assert.equal(result.ok, false)
  assert.doesNotMatch(result.message, /super-secret-value/)
})

test('the release command validates first and forces every gated suite on', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const command = pkg.scripts['test:pt:e2e:release']

  assert.equal(typeof command, 'string')
  assert.match(command, /^node scripts\/verify-pt-e2e-release-env\.mjs && /)
  for (const flag of [
    'PT_E2E_ENABLED',
    'PT_DIRECTORY_E2E_ENABLED',
    'PT_RELATIONSHIP_E2E_ENABLED',
    'PT_PLAN_START_E2E_ENABLED',
  ]) {
    assert.match(command, new RegExp(`${flag}=true`))
  }
  assert.match(command, /playwright test --config playwright\.pt\.config\.ts/)
  assert.doesNotMatch(command, /\|\| true|workout-tracker-six-flame/)
})
