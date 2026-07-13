import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFakeSupabaseClient } from './fakes/supabase.mjs'

const { reviewTrainerProfileCore, saveTrainerProfileCore } = await import(
  '../src/app/actions/trainerCores.ts'
)

const PROFILE_ID = '19ee3335-95b5-4d78-a7b6-cf09a994dc01'

function validProfileForm(overrides = {}) {
  const form = new FormData()
  const values = {
    displayName: 'Coach Ada',
    avatarUrl: 'https://example.com/avatar.jpg',
    bio: 'A careful strength coach.',
    specialties: 'Strength Training, mobility',
    locationText: 'Amsterdam',
    remoteAvailable: 'on',
    acceptingClients: 'on',
    listingStatus: 'published',
    ...overrides,
  }
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null) form.set(key, String(value))
  }
  return form
}

function reviewForm(profileId = PROFILE_ID, verificationStatus = 'approved') {
  const form = new FormData()
  form.set('profileId', profileId)
  form.set('verificationStatus', verificationStatus)
  return form
}

test('save trainer profile: unauthenticated caller causes zero RPC calls', async () => {
  const fake = createFakeSupabaseClient({ user: null })
  const result = await saveTrainerProfileCore(fake, validProfileForm())
  assert.equal(result.success, false)
  assert.match(result.message, /session/i)
  assert.equal(fake.mutationCount(undefined, 'rpc'), 0)
})

test('save trainer profile: invalid input is rejected before the mutation RPC', async () => {
  const fake = createFakeSupabaseClient({ user: { id: 'user-1' } })
  const result = await saveTrainerProfileCore(fake, validProfileForm({ displayName: '' }))
  assert.equal(result.success, false)
  assert.ok(result.fieldErrors.displayName)
  assert.equal(fake.mutationCount('save_trainer_profile', 'rpc'), 0)
})

test('save trainer profile: sends only normalized, self-service fields to the hardened RPC', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'user-1' },
    rpcResults: { save_trainer_profile: { data: PROFILE_ID, error: null } },
  })
  const result = await saveTrainerProfileCore(fake, validProfileForm())
  assert.equal(result.success, true)
  const calls = fake.mutationCalls('save_trainer_profile', 'rpc')
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].payload, {
    p_display_name: 'Coach Ada',
    p_bio: 'A careful strength coach.',
    p_specialties: ['mobility', 'strength-training'],
    p_remote_available: true,
    p_location_text: 'Amsterdam',
    p_accepting_clients: true,
    p_listing_status: 'published',
    p_avatar_url: 'https://example.com/avatar.jpg',
  })
  assert.equal('verification_status' in calls[0].payload, false)
  assert.equal('user_id' in calls[0].payload, false)
})

test('save trainer profile: draft response does not imply administrator approval', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'user-1' },
    rpcResults: { save_trainer_profile: { data: PROFILE_ID, error: null } },
  })
  const result = await saveTrainerProfileCore(fake, validProfileForm({ listingStatus: 'draft' }))
  assert.equal(result.success, true)
  assert.match(result.message, /draft saved/i)
  assert.doesNotMatch(result.message, /approved/i)
})

test('save trainer profile: database failures return a safe message without leaking internals', async () => {
  const secret = 'private schema relation leaked_internal_name does not exist'
  const fake = createFakeSupabaseClient({
    user: { id: 'user-1' },
    rpcResults: {
      save_trainer_profile: { data: null, error: { code: 'XX000', message: secret } },
    },
  })
  const result = await saveTrainerProfileCore(fake, validProfileForm())
  assert.equal(result.success, false)
  assert.doesNotMatch(result.message, new RegExp(secret))
})

test('review trainer profile: unauthenticated caller causes zero role or mutation RPCs', async () => {
  const fake = createFakeSupabaseClient({ user: null })
  const result = await reviewTrainerProfileCore(fake, reviewForm())
  assert.equal(result.success, false)
  assert.equal(fake.mutationCount(undefined, 'rpc'), 0)
})

test('review trainer profile: invalid UUID or status never reaches an authorization or mutation RPC', async () => {
  for (const form of [reviewForm('not-a-uuid'), reviewForm(PROFILE_ID, 'pending')]) {
    const fake = createFakeSupabaseClient({ user: { id: 'admin-1' } })
    const result = await reviewTrainerProfileCore(fake, form)
    assert.equal(result.success, false)
    assert.equal(fake.mutationCount(undefined, 'rpc'), 0)
  }
})

test('review trainer profile: authenticated non-admin is denied before mutation', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'user-1' },
    rpcResults: { current_user_is_platform_admin: { data: false, error: null } },
  })
  const result = await reviewTrainerProfileCore(fake, reviewForm())
  assert.equal(result.success, false)
  assert.match(result.message, /administrator/i)
  assert.equal(fake.mutationCount('current_user_is_platform_admin', 'rpc'), 1)
  assert.equal(fake.mutationCount('admin_set_trainer_verification', 'rpc'), 0)
})

test('review trainer profile: role lookup failures fail closed before mutation', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'user-1' },
    rpcResults: {
      current_user_is_platform_admin: {
        data: null,
        error: { code: '42501', message: 'denied' },
      },
    },
  })
  const result = await reviewTrainerProfileCore(fake, reviewForm())
  assert.equal(result.success, false)
  assert.equal(fake.mutationCount('admin_set_trainer_verification', 'rpc'), 0)
})

test('review trainer profile: administrator decision uses the exact profile id and bounded status', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'admin-1' },
    rpcResults: {
      current_user_is_platform_admin: { data: true, error: null },
      admin_set_trainer_verification: { data: null, error: null },
    },
  })
  const result = await reviewTrainerProfileCore(fake, reviewForm(PROFILE_ID, 'suspended'))
  assert.equal(result.success, true)
  assert.deepEqual(fake.mutationCalls('admin_set_trainer_verification', 'rpc')[0].payload, {
    p_profile_id: PROFILE_ID,
    p_verification_status: 'suspended',
  })
})

test('review trainer profile: missing profile error is translated without exposing database details', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'admin-1' },
    rpcResults: {
      current_user_is_platform_admin: { data: true, error: null },
      admin_set_trainer_verification: {
        data: null,
        error: { code: 'P0002', message: 'sensitive database detail' },
      },
    },
  })
  const result = await reviewTrainerProfileCore(fake, reviewForm())
  assert.equal(result.success, false)
  assert.match(result.message, /no longer exists/i)
  assert.doesNotMatch(result.message, /sensitive database detail/i)
})
