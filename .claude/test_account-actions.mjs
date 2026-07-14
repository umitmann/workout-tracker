import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { parseAccountProfileForm } from '../src/lib/accountValidation.ts'
import { saveAccountProfileCore } from '../src/app/actions/accountCores.ts'

function profileForm(overrides = {}) {
  const values = {
    displayName: 'Morgan Athlete',
    avatarUrl: 'https://images.example/morgan.jpg',
    timeZone: 'Europe/Amsterdam',
    ...overrides,
  }
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, String(value))
  return data
}

test('account profile validation normalizes safe editable identity fields', () => {
  assert.deepEqual(parseAccountProfileForm(profileForm()), {
    success: true,
    data: {
      displayName: 'Morgan Athlete',
      avatarUrl: 'https://images.example/morgan.jpg',
      timeZone: 'Europe/Amsterdam',
    },
  })
})

test('account profile validation rejects unsafe avatar and malformed bounded fields', () => {
  const result = parseAccountProfileForm(profileForm({
    displayName: '',
    avatarUrl: 'javascript:alert(1)',
    timeZone: '../etc/passwd',
  }))
  assert.equal(result.success, false)
  if (result.success) return
  assert.ok(result.fieldErrors.displayName)
  assert.ok(result.fieldErrors.avatarUrl)
  assert.ok(result.fieldErrors.timeZone)
})

function fakeClient({ user = { id: 'user-1' }, rpcError = null, metadataError = null } = {}) {
  const calls = []
  return {
    calls,
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
      updateUser: async (payload) => {
        calls.push({ name: 'updateUser', payload })
        return { data: { user }, error: metadataError }
      },
    },
    async rpc(name, args) {
      calls.push({ name, args })
      return { data: null, error: rpcError }
    },
  }
}

test('account save uses the narrow profile RPC and synchronizes display metadata', async () => {
  const client = fakeClient()
  const result = await saveAccountProfileCore(client, profileForm())
  assert.deepEqual(result, { success: true, message: 'Account settings saved.' })
  assert.deepEqual(client.calls, [
    {
      name: 'save_my_profile',
      args: {
        p_display_name: 'Morgan Athlete',
        p_avatar_url: 'https://images.example/morgan.jpg',
        p_time_zone: 'Europe/Amsterdam',
      },
    },
    {
      name: 'updateUser',
      payload: {
        data: {
          display_name: 'Morgan Athlete',
          avatar_url: 'https://images.example/morgan.jpg',
        },
      },
    },
  ])
})

test('account save fails before mutation for signed-out and invalid requests', async () => {
  const signedOut = fakeClient({ user: null })
  assert.equal((await saveAccountProfileCore(signedOut, profileForm())).success, false)
  assert.deepEqual(signedOut.calls, [])

  const invalid = fakeClient()
  assert.equal((await saveAccountProfileCore(invalid, profileForm({ avatarUrl: 'http://unsafe.test' }))).success, false)
  assert.deepEqual(invalid.calls, [])
})

test('profile RPC failure is fail-closed and metadata sync failure is reported honestly', async () => {
  const databaseFailure = fakeClient({ rpcError: { code: '22023' } })
  assert.equal((await saveAccountProfileCore(databaseFailure, profileForm())).success, false)
  assert.equal(databaseFailure.calls.length, 1)

  const metadataFailure = fakeClient({ metadataError: { message: 'auth unavailable' } })
  assert.deepEqual(await saveAccountProfileCore(metadataFailure, profileForm()), {
    success: true,
    message: 'Account settings saved. Your menu name may update after you sign in again.',
  })
})

test('database profile mutation independently rejects non-HTTPS avatar URLs', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/20260714000800_trainer_custom_exercises.sql', import.meta.url),
    'utf8',
  )
  const start = migration.indexOf('create or replace function public.save_my_profile')
  const end = migration.indexOf('$function$;', start)
  assert.notEqual(start, -1)
  assert.match(migration.slice(start, end), /v_avatar_url !~ '\^https:\/\/'/)
})
