-- Phase 1A: harden the existing owner-only data boundary and set persistence.
--
-- This migration is written for the live schema inventoried on 2026-07-13.
-- It intentionally preserves the existing save_workout_sets signature so the
-- deployed application remains compatible while its implementation and grants
-- are tightened.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Fail closed for future public-schema objects. Every later migration must
-- grant only the table/function/sequence privileges its API contract needs.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from PUBLIC, anon, authenticated, service_role;

-- Existing sensitive tables are owner-only and have no anonymous API surface.
-- RLS remains the row boundary for authenticated calls.
revoke all on table
  public.workouts,
  public.sets,
  public.routines,
  public.routine_exercises,
  public.scheduled_workouts,
  public.body_weights,
  public.exercise_notes
from PUBLIC, anon;

revoke all on table public.exercises from PUBLIC, anon;

-- Existing projects can have different historical default ACLs. Make the
-- authenticated API contract explicit instead of relying on inherited/default
-- grants; RLS below remains the row-level boundary.
grant usage on schema public to authenticated;
grant usage on schema public to service_role;
grant select on table public.exercises to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.exercises from authenticated;
grant select, insert, update, delete on table
  public.workouts,
  public.sets,
  public.routines,
  public.routine_exercises,
  public.scheduled_workouts,
  public.body_weights,
  public.exercise_notes
to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Supporting indexes for owner reads, RLS predicates, and foreign keys.
-- ---------------------------------------------------------------------------

create index if not exists workouts_user_date_idx
  on public.workouts (user_id, date desc);

-- Required by the composite child-owner foreign key below. The id remains the
-- primary key; this additional key lets Postgres enforce matching ownership.
create unique index if not exists workouts_id_user_uidx
  on public.workouts (id, user_id);

create index if not exists sets_user_workout_idx
  on public.sets (user_id, workout_id);

create index if not exists sets_exercise_idx
  on public.sets (exercise_id);

create index if not exists routines_user_idx
  on public.routines (user_id)
  where user_id is not null;

create unique index if not exists routine_exercises_routine_order_uidx
  on public.routine_exercises (routine_id, "order");

create index if not exists routine_exercises_exercise_idx
  on public.routine_exercises (exercise_id);

-- ---------------------------------------------------------------------------
-- Constraints. Preflight queries confirmed zero violating rows.
-- NOT VALID minimizes the initial lock; VALIDATE checks existing rows before
-- this transaction can commit.
-- ---------------------------------------------------------------------------

alter table public.sets
  add constraint sets_workout_owner_fkey
    foreign key (workout_id, user_id)
    references public.workouts (id, user_id)
    on delete cascade not valid,
  add constraint sets_weight_nonnegative
    check (weight is null or weight >= 0) not valid,
  add constraint sets_reps_nonnegative
    check (reps is null or reps >= 0) not valid,
  add constraint sets_duration_nonnegative
    check (duration_minutes is null or duration_minutes >= 0) not valid,
  add constraint sets_distance_nonnegative
    check (distance is null or distance >= 0) not valid,
  add constraint sets_rest_nonnegative
    check (rest_seconds is null or rest_seconds >= 0) not valid,
  add constraint sets_difficulty_range
    check (difficulty is null or difficulty between 1 and 5) not valid;

alter table public.body_weights
  add constraint body_weights_weight_positive
    check (weight > 0) not valid;

alter table public.routine_exercises
  add constraint routine_exercises_sets_range
    check (sets between 1 and 50) not valid,
  add constraint routine_exercises_reps_nonnegative
    check (reps is null or reps >= 0) not valid,
  add constraint routine_exercises_weight_nonnegative
    check (weight is null or weight >= 0) not valid,
  add constraint routine_exercises_duration_nonnegative
    check (duration_minutes is null or duration_minutes >= 0) not valid,
  add constraint routine_exercises_distance_nonnegative
    check (distance is null or distance >= 0) not valid,
  add constraint routine_exercises_rest_nonnegative
    check (rest_seconds is null or rest_seconds >= 0) not valid,
  add constraint routine_exercises_order_nonnegative
    check ("order" >= 0) not valid,
  add constraint routine_exercises_set_details_shape
    check (
      set_details is null
      or case
        when jsonb_typeof(set_details) = 'array'
          then jsonb_array_length(set_details) = sets
        else false
      end
    ) not valid;

