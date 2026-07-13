-- PT Phase 6: non-destructive legacy plan backfill and compatibility bridge.
--
-- This migration does not delete or rewrite legacy planning rows. It creates
-- one immutable workout-plan snapshot per legacy source, records provenance in
-- a private reconciliation table, and mirrors new workouts.status='planned'
-- writes until the application switches to the Phase 4 scheduling RPCs.
-- Destructive retirement of the legacy model requires a later, separately
-- reviewed migration after dual-read count reconciliation in production.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table if not exists private.workout_plan_legacy_mappings (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null,
  source_id text not null,
  workout_plan_id uuid not null
    references public.workout_plans (id) on delete cascade,
  anomalies text[] not null default '{}'::text[],
  details jsonb not null default '{}'::jsonb,
  migrated_at timestamp with time zone not null default now(),
  constraint workout_plan_legacy_mappings_source_kind
    check (source_kind in ('legacy_workout', 'scheduled_workout')),
  constraint workout_plan_legacy_mappings_source_id
    check (char_length(btrim(source_id)) between 1 and 100),
  constraint workout_plan_legacy_mappings_anomaly_count
    check (cardinality(anomalies) <= 20),
  constraint workout_plan_legacy_mappings_details_object
    check (jsonb_typeof(details) = 'object'),
  unique (source_kind, source_id)
);

create index if not exists workout_plan_legacy_mappings_plan_idx
  on private.workout_plan_legacy_mappings (workout_plan_id);

revoke all on table private.workout_plan_legacy_mappings
  from PUBLIC, anon, authenticated, service_role;

create or replace function private.create_empty_legacy_workout_plan(
  p_trainee_id uuid,
  p_assigned_by uuid,
  p_relationship_id uuid,
  p_scheduled_date date,
  p_title text,
  p_created_at timestamp with time zone
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_plan_id uuid;
  v_created_at timestamp with time zone := coalesce(p_created_at, statement_timestamp());
begin
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
    null,
    p_scheduled_date,
    pg_catalog.left(coalesce(nullif(pg_catalog.btrim(p_title), ''), 'Planned workout'), 120),
    null,
    'scheduled',
    v_created_at,
    greatest(v_created_at, statement_timestamp())
  )
  returning id into v_plan_id;

  return v_plan_id;
end;
$function$;

revoke all on function private.create_empty_legacy_workout_plan(uuid, uuid, uuid, date, text, timestamp with time zone)
  from PUBLIC, anon, authenticated, service_role;

