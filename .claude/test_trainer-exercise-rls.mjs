/**
 * Direct JWT/RLS tests for trainer-authored exercise discovery and durable
 * historical access. Run only against an explicitly disposable project.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const enabled = process.env.PT_EXERCISE_RLS_ENABLED === 'true'

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required trainer-exercise RLS variable: ${name}`)
  return value
}

function client(accessToken) {
  return createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
    },
  )
}

function subject(accessToken) {
  return JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8')).sub
}

function saveArgs(name, visibility, video = null) {
  return {
    p_exercise_id: null,
    p_name: name,
    p_category: 'strength',
    p_equipment: 'dumbbell',
    p_muscles: ['quadriceps'],
    p_muscles_secondary: ['glutes'],
    p_instructions: ['Use the direct JWT test instruction.'],
    p_video_url: video,
    p_visibility: visibility,
  }
}

test('anonymous callers cannot discover or create trainer exercises', { skip: !enabled }, async () => {
  const anonymous = client()
  const list = await anonymous.rpc('list_available_exercises')
  assert.ok(list.error)
  const save = await anonymous.rpc('save_trainer_exercise', saveArgs('Anonymous forbidden', 'public'))
  assert.ok(save.error)
})

test('custom exercise scope, write authorization, and historical entitlement hold end to end', { skip: !enabled }, async () => {
  const trainerToken = required('PT_EXERCISE_RLS_TRAINER_ACCESS_TOKEN')
  const clientToken = required('PT_EXERCISE_RLS_CLIENT_ACCESS_TOKEN')
  const outsiderToken = required('PT_EXERCISE_RLS_OUTSIDER_ACCESS_TOKEN')
  const trainer = client(trainerToken)
  const trainee = client(clientToken)
  const outsider = client(outsiderToken)

  const directWrite = await trainer.from('exercises').insert({ name: 'Bypass attempt' })
  assert.ok(directWrite.error, 'base exercise writes must stay denied')

  const outsiderSave = await outsider.rpc('save_trainer_exercise', saveArgs('Unapproved attempt', 'public'))
  assert.equal(outsiderSave.error?.code, '42501')

  const privateName = 'RLS Clients Exercise 88421'
  const publicName = 'RLS Public Exercise 88421'
  const privateCreate = await trainer.rpc('save_trainer_exercise', saveArgs(
    privateName,
    'clients',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  ))
  assert.equal(privateCreate.error, null)
  assert.equal(typeof privateCreate.data, 'number')
  const privateId = privateCreate.data

  const publicCreate = await trainer.rpc('save_trainer_exercise', saveArgs(publicName, 'public'))
  assert.equal(publicCreate.error, null)
  const publicId = publicCreate.data

  const trainerList = await trainer.rpc('list_available_exercises')
  const traineeList = await trainee.rpc('list_available_exercises')
  const outsiderList = await outsider.rpc('list_available_exercises')
  assert.equal(trainerList.error, null)
  assert.equal(traineeList.error, null)
  assert.equal(outsiderList.error, null)
  assert.ok(trainerList.data.some((row) => row.id === privateId))
  assert.ok(traineeList.data.some((row) => row.id === privateId))
  assert.ok(outsiderList.data.some((row) => row.id === publicId))
  assert.ok(!outsiderList.data.some((row) => row.id === privateId))

  const stored = await trainer
    .from('exercises')
    .select('video_url,visibility')
    .eq('id', privateId)
    .single()
  assert.equal(stored.error, null)
  assert.deepEqual(stored.data, {
    video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    visibility: 'clients',
  })

  const traineeRoutine = await trainee
    .from('routines')
    .insert({ user_id: subject(clientToken), name: 'RLS entitlement routine', is_preset: false })
    .select('id')
    .single()
  assert.equal(traineeRoutine.error, null)
  const legitimateReference = await trainee.from('routine_exercises').insert({
    routine_id: traineeRoutine.data.id,
    exercise_id: privateId,
    sets: 3,
    reps: 8,
    order: 0,
  })
  assert.equal(legitimateReference.error, null)

  const outsiderRoutine = await outsider
    .from('routines')
    .insert({ user_id: subject(outsiderToken), name: 'RLS forbidden routine', is_preset: false })
    .select('id')
    .single()
  assert.equal(outsiderRoutine.error, null)
  const forbiddenReference = await outsider.from('routine_exercises').insert({
    routine_id: outsiderRoutine.data.id,
    exercise_id: privateId,
    sets: 3,
    reps: 8,
    order: 0,
  })
  assert.equal(forbiddenReference.error?.code, '42501')

  const entitlementProbe = await trainee.from('trainer_exercise_entitlements').select('*')
  assert.ok(entitlementProbe.error, 'private entitlement rows must not have a base-table API')

  const archived = await trainer.rpc('archive_trainer_exercise', { p_exercise_id: privateId })
  assert.equal(archived.error, null)
  const afterArchiveDirectory = await trainee.rpc('list_available_exercises')
  assert.ok(!afterArchiveDirectory.data.some((row) => row.id === privateId))

  const historicalRead = await trainee.from('exercises').select('id,name').eq('id', privateId)
  const unrelatedRead = await outsider.from('exercises').select('id,name').eq('id', privateId)
  assert.deepEqual(historicalRead.data, [{ id: privateId, name: privateName }])
  assert.deepEqual(unrelatedRead.data, [])
})
