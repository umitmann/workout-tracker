import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  archiveTrainerExerciseCore,
  saveTrainerExerciseCore,
} from '../src/app/actions/trainerExerciseCores.ts'

function form(overrides = {}) {
  const values = {
    name: 'Tempo Goblet Squat',
    category: 'strength',
    equipment: 'dumbbell',
    primaryMuscles: 'quadriceps,glutes',
    secondaryMuscles: 'core',
    primaryDetailedMuscles: 'rectus femoris,vastus lateralis',
    secondaryDetailedMuscles: '',
    instructions: 'Brace.\nSquat with control.',
    videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
    visibility: 'clients',
    ...overrides,
  }
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, String(value))
  return data
}

function fakeClient({ user = { id: 'trainer' }, rpc } = {}) {
  return {
    calls: [],
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    async rpc(name, args) {
      this.calls.push({ name, args })
      return rpc ? rpc(name, args) : { data: 42, error: null }
    },
  }
}

test('save core authenticates, validates, and sends only canonical bounded values', async () => {
  const client = fakeClient()
  const result = await saveTrainerExerciseCore(client, form())
  assert.deepEqual(result, {
    success: true,
    message: 'Exercise created for your clients.',
    exerciseId: 42,
  })
  assert.deepEqual(client.calls, [{
    name: 'save_trainer_exercise_v2',
    args: {
      p_exercise_id: null,
      p_name: 'Tempo Goblet Squat',
      p_category: 'strength',
      p_equipment: 'dumbbell',
      p_muscles: ['quadriceps', 'glutes'],
      p_muscles_secondary: ['abdominals'],
      p_muscles_detailed: ['rectus_femoris', 'vastus_lateralis'],
      p_muscles_secondary_detailed: [],
      p_instructions: ['Brace.', 'Squat with control.'],
      p_video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      p_visibility: 'clients',
    },
  }])
})

test('save core falls back only when the detailed RPC is not migrated yet', async () => {
  const client = fakeClient({
    rpc: async (name) => name === 'save_trainer_exercise_v2'
      ? { data: null, error: { code: 'PGRST202' } }
      : { data: 42, error: null },
  })
  const result = await saveTrainerExerciseCore(client, form())
  assert.equal(result.success, true)
  assert.deepEqual(client.calls.map((call) => call.name), [
    'save_trainer_exercise_v2',
    'save_trainer_exercise',
  ])
})

test('save core does not call the database for invalid or signed-out input', async () => {
  const invalidClient = fakeClient()
  const invalid = await saveTrainerExerciseCore(invalidClient, form({ videoUrl: 'https://evil.test' }))
  assert.equal(invalid.success, false)
  assert.equal(invalidClient.calls.length, 0)

  const anonymousClient = fakeClient({ user: null })
  const anonymous = await saveTrainerExerciseCore(anonymousClient, form())
  assert.equal(anonymous.success, false)
  assert.match(anonymous.message, /session/i)
  assert.equal(anonymousClient.calls.length, 0)
})

test('database authorization and uniqueness failures have safe actionable messages', async () => {
  const denied = fakeClient({ rpc: async () => ({ data: null, error: { code: '42501' } }) })
  assert.deepEqual(await saveTrainerExerciseCore(denied, form()), {
    success: false,
    message: 'An approved personal trainer profile is required.',
  })

  const duplicate = fakeClient({ rpc: async () => ({ data: null, error: { code: '23505' } }) })
  const result = await saveTrainerExerciseCore(duplicate, form())
  assert.equal(result.success, false)
  assert.match(result.message, /already have/i)
})

test('archive core validates the identifier before invoking the narrow RPC', async () => {
  const invalid = fakeClient()
  assert.equal((await archiveTrainerExerciseCore(invalid, form({ exerciseId: '0' }))).success, false)
  assert.equal(invalid.calls.length, 0)

  const valid = fakeClient()
  const result = await archiveTrainerExerciseCore(valid, form({ exerciseId: '42' }))
  assert.equal(result.success, true)
  assert.deepEqual(valid.calls, [{
    name: 'archive_trainer_exercise',
    args: { p_exercise_id: 42 },
  }])
})

test('create and edit forms have distinct accessible names', async () => {
  const source = await readFile(
    new URL('../src/app/trainer/exercises/TrainerExerciseForm.tsx', import.meta.url),
    'utf8',
  )
  assert.match(source, /aria-label=\{exercise \? `Edit /)
  assert.match(source, /: 'Create exercise'\}/)
})
