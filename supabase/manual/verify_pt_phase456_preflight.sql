-- Read-only preflight for PT Phases 4, 5, and 6.
-- Run this once before 20260713000500. Do not continue if either of the first
-- three booleans is false. Counts and anomaly candidates are evidence to save
-- and compare with the three migration verification rows.

select
  to_regclass('public.trainer_relationships') is not null
    and to_regclass('public.trainer_access_grants') is not null
    and to_regclass('public.trainer_relationship_audit_events') is not null
    as phase3_tables_ready,
  to_regprocedure('public.list_my_trainer_relationships()') is not null
    and to_regprocedure('public.grant_trainer_access(uuid,text,text)') is not null
    as phase3_rpcs_ready,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workouts'
      and column_name = 'id'
      and data_type = 'bigint'
  )
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'routines'
        and column_name = 'id'
        and data_type = 'uuid'
    ) as live_identifier_types_match,
  to_regclass('public.workout_plans') is null
    and to_regclass('public.workout_plan_exercises') is null
    and not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'workouts'
        and column_name = 'plan_id'
    ) as phase4_not_already_applied,
  (select count(*) from public.workouts) as stored_workout_count,
  (select count(*) from public.sets) as stored_set_count,
  (select count(*) from public.body_weights) as stored_bodyweight_count,
  (select count(*) from public.workouts where status = 'planned')
    as legacy_planned_workout_count,
  (select count(*) from public.scheduled_workouts)
    as legacy_scheduled_workout_count,
  (
    select count(*)
    from public.trainer_relationships
    where status = 'active'
  ) as active_trainer_relationship_count,
  (
    select count(*)
    from public.trainer_access_grants
    where revoked_at is null
      and permission = 'workout_results.read'
  ) as active_workout_result_grant_count,
  (
    select count(*)
    from public.trainer_access_grants
    where revoked_at is null
      and permission = 'bodyweight.read'
  ) as active_bodyweight_grant_count,
  (
    select count(*)
    from public.workouts as workout
    where workout.status = 'planned'
      and exists (
        select 1
        from public.sets as set_row
        where set_row.workout_id = workout.id
      )
  ) as planned_workouts_with_sets_to_flag,
  (
    select count(*)
    from public.workouts as workout
    left join public.routines as routine
      on routine.id = workout.template_id
    where workout.status = 'planned'
      and workout.template_id is not null
      and (
        routine.id is null
        or not (routine.is_preset = true or routine.user_id = workout.user_id)
      )
  ) as planned_workouts_with_untrusted_template_to_flag,
  (
    select count(*)
    from public.scheduled_workouts as scheduled
    join public.workouts as workout
      on workout.id = scheduled.workout_id
    where workout.user_id <> scheduled.user_id
       or workout.date <> scheduled.scheduled_date
  ) as scheduled_workout_link_mismatches_to_flag;
