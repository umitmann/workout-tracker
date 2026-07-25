import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(
  new URL('../supabase/migrations/20260725000100_set_notes.sql', import.meta.url),
  'utf8',
).toLowerCase()

test('set notes migration is additive, bounded, and included in the atomic snapshot', () => {
  assert.match(sql, /alter table public\.sets\s+add column if not exists note text/)
  assert.match(sql, /char_length\(note\) <= 500/)
  assert.match(sql, /create or replace function public\.save_workout_sets/)
  assert.match(sql, /difficulty,\s*note\s*\)/)
  assert.doesNotMatch(sql, /drop table|truncate/)
})

test('set notes do not broaden base-table or RPC access', () => {
  assert.match(sql, /revoke all on function public\.save_workout_sets\(bigint, uuid, jsonb\) from public, anon, authenticated, service_role/)
  assert.match(sql, /grant execute on function public\.save_workout_sets\(bigint, uuid, jsonb\) to authenticated/)
  assert.doesNotMatch(sql, /grant (select|insert|update|delete|all) on (table )?public\.sets/)
})