create or replace function private.migrate_legacy_planned_workout(
  p_workout_id bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_workout public.workouts%rowtype;
  v_plan_id uuid;
  v_trusted_routine_id uuid;
  v_routine_name text;
  v_anomalies text[] := '{}'::text[];
begin
  if p_workout_id is null or p_workout_id <= 0 then
    raise exception using errcode = '22023', message = 'valid legacy workout id is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('legacy_workout:' || p_workout_id::text, 0)
  );

  select mapping.workout_plan_id
  into v_plan_id
  from private.workout_plan_legacy_mappings as mapping
  where mapping.source_kind = 'legacy_workout'
    and mapping.source_id = p_workout_id::text;

  if found then
    return v_plan_id;
  end if;

  select workout.*
  into v_workout
  from public.workouts as workout
  where workout.id = p_workout_id
    and workout.status = 'planned'
  for share;

  if not found then
    raise exception using errcode = 'P0002', message = 'legacy planned workout not found';
  end if;

  if v_workout.template_id is null then
    v_anomalies := pg_catalog.array_append(v_anomalies, 'missing_template');
  else
    select routine.id, routine.name
    into v_trusted_routine_id, v_routine_name
    from public.routines as routine
    where routine.id = v_workout.template_id
      and (routine.is_preset = true or routine.user_id = v_workout.user_id)
    for share;

    if not found then
      v_anomalies := pg_catalog.array_append(v_anomalies, 'untrusted_routine_owner');
      v_trusted_routine_id := null;
    else
      if nullif(pg_catalog.btrim(v_routine_name), '') is null then
        v_routine_name := 'Planned workout';
        v_anomalies := pg_catalog.array_append(v_anomalies, 'blank_routine_title');
      elsif char_length(pg_catalog.btrim(v_routine_name)) > 120 then
        v_routine_name := pg_catalog.left(pg_catalog.btrim(v_routine_name), 120);
        v_anomalies := pg_catalog.array_append(v_anomalies, 'routine_title_truncated');
      end if;

      if not exists (
        select 1
        from public.routine_exercises as source
        where source.routine_id = v_trusted_routine_id
      ) then
        v_anomalies := pg_catalog.array_append(v_anomalies, 'empty_routine');
      elsif (
        select count(*) > 100
        from public.routine_exercises as source
        where source.routine_id = v_trusted_routine_id
      ) or exists (
        select 1
        from public.routine_exercises as source
        where source.routine_id = v_trusted_routine_id
          and source.tempo is not null
          and char_length(source.tempo) not between 1 and 32
      ) then
        v_anomalies := pg_catalog.array_append(v_anomalies, 'invalid_routine_snapshot');
        v_trusted_routine_id := null;
      end if;
    end if;
  end if;

  if exists (
    select 1
    from public.sets as set_row
    where set_row.workout_id = v_workout.id
  ) then
    v_anomalies := pg_catalog.array_append(v_anomalies, 'planned_workout_has_sets');
  end if;

  if v_trusted_routine_id is not null then
    v_plan_id := private.create_workout_plan_snapshot(
      v_workout.user_id,
      v_workout.user_id,
      null,
      v_trusted_routine_id,
      v_workout.date,
      v_routine_name,
      null,
      v_workout.created_at
    );
  else
    v_plan_id := private.create_empty_legacy_workout_plan(
      v_workout.user_id,
      v_workout.user_id,
      null,
      v_workout.date,
      'Planned workout',
      v_workout.created_at
    );
  end if;

  insert into private.workout_plan_legacy_mappings (
    source_kind,
    source_id,
    workout_plan_id,
    anomalies,
    details
  )
  values (
    'legacy_workout',
    p_workout_id::text,
    v_plan_id,
    v_anomalies,
    pg_catalog.jsonb_build_object(
      'template_id', v_workout.template_id,
      'legacy_status', v_workout.status
    )
  )
  on conflict (source_kind, source_id) do nothing;

  return v_plan_id;
end;
$function$;

revoke all on function private.migrate_legacy_planned_workout(bigint)
  from PUBLIC, anon, authenticated, service_role;

