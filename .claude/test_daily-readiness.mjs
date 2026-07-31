import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFakeSupabaseClient } from './fakes/supabase.mjs'

const { saveDailyReadinessCore } = await import('../src/app/actions/readinessCores.ts')
const { READINESS_OPTIONS, normalizeReadiness } = await import('../src/lib/readinessTypes.ts')

function form(value) {
  const data = new FormData()
  data.set('feeling', String(value))
  return data
}

test('readiness has five ordered, accessible feeling choices', () => {
  assert.deepEqual(READINESS_OPTIONS.map((option) => option.value), [1, 2, 3, 4, 5])
  assert.equal(new Set(READINESS_OPTIONS.map((option) => option.label)).size, 5)
  assert.equal(normalizeReadiness({ checkin_date: '2026-07-31', feeling: 4 })?.feeling, 4)
  assert.equal(normalizeReadiness({ checkin_date: 'bad', feeling: 4 }), null)
  assert.equal(normalizeReadiness({ checkin_date: '2026-07-31', feeling: 6 }), null)
})

test('readiness mutation authenticates before inspecting the input', async () => {
  const fake = createFakeSupabaseClient({ user: null })
  const result = await saveDailyReadinessCore(fake, form(4))
  assert.equal(result.success, false)
  assert.match(result.message, /session/i)
  assert.equal(fake.mutationCount(undefined, 'rpc'), 0)
})

test('readiness accepts only integer feelings one through five', async () => {
  for (const value of [0, 6, 2.5, 'good', '']) {
    const fake = createFakeSupabaseClient({ user: { id: 'athlete-a' } })
    const result = await saveDailyReadinessCore(fake, form(value))
    assert.equal(result.success, false)
    assert.equal(fake.mutationCount(undefined, 'rpc'), 0)
  }
})

test('readiness sends no user id or date to the hardened today RPC', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'athlete-a' },
    rpcResults: {
      set_my_daily_readiness: {
        data: [{ checkin_date: '2026-07-31', feeling: 5 }],
        error: null,
      },
    },
  })
  const result = await saveDailyReadinessCore(fake, form(5))
  assert.deepEqual(result, {
    success: true,
    message: 'Feeling saved.',
    readiness: { checkin_date: '2026-07-31', feeling: 5 },
  })
  assert.deepEqual(fake.mutationCalls('set_my_daily_readiness', 'rpc')[0].payload, {
    p_feeling: 5,
  })
})

test('database details are not leaked when readiness cannot be stored', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'athlete-a' },
    rpcResults: {
      set_my_daily_readiness: {
        data: null,
        error: { code: 'XX000', message: 'private.daily_readiness_checkins leaked' },
      },
    },
  })
  const result = await saveDailyReadinessCore(fake, form(3))
  assert.equal(result.success, false)
  assert.doesNotMatch(result.message, /private|daily_readiness_checkins/i)
})
