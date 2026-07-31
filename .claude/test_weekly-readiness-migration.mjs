import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [sql, phase22, combined] = await Promise.all([
  readFile(
    new URL('../supabase/migrations/20260731000200_weekly_plans_and_readiness.sql', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../supabase/migrations/20260731000100_set_completion_state.sql', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../supabase/manual/apply_phase22_and_23.sql', import.meta.url),
    'utf8',
  ),
])

function functionBlock(name) {
  const start = sql.indexOf(`create or replace function ${name}`)
  assert.notEqual(start, -1, `missing ${name}`)
  const end = sql.indexOf('$function$;', start)
  assert.notEqual(end, -1, `unterminated ${name}`)
  return sql.slice(start, end + '$function$;'.length)
}

function expectHardened(name, signature) {
  const block = functionBlock(name)
  assert.match(block, /security definer/i)
  assert.match(block, /set search_path = ''/i)
  const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  assert.match(sql, new RegExp(`revoke all on function ${escaped}[\\s\\S]+from PUBLIC, anon, authenticated, service_role;`, 'i'))
  assert.match(sql, new RegExp(`grant execute on function ${escaped}[\\s\\S]+to authenticated;`, 'i'))
}

test('weekly windows and readiness are additive private tables', () => {
  for (const table of ['workout_plan_week_windows', 'daily_readiness_checkins']) {
    assert.match(sql, new RegExp(`create table public\\.${table}`, 'i'))
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
    assert.match(sql, new RegExp(`revoke all on table public\\.${table}[\\s\\S]+from PUBLIC, anon, authenticated, service_role`, 'i'))
  }
  assert.doesNotMatch(sql, /delete\s+from\s+public\.(?:workouts|sets|workout_plans)/i)
  assert.doesNotMatch(sql, /truncate|drop table/i)
})

test('weekly assignment is bounded, relationship-authorized, ordered, and audited', () => {
  const block = functionBlock('public.assign_weekly_workouts_from_routines')
  assert.match(block, /cardinality\(p_routine_ids\) not between 1 and 7/i)
  assert.match(block, /relationship\.trainer_id = v_actor/i)
  assert.match(block, /relationship\.status = 'active'/i)
  assert.match(block, /trainer\.verification_status = 'approved'/i)
  assert.match(block, /routine\.user_id = v_actor/i)
  assert.match(block, /with ordinality/i)
  assert.match(block, /private\.create_workout_plan_snapshot/i)
  assert.match(block, /insert into public\.workout_plan_week_windows/i)
  assert.match(block, /'plan\.assigned'/i)
})

test('only the trainee can choose an in-window date on a pending weekly plan', () => {
  const block = functionBlock('public.choose_workout_plan_date')
  assert.match(block, /plan\.trainee_id = v_actor/i)
  assert.match(block, /plan\.status = 'scheduled'/i)
  assert.match(block, /p_selected_date between week_window\.week_start and week_window\.week_end/i)
  assert.match(block, /for update/i)
})

test('weekly start retains one-start locking and records the actual trainee day', () => {
  const block = functionBlock('public.start_workout_plan')
  assert.match(block, /plan\.trainee_id = v_actor/i)
  assert.match(block, /plan\.status = 'scheduled'/i)
  assert.match(block, /for update/i)
  assert.match(block, /v_today between v_week_start and v_week_end/i)
  assert.match(block, /coalesce\(v_today, v_plan\.scheduled_date\)/i)
})

test('readiness date and owner are derived from auth and profile timezone', () => {
  const write = functionBlock('public.set_my_daily_readiness')
  assert.match(write, /v_actor uuid := auth\.uid\(\)/i)
  assert.match(write, /profile\.time_zone/i)
  assert.match(write, /on conflict on constraint daily_readiness_checkins_user_id_checkin_date_key/i)
  assert.doesNotMatch(write, /p_user_id|p_date/i)
  const read = functionBlock('public.get_my_daily_readiness')
  assert.match(read, /checkin\.user_id = v_actor/i)
})

test('all new public RPCs are authenticated-only and hardened', () => {
  for (const [name, signature] of [
    ['public.assign_weekly_workouts_from_routines', 'public.assign_weekly_workouts_from_routines(uuid, uuid[], date, text)'],
    ['public.choose_workout_plan_date', 'public.choose_workout_plan_date(uuid, date)'],
    ['public.get_my_daily_readiness', 'public.get_my_daily_readiness()'],
    ['public.set_my_daily_readiness', 'public.set_my_daily_readiness(smallint)'],
  ]) expectHardened(name, signature)
})

test('combined SQL Editor runner applies Phase 22 before 23 in one transaction', () => {
  assert.equal((combined.match(/^begin;$/gmi) ?? []).length, 1)
  assert.equal((combined.match(/^commit;$/gmi) ?? []).length, 1)
  assert.ok(combined.indexOf('Phase 22: durable per-set completion state') < combined.indexOf('PT Phase 23'))
  assert.ok(combined.includes(phase22.trim()))
  assert.match(combined, /set_completion_column_created[\s\S]+weekly_plan_table_created/i)
  assert.doesNotMatch(combined, /^\\i\b/gm, 'Supabase SQL Editor cannot resolve psql include commands')
})
