import { pathToFileURL } from 'node:url'

export const PT_E2E_RELEASE_REQUIRED = Object.freeze([
  'PT_E2E_TRAINEE_EMAIL',
  'PT_E2E_TRAINEE_PASSWORD',
  'PT_E2E_TRAINEE_NAME',
  'PT_E2E_TRAINER_EMAIL',
  'PT_E2E_TRAINER_PASSWORD',
  'PT_E2E_TRAINER_NAME',
  'PT_E2E_OTHER_TRAINER_EMAIL',
  'PT_E2E_OTHER_TRAINER_PASSWORD',
  'PT_E2E_APPLICANT_EMAIL',
  'PT_E2E_APPLICANT_PASSWORD',
  'PT_E2E_APPLICANT_NAME',
  'PT_E2E_ADMIN_EMAIL',
  'PT_E2E_ADMIN_PASSWORD',
  'PT_E2E_TRAINER_TEMPLATE_NAME',
  'PT_E2E_COMPLETED_WORKOUT_MARKER',
  'PT_E2E_PRIVATE_BODYWEIGHT_MARKER',
  'PT_E2E_PENDING_TRAINER_NAME',
  'PT_E2E_SUSPENDED_TRAINER_NAME',
  'PT_E2E_TRAINEE_PUBLIC_ID',
  'PT_PLAN_E2E_TRAINEE_EMAIL',
  'PT_PLAN_E2E_TRAINEE_PASSWORD',
  'PT_PLAN_E2E_TRAINER_EMAIL',
  'PT_PLAN_E2E_TRAINER_PASSWORD',
  'PT_PLAN_E2E_TRAINER_NAME',
  'PT_PLAN_E2E_RELATIONSHIP_ID',
  'PT_PLAN_E2E_TEMPLATE_NAME',
  'PT_PLAN_E2E_TEMPLATE_EXERCISE_MARKER',
  'PT_EXERCISE_E2E_TRAINER_EMAIL',
  'PT_EXERCISE_E2E_TRAINER_PASSWORD',
  'PT_EXERCISE_E2E_CLIENT_EMAIL',
  'PT_EXERCISE_E2E_CLIENT_PASSWORD',
  'PT_EXERCISE_E2E_OUTSIDER_EMAIL',
  'PT_EXERCISE_E2E_OUTSIDER_PASSWORD',
])

const PRODUCTION_HOSTS = new Set([
  'workout-tracker-six-flame.vercel.app',
])

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

export function validatePtE2eReleaseEnv(env) {
  const required = ['PT_E2E_BASE_URL', ...PT_E2E_RELEASE_REQUIRED]
  const missing = required.filter((name) => !hasText(env[name]))
  if (missing.length > 0) {
    return {
      ok: false,
      message: `Missing required PT E2E variables: ${missing.join(', ')}`,
    }
  }

  if (env.PT_E2E_CONFIRM_DISPOSABLE_TARGET !== 'yes') {
    return {
      ok: false,
      message: 'Set PT_E2E_CONFIRM_DISPOSABLE_TARGET=yes only for an isolated, resettable test target.',
    }
  }

  let target
  try {
    target = new URL(env.PT_E2E_BASE_URL)
  } catch {
    return { ok: false, message: 'PT_E2E_BASE_URL must be a valid absolute URL.' }
  }

  if (target.username || target.password) {
    return { ok: false, message: 'PT_E2E_BASE_URL must not contain credentials.' }
  }

  if (PRODUCTION_HOSTS.has(target.hostname.toLowerCase())) {
    return {
      ok: false,
      message: 'The stateful PT release suite is blocked against the production application.',
    }
  }

  if (target.protocol !== 'https:' && !(target.protocol === 'http:' && LOCAL_HOSTS.has(target.hostname))) {
    return {
      ok: false,
      message: 'Remote PT E2E targets must use HTTPS; HTTP is permitted only for localhost.',
    }
  }

  return {
    ok: true,
    baseUrl: target.href.replace(/\/$/, ''),
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null
if (invokedPath === import.meta.url) {
  const result = validatePtE2eReleaseEnv(process.env)
  if (!result.ok) {
    console.error(result.message)
    process.exitCode = 1
  } else {
    console.log(`PT E2E release environment verified for ${result.baseUrl}`)
  }
}
