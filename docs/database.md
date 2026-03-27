# Database Setup — Supabase

All SQL here runs in **Supabase → SQL Editor → New query**.

---

## Status

| Table | Created | RLS |
|---|---|---|
| `exercises` | ✅ | ✅ |
| `workouts` | ✅ | ✅ |
| `sets` | ✅ | ✅ |
| `routines` | ✅ | ✅ |
| `routine_exercises` | ✅ | ✅ |
| `scheduled_workouts` | ✅ | ✅ |

> **Notes from setup:**
> - `exercises.id` and `workouts.id` are `bigint` (created via Table Editor). All foreign keys referencing them must use `bigint`, not `uuid`.
> - `equipment` column was missing from `exercises` after initial Table Editor setup — added manually via `alter table exercises add column equipment text`.
> - Schema cache may need a refresh after column changes: run `notify pgrst, 'reload schema';` in SQL Editor if Supabase can't find a column.

---

## Phase 2 — Already Created

### `exercises`

Shared read-only library seeded from [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db).
All authenticated users can read. No user can write (inserts go through service role only).

```sql
create table if not exists exercises (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz default now(),
  name            text not null,
  category        text,
  equipment       text,
  muscles         text[],
  muscles_secondary text[],
  images          text[],
  instructions    text[]
);

alter table exercises enable row level security;

-- Authenticated users can read all exercises
create policy "exercises: authenticated read"
  on exercises for select
  to authenticated
  using (true);
```

> **Check before moving on:** Open the `exercises` table in Table Editor and confirm
> `muscles`, `muscles_secondary`, `images`, `instructions`, and `equipment` are all
> **nullable** and **not** marked as primary key. If any of those toggles are wrong,
> click the column → Edit → fix and save.

---

### `workouts`

One row per workout session. Belongs to a user.

```sql
create table if not exists workouts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  date       date not null,
  created_at timestamptz default now()
);

alter table workouts enable row level security;

create policy "workouts: users select their own"
  on workouts for select
  to authenticated
  using (auth.uid() = user_id);

create policy "workouts: users insert their own"
  on workouts for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "workouts: users update their own"
  on workouts for update
  to authenticated
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "workouts: users delete their own"
  on workouts for delete
  to authenticated
  using (auth.uid() = user_id);
```

---

### `sets`

One row per set within a workout. Supports both strength and cardio.

```sql
create table if not exists sets (
  id                uuid primary key default gen_random_uuid(),
  workout_id        uuid not null references workouts on delete cascade,
  exercise_id       uuid not null references exercises on delete restrict,
  user_id           uuid not null references auth.users on delete cascade,
  weight            numeric,           -- kg or lbs; null for cardio
  reps              integer,           -- null for cardio
  duration_minutes  numeric,           -- cardio only
  distance          numeric,           -- cardio only, optional
  created_at        timestamptz default now()
);

alter table sets enable row level security;

create policy "sets: users select their own"
  on sets for select
  to authenticated
  using (auth.uid() = user_id);

create policy "sets: users insert their own"
  on sets for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "sets: users update their own"
  on sets for update
  to authenticated
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "sets: users delete their own"
  on sets for delete
  to authenticated
  using (auth.uid() = user_id);
```

---

## Phase 3 — Scheduling Tables

### `routines`

A routine is a named template of exercises. Can be a user's own or a system preset (`is_preset = true`, `user_id = null`).

```sql
create table routines (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users on delete cascade, -- null = system preset
  name       text not null,
  is_preset  boolean not null default false,
  created_at timestamptz default now()
);

alter table routines enable row level security;

-- Users can read all presets and their own routines
create policy "routines: read presets and own"
  on routines for select
  to authenticated
  using (is_preset = true or auth.uid() = user_id);

-- Users can only write their own routines (not presets)
create policy "routines: users insert their own"
  on routines for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "routines: users update their own"
  on routines for update
  to authenticated
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "routines: users delete their own"
  on routines for delete
  to authenticated
  using (auth.uid() = user_id);
```

---

### `routine_exercises`

The exercises inside a routine, in order.

```sql
create table routine_exercises (
  id          uuid primary key default gen_random_uuid(),
  routine_id  uuid not null references routines on delete cascade,
  exercise_id bigint not null references exercises on delete restrict,
  sets        integer not null,
  reps        integer not null,
  "order"     integer not null
);

alter table routine_exercises enable row level security;

-- All authenticated users can read (needed to view preset routines)
create policy "routine_exercises: authenticated read"
  on routine_exercises for select
  to authenticated
  using (true);

-- Users can only write routine_exercises that belong to their own routines
create policy "routine_exercises: users insert their own"
  on routine_exercises for insert
  to authenticated
  with check (
    exists (
      select 1 from routines
      where id = routine_exercises.routine_id
      and auth.uid() = routines.user_id
    )
  );

create policy "routine_exercises: users update their own"
  on routine_exercises for update
  to authenticated
  with check (
    exists (
      select 1 from routines
      where id = routine_exercises.routine_id
      and auth.uid() = routines.user_id
    )
  );

create policy "routine_exercises: users delete their own"
  on routine_exercises for delete
  to authenticated
  using (
    exists (
      select 1 from routines
      where id = routine_exercises.routine_id
      and auth.uid() = routines.user_id
    )
  );
```

---

### `scheduled_workouts`

A routine assigned to a specific date for a user. `assigned_by` is set when a trainer schedules it (future use). `workout_id` is null until the user completes the workout.

```sql
create table scheduled_workouts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,
  routine_id     uuid not null references routines on delete cascade,
  scheduled_date date not null,
  assigned_by    uuid references auth.users on delete set null, -- null = self-scheduled
  workout_id     bigint references workouts on delete set null,  -- null = not yet done
  created_at     timestamptz default now()
);

alter table scheduled_workouts enable row level security;

create policy "scheduled_workouts: users select their own"
  on scheduled_workouts for select
  to authenticated
  using (auth.uid() = user_id);

create policy "scheduled_workouts: users insert their own"
  on scheduled_workouts for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "scheduled_workouts: users update their own"
  on scheduled_workouts for update
  to authenticated
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "scheduled_workouts: users delete their own"
  on scheduled_workouts for delete
  to authenticated
  using (auth.uid() = user_id);
```

---

## Future — Admin & Trainer Tables

Not needed now. Documented in [../examples/admin-groups.md](../examples/admin-groups.md) for reference.

When the time comes, two additional tables are needed: `roles` and `trainer_clients`.
The `scheduled_workouts` table already has the `assigned_by` column to support trainer-assigned workouts without a migration.
