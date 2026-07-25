select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sets' and column_name = 'note'
  ) as set_notes_created,
  not has_function_privilege('anon', 'public.save_workout_sets(bigint,uuid,jsonb)', 'execute') as anon_rpc_denied,
  not has_function_privilege('service_role', 'public.save_workout_sets(bigint,uuid,jsonb)', 'execute') as service_role_rpc_denied,
  has_function_privilege('authenticated', 'public.save_workout_sets(bigint,uuid,jsonb)', 'execute') as authenticated_rpc_allowed,
  (
    select prosecdef
    from pg_proc
    where oid = 'public.save_workout_sets(bigint,uuid,jsonb)'::regprocedure
  ) as rpc_is_security_definer;
