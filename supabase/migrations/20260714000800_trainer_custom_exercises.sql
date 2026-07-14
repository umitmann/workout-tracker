-- PT Phase 7: trainer-authored exercises with scoped discovery, durable
-- historical access, and privacy-enhanced YouTube explanations.
--
-- Existing catalog rows remain platform-owned. Custom rows are mutated only
-- through narrow RPCs, and trainer approval is rechecked in the database.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Close an adjacent direct-RPC gap found while adding the account panel. The
-- browser action already enforces HTTPS, but the database remains the final
-- boundary for callers that invoke save_my_profile directly.
create or replace function public.save_my_profile(
  p_display_name text,
  p_avatar_url text,
  p_time_zone text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_display_name text := pg_catalog.btrim(p_display_name);
  v_avatar_url text := nullif(pg_catalog.btrim(p_avatar_url), '');
  v_time_zone text := pg_catalog.btrim(p_time_zone);
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if v_display_name is null or char_length(v_display_name) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'display name must contain 1 to 80 characters';
  end if;

  if v_avatar_url is not null and (
    char_length(v_avatar_url) > 2048
    or v_avatar_url !~ '^https://'
  ) then
    raise exception using errcode = '22023', message = 'avatar URL must be a valid HTTPS URL';
  end if;

  if v_time_zone is null
     or char_length(v_time_zone) > 100
     or not exists (
       select 1
       from pg_catalog.pg_timezone_names as time_zone
       where time_zone.name = v_time_zone
     ) then
    raise exception using errcode = '22023', message = 'time zone must be a valid IANA time zone';
  end if;

  update public.profiles
  set
    display_name = v_display_name,
    avatar_url = v_avatar_url,
    time_zone = v_time_zone
  where user_id = v_actor;

  if not found then
    raise exception using errcode = 'P0002', message = 'profile not found';
  end if;
end;
$function$;

alter table public.exercises
  add column creator_id uuid references auth.users (id) on delete set null,
  add column visibility text not null default 'platform',
  add column video_url text,
  add column updated_at timestamp with time zone not null default now(),
  add column archived_at timestamp with time zone;

create or replace function private.text_array_is_bounded(
  p_values text[],
  p_max_count integer,
  p_max_item_length integer,
  p_max_total_length integer
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $function$
  select
    cardinality(coalesce(p_values, '{}'::text[])) <= p_max_count
    and not exists (
      select 1
      from unnest(coalesce(p_values, '{}'::text[])) as item(value)
      where char_length(pg_catalog.btrim(item.value)) not between 1 and p_max_item_length
    )
    and coalesce(
      (
        select sum(char_length(item.value))
        from unnest(coalesce(p_values, '{}'::text[])) as item(value)
      ),
      0
    ) <= p_max_total_length;
$function$;

revoke all on function private.text_array_is_bounded(text[], integer, integer, integer)
  from PUBLIC, anon, authenticated, service_role;
-- Service-role imports can create catalog rows directly. The private schema
-- remains USAGE-denied, while constraint evaluation needs function EXECUTE.
grant execute on function private.text_array_is_bounded(text[], integer, integer, integer)
  to service_role;

alter table public.exercises
  add constraint exercises_custom_shape
  check (
    (
      visibility = 'platform'
      and creator_id is null
      and video_url is null
      and archived_at is null
    )
    or
    (
      visibility in ('public', 'clients')
      and char_length(pg_catalog.btrim(name)) between 1 and 120
      and char_length(pg_catalog.btrim(category)) between 1 and 80
      and (equipment is null or char_length(pg_catalog.btrim(equipment)) between 1 and 120)
      and private.text_array_is_bounded(muscles, 20, 60, 1200)
      and private.text_array_is_bounded(muscles_secondary, 20, 60, 1200)
      and private.text_array_is_bounded(instructions, 30, 1000, 5000)
      and (
        video_url is null
        or video_url ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$'
      )
      and (archived_at is null or archived_at >= created_at)
    )
  ) not valid;

alter table public.exercises validate constraint exercises_custom_shape;

create index exercises_creator_updated_idx
  on public.exercises (creator_id, updated_at desc, id)
  where creator_id is not null;

create index exercises_scoped_directory_idx
  on public.exercises (visibility, name, id)
  where archived_at is null;

create unique index exercises_creator_name_active_uidx
  on public.exercises (creator_id, pg_catalog.lower(pg_catalog.btrim(name)))
  where creator_id is not null and archived_at is null;

create trigger exercises_set_updated_at
before update on public.exercises
for each row execute function private.set_updated_at();

-- A durable entitlement is created only when a custom exercise is actually
-- referenced in a user's routine, set history, or immutable plan snapshot.
-- This keeps historical screens meaningful after consent/relationship changes
-- without keeping the full trainer catalog discoverable to former clients.
create table public.trainer_exercise_entitlements (
  exercise_id bigint not null
    references public.exercises (id) on delete cascade,
  user_id uuid not null
    references auth.users (id) on delete cascade,
  relationship_id uuid
    references public.trainer_relationships (id) on delete set null,
  granted_at timestamp with time zone not null default now(),
  primary key (exercise_id, user_id)
);

create index trainer_exercise_entitlements_user_idx
  on public.trainer_exercise_entitlements (user_id, exercise_id);

alter table public.trainer_exercise_entitlements enable row level security;

revoke all on table public.trainer_exercise_entitlements
  from PUBLIC, anon, authenticated, service_role;

create or replace function private.can_discover_exercise(
  p_exercise_id bigint,
  p_actor uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select p_actor is not null and exists (
    select 1
    from public.exercises as exercise
    where exercise.id = p_exercise_id
      and exercise.archived_at is null
      and (
        exercise.visibility = 'platform'
        or exercise.visibility = 'public'
        or exercise.creator_id = p_actor
        or (
          exercise.visibility = 'clients'
          and exercise.creator_id is not null
          and exists (
            select 1
            from public.trainer_relationships as relationship
            where relationship.trainer_id = exercise.creator_id
              and relationship.trainee_id = p_actor
              and relationship.status = 'active'
          )
        )
      )
  );
$function$;

create or replace function private.can_read_exercise(
  p_exercise_id bigint,
  p_actor uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select p_actor is not null and (
    private.can_discover_exercise(p_exercise_id, p_actor)
    or exists (
      select 1
      from public.exercises as exercise
      where exercise.id = p_exercise_id
        and exercise.creator_id = p_actor
    )
    or exists (
      select 1
      from public.trainer_exercise_entitlements as entitlement
      where entitlement.exercise_id = p_exercise_id
        and entitlement.user_id = p_actor
    )
  );
$function$;

create or replace function private.can_use_exercise(
  p_exercise_id bigint,
  p_actor uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.can_read_exercise(p_exercise_id, p_actor);
$function$;

revoke all on function private.can_discover_exercise(bigint, uuid)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function private.can_read_exercise(bigint, uuid)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function private.can_use_exercise(bigint, uuid)
  from PUBLIC, anon, authenticated, service_role;
-- RLS policy evaluation runs with the querying role and therefore requires
-- EXECUTE on its predicate. The private schema itself remains USAGE-denied,
-- so callers cannot invoke this helper as an API.
grant execute on function private.can_read_exercise(bigint, uuid)
  to authenticated;

drop policy if exists "Authenticated users can read exercises" on public.exercises;
drop policy if exists "exercises: authenticated read" on public.exercises;
drop policy if exists "exercises: scoped authenticated read" on public.exercises;

create policy "exercises: scoped authenticated read"
  on public.exercises
  for select
  to authenticated
  using (private.can_read_exercise(id, (select auth.uid())));

-- Base-table writes remain unavailable even if historical project grants were
-- broader. RPC and trigger checks are the only custom-exercise mutation path.
grant select on table public.exercises to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.exercises from authenticated;

create or replace function private.exercise_reference_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
begin
  if tg_table_name = 'routine_exercises' then
    select routine.user_id
    into v_user_id
    from public.routines as routine
    where routine.id = new.routine_id;
  elsif tg_table_name = 'sets' then
    v_user_id := new.user_id;
  elsif tg_table_name = 'workout_plan_exercises' then
    select plan.trainee_id
    into v_user_id
    from public.workout_plans as plan
    where plan.id = new.plan_id;
  else
    raise exception using errcode = '0A000', message = 'unsupported exercise reference table';
  end if;

  if not private.can_use_exercise(new.exercise_id, v_user_id) then
    raise exception using errcode = '42501', message = 'exercise is not available to this user';
  end if;

  return new;
end;
$function$;

create or replace function private.record_trainer_exercise_entitlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_creator_id uuid;
  v_relationship_id uuid;
begin
  if tg_table_name = 'routine_exercises' then
    select routine.user_id
    into v_user_id
    from public.routines as routine
    where routine.id = new.routine_id;
  elsif tg_table_name = 'sets' then
    v_user_id := new.user_id;
  elsif tg_table_name = 'workout_plan_exercises' then
    select plan.trainee_id
    into v_user_id
    from public.workout_plans as plan
    where plan.id = new.plan_id;
  end if;

  select exercise.creator_id
  into v_creator_id
  from public.exercises as exercise
  where exercise.id = new.exercise_id;

  if v_user_id is null or v_creator_id is null or v_user_id = v_creator_id then
    return new;
  end if;

  if exists (
    select 1
    from public.trainer_exercise_entitlements as entitlement
    where entitlement.exercise_id = new.exercise_id
      and entitlement.user_id = v_user_id
  ) then
    return new;
  end if;

  select relationship.id
  into v_relationship_id
  from public.trainer_relationships as relationship
  where relationship.trainer_id = v_creator_id
    and relationship.trainee_id = v_user_id
    and relationship.status = 'active'
  order by relationship.activated_at desc, relationship.id
  limit 1;

  insert into public.trainer_exercise_entitlements (
    exercise_id,
    user_id,
    relationship_id
  )
  values (
    new.exercise_id,
    v_user_id,
    v_relationship_id
  )
  on conflict (exercise_id, user_id) do nothing;

  return new;
end;
$function$;

revoke all on function private.exercise_reference_user()
  from PUBLIC, anon, authenticated, service_role;
revoke all on function private.record_trainer_exercise_entitlement()
  from PUBLIC, anon, authenticated, service_role;

create trigger routine_exercises_validate_custom_exercise
before insert or update of exercise_id on public.routine_exercises
for each row execute function private.exercise_reference_user();
create trigger routine_exercises_record_custom_exercise
after insert or update of exercise_id on public.routine_exercises
for each row execute function private.record_trainer_exercise_entitlement();

create trigger sets_validate_custom_exercise
before insert or update of exercise_id on public.sets
for each row execute function private.exercise_reference_user();
create trigger sets_record_custom_exercise
after insert or update of exercise_id on public.sets
for each row execute function private.record_trainer_exercise_entitlement();

create trigger workout_plan_exercises_validate_custom_exercise
before insert or update of exercise_id on public.workout_plan_exercises
for each row execute function private.exercise_reference_user();
create trigger workout_plan_exercises_record_custom_exercise
after insert or update of exercise_id on public.workout_plan_exercises
for each row execute function private.record_trainer_exercise_entitlement();

create or replace function public.list_available_exercises()
returns table (
  id bigint,
  name text,
  category text,
  equipment text,
  muscles text[],
  creator_id uuid,
  visibility text,
  video_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  return query
  select
    exercise.id,
    exercise.name,
    exercise.category,
    exercise.equipment,
    exercise.muscles,
    exercise.creator_id,
    exercise.visibility,
    exercise.video_url
  from public.exercises as exercise
  where exercise.archived_at is null
    and (
      exercise.visibility = 'platform'
      or exercise.visibility = 'public'
      or exercise.creator_id = v_actor
      or (
        exercise.visibility = 'clients'
        and exercise.creator_id is not null
        and exists (
          select 1
          from public.trainer_relationships as relationship
          where relationship.trainer_id = exercise.creator_id
            and relationship.trainee_id = v_actor
            and relationship.status = 'active'
        )
      )
    )
  order by pg_catalog.lower(exercise.name), exercise.id;
end;
$function$;

create or replace function public.save_trainer_exercise(
  p_exercise_id bigint,
  p_name text,
  p_category text,
  p_equipment text,
  p_muscles text[],
  p_muscles_secondary text[],
  p_instructions text[],
  p_video_url text,
  p_visibility text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_name text := pg_catalog.btrim(p_name);
  v_category text := pg_catalog.lower(pg_catalog.btrim(p_category));
  v_equipment text := nullif(pg_catalog.btrim(p_equipment), '');
  v_video_url text := nullif(pg_catalog.btrim(p_video_url), '');
  v_visibility text := pg_catalog.lower(pg_catalog.btrim(p_visibility));
  v_muscles text[];
  v_muscles_secondary text[];
  v_instructions text[];
  v_exercise_id bigint;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if not exists (
    select 1
    from public.trainer_profiles as trainer
    where trainer.user_id = v_actor
      and trainer.verification_status = 'approved'
  ) then
    raise exception using errcode = '42501', message = 'approved trainer profile required';
  end if;

  select coalesce(pg_catalog.array_agg(value order by first_position), '{}'::text[])
  into v_muscles
  from (
    select
      pg_catalog.lower(pg_catalog.btrim(raw.value)) as value,
      min(raw.position) as first_position
    from unnest(coalesce(p_muscles, '{}'::text[])) with ordinality as raw(value, position)
    where nullif(pg_catalog.btrim(raw.value), '') is not null
    group by pg_catalog.lower(pg_catalog.btrim(raw.value))
  ) as normalized;

  select coalesce(pg_catalog.array_agg(value order by first_position), '{}'::text[])
  into v_muscles_secondary
  from (
    select
      pg_catalog.lower(pg_catalog.btrim(raw.value)) as value,
      min(raw.position) as first_position
    from unnest(coalesce(p_muscles_secondary, '{}'::text[])) with ordinality as raw(value, position)
    where nullif(pg_catalog.btrim(raw.value), '') is not null
    group by pg_catalog.lower(pg_catalog.btrim(raw.value))
  ) as normalized;

  select coalesce(pg_catalog.array_agg(pg_catalog.btrim(raw.value) order by raw.position), '{}'::text[])
  into v_instructions
  from unnest(coalesce(p_instructions, '{}'::text[])) with ordinality as raw(value, position)
  where nullif(pg_catalog.btrim(raw.value), '') is not null;

  if v_name is null
     or char_length(v_name) not between 1 and 120
     or v_category is null
     or char_length(v_category) not between 1 and 80
     or (v_equipment is not null and char_length(v_equipment) > 120)
     or cardinality(v_muscles) > 20
     or cardinality(v_muscles_secondary) > 20
     or cardinality(v_instructions) > 30
     or exists (select 1 from unnest(v_muscles) as item(value) where char_length(item.value) > 60)
     or exists (select 1 from unnest(v_muscles_secondary) as item(value) where char_length(item.value) > 60)
     or exists (select 1 from unnest(v_instructions) as item(value) where char_length(item.value) > 1000)
     or coalesce((select sum(char_length(item.value)) from unnest(v_instructions) as item(value)), 0) > 5000
     or v_visibility not in ('public', 'clients')
     or (
       v_video_url is not null
       and v_video_url !~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$'
     ) then
    raise exception using errcode = '22023', message = 'invalid trainer exercise';
  end if;

  if p_exercise_id is null then
    insert into public.exercises (
      name,
      category,
      equipment,
      muscles,
      muscles_secondary,
      instructions,
      creator_id,
      visibility,
      video_url
    )
    values (
      v_name,
      v_category,
      v_equipment,
      v_muscles,
      v_muscles_secondary,
      v_instructions,
      v_actor,
      v_visibility,
      v_video_url
    )
    returning exercises.id into v_exercise_id;
  else
    update public.exercises as exercise
    set
      name = v_name,
      category = v_category,
      equipment = v_equipment,
      muscles = v_muscles,
      muscles_secondary = v_muscles_secondary,
      instructions = v_instructions,
      visibility = v_visibility,
      video_url = v_video_url
    where exercise.id = p_exercise_id
      and exercise.creator_id = v_actor
      and exercise.archived_at is null
    returning exercise.id into v_exercise_id;

    if v_exercise_id is null then
      raise exception using errcode = 'P0002', message = 'trainer exercise not found';
    end if;
  end if;

  return v_exercise_id;
end;
$function$;

create or replace function public.archive_trainer_exercise(
  p_exercise_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if not exists (
    select 1
    from public.trainer_profiles as trainer
    where trainer.user_id = v_actor
      and trainer.verification_status = 'approved'
  ) then
    raise exception using errcode = '42501', message = 'approved trainer profile required';
  end if;

  update public.exercises as exercise
  set archived_at = statement_timestamp()
  where exercise.id = p_exercise_id
    and exercise.creator_id = v_actor
    and exercise.archived_at is null;

  if not found then
    raise exception using errcode = 'P0002', message = 'trainer exercise not found';
  end if;
end;
$function$;

revoke all on function public.list_available_exercises()
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.save_trainer_exercise(bigint, text, text, text, text[], text[], text[], text, text)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.archive_trainer_exercise(bigint)
  from PUBLIC, anon, authenticated, service_role;

grant execute on function public.list_available_exercises() to authenticated;
grant execute on function public.save_trainer_exercise(bigint, text, text, text, text[], text[], text[], text, text)
  to authenticated;
grant execute on function public.archive_trainer_exercise(bigint) to authenticated;

comment on column public.exercises.visibility is
  'platform = legacy catalog; public = all authenticated users; clients = trainer plus active clients.';
comment on table public.trainer_exercise_entitlements is
  'Private durable access for users who referenced a trainer-authored exercise; not a discovery directory.';

commit;

select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'exercises'
      and column_name = 'creator_id'
  ) as trainer_exercise_columns_created,
  not has_table_privilege('anon', 'public.exercises', 'select')
    and not has_table_privilege('anon', 'public.trainer_exercise_entitlements', 'select')
    as anonymous_exercise_access_denied,
  has_table_privilege('authenticated', 'public.exercises', 'select')
    and not has_table_privilege('authenticated', 'public.exercises', 'insert')
    and not has_table_privilege('authenticated', 'public.exercises', 'update')
    and not has_table_privilege('authenticated', 'public.exercises', 'delete')
    as authenticated_exercise_base_is_read_only,
  not has_table_privilege('authenticated', 'public.trainer_exercise_entitlements', 'select')
    as exercise_entitlements_are_private,
  has_function_privilege('authenticated', 'public.list_available_exercises()', 'execute')
    and has_function_privilege(
      'authenticated',
      'public.save_trainer_exercise(bigint,text,text,text,text[],text[],text[],text,text)',
      'execute'
    )
    and has_function_privilege('authenticated', 'public.archive_trainer_exercise(bigint)', 'execute')
    as trainer_exercise_rpc_permissions_are_scoped,
  not has_function_privilege('anon', 'public.list_available_exercises()', 'execute')
    and not has_function_privilege(
      'service_role',
      'public.save_trainer_exercise(bigint,text,text,text,text[],text[],text[],text,text)',
      'execute'
    )
    as non_user_rpc_execution_denied,
  has_function_privilege('authenticated', 'public.save_my_profile(text,text,text)', 'execute')
    and not has_function_privilege('anon', 'public.save_my_profile(text,text,text)', 'execute')
    and not has_function_privilege('service_role', 'public.save_my_profile(text,text,text)', 'execute')
    and pg_catalog.strpos(
      pg_catalog.pg_get_functiondef('public.save_my_profile(text,text,text)'::regprocedure),
      'v_avatar_url !~ ''^https://'''
    ) > 0
    as account_profile_rpc_is_hardened,
  (select count(*) from public.exercises where creator_id is not null) as trainer_exercise_count,
  (select count(*) from public.trainer_exercise_entitlements) as exercise_entitlement_count;
