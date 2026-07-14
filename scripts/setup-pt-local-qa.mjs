import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const PASSWORD = 'Local-PT-QA-Only!2026'

export const PT_LOCAL_QA_OUTPUT_NAMES = Object.freeze([
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'PT_E2E_BASE_URL',
  'PT_E2E_CONFIRM_DISPOSABLE_TARGET',
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
  'PT_RLS_TRAINEE_ACCESS_TOKEN',
  'PT_RLS_TRAINER_ACCESS_TOKEN',
  'PT_RLS_OTHER_TRAINER_ACCESS_TOKEN',
  'PT_RLS_COMPLETED_WORKOUT_ID',
  'PT_RLS_IN_PROGRESS_WORKOUT_ID',
  'PT_RLS_ACTIVE_GRANT_RELATIONSHIP_ID',
  'PT_RLS_NO_GRANT_RELATIONSHIP_ID',
  'PT_RLS_ENDED_RELATIONSHIP_ID',
  'PT_RLS_BODYWEIGHT_DATE',
  'PT_RLS_BODYWEIGHT_VALUE',
  'PT_RLS_RANGE_FROM',
  'PT_RLS_RANGE_TO',
  'PT_DIRECTORY_TRAINEE_ACCESS_TOKEN',
  'PT_DIRECTORY_APPROVED_TRAINER_ACCESS_TOKEN',
  'PT_DIRECTORY_APPROVED_NAME',
  'PT_DIRECTORY_PENDING_NAME',
  'PT_DIRECTORY_SUSPENDED_NAME',
  'PT_PLANNING_TRAINER_ACCESS_TOKEN',
  'PT_PLANNING_TRAINEE_ACCESS_TOKEN',
  'PT_PLANNING_OUTSIDER_ACCESS_TOKEN',
  'PT_PLANNING_ACTIVE_RELATIONSHIP_ID',
  'PT_PLANNING_TRAINER_ROUTINE_ID',
  'PT_PLANNING_SCHEDULED_DATE',
  'PT_RELATIONSHIP_TRAINEE_ACCESS_TOKEN',
  'PT_RELATIONSHIP_TRAINER_ACCESS_TOKEN',
  'PT_RELATIONSHIP_OUTSIDER_ACCESS_TOKEN',
  'PT_RELATIONSHIP_TRAINER_PROFILE_ID',
  'PT_RELATIONSHIP_TRAINEE_WORKOUT_ID',
  'PT_RELATIONSHIP_TRAINEE_BODYWEIGHT_ID',
  'PT_EXERCISE_E2E_TRAINER_EMAIL',
  'PT_EXERCISE_E2E_TRAINER_PASSWORD',
  'PT_EXERCISE_E2E_CLIENT_EMAIL',
  'PT_EXERCISE_E2E_CLIENT_PASSWORD',
  'PT_EXERCISE_E2E_OUTSIDER_EMAIL',
  'PT_EXERCISE_E2E_OUTSIDER_PASSWORD',
  'PT_EXERCISE_RLS_TRAINER_ACCESS_TOKEN',
  'PT_EXERCISE_RLS_CLIENT_ACCESS_TOKEN',
  'PT_EXERCISE_RLS_OUTSIDER_ACCESS_TOKEN',
  'PT_EXERCISE_RLS_RELATIONSHIP_ID',
])

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

export function validatePtLocalQaTarget(env) {
  for (const name of [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]) {
    if (!hasText(env[name])) {
      return { ok: false, message: `Missing required local QA variable: ${name}` }
    }
  }

  let target
  try {
    target = new URL(env.NEXT_PUBLIC_SUPABASE_URL)
  } catch {
    return { ok: false, message: 'NEXT_PUBLIC_SUPABASE_URL must be an absolute URL.' }
  }

  if (
    target.protocol !== 'http:'
    || !LOCAL_HOSTS.has(target.hostname)
    || target.username
    || target.password
  ) {
    return {
      ok: false,
      message: 'Local PT fixtures are restricted to credential-free HTTP loopback URLs.',
    }
  }

  return { ok: true, url: target.href.replace(/\/$/, '') }
}