create or replace function private.migrate_legacy_scheduled_workout(
  p_scheduled_workout_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_scheduled public.scheduled_workouts%rowtype;
  v_linked_workout public.workouts%rowtype;
  v_relationship public.trainer_relationships%rowtype;
  v_plan_id uuid;
  v_trusted_routine_id uuid;
  v_routine_name text;
  v_assigned_by uuid;
  v_relationship_id uuid;
  v_anomalies text[] := '{}'::text[];
begin
  if p_scheduled_workout_id is null then
    raise exception using errcode = '22023', message = 'scheduled workout id is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('scheduled_workout:' || p_scheduled_workout_id::text, 0)
  );

  select mapping.workout_plan_id
  into v_plan_id
  from private.workout_plan_legacy_mappings as mapping
  where mapping.source_kind = 'scheduled_workout'
    and mapping.source_id = p_scheduled_workout_id::text;

  if found then
    return v_plan_id;
  end if;

  select scheduled.*
  into v_scheduled
  from public.scheduled_workouts as scheduled
  where scheduled.id = p_scheduled_workout_id
  for share;

  if not found then
    raise exception using errcode = 'P0002', message = 'legacy scheduled workout not found';
  end if;

  if v_scheduled.workout_id is not null then
    select workout.*
    into v_linked_workout
    from public.workouts as workout
    where workout.id = v_scheduled.workout_id
    for share;

    if found and v_linked_workout.status = 'planned' then
      v_plan_id := private.migrate_legacy_planned_workout(v_linked_workout.id);
      v_anomalies := pg_catalog.array_append(v_anomalies, 'linked_to_legacy_workout');

      insert into private.workout_plan_legacy_mappings (
        source_kind,
        source_id,
        workout_plan_id,
        anomalies,
        details
      )
      values (
        'scheduled_workout',
        p_scheduled_workout_id::text,
        v_plan_id,
        v_anomalies,
        pg_catalog.jsonb_build_object(
          'routine_id', v_scheduled.routine_id,
          'assigned_by', v_scheduled.assigned_by,
          'workout_id', v_scheduled.workout_id
        )
      )
      on conflict (source_kind, source_id) do nothing;

      return v_plan_id;
    elsif found and v_linked_workout.plan_id is not null then
      v_plan_id := v_linked_workout.plan_id;
      v_anomalies := pg_catalog.array_append(v_anomalies, 'linked_to_existing_plan');

      insert into private.workout_plan_legacy_mappings (
        source_kind,
        source_id,
        workout_plan_id,
        anomalies,
        details
      )
      values (
        'scheduled_workout',
        p_scheduled_workout_id::text,
        v_plan_id,
        v_anomalies,
        pg_catalog.jsonb_build_object(
          'routine_id', v_scheduled.routine_id,
          'assigned_by', v_scheduled.assigned_by,
          'workout_id', v_scheduled.workout_id
        )
      )
      on conflict (source_kind, source_id) do nothing;

      return v_plan_id;
    end if;
  end if;

  v_assigned_by := v_scheduled.user_id;
  v_relationship_id := null;

  if v_scheduled.assigned_by is not null
     and v_scheduled.assigned_by <> v_scheduled.user_id then
    select relationship.*
    into v_relationship
    from public.trainer_relationships as relationship
    join public.trainer_profiles as trainer
      on trainer.user_id = relationship.trainer_id
    where relationship.trainer_id = v_scheduled.assigned_by
      and relationship.trainee_id = v_scheduled.user_id
      and relationship.status = 'active'
      and trainer.verification_status = 'approved'
    order by relationship.activated_at desc, relationship.id
    limit 1
    for share of relationship, trainer;

    if found then
      v_assigned_by := v_scheduled.assigned_by;
      v_relationship_id := v_relationship.id;
    else
      v_anomalies := pg_catalog.array_append(v_anomalies, 'unverified_legacy_assigner');
    end if;
  end if;

  select routine.id, routine.name
  into v_trusted_routine_id, v_routine_name
  from public.routines as routine
  where routine.id = v_scheduled.routine_id
    and (
      routine.is_preset = true
      or routine.user_id = v_scheduled.user_id
      or (
        v_relationship_id is not null
        and routine.user_id = v_assigned_by
      )
    )
  for share;

  if not found then
    v_anomalies := pg_catalog.array_append(v_anomalies, 'untrusted_routine_owner');
    v_trusted_routine_id := null;
  else
    if nullif(pg_catalog.btrim(v_routine_name), '') is null then
      v_routine_name := 'Planned workout';
      v_anomalies := pg_catalog.array_append(v_anomalies, 'blank_routine_title');
    elsif char_length(pg_catalog.btrim(v_routine_name)) > 120 then
      v_routine_name := pg_catalog.left(pg_catalog.btrim(v_routine_name), 120);
      v_anomalies := pg_catalog.array_append(v_anomalies, 'routine_title_truncated');
    end if;

    if not exists (
      select 1
      from public.routine_exercises as source
      where source.routine_id = v_trusted_routine_id
    ) then
      v_anomalies := pg_catalog.array_append(v_anomalies, 'empty_routine');
    elsif (
      select count(*) > 100
      from public.routine_exercises as source
      where source.routine_id = v_trusted_routine_id
    ) or exists (
      select 1
      from public.routine_exercises as source
      where source.routine_id = v_trusted_routine_id
        and source.tempo is not null
        and char_length(source.tempo) not between 1 and 32
    ) then
      v_anomalies := pg_catalog.array_append(v_anomalies, 'invalid_routine_snapshot');
      v_trusted_routine_id := null;
    end if;
  end if;

  if v_trusted_routine_id is not null then
    v_plan_id := private.create_workout_plan_snapshot(
      v_scheduled.user_id,
      v_assigned_by,
      v_relationship_id,
      v_trusted_routine_id,
      v_scheduled.scheduled_date,
      v_routine_name,
      null,
      coalesce(v_scheduled.created_at, statement_timestamp())
    );
  else
    v_plan_id := private.create_empty_legacy_workout_plan(
      v_scheduled.user_id,
      v_assigned_by,
      v_relationship_id,
      v_scheduled.scheduled_date,
      'Planned workout',
      coalesce(v_scheduled.created_at, statement_timestamp())
    );
  end if;

  if v_scheduled.workout_id is not null and v_linked_workout.id is not null then
    if v_linked_workout.user_id = v_scheduled.user_id
       and v_linked_workout.date = v_scheduled.scheduled_date
       and v_linked_workout.status in ('in_progress', 'completed') then
      update public.workouts
      set plan_id = v_plan_id
      where id = v_linked_workout.id
        and plan_id is null;
    else
      v_anomalies := pg_catalog.array_append(v_anomalies, 'linked_workout_mismatch');
    end if;
  end if;

  insert into private.workout_plan_legacy_mappings (
    source_kind,
    source_id,
    workout_plan_id,
    anomalies,
    details
  )
  values (
    'scheduled_workout',
    p_scheduled_workout_id::text,
    v_plan_id,
    v_anomalies,
    pg_catalog.jsonb_build_object(
      'routine_id', v_scheduled.routine_id,
      'assigned_by', v_scheduled.assigned_by,
      'workout_id', v_scheduled.workout_id
    )
  )
  on conflict (source_kind, source_id) do nothing;

  return v_plan_id;
