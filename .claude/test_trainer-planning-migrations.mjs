import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [planningSql, resultsSql, legacySql] = await Promise.all([
  readFile(
    new URL('../supabase/migrations/20260713000500_workout_plan_snapshots.sql', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../supabase/migrations/20260713000600_trainer_result_sharing.sql', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../supabase/migrations/20260713000700_legacy_workout_plan_backfill.sql', import.meta.url),
    'utf8',
  ),
])

function functionBlock(sql, name) {
  const start = sql.indexOf(`create or replace function ${name}`)
  assert.notEqual(start, -1, `missing function ${name}`)
  const end = sql.indexOf('$function$;', start)
  assert.notEqual(end, -1, `unterminated function ${name}`)
  return sql.slice(start, end + '$function$;'.length)
}

function assertHardenedAuthenticatedRpc(sql, name, signature) {
  const block = functionBlock(sql, name)
  assert.match(block, /security definer/i, `${name} must be a definer function`)
  assert.match(block, /set search_path = ''/i, `${name} must use an empty search path`)
  assert.match(
    sql,
    new RegExp(
      `revoke all on function ${signature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+from PUBLIC, anon, authenticated, service_role;`,
      'i',
    ),
    `${signature} must be revoked from every implicit/elevated API role`,
  )
  assert.match(
    sql,
    new RegExp(
      `grant execute on function ${signature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+to authenticated;`,
      'i',
    ),
    `${signature} must be authenticated-only`,
  )
}

test('Phase 4 creates private immutable plan snapshots and a one-workout link', () => {
  for (const table of ['workout_plans', 'workout_plan_exercises']) {
    assert.match(planningSql, new RegExp(`create table public\\.${table}\\b`, 'i'))
    assert.match(
      planningSql,
      new RegExp(`alter table public\\.${table} enable row level security`, 'i'),
    )
  }

  assert.match(planningSql, /alter table public\.workouts[\s\S]+add column plan_id uuid/i)
  assert.match(
    planningSql,
    /foreign key \(plan_id, user_id\)[\s\S]+references public\.workout_plans \(id, trainee_id\)/i,
  )
  assert.match(planningSql, /create unique index workouts_plan_id_uidx[\s\S]+\(plan_id\)/i)
  assert.doesNotMatch(
    planningSql,
    /trainee_id uuid[^,]*references auth\.users[^,]*on delete cascade/i,
    'plan ownership must not conflict with retained workout history during account deletion',
  )
  assert.match(
    functionBlock(planningSql, 'private.validate_workout_plan_row'),
    /from auth\.users as account[\s\S]+account\.id = new\.trainee_id/i,
  )
  assert.match(
    planningSql,
    /revoke all on table\s+public\.workout_plans,\s+public\.workout_plan_exercises\s+from PUBLIC, anon, authenticated, service_role;/i,
  )
  assert.doesNotMatch(
    planningSql,
    /grant\s+(?:select|insert|update|delete|all)[^;]+(?:workout_plans|workout_plan_exercises)[^;]+to authenticated/is,
  )
})

test('Phase 4 assignment authorizes and snapshots without sharing a mutable routine', () => {
  const assign = functionBlock(planningSql, 'public.assign_workout_from_routine')
  assert.match(assign, /v_actor uuid := auth\.uid\(\)/i)
  assert.match(assign, /relationship\.trainer_id = v_actor/i)
  assert.match(assign, /relationship\.status = 'active'/i)
  assert.match(assign, /trainer\.verification_status = 'approved'/i)
  assert.match(assign, /routine\.user_id = v_actor/i)
  assert.match(assign, /for share/i)
  assert.match(assign, /scheduled date/i)
  assert.match(assign, /private\.create_workout_plan_snapshot/i)
  assert.match(assign, /'plan\.assigned'/i)

  const snapshot = functionBlock(planningSql, 'private.create_workout_plan_snapshot')
  assert.match(snapshot, /insert into public\.workout_plans/i)
  assert.match(snapshot, /insert into public\.workout_plan_exercises/i)
  assert.match(snapshot, /from public\.routine_exercises/i)
  assert.match(snapshot, /order by source\."order"/i)
})

test('Phase 4 plan lifecycle is serialized and trainee-owned', () => {
  const start = functionBlock(planningSql, 'public.start_workout_plan')
  assert.match(start, /v_actor uuid := auth\.uid\(\)/i)
  assert.match(start, /plan\.trainee_id = v_actor/i)
  assert.match(start, /plan\.status = 'scheduled'/i)
  assert.match(start, /for update/i)
  assert.match(start, /insert into public\.workouts/i)
  assert.match(start, /'in_progress'/i)
  assert.match(start, /plan_id/i)

  const cancel = functionBlock(planningSql, 'public.cancel_workout_plan')
  assert.match(cancel, /plan\.status <> 'scheduled'/i)
  assert.match(cancel, /plan\.trainee_id = v_actor/i)
  assert.match(cancel, /relationship\.status = 'active'/i)
  assert.match(cancel, /status = 'cancelled'/i)

  assert.match(
    planningSql,
    /create trigger workout_plan_exercises_prevent_mutation[\s\S]+before update or delete/i,
  )
  assert.match(
    planningSql,
    /create trigger workouts_enforce_lifecycle[\s\S]+before insert or update/i,
  )
  assert.doesNotMatch(planningSql, /create policy[^;]+(?:trainer|relationship)[^;]+on public\.(?:workouts|sets)/is)
})