function actor(email, displayName) {
  return { email, displayName, password: PASSWORD }
}

const ACTORS = Object.freeze({
  trainee: actor('trainee@pt-local.test', 'Morgan Trainee'),
  trainer: actor('trainer@pt-local.test', 'Alex Strong PT'),
  otherTrainer: actor('other-trainer@pt-local.test', 'Taylor Other PT'),
  applicant: actor('applicant@pt-local.test', 'Jordan Applicant'),
  admin: actor('admin@pt-local.test', 'Casey Admin'),
  pendingTrainer: actor('pending-trainer@pt-local.test', 'Pending Hidden PT'),
  suspendedTrainer: actor('suspended-trainer@pt-local.test', 'Suspended Hidden PT'),
  planTrainee: actor('plan-trainee@pt-local.test', 'Plan Trainee'),
  planTrainer: actor('plan-trainer@pt-local.test', 'Plan Trainer PT'),
  resultsTrainee: actor('results-trainee@pt-local.test', 'Results Trainee'),
  resultsTrainer: actor('results-trainer@pt-local.test', 'Results Trainer PT'),
  resultsOtherTrainer: actor('results-outsider@pt-local.test', 'Results Outsider PT'),
  resultsNoGrantTrainee: actor('results-no-grant@pt-local.test', 'No Grant Trainee'),
  planningTrainee: actor('planning-trainee@pt-local.test', 'Planning Trainee'),
  planningTrainer: actor('planning-trainer@pt-local.test', 'Planning Trainer PT'),
  planningOutsider: actor('planning-outsider@pt-local.test', 'Planning Outsider'),
  relationshipTrainee: actor('relationship-trainee@pt-local.test', 'Relationship Trainee'),
  relationshipTrainer: actor('relationship-trainer@pt-local.test', 'Relationship Trainer PT'),
  relationshipOutsider: actor('relationship-outsider@pt-local.test', 'Relationship Outsider'),
  exerciseTrainer: actor('exercise-trainer@pt-local.test', 'Exercise Trainer PT'),
  exerciseClient: actor('exercise-client@pt-local.test', 'Exercise Client'),
  exerciseOutsider: actor('exercise-outsider@pt-local.test', 'Exercise Outsider'),
})

