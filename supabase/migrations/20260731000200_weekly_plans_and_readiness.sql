-- PT Phase 23: flexible weekly plan windows and private daily readiness.
-- Additive and non-destructive: existing day plans, workouts, and sets remain unchanged.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table public.workout_plan_week_windows (
  plan_id uuid primary key references public.workout_plans (id) on delete cascade,
  batch_id uuid not null,
  slot smallint not null,
  week_start date not null,
  week_end date not null,
  selected_date date,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint workout_plan_week_windows_slot_range check (slot between 1 and 7),
  constraint workout_plan_week_windows_monday_start
    check (extract(isodow from week_start) = 1),
  constraint workout_plan_week_windows_exact_range
    check (week_end = week_start + 6),
  constraint workout_plan_week_windows_selected_in_range
    check (selected_date is null or selected_date between week_start and week_end),
  unique (batch_id, slot)
);

create index workout_plan_week_windows_calendar_idx
  on public.workout_plan_week_windows (week_start, week_end, plan_id);

alter table public.workout_plan_week_windows enable row level security;
revoke all on table public.workout_plan_week_windows
  from PUBLIC, anon, authenticated, service_role;

comment on table public.workout_plan_week_windows is
  'Private flexible-week metadata around immutable workout-plan prescriptions.';

create table public.daily_readiness_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  checkin_date date not null,
  feeling smallint not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint daily_readiness_feeling_range check (feeling between 1 and 5),
  unique (user_id, checkin_date)
);

create index daily_readiness_checkins_user_date_idx
  on public.daily_readiness_checkins (user_id, checkin_date desc);

alter table public.daily_readiness_checkins enable row level security;
revoke all on table public.daily_readiness_checkins
  from PUBLIC, anon, authenticated, service_role;

comment on table public.daily_readiness_checkins is
  'Athlete-private daily feeling check-ins. No trainer read is granted by this phase.';

create or replace function public.assign_weekly_workouts_from_routines(
  p_relationship_id uuid,
  p_routine_ids uuid[],
  p_week_start date,
  p_instructions text default null
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_relationship public.trainer_relationships%rowtype;
  v_time_zone text;
  v_today date;
  v_current_week_start date;
  v_batch_id uuid := gen_random_uuid();
  v_plan_ids uuid[] := '{}'::uuid[];
  v_plan_id uuid;
  v_routine_id uuid;
  v_slot bigint;
  v_exercise_count integer;
  v_instructions text := nullif(pg_catalog.btrim(p_instructions), '');
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_relationship_id is null
     or p_week_start is null
     or cardinality(p_routine_ids) not between 1 and 7
     or extract(isodow from p_week_start) <> 1
     or (v_instructions is not null and char_length(v_instructions) > 2000) then
    raise exception using errcode = '22023', message = 'invalid weekly workout assignment';
  end if;

  select relationship.*
  into v_relationship
  from public.trainer_relationships as relationship
  where relationship.id = p_relationship_id
    and relationship.trainer_id = v_actor
    and relationship.status = 'active'
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'weekly workout assignment is not allowed';
  end if;

  perform 1
  from public.trainer_profiles as trainer
  where trainer.user_id = v_actor
    and trainer.verification_status = 'approved'
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'trainer is not approved';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(p_routine_ids) with ordinality as requested(routine_id, slot)
    left join public.routines as routine
      on routine.id = requested.routine_id
      and routine.user_id = v_actor
      and routine.is_preset = false
    where requested.routine_id is null or routine.id is null
  ) then
    raise exception using errcode = '42501', message = 'trainer does not own every source routine';
  end if;

  select profile.time_zone
  into v_time_zone
  from public.profiles as profile
  where profile.user_id = v_relationship.trainee_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'trainee profile not found';
  end if;

  v_today := (statement_timestamp() at time zone v_time_zone)::date;
  v_current_week_start := v_today - (extract(isodow from v_today)::integer - 1);
  if p_week_start < v_current_week_start or p_week_start > v_current_week_start + 728 then
    raise exception using errcode = '22023', message = 'week must be current through two years ahead';
  end if;

  for v_routine_id, v_slot in
    select requested.routine_id, requested.slot
    from pg_catalog.unnest(p_routine_ids) with ordinality as requested(routine_id, slot)
    order by requested.slot
  loop
    select count(*)::integer
    into v_exercise_count
    from public.routine_exercises as source
    where source.routine_id = v_routine_id;
    if v_exercise_count not between 1 and 100 then
      raise exception using errcode = '22023', message = 'every workout must contain 1 to 100 exercises';
    end if;

    v_plan_id := private.create_workout_plan_snapshot(
      v_relationship.trainee_id,
      v_actor,
      p_relationship_id,
      v_routine_id,
      p_week_start,
      null,
      v_instructions,
      statement_timestamp()
    );

    insert into public.workout_plan_week_windows (
      plan_id, batch_id, slot, week_start, week_end
    ) values (
      v_plan_id, v_batch_id, v_slot::smallint, p_week_start, p_week_start + 6
    );

    perform private.append_trainer_relationship_audit(
      p_relationship_id,
      v_actor,
      'trainer',
      'plan.assigned',
      pg_catalog.jsonb_build_object(
        'plan_id', v_plan_id,
        'week_start', p_week_start,
        'batch_id', v_batch_id,
        'slot', v_slot
      )
    );
    v_plan_ids := pg_catalog.array_append(v_plan_ids, v_plan_id);
  end loop;

  return v_plan_ids;