test('every Phase 4 public plan RPC is hardened and authenticated-only', () => {
  for (const [name, signature] of [
    ['public.assign_workout_from_routine', 'public.assign_workout_from_routine(uuid, uuid, date, text, text)'],
    ['public.schedule_my_workout_from_routine', 'public.schedule_my_workout_from_routine(uuid, date, text, text)'],
    ['public.cancel_workout_plan', 'public.cancel_workout_plan(uuid)'],
    ['public.start_workout_plan', 'public.start_workout_plan(uuid)'],
    ['public.list_my_workout_plans', 'public.list_my_workout_plans(date, date)'],
    ['public.get_workout_plan', 'public.get_workout_plan(uuid)'],
  ]) {
    assertHardenedAuthenticatedRpc(planningSql, name, signature)
  }
})

test('Phase 5 result functions require active relationship, approved trainer, and exact grant', () => {
  const authorization = functionBlock(resultsSql, 'private.authorize_trainer_result_read')
  assert.match(authorization, /relationship\.trainer_id = v_actor/i)
  assert.match(authorization, /relationship\.status = 'active'/i)
  assert.match(authorization, /trainer\.verification_status = 'approved'/i)
  assert.match(authorization, /grant_row\.permission = p_permission/i)
  assert.match(authorization, /grant_row\.revoked_at is null/i)

  const workouts = functionBlock(resultsSql, 'public.trainer_get_completed_workouts')
  assert.match(workouts, /private\.authorize_trainer_result_read[\s\S]+'workout_results\.read'/i)
  assert.match(workouts, /workout\.status = 'completed'/i)
  assert.doesNotMatch(workouts, /workout\.status\s+in\s*\([^)]*in_progress/i)

  const detail = functionBlock(resultsSql, 'public.trainer_get_completed_workout_sets')
  assert.match(detail, /workout\.status = 'completed'/i)
  assert.match(detail, /private\.authorize_trainer_result_read[\s\S]+'workout_results\.read'/i)

  const bodyweight = functionBlock(resultsSql, 'public.trainer_get_bodyweights')
  assert.match(bodyweight, /private\.authorize_trainer_result_read[\s\S]+'bodyweight\.read'/i)
  assert.doesNotMatch(bodyweight, /workout_results\.read/i)
})

test('Phase 5 DTOs omit account identity and every read appends a bounded audit event', () => {
  for (const [name, event] of [
    ['public.trainer_get_completed_workouts', 'results.workouts_read'],
    ['public.trainer_get_completed_workout_sets', 'results.workout_detail_read'],
    ['public.trainer_get_bodyweights', 'results.bodyweight_read'],
  ]) {
    const block = functionBlock(resultsSql, name)
    const returns = block.slice(block.indexOf('returns table'), block.indexOf('language plpgsql'))
    assert.doesNotMatch(returns, /user_id|trainer_id|trainee_id|email/i)
    assert.match(block, new RegExp(event.replace('.', '\\.'), 'i'))
    assert.match(block, /private\.append_trainer_relationship_audit/i)
  }
  assert.doesNotMatch(
    resultsSql,
    /create policy[^;]+(?:trainer|relationship)[^;]+on public\.(?:workouts|sets|body_weights)/is,
  )
})

test('every Phase 5 result RPC is hardened and authenticated-only', () => {
  for (const [name, signature] of [
    ['public.trainer_get_completed_workouts', 'public.trainer_get_completed_workouts(uuid, date, date)'],
    ['public.trainer_get_completed_workout_sets', 'public.trainer_get_completed_workout_sets(uuid, bigint)'],
    ['public.trainer_get_bodyweights', 'public.trainer_get_bodyweights(uuid, date, date)'],
  ]) {
    assertHardenedAuthenticatedRpc(resultsSql, name, signature)
  }
})

test('Phase 6 backfill is idempotent, reconciled, and non-destructive', () => {
  assert.match(legacySql, /create table if not exists private\.workout_plan_legacy_mappings/i)
  assert.match(legacySql, /where workout\.status = 'planned'/i)
  assert.match(legacySql, /from public\.scheduled_workouts/i)
  assert.match(legacySql, /on conflict \(source_kind, source_id\)/i)
  assert.match(legacySql, /legacy_planned_workout_coverage/i)
  assert.match(legacySql, /legacy_scheduled_workout_coverage/i)

  for (const destructive of [
    /delete\s+from\s+public\.workouts/i,
    /delete\s+from\s+public\.scheduled_workouts/i,
    /\btruncate\s+(?:table\s+)?(?:public\.)?/i,
    /drop\s+table/i,
    /drop\s+constraint\s+workouts_status_check/i,
  ]) {
    assert.doesNotMatch(legacySql, destructive)
  }
})

test('Phase 6 bridges legacy planned writes until the app cutover', () => {
  assert.match(
    legacySql,
    /create trigger workouts_mirror_legacy_plan[\s\S]+after insert[\s\S]+when \(new\.status = 'planned'\)/i,
  )
  assert.match(
    legacySql,
    /create trigger workouts_00_attach_legacy_plan[\s\S]+before update/i,
  )
  const mirror = functionBlock(legacySql, 'private.migrate_legacy_planned_workout')
  assert.match(mirror, /private\.workout_plan_legacy_mappings/i)
  assert.match(mirror, /private\.create_workout_plan_snapshot/i)
  assert.match(mirror, /missing_template|untrusted_routine_owner/i)
  assert.match(mirror, /planned_workout_has_sets/i)
  assert.doesNotMatch(legacySql, /grant[^;]+workout_plan_legacy_mappings[^;]+authenticated/is)
})
