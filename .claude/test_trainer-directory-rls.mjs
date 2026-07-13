/**
 * Direct JWT/RLS tests for the Phase 2 trainer-directory migration.
 * Run only against a disposable, explicitly seeded Supabase project.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const enabled = process.env.PT_DIRECTORY_RLS_ENABLED === 'true'

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required trainer-directory RLS variable: ${name}`)
  return value
}

function fixture() {
  return {
    url: required('NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    traineeToken: required('PT_DIRECTORY_TRAINEE_ACCESS_TOKEN'),
    trainerToken: required('PT_DIRECTORY_APPROVED_TRAINER_ACCESS_TOKEN'),
    approvedName: required('PT_DIRECTORY_APPROVED_NAME'),
    pendingName: required('PT_DIRECTORY_PENDING_NAME'),
    suspendedName: required('PT_DIRECTORY_SUSPENDED_NAME'),
  }
}

function client(url, anonKey, accessToken) {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  })
}

test('anonymous callers cannot invoke the trainer directory', { skip: !enabled }, async () => {
  const f = fixture()
  const anonymous = client(f.url, f.anonKey)
  const result = await anonymous.rpc('trainer_directory_search', { p_query: f.approvedName })
  assert.ok(result.error, 'anon must not have EXECUTE on the directory RPC')
  assert.deepEqual(result.data, null)
})

test('authenticated directory returns only approved/published safe DTOs', { skip: !enabled }, async () => {
  const f = fixture()
  const trainee = client(f.url, f.anonKey, f.traineeToken)

  const approved = await trainee.rpc('trainer_directory_search', { p_query: f.approvedName })
  assert.equal(approved.error, null)
  assert.ok((approved.data ?? []).some((row) => row.display_name === f.approvedName))
  for (const row of approved.data ?? []) {
    assert.deepEqual(
      Object.keys(row).sort(),
      [
        'accepting_clients',
        'avatar_url',
        'bio',
        'display_name',
        'id',
        'location_text',
        'remote_available',
        'specialties',
      ],
    )
  }

  for (const hiddenName of [f.pendingName, f.suspendedName]) {
    const hidden = await trainee.rpc('trainer_directory_search', { p_query: hiddenName })
    assert.equal(hidden.error, null)
    assert.deepEqual(hidden.data, [])
  }
})

test('unrelated users cannot read raw trainer rows or create platform roles', { skip: !enabled }, async () => {
  const f = fixture()
  const trainee = client(f.url, f.anonKey, f.traineeToken)

  const rawProfiles = await trainee.from('trainer_profiles').select('*')
  assert.equal(rawProfiles.error, null)
  assert.deepEqual(rawProfiles.data, [])

  const escalation = await trainee.from('platform_roles').insert({
    user_id: '00000000-0000-0000-0000-000000000000',
    role: 'platform_admin',
  })
  assert.ok(escalation.error)

  const adminList = await trainee.rpc('admin_list_trainer_profiles')
  assert.ok(adminList.error)
})

test('trainer can read only their own base listing row', { skip: !enabled }, async () => {
  const f = fixture()
  const trainer = client(f.url, f.anonKey, f.trainerToken)
  const result = await trainer
    .from('trainer_profiles')
    .select('display_name,verification_status,listing_status')

  assert.equal(result.error, null)
  assert.equal(result.data?.length, 1)
  assert.equal(result.data?.[0].display_name, f.approvedName)
  assert.equal(result.data?.[0].verification_status, 'approved')
})
