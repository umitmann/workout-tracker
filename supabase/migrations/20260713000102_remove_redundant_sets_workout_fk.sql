-- Remove the redundant single-column sets -> workouts relationship.
--
-- The stronger composite sets_workout_owner_fkey already enforces
-- (workout_id, user_id) ownership and ON DELETE CASCADE. Keeping both foreign
-- keys makes PostgREST unable to choose a relationship for embedded
-- workouts(...sets(...)) reads, which the current DAL presents as an empty
-- workout list.

begin;

alter table public.sets
  drop constraint if exists sets_workout_id_fkey;

notify pgrst, 'reload schema';

commit;

select
  (
    select count(*) = 1
    from pg_constraint as con
    where con.conrelid = 'public.sets'::regclass
      and con.confrelid = 'public.workouts'::regclass
      and con.contype = 'f'
  ) as exactly_one_sets_workout_relationship,
  exists (
    select 1
    from pg_constraint as con
    where con.conrelid = 'public.sets'::regclass
      and con.conname = 'sets_workout_owner_fkey'
      and con.contype = 'f'
      and con.confdeltype = 'c'
      and con.convalidated
  ) as composite_owner_cascade_retained,
  (select count(*) from public.workouts) as stored_workout_count,
  (select count(*) from public.sets) as stored_set_count;