function dateDaysFromNow(days) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function timestampHoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`
}

async function requiredResult(label, promise) {
  const result = await promise
  if (result.error) throw new Error(`${label}: ${result.error.message}`)
  return result.data
}

export async function setupPtLocalQa(env = process.env) {
  const validation = validatePtLocalQaTarget(env)
  if (!validation.ok) throw new Error(validation.message)

  const supabaseUrl = validation.url
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
  const appUrl = env.PT_LOCAL_APP_URL || 'http://127.0.0.1:3000'
  const outputPath = resolve(env.PT_LOCAL_QA_OUTPUT || '.context/pt-local-qa.env')

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const existingUsers = await requiredResult(
    'list disposable users',
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  )
  if (existingUsers.users.some((user) => user.email?.endsWith('@pt-local.test'))) {
    throw new Error('Local PT fixtures already exist. Run `supabase db reset` before reseeding.')
  }

  const users = {}
  for (const [key, fixture] of Object.entries(ACTORS)) {
    const data = await requiredResult(
      `create ${key}`,
      admin.auth.admin.createUser({
        email: fixture.email,
        password: fixture.password,
        email_confirm: true,
        user_metadata: { display_name: fixture.displayName },
      }),
    )
    users[key] = data.user
  }

  const tokens = {}
  for (const [key, fixture] of Object.entries(ACTORS)) {
    const auth = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const data = await requiredResult(
      `sign in ${key}`,
      auth.auth.signInWithPassword({ email: fixture.email, password: fixture.password }),
    )
    if (!data.session?.access_token) throw new Error(`sign in ${key}: access token missing`)
    tokens[key] = data.session.access_token
  }

  const insertOne = async (table, row) => requiredResult(
    `seed ${table}`,
    admin.from(table).insert(row).select('*').single(),
  )
  const insertMany = async (table, rows) => requiredResult(
    `seed ${table}`,
    admin.from(table).insert(rows).select('*'),
  )

  await insertOne('platform_roles', {
    user_id: users.admin.id,
    role: 'platform_admin',
    granted_by: users.admin.id,
  })

  const reviewedAt = timestampHoursAgo(48)
  const approvedTrainerKeys = [
    'trainer',
    'otherTrainer',
    'planTrainer',
    'resultsTrainer',
    'resultsOtherTrainer',
    'planningTrainer',
    'relationshipTrainer',
    'exerciseTrainer',
  ]
  const trainerProfiles = {}
  for (const key of approvedTrainerKeys) {
    trainerProfiles[key] = await insertOne('trainer_profiles', {
      user_id: users[key].id,
      display_name: ACTORS[key].displayName,
      bio: 'Disposable local QA trainer profile.',
      specialties: ['strength-training', 'mobility'],
      remote_available: true,
      location_text: 'Amsterdam',
      accepting_clients: true,
      listing_status: 'published',
      verification_status: 'approved',
      reviewed_at: reviewedAt,
      reviewed_by: users.admin.id,
    })
  }
  trainerProfiles.pendingTrainer = await insertOne('trainer_profiles', {
    user_id: users.pendingTrainer.id,
    display_name: ACTORS.pendingTrainer.displayName,
    bio: 'Must remain undiscoverable while pending.',
    specialties: ['strength-training'],
    accepting_clients: true,
    listing_status: 'published',
    verification_status: 'pending',
  })
  trainerProfiles.suspendedTrainer = await insertOne('trainer_profiles', {
    user_id: users.suspendedTrainer.id,
    display_name: ACTORS.suspendedTrainer.displayName,
    bio: 'Must remain undiscoverable while suspended.',
    specialties: ['strength-training'],
    accepting_clients: true,
    listing_status: 'published',
    verification_status: 'suspended',
    reviewed_at: reviewedAt,
    reviewed_by: users.admin.id,
  })

  const exerciseMarker = 'QA Snapshot Squat 47391'
  const exercise = await insertOne('exercises', {
    name: exerciseMarker,
    category: 'strength',
    equipment: 'barbell',
    muscles: ['quadriceps'],
    muscles_secondary: ['glutes'],
    instructions: ['Use the disposable QA prescription.'],
  })

  async function createRoutine(ownerKey, name) {
    const routine = await insertOne('routines', {
      user_id: users[ownerKey].id,
      name,
      is_preset: false,
    })
    await insertOne('routine_exercises', {
      routine_id: routine.id,
      exercise_id: exercise.id,
      sets: 3,
      reps: 8,
      weight: 60,
      set_details: [
        { reps: 8, weight: 60 },
        { reps: 8, weight: 52.5 },
        { reps: 8, weight: 45 },
      ],
      tempo: '3-1-2-1',
      rest_seconds: 75,
      order: 0,
    })
    return routine
  }

  const mainTemplateName = 'QA Trainer Strength Template'
  const planTemplateName = 'QA Snapshot Template'
  await createRoutine('trainer', mainTemplateName)
  await createRoutine('planTrainer', planTemplateName)
  const planningRoutine = await createRoutine('planningTrainer', 'QA Planning RLS Template')
  const completedMarkerRoutine = await createRoutine('trainee', 'QA Completed Result Source')

  async function activeRelationship(trainerKey, traineeKey) {
    const createdAt = timestampHoursAgo(72)
    const acceptedAt = timestampHoursAgo(70)
    const activatedAt = timestampHoursAgo(69)
    return insertOne('trainer_relationships', {
      trainer_id: users[trainerKey].id,
      trainee_id: users[traineeKey].id,
      initiated_by: users[traineeKey].id,
      status: 'active',
      trainer_accepted_at: acceptedAt,
      trainee_accepted_at: createdAt,
      activated_at: activatedAt,
      created_at: createdAt,
      updated_at: activatedAt,
    })
  }

  async function endedRelationship(trainerKey, traineeKey) {
    const createdAt = timestampHoursAgo(144)
    const traineeAcceptedAt = timestampHoursAgo(142)
    const trainerAcceptedAt = timestampHoursAgo(140)
    const activatedAt = timestampHoursAgo(139)
    const endedAt = timestampHoursAgo(96)
    return insertOne('trainer_relationships', {
      trainer_id: users[trainerKey].id,
      trainee_id: users[traineeKey].id,
      initiated_by: users[traineeKey].id,
      status: 'ended',
      trainer_accepted_at: trainerAcceptedAt,
      trainee_accepted_at: traineeAcceptedAt,
      activated_at: activatedAt,
      ended_at: endedAt,
      ended_by: users[traineeKey].id,
      created_at: createdAt,
      updated_at: endedAt,
    })
  }

  const planRelationship = await activeRelationship('planTrainer', 'planTrainee')
  const resultsGrantRelationship = await activeRelationship('resultsTrainer', 'resultsTrainee')
  const resultsNoGrantRelationship = await activeRelationship('resultsTrainer', 'resultsNoGrantTrainee')
  const resultsEndedRelationship = await endedRelationship('resultsTrainer', 'resultsTrainee')
  const planningRelationship = await activeRelationship('planningTrainer', 'planningTrainee')
  const exerciseRelationship = await activeRelationship('exerciseTrainer', 'exerciseClient')

  const rangeFrom = dateDaysFromNow(-30)
  const rangeTo = dateDaysFromNow(1)
  const activeGrantTime = timestampHoursAgo(48)
  await insertMany('trainer_access_grants', [
    {
      relationship_id: resultsGrantRelationship.id,
      permission: 'workout_results.read',
      granted_by: users.resultsTrainee.id,
      granted_at: activeGrantTime,
      resource_date_from: rangeFrom,
    },
    {
      relationship_id: resultsGrantRelationship.id,
      permission: 'bodyweight.read',
      granted_by: users.resultsTrainee.id,
      granted_at: activeGrantTime,
      resource_date_from: rangeFrom,
    },
    {
      relationship_id: resultsEndedRelationship.id,
      permission: 'workout_results.read',
      granted_by: users.resultsTrainee.id,
      granted_at: timestampHoursAgo(120),
    },
  ])

  const completedWorkoutMarker = 'QA Completed Workout 47391'
  const privateBodyweightValue = 73.241
  const completedDate = dateDaysFromNow(0)
  const traineeApi = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${tokens.trainee}` } },
  })
  const selfPlanId = await requiredResult(
    'seed self-scheduled completed plan',
    traineeApi.rpc('schedule_my_workout_from_routine', {
      p_routine_id: completedMarkerRoutine.id,
      p_scheduled_date: completedDate,
      p_title: completedWorkoutMarker,
      p_instructions: 'Disposable completed-result marker.',
    }),
  )
  const mainCompletedWorkout = await insertOne('workouts', {
    user_id: users.trainee.id,
    date: completedDate,
    status: 'completed',
    plan_id: selfPlanId,
  })
  await insertOne('sets', {
    workout_id: mainCompletedWorkout.id,
    exercise_id: exercise.id,
    user_id: users.trainee.id,
    weight: 62.5,
    reps: 8,
    rest_seconds: 75,
    difficulty: 3,
  })
  await insertOne('workouts', {
    user_id: users.trainee.id,
    date: dateDaysFromNow(0),
    status: 'in_progress',
  })
  await insertOne('body_weights', {
    user_id: users.trainee.id,
    date: completedDate,
    weight: privateBodyweightValue,
  })

  const resultCompletedDate = dateDaysFromNow(-2)
  const resultCompletedWorkout = await insertOne('workouts', {
    user_id: users.resultsTrainee.id,
    date: resultCompletedDate,
    status: 'completed',
  })
  const resultInProgressWorkout = await insertOne('workouts', {
    user_id: users.resultsTrainee.id,
    date: dateDaysFromNow(-1),
    status: 'in_progress',
  })
  await insertMany('sets', [
    {
      workout_id: resultCompletedWorkout.id,
      exercise_id: exercise.id,
      user_id: users.resultsTrainee.id,
      weight: 80,
      reps: 5,
      difficulty: 4,
    },
    {
      workout_id: resultInProgressWorkout.id,
      exercise_id: exercise.id,
      user_id: users.resultsTrainee.id,
      weight: 75,
      reps: 6,
      difficulty: 3,
    },
  ])
  const resultBodyweightValue = 71.234
  await insertOne('body_weights', {
    user_id: users.resultsTrainee.id,
    date: resultCompletedDate,
    weight: resultBodyweightValue,
  })

  const relationshipWorkout = await insertOne('workouts', {
    user_id: users.relationshipTrainee.id,
    date: dateDaysFromNow(-3),
    status: 'completed',
  })
  const relationshipBodyweight = await insertOne('body_weights', {
    user_id: users.relationshipTrainee.id,
    date: dateDaysFromNow(-3),
    weight: 69.5,
  })

  const output = {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    PT_E2E_BASE_URL: appUrl,
    PT_E2E_CONFIRM_DISPOSABLE_TARGET: 'yes',
    PT_E2E_TRAINEE_EMAIL: ACTORS.trainee.email,
    PT_E2E_TRAINEE_PASSWORD: PASSWORD,
    PT_E2E_TRAINEE_NAME: ACTORS.trainee.displayName,
    PT_E2E_TRAINER_EMAIL: ACTORS.trainer.email,
    PT_E2E_TRAINER_PASSWORD: PASSWORD,
    PT_E2E_TRAINER_NAME: ACTORS.trainer.displayName,
    PT_E2E_OTHER_TRAINER_EMAIL: ACTORS.otherTrainer.email,
    PT_E2E_OTHER_TRAINER_PASSWORD: PASSWORD,
    PT_E2E_APPLICANT_EMAIL: ACTORS.applicant.email,
    PT_E2E_APPLICANT_PASSWORD: PASSWORD,
    PT_E2E_APPLICANT_NAME: ACTORS.applicant.displayName,
    PT_E2E_ADMIN_EMAIL: ACTORS.admin.email,
    PT_E2E_ADMIN_PASSWORD: PASSWORD,
    PT_E2E_TRAINER_TEMPLATE_NAME: mainTemplateName,
    PT_E2E_COMPLETED_WORKOUT_MARKER: completedWorkoutMarker,
    PT_E2E_PRIVATE_BODYWEIGHT_MARKER: String(privateBodyweightValue),
    PT_E2E_PENDING_TRAINER_NAME: ACTORS.pendingTrainer.displayName,
    PT_E2E_SUSPENDED_TRAINER_NAME: ACTORS.suspendedTrainer.displayName,
    PT_E2E_TRAINEE_PUBLIC_ID: users.trainee.id,
    PT_PLAN_E2E_TRAINEE_EMAIL: ACTORS.planTrainee.email,
    PT_PLAN_E2E_TRAINEE_PASSWORD: PASSWORD,
    PT_PLAN_E2E_TRAINER_EMAIL: ACTORS.planTrainer.email,
    PT_PLAN_E2E_TRAINER_PASSWORD: PASSWORD,
    PT_PLAN_E2E_TRAINER_NAME: ACTORS.planTrainer.displayName,
    PT_PLAN_E2E_RELATIONSHIP_ID: planRelationship.id,
    PT_PLAN_E2E_TEMPLATE_NAME: planTemplateName,
    PT_PLAN_E2E_TEMPLATE_EXERCISE_MARKER: exerciseMarker,
    PT_RLS_TRAINEE_ACCESS_TOKEN: tokens.resultsTrainee,
    PT_RLS_TRAINER_ACCESS_TOKEN: tokens.resultsTrainer,
    PT_RLS_OTHER_TRAINER_ACCESS_TOKEN: tokens.resultsOtherTrainer,
    PT_RLS_COMPLETED_WORKOUT_ID: resultCompletedWorkout.id,
    PT_RLS_IN_PROGRESS_WORKOUT_ID: resultInProgressWorkout.id,
    PT_RLS_ACTIVE_GRANT_RELATIONSHIP_ID: resultsGrantRelationship.id,
    PT_RLS_NO_GRANT_RELATIONSHIP_ID: resultsNoGrantRelationship.id,
    PT_RLS_ENDED_RELATIONSHIP_ID: resultsEndedRelationship.id,
    PT_RLS_BODYWEIGHT_DATE: resultCompletedDate,
    PT_RLS_BODYWEIGHT_VALUE: resultBodyweightValue,
    PT_RLS_RANGE_FROM: rangeFrom,
    PT_RLS_RANGE_TO: rangeTo,
    PT_DIRECTORY_TRAINEE_ACCESS_TOKEN: tokens.trainee,
    PT_DIRECTORY_APPROVED_TRAINER_ACCESS_TOKEN: tokens.trainer,
    PT_DIRECTORY_APPROVED_NAME: ACTORS.trainer.displayName,
    PT_DIRECTORY_PENDING_NAME: ACTORS.pendingTrainer.displayName,
    PT_DIRECTORY_SUSPENDED_NAME: ACTORS.suspendedTrainer.displayName,
    PT_PLANNING_TRAINER_ACCESS_TOKEN: tokens.planningTrainer,
    PT_PLANNING_TRAINEE_ACCESS_TOKEN: tokens.planningTrainee,
    PT_PLANNING_OUTSIDER_ACCESS_TOKEN: tokens.planningOutsider,
    PT_PLANNING_ACTIVE_RELATIONSHIP_ID: planningRelationship.id,
    PT_PLANNING_TRAINER_ROUTINE_ID: planningRoutine.id,
    PT_PLANNING_SCHEDULED_DATE: dateDaysFromNow(14),
    PT_RELATIONSHIP_TRAINEE_ACCESS_TOKEN: tokens.relationshipTrainee,
    PT_RELATIONSHIP_TRAINER_ACCESS_TOKEN: tokens.relationshipTrainer,
    PT_RELATIONSHIP_OUTSIDER_ACCESS_TOKEN: tokens.relationshipOutsider,
    PT_RELATIONSHIP_TRAINER_PROFILE_ID: trainerProfiles.relationshipTrainer.id,
    PT_RELATIONSHIP_TRAINEE_WORKOUT_ID: relationshipWorkout.id,
    PT_RELATIONSHIP_TRAINEE_BODYWEIGHT_ID: relationshipBodyweight.id,
    PT_EXERCISE_E2E_TRAINER_EMAIL: ACTORS.exerciseTrainer.email,
    PT_EXERCISE_E2E_TRAINER_PASSWORD: PASSWORD,
    PT_EXERCISE_E2E_CLIENT_EMAIL: ACTORS.exerciseClient.email,
    PT_EXERCISE_E2E_CLIENT_PASSWORD: PASSWORD,
    PT_EXERCISE_E2E_OUTSIDER_EMAIL: ACTORS.exerciseOutsider.email,
    PT_EXERCISE_E2E_OUTSIDER_PASSWORD: PASSWORD,
    PT_EXERCISE_RLS_TRAINER_ACCESS_TOKEN: tokens.exerciseTrainer,
    PT_EXERCISE_RLS_CLIENT_ACCESS_TOKEN: tokens.exerciseClient,
    PT_EXERCISE_RLS_OUTSIDER_ACCESS_TOKEN: tokens.exerciseOutsider,
    PT_EXERCISE_RLS_RELATIONSHIP_ID: exerciseRelationship.id,
  }

  for (const name of PT_LOCAL_QA_OUTPUT_NAMES) {
    if (!hasText(String(output[name] ?? ''))) throw new Error(`local QA output is missing ${name}`)
  }

  const contents = [
    '# Generated disposable local PT QA environment. Never use against production.',
    ...Object.entries(output).map(([name, value]) => `export ${name}=${shellQuote(value)}`),
    '',
  ].join('\n')

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, contents, { encoding: 'utf8', mode: 0o600 })
  await chmod(outputPath, 0o600)

  return { outputPath, actorCount: Object.keys(ACTORS).length }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null
if (invokedPath === import.meta.url) {
  setupPtLocalQa()
    .then(({ outputPath, actorCount }) => {
      console.log(`Created ${actorCount} disposable local actors; environment written to ${outputPath}`)
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
