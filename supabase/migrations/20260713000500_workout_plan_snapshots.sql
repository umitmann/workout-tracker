-- PT Phase 4: immutable workout-plan snapshots and serialized plan lifecycle.
--
-- This migration is additive. The deployed application can continue using
-- workouts.status = 'planned' until the Phase 6 compatibility migration is
-- installed and the application is switched to the plan RPCs below.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  -- Workouts currently retain their owner UUID after account removal. Plans
  -- use the same durable ownership provenance so a linked workout cannot make
  -- auth-user deletion fail through conflicting CASCADE/RESTRICT actions.
  trainee_id uuid not null,
  relationship_id uuid
    references public.trainer_relationships (id) on delete set null,
  -- Deliberately retained as audit provenance rather than a cascading FK.
  -- If a trainer account is deleted, the trainee-owned prescription remains.
  assigned_by uuid not null,
  was_trainer_assigned boolean not null default false,
  source_routine_id uuid references public.routines (id) on delete set null,
  scheduled_date date not null,
  title text not null,
  instructions text,
  status text not null default 'scheduled',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  cancelled_at timestamp with time zone,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  constraint workout_plans_title_length
    check (char_length(btrim(title)) between 1 and 120),
  constraint workout_plans_instructions_length
    check (instructions is null or char_length(instructions) <= 2000),
  constraint workout_plans_supported_status
    check (status in ('scheduled', 'cancelled', 'started', 'completed')),
  constraint workout_plans_assignment_shape
    check (
      (
        not was_trainer_assigned
        and relationship_id is null
        and assigned_by = trainee_id
      )
      or
      (
        was_trainer_assigned
        and assigned_by <> trainee_id
      )
    ),
  constraint workout_plans_timestamp_order
    check (
      updated_at >= created_at
      and (cancelled_at is null or cancelled_at >= created_at)
      and (started_at is null or started_at >= created_at)
      and (completed_at is null or completed_at >= created_at)
    ),
  constraint workout_plans_state_consistency
    check (
      (
        status = 'scheduled'
        and cancelled_at is null
        and started_at is null
        and completed_at is null
      )
      or
      (
        status = 'cancelled'
        and cancelled_at is not null
        and started_at is null
        and completed_at is null
      )
      or
      (
        status = 'started'
        and cancelled_at is null
        and started_at is not null
        and completed_at is null
      )
      or
      (
        status = 'completed'
        and cancelled_at is null
        and started_at is not null
        and completed_at is not null
        and completed_at >= started_at
      )
    )
);

create unique index workout_plans_id_trainee_uidx
  on public.workout_plans (id, trainee_id);

create index workout_plans_trainee_calendar_idx
  on public.workout_plans (trainee_id, scheduled_date, id);

create index workout_plans_trainer_calendar_idx
  on public.workout_plans (assigned_by, scheduled_date, id)
  where was_trainer_assigned;

create index workout_plans_relationship_idx
  on public.workout_plans (relationship_id, scheduled_date, id)
  where relationship_id is not null;

create table public.workout_plan_exercises (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.workout_plans (id) on delete cascade,
  exercise_id bigint not null references public.exercises (id) on delete restrict,
  sets integer not null,
  reps integer,
  weight numeric,
  duration_minutes numeric,
  distance numeric,
  set_details jsonb,
  tempo text,
  rest_seconds integer,
  "order" integer not null,
  created_at timestamp with time zone not null default now(),
  constraint workout_plan_exercises_sets_range
    check (sets between 1 and 50),
  constraint workout_plan_exercises_reps_nonnegative
    check (reps is null or reps >= 0),
  constraint workout_plan_exercises_weight_nonnegative
    check (weight is null or weight >= 0),
  constraint workout_plan_exercises_duration_nonnegative
    check (duration_minutes is null or duration_minutes >= 0),
  constraint workout_plan_exercises_distance_nonnegative
    check (distance is null or distance >= 0),
  constraint workout_plan_exercises_rest_nonnegative
    check (rest_seconds is null or rest_seconds >= 0),
  constraint workout_plan_exercises_order_nonnegative
    check ("order" >= 0),
  constraint workout_plan_exercises_tempo_length
    check (tempo is null or char_length(tempo) between 1 and 32),
  constraint workout_plan_exercises_set_details_shape
    check (
      set_details is null
      or case
        when jsonb_typeof(set_details) = 'array'
          then jsonb_array_length(set_details) = sets
            and jsonb_array_length(set_details) <= 50
        else false
      end
    ),
  unique (plan_id, "order")
);

