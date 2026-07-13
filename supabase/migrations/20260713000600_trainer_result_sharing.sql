-- PT Phase 5: consent-gated, audited trainer reads.
--
-- Raw workouts, sets, and bodyweight tables remain owner-only. A trainer can
-- retrieve only bounded DTOs after every call re-checks the active bilateral
-- relationship, trainer approval, category-specific grant, and date scope.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.trainer_relationship_audit_events
  drop constraint trainer_relationship_audit_event_type;

alter table public.trainer_relationship_audit_events
  add constraint trainer_relationship_audit_event_type
  check (
    event_type in (
      'relationship.requested',
      'relationship.accepted',
      'relationship.activated',
      'relationship.declined',
      'relationship.ended',
      'access.granted',
      'access.revoked',
      'plan.assigned',
      'plan.cancelled',
      'plan.started',
      'plan.completed',
      'results.workouts_read',
      'results.workout_detail_read',
      'results.bodyweight_read'
    )
  ) not valid;

alter table public.trainer_relationship_audit_events
  validate constraint trainer_relationship_audit_event_type;

create or replace function private.authorize_trainer_result_read(
  p_relationship_id uuid,
  p_permission text
)
returns public.trainer_access_grants
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_relationship public.trainer_relationships%rowtype;
  v_grant public.trainer_access_grants%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if p_relationship_id is null
     or p_permission not in ('workout_results.read', 'bodyweight.read') then
    raise exception using errcode = '22023', message = 'invalid delegated result request';
  end if;

  -- The shared relationship lock serializes this read with end/revoke, both of
  -- which take the relationship row FOR UPDATE before changing access.
  select relationship.*
  into v_relationship
  from public.trainer_relationships as relationship
  where relationship.id = p_relationship_id
    and relationship.trainer_id = v_actor
    and relationship.status = 'active'
  for share;

  if not found then
    raise exception using errcode = '42501', message = 'delegated result access is not allowed';
  end if;

  if not exists (
    select 1
    from public.trainer_profiles as trainer
    where trainer.user_id = v_actor
      and trainer.verification_status = 'approved'
    for share
  ) then
    raise exception using errcode = '42501', message = 'delegated result access is not allowed';
  end if;

  select grant_row.*
  into v_grant
  from public.trainer_access_grants as grant_row
  where grant_row.relationship_id = p_relationship_id
    and grant_row.permission = p_permission
    and grant_row.granted_by = v_relationship.trainee_id
    and grant_row.revoked_at is null
  for share;

  if not found then
    raise exception using errcode = '42501', message = 'delegated result access is not allowed';
  end if;

  return v_grant;
end;
$function$;

revoke all on function private.authorize_trainer_result_read(uuid, text)
  from PUBLIC, anon, authenticated, service_role;

