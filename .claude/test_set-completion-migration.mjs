import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(new URL('../supabase/migrations/20260731000100_set_completion_state.sql', import.meta.url), 'utf8')
const manual = await readFile(new URL('../supabase/manual/verify_set_completion_state.sql', import.meta.url), 'utf8')

test('completion migration is additive, idempotent, and retains workout/set rows', () => {
  assert.match(migration, /alter table public\.sets\s+add column if not exists is_completed boolean/i)
  assert.doesNotMatch(migration, /drop\s+table/i)
  assert.doesNotMatch(migration, /truncate\s+(?:table\s+)?public\.(?:sets|workouts)/i)
  assert.match(migration, /stored_workout_count[\s\S]*stored_set_count/i)
})

test('atomic snapshot persists is_completed and keeps hardened execution grants', () => {
  assert.match(migration, /is_completed/i)
  assert.match(migration, /coalesce\(\(item->>'is_completed'\)::boolean, true\)/i)
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i)
  assert.match(migration, /revoke all on function public\.save_workout_sets[\s\S]*service_role/i)
  assert.match(migration, /grant execute on function public\.save_workout_sets[\s\S]*authenticated/i)
})

test('manual verification checks persistence security and stored row counts', () => {
  for (const name of ['set_completion_column_created', 'atomic_completion_write_installed', 'rpc_permissions_are_scoped', 'stored_workout_count', 'stored_set_count']) {
    assert.match(manual, new RegExp(name))
  }
})