create index workout_plan_exercises_plan_order_idx
  on public.workout_plan_exercises (plan_id, "order");

create index workout_plan_exercises_exercise_idx
  on public.workout_plan_exercises (exercise_id);

alter table public.workouts
  add column plan_id uuid;

create unique index workouts_plan_id_uidx
  on public.workouts (plan_id)
  where plan_id is not null;

alter table public.workouts
  add constraint workouts_plan_owner_fkey
    foreign key (plan_id, user_id)
    references public.workout_plans (id, trainee_id)
    on delete restrict not valid;

alter table public.workouts
  validate constraint workouts_plan_owner_fkey;

alter table public.workout_plans enable row level security;
alter table public.workout_plan_exercises enable row level security;

-- Plans are never exposed as writable base rows. Every read and transition is
-- purpose-specific so a trainer cannot acquire general trainee-table access.
revoke all on table
  public.workout_plans,
  public.workout_plan_exercises
from PUBLIC, anon, authenticated, service_role;

grant select on table
  public.workout_plans,
  public.workout_plan_exercises
to service_role;

-- Add plan events to the existing append-only relationship ledger. Self plans
-- have no relationship and therefore do not create relationship audit rows.
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
      'plan.completed'
    )
  ) not valid;

alter table public.trainer_relationship_audit_events
  validate constraint trainer_relationship_audit_event_type;

create trigger workout_plans_set_updated_at
before update on public.workout_plans
for each row execute function private.set_updated_at();

create or replace function private.validate_workout_plan_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_relationship public.trainer_relationships%rowtype;
begin
  if tg_op = 'INSERT' then
    if not exists (
      select 1
      from auth.users as account
      where account.id = new.trainee_id
    ) then
      raise exception using errcode = '23503', message = 'plan trainee account does not exist';
    end if;

    if new.was_trainer_assigned then
      if new.relationship_id is null then
        raise exception using errcode = '23514', message = 'trainer plans require relationship provenance';
      end if;

      select relationship.*
      into v_relationship
      from public.trainer_relationships as relationship
      where relationship.id = new.relationship_id;

      if not found
         or v_relationship.trainer_id <> new.assigned_by
         or v_relationship.trainee_id <> new.trainee_id then
        raise exception using errcode = '23514', message = 'plan provenance does not match the relationship';
      end if;
    elsif new.relationship_id is not null or new.assigned_by <> new.trainee_id then
      raise exception using errcode = '23514', message = 'self plans must be owned and assigned by the trainee';
    end if;
  else
    if new.trainee_id is distinct from old.trainee_id
       or new.assigned_by is distinct from old.assigned_by
       or new.was_trainer_assigned is distinct from old.was_trainer_assigned
       or new.scheduled_date is distinct from old.scheduled_date
       or new.title is distinct from old.title
       or new.instructions is distinct from old.instructions
       or new.created_at is distinct from old.created_at then
      raise exception using errcode = '55000', message = 'workout plan prescription is immutable';
    end if;

    if new.relationship_id is distinct from old.relationship_id
       and not (old.relationship_id is not null and new.relationship_id is null) then
      raise exception using errcode = '55000', message = 'workout plan relationship provenance is immutable';
    end if;

    if new.source_routine_id is distinct from old.source_routine_id
       and not (old.source_routine_id is not null and new.source_routine_id is null) then
      raise exception using errcode = '55000', message = 'workout plan source provenance is immutable';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function private.validate_workout_plan_row()
  from PUBLIC, anon, authenticated, service_role;

create trigger workout_plans_validate_row
before insert or update on public.workout_plans
for each row execute function private.validate_workout_plan_row();

