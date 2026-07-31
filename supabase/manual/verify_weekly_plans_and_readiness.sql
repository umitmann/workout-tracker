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
