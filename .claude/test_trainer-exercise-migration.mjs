import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migrationUrl = new URL(
  '../supabase/migrations/20260714000800_trainer_custom_exercises.sql',
  import.meta.url,
)
const sql = await readFile(migrationUrl, 'utf8')

function functionBlock(name) {
  const start = sql.indexOf(`create or replace function ${name}`)
  assert.notEqual(start, -1, `missing function ${name}`)
  const end = sql.indexOf('$function$;', start)
  assert.notEqual(end, -1, `unterminated function ${name}`)
  return sql.slice(start, end + '$function$;'.length)
}

test('custom-exercise migration is additive and never rewrites training history', () => {
  for (const table of ['workouts', 'sets', 'routines', 'routine_exercises', 'workout_plans']) {
    assert.doesNotMatch(
      sql,
      new RegExp(`(?:delete\\s+from|truncate\\s+(?:table\\s+)?|drop\\s+table)\\s+public\\.${table}\\b`, 'i'),
    )
  }
  assert.match(sql, /alter table public\.exercises[\s\S]+add column creator_id uuid/)
  assert.match(sql, /add column visibility text not null default 'platform'/)
  assert.match(sql, /add column video_url text/)
  assert.match(sql, /add column archived_at timestamp with time zone/)
})

test('legacy catalog rows and trainer-created rows have distinct validated shapes', () => {
  assert.match(sql, /visibility = 'platform'[\s\S]+creator_id is null/)
  // Creator can become null only through ON DELETE SET NULL. Visibility still
  // distinguishes that orphaned custom row from the platform catalog.
  assert.match(sql, /visibility in \('public', 'clients'\)/)
  assert.match(sql, /video_url ~ '\^https:\/\/www\\\.youtube\\\.com\/watch\\\?v=/)
  assert.match(sql, /exercises_custom_shape/)
  assert.match(sql, /validate constraint exercises_custom_shape/)
})

test('broad exercise read policy is replaced by a scoped security-definer predicate', () => {
  assert.match(sql, /drop policy if exists "exercises: authenticated read" on public\.exercises/)
  assert.match(sql, /create policy "exercises: scoped authenticated read"/)
  assert.match(sql, /private\.can_read_exercise\(id, \(select auth\.uid\(\)\)\)/)

  const predicate = functionBlock('private.can_read_exercise')
  const discovery = functionBlock('private.can_discover_exercise')
  assert.match(predicate, /security definer/)
  assert.match(predicate, /set search_path = ''/)
  assert.match(discovery, /relationship\.status = 'active'/)
  assert.match(predicate, /public\.trainer_exercise_entitlements/)
})

test('durable entitlements preserve referenced history without broadening discovery', () => {
  assert.match(sql, /create table public\.trainer_exercise_entitlements/)
  assert.match(sql, /revoke all on table public\.trainer_exercise_entitlements[\s\S]+PUBLIC, anon, authenticated, service_role/)
  assert.match(sql, /create trigger routine_exercises_validate_custom_exercise/)
  assert.match(sql, /create trigger sets_validate_custom_exercise/)
  assert.match(sql, /create trigger workout_plan_exercises_validate_custom_exercise/)
  assert.match(sql, /private\.record_trainer_exercise_entitlement/)

  const directory = functionBlock('public.list_available_exercises')
  assert.doesNotMatch(directory, /trainer_exercise_entitlements/)
  assert.match(directory, /relationship\.status = 'active'/)
  assert.match(directory, /exercise\.archived_at is null/)
})

test('only approved trainers can create or change their own exercises', () => {
  for (const name of ['public.save_trainer_exercise', 'public.archive_trainer_exercise']) {
    const block = functionBlock(name)
    assert.match(block, /security definer/)
    assert.match(block, /set search_path = ''/)
    assert.match(block, /trainer\.verification_status = 'approved'/)
    assert.match(block, /auth\.uid\(\)/)
  }
  const save = functionBlock('public.save_trainer_exercise')
  assert.match(save, /exercise\.creator_id = v_actor/)
  assert.match(save, /v_visibility not in \('public', 'clients'\)/)
  const archive = functionBlock('public.archive_trainer_exercise')
  assert.match(archive, /set archived_at = statement_timestamp\(\)/)
  assert.doesNotMatch(archive, /delete from public\.exercises/)
})

test('exercise RPC grants are narrow and the base table stays read-only', () => {
  assert.match(sql, /revoke insert, update, delete, truncate, references, trigger[\s\S]+public\.exercises from authenticated/)
  for (const signature of [
    'list_available_exercises\\(\\)',
    'save_trainer_exercise\\(bigint,\\s*text,\\s*text,\\s*text,\\s*text\\[\\],\\s*text\\[\\],\\s*text\\[\\],\\s*text,\\s*text\\)',
    'archive_trainer_exercise\\(bigint\\)',
  ]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${signature}[\\s\\S]+PUBLIC, anon, authenticated, service_role;`, 'i'))
    assert.match(sql, new RegExp(`grant execute on function public\\.${signature}[^;]+to authenticated;`, 'i'))
  }
})
