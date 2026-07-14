import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  assertLocalAppBaseUrl,
  readLocalLoadConfig,
} from '../scripts/setup-pt-local-load-session.mjs'

const fixture = {
  PT_E2E_BASE_URL: 'http://127.0.0.1:3002',
  PT_PLAN_E2E_RELATIONSHIP_ID: '00000000-0000-4000-8000-000000000001',
  PT_DIRECTORY_APPROVED_NAME: 'Approved PT',
  PT_E2E_TRAINEE_EMAIL: 'trainee@example.test',
  PT_E2E_TRAINEE_PASSWORD: 'trainee-password',
  PT_PLAN_E2E_TRAINER_EMAIL: 'trainer@example.test',
  PT_PLAN_E2E_TRAINER_PASSWORD: 'trainer-password',
}

test('local load-session setup accepts loopback and refuses remote targets', () => {
  assert.equal(assertLocalAppBaseUrl('http://localhost:3002/path'), 'http://localhost:3002')
  assert.throws(() => assertLocalAppBaseUrl('https://workout.example'), /loopback/)
  assert.throws(() => assertLocalAppBaseUrl('http://user:secret@127.0.0.1:3002'), /credentials/)
})

test('local load-session config keeps trainer and trainee identities separate', () => {
  const config = readLocalLoadConfig(fixture)
  assert.equal(config.dockerBaseUrl, 'http://host.docker.internal:3002')
  assert.equal(config.trainee.email, fixture.PT_E2E_TRAINEE_EMAIL)
  assert.equal(config.trainer.email, fixture.PT_PLAN_E2E_TRAINER_EMAIL)
  assert.notEqual(config.trainee.email, config.trainer.email)
})

test('generated load sessions are private ignored files and never log cookies', async () => {
  const source = await readFile(
    new URL('../scripts/setup-pt-local-load-session.mjs', import.meta.url),
    'utf8',
  )
  assert.match(source, /\.context\/pt-load-local\.env/)
  assert.match(source, /mode: 0o600/)
  assert.match(source, /chmod\(OUTPUT_PATH, 0o600\)/)
  assert.match(source, /PT_LOAD_EXERCISES_PATH/)
  assert.match(source, /PT_LOAD_EXERCISES_MARKER/)
  assert.doesNotMatch(source, /console\.log\([^\n]*(?:traineeCookie|trainerCookie)/)
})