end;
$function$;

create or replace function public.choose_workout_plan_date(
  p_plan_id uuid,
  p_selected_date date
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
  if p_plan_id is null or p_selected_date is null then
    raise exception using errcode = '22023', message = 'plan and selected date are required';
  end if;

  perform 1
  from public.workout_plans as plan
  where plan.id = p_plan_id
    and plan.trainee_id = v_actor
    and plan.status = 'scheduled'
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'training day cannot be selected';
  end if;

  perform 1
  from public.workout_plan_week_windows as week_window
  where week_window.plan_id = p_plan_id
    and p_selected_date between week_window.week_start and week_window.week_end
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'training day cannot be selected';
  end if;

  update public.workout_plan_week_windows as week_window
  set selected_date = p_selected_date, updated_at = statement_timestamp()
  where week_window.plan_id = p_plan_id;
end;
$function$;

create or replace function private.enforce_workout_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_plan public.workout_plans%rowtype;
  v_week_start date;
  v_week_end date;
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception using errcode = '55000', message = 'workout ownership is immutable';
    end if;
    if new.status is distinct from old.status
       and not (
         (old.status = 'planned' and new.status = 'in_progress')
         or (old.status = 'in_progress' and new.status = 'completed')
         or (old.status = 'completed' and new.status = 'in_progress')
       ) then
      raise exception using errcode = '55000', message = 'invalid workout status transition';
    end if;
    if old.plan_id is not null and new.plan_id is distinct from old.plan_id then
      raise exception using errcode = '55000', message = 'workout plan link is immutable';
    end if;
  end if;

  if new.plan_id is not null then
    select plan.*
    into v_plan
    from public.workout_plans as plan
    where plan.id = new.plan_id;

    if not found then
      raise exception using errcode = '23514', message = 'workout does not match an available plan';
    end if;

    select week_window.week_start, week_window.week_end
    into v_week_start, v_week_end
    from public.workout_plan_week_windows as week_window
    where week_window.plan_id = new.plan_id;

    if v_plan.trainee_id <> new.user_id
       or new.status = 'planned'
       or v_plan.status = 'cancelled'
       or (v_week_start is null and v_plan.scheduled_date <> new.date)
       or (v_week_start is not null and new.date not between v_week_start and v_week_end) then
      raise exception using errcode = '23514', message = 'workout does not match an available plan';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.start_workout_plan(
  p_plan_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_plan public.workout_plans%rowtype;
  v_week_start date;
  v_week_end date;
  v_time_zone text;
  v_today date;
  v_workout_id bigint;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_plan_id is null then
    raise exception using errcode = '22023', message = 'plan id is required';
  end if;

  select plan.*
  into v_plan
  from public.workout_plans as plan
  where plan.id = p_plan_id
    and plan.trainee_id = v_actor
    and plan.status = 'scheduled'
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'workout plan cannot be started';
  end if;

  select week_window.week_start, week_window.week_end
  into v_week_start, v_week_end
  from public.workout_plan_week_windows as week_window
  where week_window.plan_id = p_plan_id
  for update;

  if v_week_start is not null then
    select profile.time_zone
    into v_time_zone
    from public.profiles as profile
    where profile.user_id = v_actor;
    if not found then
      raise exception using errcode = 'P0002', message = 'profile not found';
    end if;
    v_today := (statement_timestamp() at time zone v_time_zone)::date;
    if not (v_today between v_week_start and v_week_end) then
      raise exception using errcode = '22023', message = 'weekly workout can only start during its assigned week';
    end if;
    update public.workout_plan_week_windows
    set selected_date = v_today, updated_at = statement_timestamp()
    where plan_id = p_plan_id;
  end if;

  insert into public.workouts (user_id, date, status, template_id, plan_id)
  values (v_actor, coalesce(v_today, v_plan.scheduled_date), 'in_progress', null, v_plan.id)
  returning id into v_workout_id;
  return v_workout_id;
end;
$function$;

drop function public.list_my_workout_plans(date, date);
create or replace function public.list_my_workout_plans(p_from date, p_to date)
returns table (
  plan_id uuid,
  scheduled_date date,
  schedule_scope text,
  week_start date,
  week_end date,
  selected_date date,
  title text,
  status text,
  trainer_assigned boolean,
  assigned_by_me boolean,
  workout_id bigint,
  exercise_count bigint
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
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 366 then
    raise exception using errcode = '22023', message = 'plan date range must contain at most 367 days';
  end if;

  return query
  select
    plan.id,
    plan.scheduled_date,
    case when week_window.plan_id is null then 'day'::text else 'week'::text end,
    week_window.week_start,
    week_window.week_end,
    week_window.selected_date,
    plan.title,
    plan.status,
    plan.was_trainer_assigned,
    plan.assigned_by = v_actor,
    workout.id,
    (select count(*) from public.workout_plan_exercises as exercise where exercise.plan_id = plan.id)
  from public.workout_plans as plan
  left join public.workout_plan_week_windows as week_window on week_window.plan_id = plan.id
  left join public.workouts as workout on workout.plan_id = plan.id
  where coalesce(week_window.week_start, plan.scheduled_date) between p_from and p_to
    and (
      plan.trainee_id = v_actor
      or (
        plan.assigned_by = v_actor
        and plan.was_trainer_assigned
        and plan.relationship_id is not null
        and exists (
          select 1
          from public.trainer_relationships as relationship
          join public.trainer_profiles as trainer on trainer.user_id = relationship.trainer_id
          where relationship.id = plan.relationship_id
            and relationship.trainer_id = v_actor
            and relationship.trainee_id = plan.trainee_id
            and relationship.status = 'active'
            and trainer.verification_status = 'approved'
        )
      )
    )
  order by coalesce(week_window.selected_date, week_window.week_start, plan.scheduled_date), plan.created_at, plan.id;
end;
$function$;

drop function public.get_workout_plan(uuid);
create or replace function public.get_workout_plan(p_plan_id uuid)
returns table (
  plan_id uuid,
  scheduled_date date,
  schedule_scope text,
  week_start date,
  week_end date,
  selected_date date,
  title text,
  instructions text,
  status text,
  trainer_assigned boolean,
  assigned_by_me boolean,
  workout_id bigint,
  exercises jsonb
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
  if p_plan_id is null then
    raise exception using errcode = '22023', message = 'plan id is required';
  end if;

  return query
  select
    plan.id,
    plan.scheduled_date,
    case when week_window.plan_id is null then 'day'::text else 'week'::text end,
    week_window.week_start,
    week_window.week_end,
    week_window.selected_date,
    plan.title,
    plan.instructions,
    plan.status,
    plan.was_trainer_assigned,
    plan.assigned_by = v_actor,
    workout.id,
    coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'exercise_id', snapshot.exercise_id,
          'exercise_name', catalog.name,
          'sets', snapshot.sets,
          'reps', snapshot.reps,
          'weight', snapshot.weight,
          'duration_minutes', snapshot.duration_minutes,
          'distance', snapshot.distance,
          'set_details', snapshot.set_details,
          'tempo', snapshot.tempo,
          'rest_seconds', snapshot.rest_seconds,
          'order', snapshot."order"
        ) order by snapshot."order"
      )
      from public.workout_plan_exercises as snapshot
      join public.exercises as catalog on catalog.id = snapshot.exercise_id
      where snapshot.plan_id = plan.id
    ), '[]'::jsonb)
  from public.workout_plans as plan
  left join public.workout_plan_week_windows as week_window on week_window.plan_id = plan.id
  left join public.workouts as workout on workout.plan_id = plan.id
  where plan.id = p_plan_id
    and (
      plan.trainee_id = v_actor
      or (
        plan.assigned_by = v_actor
        and plan.was_trainer_assigned
        and plan.relationship_id is not null
        and exists (
          select 1
          from public.trainer_relationships as relationship
          join public.trainer_profiles as trainer on trainer.user_id = relationship.trainer_id
          where relationship.id = plan.relationship_id
            and relationship.trainer_id = v_actor
            and relationship.trainee_id = plan.trainee_id
            and relationship.status = 'active'
            and trainer.verification_status = 'approved'
        )
      )
    );
