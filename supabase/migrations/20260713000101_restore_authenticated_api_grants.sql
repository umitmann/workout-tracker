-- Emergency follow-up for projects whose historical table ACLs were inherited
-- rather than granted directly to `authenticated`.
--
-- This migration is non-destructive: it changes API privileges only. RLS still
-- limits every sensitive table to rows allowed by its policies.

begin;

revoke all on table
  public.workouts,
  public.sets,
  public.routines,
  public.routine_exercises,
  public.scheduled_workouts,
  public.body_weights,
  public.exercise_notes,
  public.exercises
from PUBLIC, anon;

grant usage on schema public to authenticated;
grant usage on schema public to service_role;

grant select on table public.exercises to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.exercises from authenticated;

grant select, insert, update, delete on table
  public.workouts,
  public.sets,
  public.routines,
  public.routine_exercises,
  public.scheduled_workouts,
  public.body_weights,
  public.exercise_notes
to authenticated;

-- Required for inserts into the bigint identity tables. Table grants and RLS
-- still prevent authenticated users from inserting into the exercise library.
grant usage, select on all sequences in schema public to authenticated;

-- Preserve the documented elevated server role. It bypasses RLS by design,
-- but is never used by browser/user-scoped workout paths.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

notify pgrst, 'reload schema';

commit;

select
  has_schema_privilege('authenticated', 'public', 'usage')
    as authenticated_schema_usage,
  has_table_privilege('authenticated', 'public.workouts', 'select')
    as authenticated_workout_read,
  has_table_privilege('authenticated', 'public.sets', 'select')
    as authenticated_set_read,
  has_table_privilege('authenticated', 'public.routines', 'select')
    as authenticated_routine_read,
  has_table_privilege('authenticated', 'public.exercises', 'select')
    as authenticated_exercise_read,
  not has_table_privilege('anon', 'public.workouts', 'select')
    as anon_workout_denied,
  not has_table_privilege('anon', 'public.sets', 'select')
    as anon_set_denied,
  (select count(*) from public.workouts) as stored_workout_count,
  (select count(*) from public.sets) as stored_set_count;
