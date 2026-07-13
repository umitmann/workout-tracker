import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migrationUrl = new URL(
  '../supabase/migrations/20260713000300_profiles_trainer_directory.sql',
  import.meta.url,
)
const bootstrapUrl = new URL(
  '../supabase/manual/bootstrap_platform_admin.sql',
  import.meta.url,
)

const sql = await readFile(migrationUrl, 'utf8')
const bootstrap = await readFile(bootstrapUrl, 'utf8')

function functionBlock(name) {
  const start = sql.indexOf(`create or replace function ${name}`)
  assert.notEqual(start, -1, `missing function ${name}`)
  const end = sql.indexOf('$function$;', start)
  assert.notEqual(end, -1, `unterminated function ${name}`)
  return sql.slice(start, end + '$function$;'.length)
}

test('directory migration is additive to existing workout and health data', () => {
  for (const table of [
    'workouts',
    'sets',
    'routines',
    'routine_exercises',
    'body_weights',
    'exercise_notes',
  ]) {
    assert.doesNotMatch(
      sql,
      new RegExp(`(?:alter\\s+table|delete\\s+from|truncate\\s+(?:table\\s+)?|drop\\s+table)\\s+public\\.${table}\\b`, 'i'),
      `${table} must remain untouched by the identity/directory migration`,
    )
  }
})

test('all three foundation tables are RLS-protected and fail closed to anon', () => {
  for (const table of ['profiles', 'trainer_profiles', 'platform_roles']) {
    assert.match(sql, new RegExp(`create table public\\.${table}\\b`, 'i'))
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
  }
  assert.match(
    sql,
    /revoke all on table public\.profiles, public\.trainer_profiles, public\.platform_roles\s+from PUBLIC, anon, authenticated, service_role;/i,
  )
  assert.doesNotMatch(sql, /grant\s+.+public\.platform_roles\s+to authenticated/is)
})

test('account and trainer base rows are owner-readable but mutations use narrow RPCs', () => {
  assert.match(sql, /create policy "profiles: read own"[\s\S]+auth\.uid\(\)\) = user_id/)
  assert.match(sql, /create policy "trainer_profiles: read own base row"[\s\S]+auth\.uid\(\)\) = user_id/)
  assert.match(sql, /grant select on table public\.profiles to authenticated;/)
  assert.match(sql, /grant select on table public\.trainer_profiles to authenticated;/)
  assert.doesNotMatch(sql, /grant (?:insert|update|delete)[^;]+public\.trainer_profiles[^;]+authenticated/is)
  assert.doesNotMatch(sql, /grant update[^;]+public\.profiles[^;]+authenticated/is)
})

test('public RPCs are security-definer functions with an empty search path', () => {
  for (const name of [
    'public.current_user_is_platform_admin',
    'public.save_my_profile',
    'public.save_trainer_profile',
    'public.trainer_directory_search',
    'public.trainer_directory_get',
    'public.admin_list_trainer_profiles',
    'public.admin_set_trainer_verification',
  ]) {
    const block = functionBlock(name)
    assert.match(block, /security definer/i, `${name} must be security definer`)
    assert.match(block, /set search_path = ''/i, `${name} must use an empty search path`)
  }
})

test('directory DTO excludes private identity and review columns', () => {
  for (const name of ['public.trainer_directory_search', 'public.trainer_directory_get']) {
    const block = functionBlock(name)
    const returns = block.slice(block.indexOf('returns table'), block.indexOf('language plpgsql'))
    assert.doesNotMatch(returns, /user_id|reviewed_|verification_status|email/i)
    assert.match(block, /verification_status = 'approved'/)
    assert.match(block, /listing_status = 'published'/)
  }
})

test('trainer self-service cannot choose its own verification status', () => {
  const block = functionBlock('public.save_trainer_profile')
  const signature = block.slice(0, block.indexOf('returns uuid'))
  assert.doesNotMatch(signature, /verification|reviewed/i)
  assert.match(block, /v_actor uuid := auth\.uid\(\)/)
  assert.match(block, /existing\.verification_status = 'rejected' then 'pending'/)
  assert.match(block, /existing\.verification_status = 'suspended' then 'paused'/)
})

test('admin operations authorize current platform membership without touching health data', () => {
  for (const name of [
    'public.admin_list_trainer_profiles',
    'public.admin_set_trainer_verification',
  ]) {
    const block = functionBlock(name)
    assert.match(block, /private\.is_platform_admin\(auth\.uid\(\)|private\.is_platform_admin\(v_actor\)/)
    assert.doesNotMatch(block, /public\.(?:workouts|sets|body_weights|exercise_notes|routines)\b/)
  }
})

test('every exposed RPC is denied to anon/service-role and explicitly granted to authenticated', () => {
  for (const signature of [
    'current_user_is_platform_admin\\(\\)',
    'save_my_profile\\(text, text, text\\)',
    'save_trainer_profile\\(text, text, text\\[\\], boolean, text, boolean, text, text\\)',
    'trainer_directory_search\\(text, text, boolean, integer, integer\\)',
    'trainer_directory_get\\(uuid\\)',
    'admin_list_trainer_profiles\\(text, integer, integer\\)',
    'admin_set_trainer_verification\\(uuid, text\\)',
  ]) {
    assert.match(
      sql,
      new RegExp(`revoke all on function public\\.${signature}\\s+from PUBLIC, anon, authenticated, service_role;`, 'i'),
    )
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${signature}[^;]*\\s+to authenticated;`, 'i'),
    )
  }
})

test('auth-user trigger is bounded and existing users are backfilled without email', () => {
  const trigger = functionBlock('private.handle_new_user_profile')
  assert.match(trigger, /pg_catalog\.left\([\s\S]+80/)
  assert.match(trigger, /on conflict \(user_id\) do nothing/)
  assert.doesNotMatch(trigger, /new\.email/)
  assert.match(sql, /from auth\.users as auth_user[\s\S]+on conflict \(user_id\) do nothing;/)
})

test('admin bootstrap resolves exactly one auth user and is idempotent', () => {
  assert.match(bootstrap, /REPLACE_WITH_YOUR_LOGIN_EMAIL/)
  assert.match(bootstrap, /if v_match_count <> 1 then/)
  assert.match(bootstrap, /insert into public\.platform_roles/)
  assert.match(bootstrap, /values \(v_user_id, 'platform_admin', v_user_id\)/)
  assert.match(bootstrap, /on conflict \(user_id, role\) do nothing/)
})
