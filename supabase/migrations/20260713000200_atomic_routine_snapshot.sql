-- Phase 1B: atomically replace a user-owned routine and its exercise snapshot.
-- This removes the application's delete-then-insert data-loss window.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.save_routine_snapshot(
  p_routine_id uuid,
  p_name text,
  p_exercises jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_name text := btrim(p_name);
begin
  if v_actor is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception using
      errcode = '22023',
      message = 'routine name must contain 1 to 120 characters';
  end if;

  if jsonb_typeof(p_exercises) is distinct from 'array' then
    raise exception using
      errcode = '22023',
      message = 'p_exercises must be a JSON array';
  end if;

  if jsonb_array_length(p_exercises) > 100
     or pg_column_size(p_exercises) > 1048576 then
    raise exception using
      errcode = '22023',
      message = 'routine snapshot exceeds the allowed payload size';
  end if;

  -- Validate JSON types and bounds before acquiring the row lock or deleting
  -- the previous snapshot. Table constraints and foreign keys provide a second
  -- enforcement layer during INSERT.
  if exists (
    select 1
    from jsonb_array_elements(p_exercises) as exercise(item)
    where jsonb_typeof(item) <> 'object'
      or not case jsonb_typeof(item->'exercise_id')
        when 'number' then
          (item->>'exercise_id')::numeric > 0
          and (item->>'exercise_id')::numeric = trunc((item->>'exercise_id')::numeric)
        else false
      end
      or not case jsonb_typeof(item->'sets')
        when 'number' then
          (item->>'sets')::numeric between 1 and 50
          and (item->>'sets')::numeric = trunc((item->>'sets')::numeric)
        else false
      end
      or not case jsonb_typeof(item->'order')
        when 'number' then
          (item->>'order')::numeric >= 0
          and (item->>'order')::numeric = trunc((item->>'order')::numeric)
        else false
      end
      or not case coalesce(jsonb_typeof(item->'reps'), 'null')
        when 'null' then true
        when 'number' then
          (item->>'reps')::numeric >= 0
          and (item->>'reps')::numeric = trunc((item->>'reps')::numeric)
        else false
      end
      or not case coalesce(jsonb_typeof(item->'weight'), 'null')
        when 'null' then true
        when 'number' then (item->>'weight')::numeric >= 0
        else false
      end
      or not case coalesce(jsonb_typeof(item->'duration_minutes'), 'null')
        when 'null' then true
        when 'number' then (item->>'duration_minutes')::numeric >= 0
        else false
      end
      or not case coalesce(jsonb_typeof(item->'distance'), 'null')
        when 'null' then true
        when 'number' then (item->>'distance')::numeric >= 0
        else false
      end
      or not case coalesce(jsonb_typeof(item->'rest_seconds'), 'null')
        when 'null' then true
        when 'number' then
          (item->>'rest_seconds')::numeric >= 0
          and (item->>'rest_seconds')::numeric = trunc((item->>'rest_seconds')::numeric)
        else false
      end
      or not case coalesce(jsonb_typeof(item->'tempo'), 'null')
        when 'null' then true
        when 'string' then char_length(item->>'tempo') between 1 and 32
        else false
      end
      or not case coalesce(jsonb_typeof(item->'set_details'), 'null')
        when 'null' then true
        when 'array' then
          jsonb_array_length(item->'set_details') = (item->>'sets')::integer
          and jsonb_array_length(item->'set_details') <= 50
        else false
      end
      or exists (
        select 1
        from jsonb_array_elements(
          case
            when jsonb_typeof(item->'set_details') = 'array'
              then item->'set_details'
            else '[]'::jsonb
          end
        ) as detail(value)
        where jsonb_typeof(value) <> 'object'
          or not case coalesce(jsonb_typeof(value->'reps'), 'null')
            when 'null' then true
            when 'number' then
              (value->>'reps')::numeric >= 0
              and (value->>'reps')::numeric = trunc((value->>'reps')::numeric)
            else false
          end
          or not case coalesce(jsonb_typeof(value->'weight'), 'null')
            when 'null' then true
            when 'number' then (value->>'weight')::numeric >= 0
            else false
          end
      )
  ) then
    raise exception using
      errcode = '22023',
      message = 'routine snapshot contains an invalid exercise prescription';
  end if;

  if (
    select count(*) <> count(distinct (item->>'order')::integer)
    from jsonb_array_elements(p_exercises) as exercise(item)
  ) then
    raise exception using
      errcode = '22023',
      message = 'routine exercise order values must be unique';
  end if;

  perform 1
  from public.routines as routine
  where routine.id = p_routine_id
    and routine.user_id = v_actor
    and routine.is_preset = false
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = format('routine %s not found for the authenticated user', p_routine_id);
  end if;

  update public.routines
  set name = v_name
  where id = p_routine_id
    and user_id = v_actor
    and is_preset = false;

  delete from public.routine_exercises
  where routine_id = p_routine_id;

  insert into public.routine_exercises (
    routine_id,
    exercise_id,
    sets,
    reps,
    weight,
    duration_minutes,
    distance,
    set_details,
    tempo,
    rest_seconds,
    "order"
  )
  select
    p_routine_id,
    (item->>'exercise_id')::bigint,
    (item->>'sets')::integer,
    (item->>'reps')::integer,
    (item->>'weight')::numeric,
    (item->>'duration_minutes')::numeric,
    (item->>'distance')::numeric,
    case
      when coalesce(jsonb_typeof(item->'set_details'), 'null') = 'null' then null
      else item->'set_details'
    end,
    item->>'tempo',
    (item->>'rest_seconds')::integer,
    (item->>'order')::integer
  from jsonb_array_elements(p_exercises) as exercise(item)
  order by (item->>'order')::integer;
end;
$function$;

revoke all on function public.save_routine_snapshot(uuid, text, jsonb) from PUBLIC;
revoke all on function public.save_routine_snapshot(uuid, text, jsonb) from anon;
revoke all on function public.save_routine_snapshot(uuid, text, jsonb) from authenticated;
revoke all on function public.save_routine_snapshot(uuid, text, jsonb) from service_role;
grant execute on function public.save_routine_snapshot(uuid, text, jsonb) to authenticated;

comment on function public.save_routine_snapshot(uuid, text, jsonb) is
  'Atomically replaces an authenticated owner''s bounded routine snapshot.';

notify pgrst, 'reload schema';

commit;

select
  not has_function_privilege(
    'anon',
    'public.save_routine_snapshot(uuid,text,jsonb)',
    'execute'
  ) as anon_rpc_denied,
  not has_function_privilege(
    'service_role',
    'public.save_routine_snapshot(uuid,text,jsonb)',
    'execute'
  ) as service_role_rpc_denied,
  has_function_privilege(
    'authenticated',
    'public.save_routine_snapshot(uuid,text,jsonb)',
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
    where p.oid = 'public.save_routine_snapshot(uuid,text,jsonb)'::regprocedure
  ) as rpc_is_hardened,
  (select count(*) from public.routines) as stored_routine_count,
  (select count(*) from public.routine_exercises) as stored_routine_exercise_count;
