-- Session-specific notes for individual workout sets.
-- Exercise-level reusable notes remain in public.exercise_notes.

alter table public.sets
  add column if not exists note text;

alter table public.sets
  drop constraint if exists sets_note_length;

alter table public.sets
  add constraint sets_note_length
  check (note is null or char_length(note) <= 500)
  not valid;

alter table public.sets validate constraint sets_note_length;

create or replace function public.save_workout_sets(
  p_workout_id bigint,
  p_user_id uuid,
  p_sets jsonb
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
  if p_user_id is distinct from v_actor then
    raise exception using errcode = '42501', message = 'p_user_id does not match the authenticated caller';
  end if;
  if jsonb_typeof(p_sets) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'p_sets must be a JSON array';
  end if;
  if jsonb_array_length(p_sets) > 1000 or pg_column_size(p_sets) > 1048576 then
    raise exception using errcode = '22023', message = 'set snapshot exceeds the allowed payload size';
  end if;

  perform 1
  from public.workouts as workout
  where workout.id = p_workout_id
    and workout.user_id = v_actor
    and workout.status in ('in_progress', 'completed')
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = format('workout %s not found for the authenticated user', p_workout_id);
  end if;

  delete from public.sets
  where workout_id = p_workout_id and user_id = v_actor;

  insert into public.sets (
    workout_id, user_id, exercise_id, weight, reps, duration_minutes,
    distance, rest_seconds, difficulty, note
  )
  select
    p_workout_id,
    v_actor,
    (item->>'exercise_id')::bigint,
    (item->>'weight')::numeric,
    (item->>'reps')::integer,
    (item->>'duration_minutes')::numeric,
    (item->>'distance')::numeric,
    (item->>'rest_seconds')::numeric,
    (item->>'difficulty')::smallint,
    nullif(left(btrim(item->>'note'), 500), '')
  from jsonb_array_elements(p_sets) as item;
end;
$function$;

revoke all on function public.save_workout_sets(bigint, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_workout_sets(bigint, uuid, jsonb) to authenticated;

