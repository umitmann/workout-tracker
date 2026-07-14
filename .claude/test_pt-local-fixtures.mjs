import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  PT_LOCAL_QA_OUTPUT_NAMES,
  validatePtLocalQaTarget,
} from '../scripts/setup-pt-local-qa.mjs'
import { PT_E2E_RELEASE_REQUIRED } from '../scripts/verify-pt-e2e-release-env.mjs'

test('local QA fixture setup accepts loopback only and requires all credentials', () => {
  const valid = {
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'local-service-key',
  }

  assert.deepEqual(validatePtLocalQaTarget(valid), {
    ok: true,
    url: 'http://127.0.0.1:54321',
  })
  assert.equal(validatePtLocalQaTarget({ ...valid, NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321' }).ok, true)

  for (const unsafeUrl of [
    'https://workout-tracker-six-flame.vercel.app',
    'https://example.supabase.co',
    'http://192.168.1.20:54321',
    'http://user:pass@127.0.0.1:54321',
  ]) {
    assert.equal(
      validatePtLocalQaTarget({ ...valid, NEXT_PUBLIC_SUPABASE_URL: unsafeUrl }).ok,
      false,
      `${unsafeUrl} must be rejected`,
    )
  }

  for (const missing of Object.keys(valid)) {
    assert.equal(validatePtLocalQaTarget({ ...valid, [missing]: '' }).ok, false)
  }
})

test('local fixture output satisfies strict release and direct-JWT suites', () => {
  for (const name of PT_E2E_RELEASE_REQUIRED) {
    assert.ok(PT_LOCAL_QA_OUTPUT_NAMES.includes(name), `missing release fixture ${name}`)
  }

  for (const name of [
    'PT_E2E_CONFIRM_DISPOSABLE_TARGET',
    'PT_RLS_TRAINEE_ACCESS_TOKEN',
    'PT_RLS_TRAINER_ACCESS_TOKEN',
    'PT_RLS_OTHER_TRAINER_ACCESS_TOKEN',
    'PT_DIRECTORY_TRAINEE_ACCESS_TOKEN',
    'PT_DIRECTORY_APPROVED_TRAINER_ACCESS_TOKEN',
    'PT_PLANNING_TRAINER_ACCESS_TOKEN',
    'PT_PLANNING_TRAINEE_ACCESS_TOKEN',
    'PT_PLANNING_OUTSIDER_ACCESS_TOKEN',
    'PT_RELATIONSHIP_TRAINEE_ACCESS_TOKEN',
    'PT_RELATIONSHIP_TRAINER_ACCESS_TOKEN',
    'PT_RELATIONSHIP_OUTSIDER_ACCESS_TOKEN',
  ]) {
    assert.ok(PT_LOCAL_QA_OUTPUT_NAMES.includes(name), `missing direct-JWT fixture ${name}`)
  }
})