alter table public.sets validate constraint sets_weight_nonnegative;
alter table public.sets validate constraint sets_workout_owner_fkey;
-- The composite key fully replaces the original single-column cascading FK.
-- Keeping both makes PostgREST embedded workouts/sets queries ambiguous.
alter table public.sets drop constraint sets_workout_id_fkey;
alter table public.sets validate constraint sets_reps_nonnegative;
alter table public.sets validate constraint sets_duration_nonnegative;
alter table public.sets validate constraint sets_distance_nonnegative;
alter table public.sets validate constraint sets_rest_nonnegative;
alter table public.sets validate constraint sets_difficulty_range;
alter table public.body_weights validate constraint body_weights_weight_positive;
alter table public.routine_exercises validate constraint routine_exercises_sets_range;
alter table public.routine_exercises validate constraint routine_exercises_reps_nonnegative;
alter table public.routine_exercises validate constraint routine_exercises_weight_nonnegative;
alter table public.routine_exercises validate constraint routine_exercises_duration_nonnegative;
alter table public.routine_exercises validate constraint routine_exercises_distance_nonnegative;
alter table public.routine_exercises validate constraint routine_exercises_rest_nonnegative;
alter table public.routine_exercises validate constraint routine_exercises_order_nonnegative;
alter table public.routine_exercises validate constraint routine_exercises_set_details_shape;

-- ---------------------------------------------------------------------------
-- RLS. Permissive policies combine with OR, so the previous broad sets ALL
-- policy made the stricter INSERT policy ineffective. Replace it with one
-- explicit policy per operation, all checking both row and parent ownership.
-- ---------------------------------------------------------------------------

drop policy if exists "Users can manage their own sets" on public.sets;
drop policy if exists "sets: users insert their own" on public.sets;
drop policy if exists "sets: select own with owned workout" on public.sets;
drop policy if exists "sets: insert own with owned workout" on public.sets;
drop policy if exists "sets: update own with owned workout" on public.sets;
drop policy if exists "sets: delete own with owned workout" on public.sets;

create policy "sets: select own with owned workout"
  on public.sets
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.workouts as parent
      where parent.id = workout_id
        and parent.user_id = (select auth.uid())
    )
  );

create policy "sets: insert own with owned workout"
  on public.sets
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.workouts as parent
      where parent.id = workout_id
        and parent.user_id = (select auth.uid())
    )
  );

create policy "sets: update own with owned workout"
  on public.sets
  for update
  to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.workouts as parent
      where parent.id = workout_id
        and parent.user_id = (select auth.uid())
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.workouts as parent
      where parent.id = workout_id
        and parent.user_id = (select auth.uid())
    )
  );

create policy "sets: delete own with owned workout"
  on public.sets
  for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.workouts as parent
      where parent.id = workout_id
        and parent.user_id = (select auth.uid())
    )
  );

-- Replace the broad workouts ALL policy with explicit authenticated policies.
drop policy if exists "User can manage their own workouts" on public.workouts;
drop policy if exists "workouts: select own" on public.workouts;
drop policy if exists "workouts: insert own" on public.workouts;
drop policy if exists "workouts: update own" on public.workouts;
drop policy if exists "workouts: delete own" on public.workouts;

create policy "workouts: select own"
  on public.workouts for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "workouts: insert own"
  on public.workouts for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "workouts: update own"
  on public.workouts for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "workouts: delete own"
  on public.workouts for delete to authenticated
  using ((select auth.uid()) = user_id);

-- A routine exercise may only be updated while it belongs to an owned
-- non-preset routine, and it may not be moved into an unowned/preset routine.
drop policy if exists "routine_exercises: users update their own"
  on public.routine_exercises;
drop policy if exists "routine_exercises: update owned routine"
  on public.routine_exercises;

create policy "routine_exercises: update owned routine"
  on public.routine_exercises
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.routines as parent
      where parent.id = routine_id
        and parent.user_id = (select auth.uid())
        and parent.is_preset = false
    )
  )
  with check (
    exists (
      select 1
      from public.routines as parent
      where parent.id = routine_id
        and parent.user_id = (select auth.uid())
        and parent.is_preset = false
    )
  );

-- The exercise library is authenticated-read-only. Scoping the policy role
-- directly avoids granting the policy to PUBLIC and checking auth.role().
drop policy if exists "Authenticated users can read exercises"
  on public.exercises;
drop policy if exists "exercises: authenticated read"
  on public.exercises;

create policy "exercises: authenticated read"
  on public.exercises
  for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Harden the existing atomic set snapshot RPC without changing its signature.
-- ---------------------------------------------------------------------------

