import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migrationUrl = new URL(
  '../supabase/migrations/20260713000400_trainer_relationships_consent.sql',
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

const publicFunctions = [
  'public.request_trainer_relationship',
  'public.accept_trainer_relationship',
  'public.decline_trainer_relationship',
  'public.end_trainer_relationship',
  'public.grant_trainer_access',
  'public.revoke_trainer_access',
  'public.list_my_trainer_relationships',
  'public.list_trainer_relationship_audit',
]

test('relationship migration is additive and leaves owner health/workout tables untouched', () => {
  for (const table of [
    'workouts',
    'sets',
    'routines',
    'routine_exercises',
    'body_weights',
    'exercise_notes',
    'scheduled_workouts',
  ]) {
    assert.doesNotMatch(
      sql,
      new RegExp(`(?:alter\\s+table|delete\\s+from|truncate\\s+(?:table\\s+)?|drop\\s+table)\\s+public\\.${table}\\b`, 'i'),
      `${table} must remain untouched by the consent migration`,
    )
  }
  assert.doesNotMatch(sql, /trainer_get_completed_workouts|trainer_get_bodyweights/i)
})

test('relationship, consent, and audit tables are RLS protected and have no authenticated base-table access', () => {
  for (const table of [
    'trainer_relationships',
    'trainer_access_grants',
    'trainer_relationship_audit_events',
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}\\b`, 'i'))
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
  }
  assert.match(
    sql,
    /revoke all on table\s+public\.trainer_relationships,\s+public\.trainer_access_grants,\s+public\.trainer_relationship_audit_events\s+from PUBLIC, anon, authenticated, service_role;/i,
  )
  assert.doesNotMatch(
    sql,
    /grant\s+(?:select|insert|update|delete|all)[^;]+(?:trainer_relationships|trainer_access_grants|trainer_relationship_audit_events)[^;]+to authenticated/is,
  )
})

test('schema enforces bilateral activation and one current relationship per trainer/trainee pair', () => {
  assert.match(sql, /constraint trainer_relationships_distinct_parties[\s\S]+trainer_id <> trainee_id/i)
  assert.match(sql, /constraint trainer_relationships_initiator_is_party[\s\S]+initiated_by in \(trainer_id, trainee_id\)/i)
  assert.match(sql, /constraint trainer_relationships_state_consistency[\s\S]+status = 'pending'[\s\S]+status = 'active'/i)
  assert.match(sql, /status = 'active'[\s\S]+trainer_accepted_at is not null[\s\S]+trainee_accepted_at is not null[\s\S]+activated_at is not null/i)
  assert.match(
    sql,
    /create unique index trainer_relationships_one_current_pair_idx[\s\S]+on public\.trainer_relationships \(trainer_id, trainee_id\)[\s\S]+where status in \('pending', 'active'\)/i,
  )
})

test('grant schema is bounded, trainee-authored, soft-revoked, and unique while active', () => {
  assert.match(sql, /permission in \('workout_results\.read', 'bodyweight\.read'\)/i)
  assert.match(sql, /constraint trainer_access_grants_revocation_consistency/i)
  assert.match(sql, /constraint trainer_access_grants_date_range/i)
  assert.match(
    sql,
    /create unique index trainer_access_grants_one_active_permission_idx[\s\S]+\(relationship_id, permission\)[\s\S]+where revoked_at is null/i,
  )
  const grant = functionBlock('public.grant_trainer_access')
  assert.match(grant, /relationship\.trainee_id <> v_actor/i)
  assert.match(grant, /relationship\.status <> 'active'/i)
  assert.match(grant, /verification_status = 'approved'/i)
  assert.match(grant, /p_history_scope[\s\S]+in \('all', 'from_now'\)/i)
})

test('all relationship mutations lock current state and derive the actor from auth.uid', () => {
  for (const name of [
    'public.request_trainer_relationship',
    'public.accept_trainer_relationship',
    'public.decline_trainer_relationship',
    'public.end_trainer_relationship',
    'public.grant_trainer_access',
    'public.revoke_trainer_access',
  ]) {
    const block = functionBlock(name)
    assert.match(block, /v_actor uuid := auth\.uid\(\)/, `${name} must derive its actor`)
    assert.doesNotMatch(
      block.slice(0, block.indexOf('returns')),
      /p_(?:actor|user|trainer|trainee)_id/i,
      `${name} must not accept an account id from the browser`,
    )
  }
  for (const name of [
    'public.accept_trainer_relationship',
    'public.decline_trainer_relationship',
    'public.end_trainer_relationship',
    'public.grant_trainer_access',
    'public.revoke_trainer_access',
  ]) {
    assert.match(functionBlock(name), /for update/i, `${name} must serialize transitions`)
  }
})

test('request and bilateral transitions enforce the current directory and invited-party rules', () => {
  const request = functionBlock('public.request_trainer_relationship')
  assert.match(request, /trainer\.verification_status = 'approved'/)
  assert.match(request, /trainer\.listing_status = 'published'/)
  assert.match(request, /trainer\.accepting_clients = true/)
  assert.match(request, /v_trainer_id = v_actor/)
  assert.match(request, /trainee_accepted_at[\s\S]+v_now/)

  const accept = functionBlock('public.accept_trainer_relationship')
  assert.match(accept, /v_relationship\.status <> 'pending'/)
  assert.match(accept, /v_actor = v_relationship\.initiated_by/)
  assert.match(accept, /trainer\.verification_status = 'approved'/)
  assert.match(accept, /status = 'active'/)
  assert.match(accept, /activated_at = v_now/)

  const decline = functionBlock('public.decline_trainer_relationship')
  assert.match(decline, /v_relationship\.status <> 'pending'/)
  assert.match(decline, /v_actor = v_relationship\.initiated_by/)
  assert.match(decline, /status = 'declined'/)
  assert.match(decline, /ended_by = v_actor/)
})

test('a trigger enforces grant authorship even for operational base-table writes', () => {
  const validator = functionBlock('private.validate_trainer_access_grant')
  assert.match(validator, /new\.granted_by <> v_relationship\.trainee_id/)
  assert.match(
    sql,
    /create trigger trainer_access_grants_validate_provenance[\s\S]+before insert or update[\s\S]+private\.validate_trainer_access_grant\(\)/i,
  )
})

test('ending a relationship revokes every current grant in the same transaction', () => {
  const block = functionBlock('public.end_trainer_relationship')
  assert.match(block, /update public\.trainer_access_grants/i)
  assert.match(block, /revoked_at = v_now/i)
  assert.match(block, /revoked_by = v_actor/i)
  assert.match(block, /where relationship_id = p_relationship_id[\s\S]+and revoked_at is null/i)
})

test('audit history is append-only and transition functions record fixed event types', () => {
  assert.match(
    sql,
    /create trigger trainer_relationship_audit_prevent_mutation[\s\S]+before update or delete[\s\S]+private\.prevent_trainer_audit_mutation\(\)/i,
  )
  for (const event of [
    'relationship.requested',
    'relationship.accepted',
    'relationship.activated',
    'relationship.declined',
    'relationship.ended',
    'access.granted',
    'access.revoked',
  ]) {
    assert.match(sql, new RegExp(event.replace('.', '\\.'), 'i'), `missing audit event ${event}`)
  }
  assert.doesNotMatch(
    sql,
    /grant\s+(?:update|delete|all)[^;]+trainer_relationship_audit_events/i,
  )
})

test('participant DTOs contain no auth ids, email, workout, set, or bodyweight fields', () => {
  const list = functionBlock('public.list_my_trainer_relationships')
  const listReturns = list.slice(list.indexOf('returns table'), list.indexOf('language plpgsql'))
  assert.doesNotMatch(
    listReturns,
    /\n\s+(?:trainer_id|trainee_id|initiated_by|email|workout_id|weight|reps)\s+/i,
  )
  assert.match(listReturns, /relationship_id uuid/)
  assert.match(listReturns, /my_role text/)
  assert.match(listReturns, /workout_results_access boolean/)
  assert.match(listReturns, /bodyweight_access boolean/)

  const audit = functionBlock('public.list_trainer_relationship_audit')
  const auditReturns = audit.slice(audit.indexOf('returns table'), audit.indexOf('language plpgsql'))
  assert.doesNotMatch(auditReturns, /actor_id|trainer_id|trainee_id|email/i)
})

test('every public RPC is a hardened definer function exposed only to authenticated', () => {
  for (const name of publicFunctions) {
    const block = functionBlock(name)
    assert.match(block, /security definer/i, `${name} must be security definer`)
    assert.match(block, /set search_path = ''/i, `${name} must have an empty search path`)
  }

  for (const signature of [
    'request_trainer_relationship\\(uuid\\)',
    'accept_trainer_relationship\\(uuid\\)',
    'decline_trainer_relationship\\(uuid\\)',
    'end_trainer_relationship\\(uuid\\)',
    'grant_trainer_access\\(uuid, text, text\\)',
    'revoke_trainer_access\\(uuid, text\\)',
    'list_my_trainer_relationships\\(\\)',
    'list_trainer_relationship_audit\\(uuid\\)',
  ]) {
    assert.match(
      sql,
      new RegExp(`revoke all on function public\\.${signature}\\s+from PUBLIC, anon, authenticated, service_role;`, 'i'),
    )
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${signature}\\s+to authenticated;`, 'i'),
    )
  }
})