create or replace function private.prevent_workout_plan_exercise_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- Permit only the cascading cleanup caused by deleting the parent plan.
  -- Direct updates/deletes would rewrite an accepted prescription.
  if tg_op = 'DELETE'
     and not exists (
       select 1
       from public.workout_plans as plan
       where plan.id = old.plan_id
     ) then
    return old;
  end if;

  raise exception using errcode = '55000', message = 'workout plan exercises are immutable';
end;
$function$;

revoke all on function private.prevent_workout_plan_exercise_mutation()
  from PUBLIC, anon, authenticated, service_role;

create trigger workout_plan_exercises_prevent_mutation
before update or delete on public.workout_plan_exercises
for each row execute function private.prevent_workout_plan_exercise_mutation();

create or replace function private.create_workout_plan_snapshot(
  p_trainee_id uuid,
  p_assigned_by uuid,
  p_relationship_id uuid,
  p_routine_id uuid,
  p_scheduled_date date,
  p_title text,
  p_instructions text,
  p_created_at timestamp with time zone default statement_timestamp()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_plan_id uuid;
  v_routine_name text;
  v_title text;
  v_instructions text := nullif(pg_catalog.btrim(p_instructions), '');
begin
  select routine.name
  into v_routine_name
  from public.routines as routine
  where routine.id = p_routine_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'source routine not found';
  end if;

  v_title := coalesce(
    nullif(pg_catalog.btrim(p_title), ''),
    nullif(pg_catalog.btrim(v_routine_name), '')
  );

  if p_trainee_id is null
     or p_assigned_by is null
     or p_scheduled_date is null
     or v_title is null
     or char_length(v_title) > 120
     or (v_instructions is not null and char_length(v_instructions) > 2000) then
    raise exception using errcode = '22023', message = 'invalid workout plan snapshot';
  end if;

  insert into public.workout_plans (
    trainee_id,
    relationship_id,
    assigned_by,
    was_trainer_assigned,
    source_routine_id,
    scheduled_date,
    title,
    instructions,
    status,
    created_at,
    updated_at
  )
  values (
    p_trainee_id,
    p_relationship_id,
    p_assigned_by,
    p_relationship_id is not null,
    p_routine_id,
    p_scheduled_date,
    v_title,
    v_instructions,
    'scheduled',
    p_created_at,
    greatest(p_created_at, statement_timestamp())
  )
  returning id into v_plan_id;

  insert into public.workout_plan_exercises (
    plan_id,
    exercise_id,
    sets,
    reps,
    weight,
    duration_minutes,
    distance,
    set_details,
    tempo,
    rest_seconds,
    "order",
    created_at
  )
  select
    v_plan_id,
    source.exercise_id,
    source.sets,
    source.reps,
    source.weight,
    source.duration_minutes,
    source.distance,
    source.set_details,
    source.tempo,
    source.rest_seconds,
    source."order",
    p_created_at
  from public.routine_exercises as source
  where source.routine_id = p_routine_id
  order by source."order";

  return v_plan_id;
end;
$function$;

revoke all on function private.create_workout_plan_snapshot(uuid, uuid, uuid, uuid, date, text, text, timestamp with time zone)
  from PUBLIC, anon, authenticated, service_role;

create or replace function private.enforce_workout_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_plan public.workout_plans%rowtype;
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

    if not found
       or v_plan.trainee_id <> new.user_id
       or v_plan.scheduled_date <> new.date
       or new.status = 'planned'
       or v_plan.status = 'cancelled' then
      raise exception using errcode = '23514', message = 'workout does not match an available plan';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function private.enforce_workout_lifecycle()
  from PUBLIC, anon, authenticated, service_role;

create trigger workouts_enforce_lifecycle
before insert or update on public.workouts
for each row execute function private.enforce_workout_lifecycle();

create or replace function private.sync_workout_plan_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_plan public.workout_plans%rowtype;
  v_target_status text;
  v_event_type text;
  v_now timestamp with time zone := statement_timestamp();
begin
  if new.plan_id is null or new.status not in ('in_progress', 'completed') then
    return new;
  end if;

  select plan.*
  into v_plan
  from public.workout_plans as plan
  where plan.id = new.plan_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'linked workout plan not found';
  end if;

  v_target_status := case when new.status = 'completed' then 'completed' else 'started' end;
  v_event_type := case when new.status = 'completed' then 'plan.completed' else 'plan.started' end;

  if v_plan.status is distinct from v_target_status then
    update public.workout_plans
    set
      status = v_target_status,
      started_at = coalesce(started_at, v_now),
      completed_at = case when v_target_status = 'completed' then v_now else null end
    where id = new.plan_id;

    if v_plan.relationship_id is not null then
      perform private.append_trainer_relationship_audit(
        v_plan.relationship_id,
        v_plan.trainee_id,
        'trainee',
        v_event_type,
        pg_catalog.jsonb_build_object(
          'plan_id', v_plan.id,
          'workout_id', new.id
        )
      );
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function private.sync_workout_plan_status()
  from PUBLIC, anon, authenticated, service_role;

create trigger workouts_sync_plan_status
after insert or update of status, plan_id on public.workouts
for each row execute function private.sync_workout_plan_status();

create or replace function public.assign_workout_from_routine(
  p_relationship_id uuid,
  p_routine_id uuid,
  p_scheduled_date date,
  p_title text default null,
  p_instructions text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_relationship public.trainer_relationships%rowtype;
  v_time_zone text;
  v_today date;
  v_plan_id uuid;
  v_exercise_count integer;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if p_relationship_id is null or p_routine_id is null or p_scheduled_date is null then
    raise exception using errcode = '22023', message = 'relationship, routine, and scheduled date are required';
  end if;

  select relationship.*
  into v_relationship
  from public.trainer_relationships as relationship
  where relationship.id = p_relationship_id
    and relationship.trainer_id = v_actor
    and relationship.status = 'active'
  for share;

  if not found then
    raise exception using errcode = '42501', message = 'workout assignment is not allowed';
  end if;

  if not exists (
    select 1
    from public.trainer_profiles as trainer
    where trainer.user_id = v_actor
      and trainer.verification_status = 'approved'
    for share
  ) then
    raise exception using errcode = '42501', message = 'trainer is not approved';
  end if;

  perform 1
  from public.routines as routine
  where routine.id = p_routine_id
    and routine.user_id = v_actor
    and routine.is_preset = false
  for share;

  if not found then
    raise exception using errcode = '42501', message = 'trainer does not own the source routine';
  end if;

  select count(*)::integer
  into v_exercise_count
  from public.routine_exercises as source
  where source.routine_id = p_routine_id;

  if v_exercise_count not between 1 and 100 then
    raise exception using errcode = '22023', message = 'workout plan must contain 1 to 100 exercises';
  end if;

  select profile.time_zone
  into v_time_zone
  from public.profiles as profile
  where profile.user_id = v_relationship.trainee_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'trainee profile not found';
  end if;

  v_today := (statement_timestamp() at time zone v_time_zone)::date;
  if p_scheduled_date < v_today or p_scheduled_date > v_today + 730 then
    raise exception using errcode = '22023', message = 'scheduled date must be today through two years ahead';
  end if;

  v_plan_id := private.create_workout_plan_snapshot(
    v_relationship.trainee_id,
    v_actor,
    p_relationship_id,
    p_routine_id,
    p_scheduled_date,
    p_title,
    p_instructions,
    statement_timestamp()
  );

  perform private.append_trainer_relationship_audit(
    p_relationship_id,
    v_actor,
    'trainer',
    'plan.assigned',
    pg_catalog.jsonb_build_object(
      'plan_id', v_plan_id,
      'scheduled_date', p_scheduled_date
    )
  );

  return v_plan_id;
end;
$function$;

create or replace function public.schedule_my_workout_from_routine(
  p_routine_id uuid,
  p_scheduled_date date,
  p_title text default null,
  p_instructions text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_time_zone text;
  v_today date;
  v_exercise_count integer;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if p_routine_id is null or p_scheduled_date is null then
    raise exception using errcode = '22023', message = 'routine and scheduled date are required';
  end if;

  perform 1
  from public.routines as routine
  where routine.id = p_routine_id
    and (
      (routine.user_id = v_actor and routine.is_preset = false)
      or routine.is_preset = true
    )
  for share;

  if not found then
    raise exception using errcode = '42501', message = 'routine is not available to the trainee';
  end if;

  select count(*)::integer
  into v_exercise_count
  from public.routine_exercises as source
  where source.routine_id = p_routine_id;

  if v_exercise_count not between 1 and 100 then
    raise exception using errcode = '22023', message = 'workout plan must contain 1 to 100 exercises';
  end if;

  select profile.time_zone
  into v_time_zone
  from public.profiles as profile
  where profile.user_id = v_actor;

  if not found then
    raise exception using errcode = 'P0002', message = 'profile not found';
  end if;

  v_today := (statement_timestamp() at time zone v_time_zone)::date;
  if p_scheduled_date < v_today or p_scheduled_date > v_today + 730 then
    raise exception using errcode = '22023', message = 'scheduled date must be today through two years ahead';
  end if;

  return private.create_workout_plan_snapshot(
    v_actor,
    v_actor,
    null,
    p_routine_id,
    p_scheduled_date,
    p_title,
    p_instructions,
    statement_timestamp()
  );
end;
$function$;

create or replace function public.cancel_workout_plan(
  p_plan_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_plan public.workout_plans%rowtype;
  v_now timestamp with time zone := statement_timestamp();
  v_actor_role text;
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
  for update;

  if not found or v_plan.status <> 'scheduled' then
    raise exception using errcode = '42501', message = 'workout plan cannot be cancelled';
  end if;

  if v_plan.trainee_id = v_actor then
    v_actor_role := 'trainee';
  elsif v_plan.assigned_by = v_actor
        and v_plan.was_trainer_assigned
        and v_plan.relationship_id is not null
        and exists (
          select 1
          from public.trainer_relationships as relationship
          join public.trainer_profiles as trainer
            on trainer.user_id = relationship.trainer_id
          where relationship.id = v_plan.relationship_id
            and relationship.trainer_id = v_actor
            and relationship.trainee_id = v_plan.trainee_id
            and relationship.status = 'active'
            and trainer.verification_status = 'approved'
          for share of relationship, trainer
        ) then
    v_actor_role := 'trainer';
  else
    raise exception using errcode = '42501', message = 'workout plan cancellation is not allowed';
  end if;

  update public.workout_plans
  set
    status = 'cancelled',
    cancelled_at = v_now
  where id = p_plan_id;

  if v_plan.relationship_id is not null then
    perform private.append_trainer_relationship_audit(
      v_plan.relationship_id,
      v_actor,
      v_actor_role,
      'plan.cancelled',
      pg_catalog.jsonb_build_object('plan_id', v_plan.id)
    );
  end if;
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

  insert into public.workouts (
    user_id,
    date,
    status,
    template_id,
    plan_id
  )
  values (
    v_actor,
    v_plan.scheduled_date,
    'in_progress',
    null,
    v_plan.id
  )
  returning id into v_workout_id;

  return v_workout_id;
end;
$function$;

create or replace function public.list_my_workout_plans(
  p_from date,
  p_to date
)
returns table (
  plan_id uuid,
  scheduled_date date,
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
    plan.title,
    plan.status,
    plan.was_trainer_assigned,
    plan.assigned_by = v_actor,
    workout.id,
    (
      select count(*)
      from public.workout_plan_exercises as exercise
      where exercise.plan_id = plan.id
    )
  from public.workout_plans as plan
  left join public.workouts as workout
    on workout.plan_id = plan.id
  where plan.scheduled_date between p_from and p_to
    and (
      plan.trainee_id = v_actor
      or (
        plan.assigned_by = v_actor
        and plan.was_trainer_assigned
        and plan.relationship_id is not null
        and exists (
          select 1
          from public.trainer_relationships as relationship
          join public.trainer_profiles as trainer
            on trainer.user_id = relationship.trainer_id
          where relationship.id = plan.relationship_id
            and relationship.trainer_id = v_actor
            and relationship.trainee_id = plan.trainee_id
            and relationship.status = 'active'
            and trainer.verification_status = 'approved'
        )
      )
    )
  order by plan.scheduled_date, plan.created_at, plan.id;
end;
$function$;

create or replace function public.get_workout_plan(
  p_plan_id uuid
)
returns table (
  plan_id uuid,
  scheduled_date date,
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
    plan.title,
    plan.instructions,
    plan.status,
    plan.was_trainer_assigned,
    plan.assigned_by = v_actor,
    workout.id,
    coalesce(
      (
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
          )
          order by snapshot."order"
        )
        from public.workout_plan_exercises as snapshot
        join public.exercises as catalog
          on catalog.id = snapshot.exercise_id
        where snapshot.plan_id = plan.id
      ),
      '[]'::jsonb
    )
  from public.workout_plans as plan
  left join public.workouts as workout
    on workout.plan_id = plan.id
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
          join public.trainer_profiles as trainer
            on trainer.user_id = relationship.trainer_id
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

revoke all on function public.assign_workout_from_routine(uuid, uuid, date, text, text)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.schedule_my_workout_from_routine(uuid, date, text, text)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.cancel_workout_plan(uuid)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.start_workout_plan(uuid)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.list_my_workout_plans(date, date)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.get_workout_plan(uuid)
  from PUBLIC, anon, authenticated, service_role;

grant execute on function public.assign_workout_from_routine(uuid, uuid, date, text, text)
  to authenticated;
grant execute on function public.schedule_my_workout_from_routine(uuid, date, text, text)
  to authenticated;
grant execute on function public.cancel_workout_plan(uuid)
  to authenticated;
grant execute on function public.start_workout_plan(uuid)
  to authenticated;
grant execute on function public.list_my_workout_plans(date, date)
  to authenticated;
grant execute on function public.get_workout_plan(uuid)
  to authenticated;

comment on table public.workout_plans is
  'Trainee-owned immutable prescriptions; trainer assignment does not transfer workout ownership.';
comment on table public.workout_plan_exercises is
  'Immutable ordered prescription copied from a routine at scheduling time.';
comment on column public.workouts.plan_id is
  'Optional one-to-one link from a performed workout to its immutable plan snapshot.';

notify pgrst, 'reload schema';

commit;

select
  to_regclass('public.workout_plans') is not null
    and to_regclass('public.workout_plan_exercises') is not null
    as two_plan_tables_created,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workouts'
      and column_name = 'plan_id'
      and data_type = 'uuid'
  ) as workout_plan_link_created,
  not has_table_privilege('authenticated', 'public.workout_plans', 'select')
    and not has_table_privilege('authenticated', 'public.workout_plans', 'insert')
    and not has_table_privilege('authenticated', 'public.workout_plan_exercises', 'select')
    and not has_table_privilege('authenticated', 'public.workout_plan_exercises', 'insert')
    as authenticated_plan_base_access_denied,
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
      'public.assign_workout_from_routine(uuid,uuid,date,text,text)'::regprocedure,
      'public.schedule_my_workout_from_routine(uuid,date,text,text)'::regprocedure,
      'public.cancel_workout_plan(uuid)'::regprocedure,
      'public.start_workout_plan(uuid)'::regprocedure,
      'public.list_my_workout_plans(date,date)'::regprocedure,
      'public.get_workout_plan(uuid)'::regprocedure
    )
  ) as all_plan_rpcs_are_hardened,
  has_function_privilege(
    'authenticated',
    'public.assign_workout_from_routine(uuid,uuid,date,text,text)',
    'execute'
  )
    and not has_function_privilege(
      'anon',
      'public.assign_workout_from_routine(uuid,uuid,date,text,text)',
      'execute'
    )
    and not has_function_privilege(
      'service_role',
      'public.assign_workout_from_routine(uuid,uuid,date,text,text)',
      'execute'
    ) as plan_rpc_permissions_are_scoped,
  exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'workouts_plan_id_uidx'
  ) as one_workout_per_plan_is_enforced,
  (select count(*) from public.workout_plans) as workout_plan_count,
  (select count(*) from public.workout_plan_exercises) as workout_plan_exercise_count,
  (select count(*) from public.workouts) as stored_workout_count,
  (select count(*) from public.sets) as stored_set_count;