end;
$function$;

revoke all on function private.migrate_legacy_scheduled_workout(uuid)
  from PUBLIC, anon, authenticated, service_role;

create or replace function private.mirror_legacy_planned_workout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.migrate_legacy_planned_workout(new.id);
  return new;
end;
$function$;

revoke all on function private.mirror_legacy_planned_workout()
  from PUBLIC, anon, authenticated, service_role;

create trigger workouts_mirror_legacy_plan
after insert on public.workouts
for each row
when (new.status = 'planned')
execute function private.mirror_legacy_planned_workout();

create or replace function private.attach_legacy_workout_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.status = 'planned'
     and (
       new.date is distinct from old.date
       or new.template_id is distinct from old.template_id
     ) then
    raise exception using errcode = '55000', message = 'legacy planned prescriptions are immutable; cancel and reschedule';
  end if;

  if old.status = 'planned'
     and new.status = 'in_progress'
     and new.plan_id is null then
    new.plan_id := private.migrate_legacy_planned_workout(old.id);
  end if;

  return new;
end;
$function$;

revoke all on function private.attach_legacy_workout_plan()
  from PUBLIC, anon, authenticated, service_role;

-- PostgreSQL orders same-kind triggers by name. The 00 prefix ensures the
-- compatibility link is populated before Phase 4 validates the transition.
create trigger workouts_00_attach_legacy_plan
before update on public.workouts
for each row execute function private.attach_legacy_workout_plan();