create or replace function public.trainer_get_completed_workouts(
  p_relationship_id uuid,
  p_from date,
  p_to date
)
returns table (
  id bigint,
  date date,
  status text,
  title text,
  set_count bigint,
  exercise_count bigint
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_grant public.trainer_access_grants%rowtype;
  v_relationship public.trainer_relationships%rowtype;
  v_effective_from date;
  v_effective_to date;
  v_row_count bigint := 0;
begin
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 366 then
    raise exception using errcode = '22023', message = 'result date range must contain at most 367 days';
  end if;

  v_grant := private.authorize_trainer_result_read(
    p_relationship_id,
    'workout_results.read'
  );

  select relationship.*
  into strict v_relationship
  from public.trainer_relationships as relationship
  where relationship.id = p_relationship_id;

  v_effective_from := greatest(p_from, coalesce(v_grant.resource_date_from, p_from));
  v_effective_to := least(p_to, coalesce(v_grant.resource_date_to, p_to));

  if v_effective_from <= v_effective_to then
    return query
    select
      workout.id,
      workout.date,
      workout.status,
      plan.title,
      count(set_row.id),
      count(distinct set_row.exercise_id)
    from public.workouts as workout
    left join public.sets as set_row
      on set_row.workout_id = workout.id
      and set_row.user_id = workout.user_id
    left join public.workout_plans as plan
      on plan.id = workout.plan_id
    where workout.user_id = v_relationship.trainee_id
      and workout.status = 'completed'
      and workout.date between v_effective_from and v_effective_to
    group by workout.id, workout.date, workout.status, plan.title
    order by workout.date desc, workout.id desc;

    get diagnostics v_row_count = row_count;
  end if;

  perform private.append_trainer_relationship_audit(
    p_relationship_id,
    auth.uid(),
    'trainer',
    'results.workouts_read',
    pg_catalog.jsonb_build_object(
      'from', p_from,
      'to', p_to,
      'returned_count', v_row_count
    )
  );
end;
$function$;

create or replace function public.trainer_get_completed_workout_sets(
  p_relationship_id uuid,
  p_workout_id bigint
)
returns table (
  workout_id bigint,
  workout_date date,
  exercise_id bigint,
  exercise_name text,
  set_number bigint,
  weight numeric,
  reps integer,
  duration_minutes numeric,
  distance numeric,
  rest_seconds numeric,
  difficulty smallint
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_grant public.trainer_access_grants%rowtype;
  v_relationship public.trainer_relationships%rowtype;
  v_workout public.workouts%rowtype;
  v_row_count bigint := 0;
begin
  if p_workout_id is null or p_workout_id <= 0 then
    raise exception using errcode = '22023', message = 'valid workout id is required';
  end if;

  v_grant := private.authorize_trainer_result_read(
    p_relationship_id,
    'workout_results.read'
  );

  select relationship.*
  into strict v_relationship
  from public.trainer_relationships as relationship
  where relationship.id = p_relationship_id;

  select workout.*
  into v_workout
  from public.workouts as workout
  where workout.id = p_workout_id
    and workout.user_id = v_relationship.trainee_id
    and workout.status = 'completed'
    and (v_grant.resource_date_from is null or workout.date >= v_grant.resource_date_from)
    and (v_grant.resource_date_to is null or workout.date <= v_grant.resource_date_to);

  if found then
    return query
    select
      v_workout.id,
      v_workout.date,
      set_row.exercise_id,
      exercise.name,
      row_number() over (
        partition by set_row.exercise_id
        order by set_row.id
      ),
      set_row.weight,
      set_row.reps,
      set_row.duration_minutes,
      set_row.distance,
      set_row.rest_seconds,
      set_row.difficulty
    from public.sets as set_row
    join public.exercises as exercise
      on exercise.id = set_row.exercise_id
    where set_row.workout_id = v_workout.id
      and set_row.user_id = v_relationship.trainee_id
    order by set_row.id;

    get diagnostics v_row_count = row_count;
  end if;

  perform private.append_trainer_relationship_audit(
    p_relationship_id,
    auth.uid(),
    'trainer',
    'results.workout_detail_read',
    pg_catalog.jsonb_build_object(
      'workout_id', p_workout_id,
      'returned_set_count', v_row_count
    )
  );
end;
$function$;

create or replace function public.trainer_get_bodyweights(
  p_relationship_id uuid,
  p_from date,
  p_to date
)
returns table (
  date date,
  weight numeric
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_grant public.trainer_access_grants%rowtype;
  v_relationship public.trainer_relationships%rowtype;
  v_effective_from date;
  v_effective_to date;
  v_row_count bigint := 0;
begin
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 366 then
    raise exception using errcode = '22023', message = 'bodyweight date range must contain at most 367 days';
  end if;

  v_grant := private.authorize_trainer_result_read(
    p_relationship_id,
    'bodyweight.read'
  );

  select relationship.*
  into strict v_relationship
  from public.trainer_relationships as relationship
  where relationship.id = p_relationship_id;

  v_effective_from := greatest(p_from, coalesce(v_grant.resource_date_from, p_from));
  v_effective_to := least(p_to, coalesce(v_grant.resource_date_to, p_to));

  if v_effective_from <= v_effective_to then
    return query
    select
      measurement.date,
      measurement.weight
    from public.body_weights as measurement
    where measurement.user_id = v_relationship.trainee_id
      and measurement.date between v_effective_from and v_effective_to
    order by measurement.date desc;

    get diagnostics v_row_count = row_count;
  end if;

  perform private.append_trainer_relationship_audit(
    p_relationship_id,
    auth.uid(),
    'trainer',
    'results.bodyweight_read',
    pg_catalog.jsonb_build_object(
      'from', p_from,
      'to', p_to,
      'returned_count', v_row_count
    )
  );
end;
$function$;

revoke all on function public.trainer_get_completed_workouts(uuid, date, date)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.trainer_get_completed_workout_sets(uuid, bigint)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.trainer_get_bodyweights(uuid, date, date)
  from PUBLIC, anon, authenticated, service_role;

grant execute on function public.trainer_get_completed_workouts(uuid, date, date)
  to authenticated;
grant execute on function public.trainer_get_completed_workout_sets(uuid, bigint)
  to authenticated;
grant execute on function public.trainer_get_bodyweights(uuid, date, date)
  to authenticated;

comment on function public.trainer_get_completed_workouts(uuid, date, date) is
  'Returns an audited completed-workout summary DTO after current relationship and workout-result consent checks.';
comment on function public.trainer_get_completed_workout_sets(uuid, bigint) is
  'Returns an audited set-result DTO for one consent-covered completed workout.';
comment on function public.trainer_get_bodyweights(uuid, date, date) is
  'Returns audited bodyweight DTOs only under the independent bodyweight grant.';

notify pgrst, 'reload schema';

commit;

select
  not has_table_privilege('authenticated', 'public.trainer_relationships', 'select')
    and not has_table_privilege('authenticated', 'public.trainer_access_grants', 'select')
    and not has_table_privilege('authenticated', 'public.workout_plans', 'select')
    as authenticated_sensitive_base_tables_remain_closed,
  (
    select pg_catalog.bool_and(
      procedure.prosecdef
      and exists (
        select 1
        from pg_catalog.unnest(procedure.proconfig) as config(setting)
        where setting like 'search_path=%'
          and setting not like '%public%'
      )
    )
    from pg_catalog.pg_proc as procedure
    where procedure.oid in (
      'public.trainer_get_completed_workouts(uuid,date,date)'::regprocedure,
      'public.trainer_get_completed_workout_sets(uuid,bigint)'::regprocedure,
      'public.trainer_get_bodyweights(uuid,date,date)'::regprocedure
    )
  ) as all_result_rpcs_are_hardened,
  has_function_privilege(
    'authenticated',
    'public.trainer_get_completed_workouts(uuid,date,date)',
    'execute'
  )
    and has_function_privilege(
      'authenticated',
      'public.trainer_get_bodyweights(uuid,date,date)',
      'execute'
    )
    and not has_function_privilege(
      'anon',
      'public.trainer_get_completed_workouts(uuid,date,date)',
      'execute'
    )
    and not has_function_privilege(
      'service_role',
      'public.trainer_get_completed_workouts(uuid,date,date)',
      'execute'
    ) as result_rpc_permissions_are_scoped,
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.trainer_relationship_audit_events'::regclass
      and conname = 'trainer_relationship_audit_event_type'
      and pg_catalog.pg_get_constraintdef(oid) like '%results.workouts_read%'
      and pg_catalog.pg_get_constraintdef(oid) like '%results.bodyweight_read%'
  ) as result_reads_are_auditable,
  (select count(*) from public.workouts) as stored_workout_count,
  (select count(*) from public.sets) as stored_set_count,
  (select count(*) from public.body_weights) as stored_bodyweight_count;