end;
$function$;

create or replace function public.get_my_daily_readiness()
returns table (checkin_date date, feeling smallint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_today date;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  select (statement_timestamp() at time zone profile.time_zone)::date
  into v_today
  from public.profiles as profile
  where profile.user_id = v_actor;
  if not found then
    raise exception using errcode = 'P0002', message = 'profile not found';
  end if;
  return query
  select checkin.checkin_date, checkin.feeling
  from public.daily_readiness_checkins as checkin
  where checkin.user_id = v_actor and checkin.checkin_date = v_today;
end;
$function$;

create or replace function public.set_my_daily_readiness(p_feeling smallint)
returns table (checkin_date date, feeling smallint)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_today date;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_feeling is null or p_feeling not between 1 and 5 then
    raise exception using errcode = '22023', message = 'feeling must be from one through five';
  end if;
  select (statement_timestamp() at time zone profile.time_zone)::date
  into v_today
  from public.profiles as profile
  where profile.user_id = v_actor;
  if not found then
    raise exception using errcode = 'P0002', message = 'profile not found';
  end if;

  insert into public.daily_readiness_checkins (user_id, checkin_date, feeling)
  values (v_actor, v_today, p_feeling)
  on conflict on constraint daily_readiness_checkins_user_id_checkin_date_key do update
  set feeling = excluded.feeling, updated_at = statement_timestamp();

  return query select v_today, p_feeling;
end;
$function$;

revoke all on function public.assign_weekly_workouts_from_routines(uuid, uuid[], date, text)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.choose_workout_plan_date(uuid, date)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.start_workout_plan(uuid)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.list_my_workout_plans(date, date)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.get_workout_plan(uuid)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.get_my_daily_readiness()
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.set_my_daily_readiness(smallint)
  from PUBLIC, anon, authenticated, service_role;

grant execute on function public.assign_weekly_workouts_from_routines(uuid, uuid[], date, text)
  to authenticated;
grant execute on function public.choose_workout_plan_date(uuid, date)
  to authenticated;
grant execute on function public.start_workout_plan(uuid)
  to authenticated;
grant execute on function public.list_my_workout_plans(date, date)
  to authenticated;
grant execute on function public.get_workout_plan(uuid)
  to authenticated;
grant execute on function public.get_my_daily_readiness()
  to authenticated;
grant execute on function public.set_my_daily_readiness(smallint)
  to authenticated;

notify pgrst, 'reload schema';
commit;

select
  to_regclass('public.workout_plan_week_windows') is not null as weekly_plan_table_created,
  to_regclass('public.daily_readiness_checkins') is not null as readiness_table_created,
  not has_table_privilege('authenticated', 'public.workout_plan_week_windows', 'select')
    and not has_table_privilege('authenticated', 'public.daily_readiness_checkins', 'select')
    as authenticated_private_tables_closed,
  has_function_privilege('authenticated', 'public.assign_weekly_workouts_from_routines(uuid,uuid[],date,text)', 'execute')
    and not has_function_privilege('anon', 'public.assign_weekly_workouts_from_routines(uuid,uuid[],date,text)', 'execute')
    and not has_function_privilege('service_role', 'public.assign_weekly_workouts_from_routines(uuid,uuid[],date,text)', 'execute')
    as weekly_rpc_permissions_scoped,
  has_function_privilege('authenticated', 'public.set_my_daily_readiness(smallint)', 'execute')
    and not has_function_privilege('anon', 'public.set_my_daily_readiness(smallint)', 'execute')
    and not has_function_privilege('service_role', 'public.set_my_daily_readiness(smallint)', 'execute')
    as readiness_rpc_permissions_scoped,
  (select count(*) from public.workout_plans) as stored_workout_plan_count,
  (select count(*) from public.workouts) as stored_workout_count,
  (select count(*) from public.sets) as stored_set_count;