create or replace function private.cancel_mirrored_legacy_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_plan_id uuid;
begin
  select mapping.workout_plan_id
  into v_plan_id
  from private.workout_plan_legacy_mappings as mapping
  where mapping.source_kind = 'legacy_workout'
    and mapping.source_id = old.id::text;

  if found then
    update public.workout_plans
    set
      status = 'cancelled',
      cancelled_at = statement_timestamp()
    where id = v_plan_id
      and status = 'scheduled';
  end if;

  return old;
end;
$function$;

revoke all on function private.cancel_mirrored_legacy_plan()
  from PUBLIC, anon, authenticated, service_role;

create trigger workouts_cancel_mirrored_legacy_plan
after delete on public.workouts
for each row
when (old.status = 'planned')
execute function private.cancel_mirrored_legacy_plan();

create or replace function private.mirror_legacy_scheduled_workout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.migrate_legacy_scheduled_workout(new.id);
  return new;
end;
$function$;

revoke all on function private.mirror_legacy_scheduled_workout()
  from PUBLIC, anon, authenticated, service_role;

create trigger scheduled_workouts_mirror_legacy_plan
after insert on public.scheduled_workouts
for each row execute function private.mirror_legacy_scheduled_workout();

-- Backfill in deterministic order. Advisory transaction locks and the mapping
-- unique key make the operation safe against concurrent legacy inserts.
do $backfill$
declare
  v_workout record;
  v_scheduled record;
begin
  for v_workout in
    select workout.id
    from public.workouts as workout
    where workout.status = 'planned'
    order by workout.id
  loop
    perform private.migrate_legacy_planned_workout(v_workout.id);
  end loop;

  for v_scheduled in
    select scheduled.id
    from public.scheduled_workouts as scheduled
    order by scheduled.created_at, scheduled.id
  loop
    perform private.migrate_legacy_scheduled_workout(v_scheduled.id);
  end loop;
end;
$backfill$;

comment on table private.workout_plan_legacy_mappings is
  'Internal idempotency, provenance, and anomaly ledger for the non-destructive plan backfill.';

notify pgrst, 'reload schema';

commit;

select
  not exists (
    select 1
    from public.workouts as workout
    where workout.status = 'planned'
      and not exists (
        select 1
        from private.workout_plan_legacy_mappings as mapping
        where mapping.source_kind = 'legacy_workout'
          and mapping.source_id = workout.id::text
      )
  ) as legacy_planned_workout_coverage,
  not exists (
    select 1
    from public.scheduled_workouts as scheduled
    where not exists (
      select 1
      from private.workout_plan_legacy_mappings as mapping
      where mapping.source_kind = 'scheduled_workout'
        and mapping.source_id = scheduled.id::text
    )
  ) as legacy_scheduled_workout_coverage,
  not has_schema_privilege('authenticated', 'private', 'usage')
    and not has_table_privilege(
      'authenticated',
      'private.workout_plan_legacy_mappings',
      'select'
    ) as legacy_mapping_is_private,
  exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = 'public.workouts'::regclass
      and tgname = 'workouts_mirror_legacy_plan'
      and not tgisinternal
  )
    and exists (
      select 1
      from pg_catalog.pg_trigger
      where tgrelid = 'public.workouts'::regclass
        and tgname = 'workouts_00_attach_legacy_plan'
        and not tgisinternal
    ) as legacy_write_bridge_installed,
  (select count(*) from private.workout_plan_legacy_mappings)
    as legacy_mapping_count,
  (
    select count(*)
    from private.workout_plan_legacy_mappings
    where cardinality(anomalies) > 0
  ) as legacy_mapping_anomaly_count,
  (select count(*) from public.workout_plans) as workout_plan_count,
  (select count(*) from public.workout_plan_exercises) as workout_plan_exercise_count,
  (select count(*) from public.workouts where status = 'planned')
    as retained_legacy_planned_workout_count,
  (select count(*) from public.scheduled_workouts)
    as retained_legacy_scheduled_workout_count,
  (select count(*) from public.workouts) as stored_workout_count,
  (select count(*) from public.sets) as stored_set_count;
