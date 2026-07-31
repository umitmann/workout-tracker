select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sets'
      and column_name = 'is_completed'
      and data_type = 'boolean'
      and is_nullable = 'NO'
  ) as set_completion_column_created,
  pg_get_functiondef('public.save_workout_sets(bigint,uuid,jsonb)'::regprocedure) like '%is_completed%' as atomic_completion_write_installed,
  not has_function_privilege('anon', 'public.save_workout_sets(bigint,uuid,jsonb)', 'execute')
    and not has_function_privilege('service_role', 'public.save_workout_sets(bigint,uuid,jsonb)', 'execute')
    and has_function_privilege('authenticated', 'public.save_workout_sets(bigint,uuid,jsonb)', 'execute')
    as rpc_permissions_are_scoped,
  (select count(*) from public.workouts) as stored_workout_count,
  (select count(*) from public.sets) as stored_set_count;
