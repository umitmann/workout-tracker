-- Phase 19: versioned exercise directory contract for the desktop muscle map.
-- Additive only: the deployed v1 RPC remains available during a rolling release.

begin;

create or replace function public.list_available_exercises_v2()
returns table (
  id bigint,
  name text,
  category text,
  equipment text,
  muscles text[],
  muscles_secondary text[],
  creator_id uuid,
  visibility text,
  video_url text
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

  return query
  select
    exercise.id,
    exercise.name,
    exercise.category,
    exercise.equipment,
    exercise.muscles,
    exercise.muscles_secondary,
    exercise.creator_id,
    exercise.visibility,
    exercise.video_url
  from public.exercises as exercise
  where exercise.archived_at is null
    and (
      exercise.visibility = 'platform'
      or exercise.visibility = 'public'
      or exercise.creator_id = v_actor
      or (
        exercise.visibility = 'clients'
        and exercise.creator_id is not null
        and exists (
          select 1
          from public.trainer_relationships as relationship
          where relationship.trainer_id = exercise.creator_id
            and relationship.trainee_id = v_actor
            and relationship.status = 'active'
        )
      )
    )
  order by pg_catalog.lower(exercise.name), exercise.id;
end;
$function$;

revoke all on function public.list_available_exercises_v2()
  from PUBLIC, anon, authenticated, service_role;
grant execute on function public.list_available_exercises_v2() to authenticated;

comment on function public.list_available_exercises_v2() is
  'Authenticated discoverable exercise catalog with primary and secondary muscle metadata for explainable planning.';

commit;

select
  has_function_privilege('authenticated', 'public.list_available_exercises_v2()', 'execute')
    as authenticated_desktop_catalog_allowed,
  not has_function_privilege('anon', 'public.list_available_exercises_v2()', 'execute')
    and not has_function_privilege('service_role', 'public.list_available_exercises_v2()', 'execute')
    as non_user_desktop_catalog_denied,
  pg_catalog.strpos(
    pg_catalog.pg_get_function_result('public.list_available_exercises_v2()'::regprocedure),
    'muscles_secondary text[]'
  ) > 0 as secondary_muscles_available,
  (select count(*) from public.workouts) as stored_workout_count,
  (select count(*) from public.sets) as stored_set_count,
  (select count(*) from public.routines) as stored_routine_count;