create or replace function public.save_workout_sets(
  p_workout_id bigint,
  p_user_id uuid,
  p_sets jsonb
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
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  if p_user_id is distinct from v_actor then
    raise exception using
      errcode = '42501',
      message = 'p_user_id does not match the authenticated caller';
  end if;

  if jsonb_typeof(p_sets) is distinct from 'array' then
    raise exception using
      errcode = '22023',
      message = 'p_sets must be a JSON array';
  end if;

  if jsonb_array_length(p_sets) > 1000 or pg_column_size(p_sets) > 1048576 then
    raise exception using
      errcode = '22023',
      message = 'set snapshot exceeds the allowed payload size';
  end if;

  -- Serialize concurrent saves for the same workout and verify current owner
  -- and lifecycle state before touching any sets.
  perform 1
  from public.workouts as workout
  where workout.id = p_workout_id
    and workout.user_id = v_actor
    and workout.status in ('in_progress', 'completed')
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = format('workout %s not found for the authenticated user', p_workout_id);
  end if;

  delete from public.sets
  where workout_id = p_workout_id
    and user_id = v_actor;

  insert into public.sets (
    workout_id,
    user_id,
    exercise_id,
    weight,
    reps,
    duration_minutes,
    distance,
    rest_seconds,
    difficulty
  )
  select
    p_workout_id,
    v_actor,
    (item->>'exercise_id')::bigint,
    (item->>'weight')::numeric,
    (item->>'reps')::integer,
    (item->>'duration_minutes')::numeric,
    (item->>'distance')::numeric,
    (item->>'rest_seconds')::numeric,
    (item->>'difficulty')::smallint
  from jsonb_array_elements(p_sets) as item;
end;
$function$;

revoke all on function public.save_workout_sets(bigint, uuid, jsonb) from PUBLIC;
revoke all on function public.save_workout_sets(bigint, uuid, jsonb) from anon;
revoke all on function public.save_workout_sets(bigint, uuid, jsonb) from authenticated;
revoke all on function public.save_workout_sets(bigint, uuid, jsonb) from service_role;
grant execute on function public.save_workout_sets(bigint, uuid, jsonb) to authenticated;

comment on function public.save_workout_sets(bigint, uuid, jsonb) is
  'Atomically replaces an authenticated owner''s bounded set snapshot.';

notify pgrst, 'reload schema';

commit;

-- Verification result: every boolean should be true and constraint count
-- should be 16. Keeping this read-only query beside the migration makes a
-- manual SQL Editor deployment independently checkable.
select
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sets'
      and policyname = 'Users can manage their own sets'
  ) as unsafe_sets_policy_removed,
  (
    select count(*) = 4
    from pg_policies
    where schemaname = 'public'
      and tablename = 'sets'
      and policyname like 'sets: % own with owned workout'
  ) as four_strict_sets_policies,
  not has_function_privilege(
    'anon',
    'public.save_workout_sets(bigint,uuid,jsonb)',
    'execute'
  ) as anon_rpc_denied,
  not has_function_privilege(
    'service_role',
    'public.save_workout_sets(bigint,uuid,jsonb)',
    'execute'
  ) as service_role_rpc_denied,
  has_function_privilege(
    'authenticated',
    'public.save_workout_sets(bigint,uuid,jsonb)',
    'execute'
  ) as authenticated_rpc_allowed,
  (
    select
      p.prosecdef
      and exists (
        select 1
        from unnest(p.proconfig) as config(setting)
        where setting like 'search_path=%'
          and setting not like '%public%'
      )
    from pg_proc as p
    join pg_namespace as ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.oid = 'public.save_workout_sets(bigint,uuid,jsonb)'::regprocedure
  ) as rpc_is_hardened,
  (
    select count(*) = 16
    from pg_constraint as con
    where con.conrelid in (
      'public.sets'::regclass,
      'public.body_weights'::regclass,
      'public.routine_exercises'::regclass
    )
      and con.conname in (
        'sets_workout_owner_fkey',
        'sets_weight_nonnegative',
        'sets_reps_nonnegative',
        'sets_duration_nonnegative',
        'sets_distance_nonnegative',
        'sets_rest_nonnegative',
        'sets_difficulty_range',
        'body_weights_weight_positive',
        'routine_exercises_sets_range',
        'routine_exercises_reps_nonnegative',
        'routine_exercises_weight_nonnegative',
        'routine_exercises_duration_nonnegative',
        'routine_exercises_distance_nonnegative',
        'routine_exercises_rest_nonnegative',
        'routine_exercises_order_nonnegative',
        'routine_exercises_set_details_shape'
      )
      and con.convalidated
  ) as all_constraints_validated;
