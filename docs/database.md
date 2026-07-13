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
| `profiles` | ✅ | ✅ |
| `trainer_profiles` | ✅ | ✅ |
| `platform_roles` | ✅ | ✅ |
| `trainer_relationships` | ✅ | ✅ |
| `trainer_access_grants` | ✅ | ✅ |
| `trainer_relationship_audit_events` | ✅ | ✅ |

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
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from workouts
      where workouts.id = sets.workout_id
      and workouts.user_id = auth.uid()
    )
  );

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
  id                uuid primary key default gen_random_uuid(),
  routine_id        uuid not null references routines on delete cascade,
  exercise_id       bigint not null references exercises on delete restrict,
  sets              integer not null,
  reps              integer,           -- null for cardio exercises
  weight            numeric,           -- null for cardio exercises
  duration_minutes  numeric,           -- cardio only
  distance          numeric,           -- cardio only, optional
  "order"           integer not null
);

-- Migration applied 2026-06-14:
-- alter table routine_exercises add column duration_minutes numeric;
-- alter table routine_exercises add column distance numeric;
-- alter table routine_exercises alter column reps drop not null;

alter table routine_exercises enable row level security;

-- Users can read routine_exercises belonging to their own routines or presets
create policy "routine_exercises: read own and presets"
  on routine_exercises for select
  to authenticated
  using (
    exists (
      select 1 from routines
      where routines.id = routine_exercises.routine_id
      and (routines.is_preset = true or routines.user_id = auth.uid())
    )
  );

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

## Phase 4 — Rest timer + bodyweight

### `sets.rest_seconds` (migration)

Records the **actual** elapsed rest taken after a set (seconds). Nullable — old
rows and sets logged without a rest timer stay `null`. The app degrades
gracefully if this column is missing (reads fall back, writes retry without it),
so it can be added at any time.

```sql
alter table sets add column rest_seconds numeric;
notify pgrst, 'reload schema';
```

### `body_weights` (new table)

One bodyweight entry per user per day (kg). Upserted on `(user_id, date)`.

```sql
create table if not exists body_weights (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  date       date not null,
  weight     numeric not null,
  created_at timestamptz default now(),
  unique (user_id, date)
);

alter table body_weights enable row level security;

create policy "body_weights: users select their own"
  on body_weights for select
  to authenticated
  using (auth.uid() = user_id);

create policy "body_weights: users insert their own"
  on body_weights for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "body_weights: users update their own"
  on body_weights for update
  to authenticated
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "body_weights: users delete their own"
  on body_weights for delete
  to authenticated
  using (auth.uid() = user_id);

notify pgrst, 'reload schema';
```

> The dashboard bodyweight widget and the PT export tolerate this table not
> existing yet (reads return empty), but logging a weight will error until it is
> created.

---

## Phase 5 — Per-set targets (dropsets / pyramids)

### `routine_exercises.set_details` (migration)

Optional per-set target scheme. When present it's a JSON array with one entry
per planned set — `[{ "reps": 8, "weight": 60 }, { "reps": 8, "weight": 50 }, …]`
— which lets a template schedule dropsets or pyramids instead of a single
uniform `sets × reps @ weight`. Null = uniform (use the existing `sets`/`reps`/
`weight` columns). Reads and writes degrade gracefully if the column is missing.

```sql
alter table routine_exercises add column set_details jsonb;
notify pgrst, 'reload schema';
```

---

## Phase 7 — PT-set tempo per template exercise

### `routine_exercises.tempo` (migration)

Optional DRUH tempo the PT prescribes for an exercise, stored as `"down-rest-up-hold"`
seconds (e.g. `"3-1-2-1"`). Null = no prescribed tempo (the athlete's own tempo
is used). When a workout is started from the template, the guided-set timer for
that exercise pre-fills this tempo. Reads/writes degrade gracefully if missing.

```sql
alter table routine_exercises add column tempo text;
notify pgrst, 'reload schema';
```

---

## Phase 6 — Per-exercise personal notes

### `exercise_notes` (migration)

One free-text note per user per exercise (e.g. "seat height 4, narrow grip").
Shown on the exercise while logging. Reads degrade gracefully if the table is
missing.

```sql
create table if not exists exercise_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  exercise_id bigint not null references exercises on delete cascade,
  note        text,
  updated_at  timestamptz default now(),
  unique (user_id, exercise_id)
);

alter table exercise_notes enable row level security;

create policy "exercise_notes: select own" on exercise_notes for select
  to authenticated using (auth.uid() = user_id);
create policy "exercise_notes: insert own" on exercise_notes for insert
  to authenticated with check (auth.uid() = user_id);
create policy "exercise_notes: update own" on exercise_notes for update
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "exercise_notes: delete own" on exercise_notes for delete
  to authenticated using (auth.uid() = user_id);

notify pgrst, 'reload schema';
```

---

## Phase 8 — Atomic set-snapshot save (ADR-0004)

### `save_workout_sets` (RPC function)

Replaces the client's unconditional `delete().eq('workout_id', …)` +
`insert()` pair (finding C1) with a single Postgres function executed in one
transaction — a delete followed by an insert that fails partway can no
longer leave the workout's sets empty. `p_sets` is the full snapshot to
persist for the workout, as a JSON array of rows shaped like the `sets`
table (minus `id`); ownership is re-checked inside the function (`p_user_id`
must own `p_workout_id`) so this can't be used to write into another user's
workout even though `security definer` bypasses RLS for the body.

```sql
create or replace function save_workout_sets(
  p_workout_id bigint,
  p_user_id uuid,
  p_sets jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- security definer bypasses RLS, and PostgREST exposes this RPC to any
  -- authenticated user — so p_user_id must be pinned to the actual caller,
  -- not trusted as an argument. Without this line, any logged-in user could
  -- pass another user's uuid + workout id and replace their sets.
  if p_user_id is distinct from auth.uid() then
    raise exception 'p_user_id does not match the authenticated caller';
  end if;

  if not exists (
    select 1 from workouts
    where id = p_workout_id and user_id = p_user_id
  ) then
    raise exception 'workout % not found for user %', p_workout_id, p_user_id;
  end if;

  delete from sets where workout_id = p_workout_id and user_id = p_user_id;

  insert into sets (workout_id, user_id, exercise_id, weight, reps, duration_minutes, distance, rest_seconds, difficulty)
  select
    p_workout_id,
    p_user_id,
    (row->>'exercise_id')::bigint,
    (row->>'weight')::numeric,
    (row->>'reps')::integer,
    (row->>'duration_minutes')::numeric,
    (row->>'distance')::numeric,
    (row->>'rest_seconds')::numeric,
    (row->>'difficulty')::smallint
  from jsonb_array_elements(p_sets) as row;
end;
$$;

grant execute on function save_workout_sets(bigint, uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
```

> **Client fallback:** until this migration is applied, `save_workout_sets`
> does not exist and Supabase returns a missing-function error (PostgREST
> `PGRST202` / Postgres `undefined_function` `42883`). The client detects
> exactly that error (`isMissingFunctionError` in `src/lib/dal.ts`) and falls
> back to **insert-new-before-delete-old**: it inserts the new snapshot
> first, then deletes only the old rows (excluding the ids it just
> inserted). If the insert fails, no delete fires — the previous snapshot is
> left untouched. This is a deliberate trade-off versus this RPC: it can
> leave duplicate rows behind if the cleanup delete itself fails, but it can
> never leave the workout emptier than before the save. Apply this migration
> to close that residual-duplicate window entirely. See
> [ADR-0004](decisions/0004-atomic-workout-persistence.md) and
> `src/app/actions/cores.ts` (`saveSetSnapshot`).

---

## Phase 9 — PT-prescribed rest target per template exercise

### `routine_exercises.rest_seconds` (migration)

Optional rest target (seconds) the PT prescribes for an exercise on the plan.
Null = no prescription. Resolve order (Tile 6): a per-exercise prescription on
`routine_exercises.rest_seconds` wins; otherwise the athlete's single global
rest-target value (localStorage `wt.restTarget`) applies to every exercise —
there is NO per-exercise learned memory. Distinct from `sets.rest_seconds`
(Phase 4), which is the timer's *logged elapsed* rest for a completed set, not
a prescribed target. Named to parallel `tempo` (Phase 7); reads/writes degrade
gracefully if missing, same pattern as `tempo`/`set_details`.

```sql
alter table routine_exercises add column rest_seconds integer;
notify pgrst, 'reload schema';
```

---

## Phase 10 — Per-set difficulty rating

### `sets.difficulty` (migration)

Optional 1-5 subjective-effort rating (1 = easy … 5 = maximal) the athlete can
tap onto any non-cardio set, any time — never required to add/complete a set
or complete the workout. Nullable — old rows and sets logged without a rating
stay `null`. Same missing-column graceful-degrade as `rest_seconds` (Phase 4):
reads fall back, writes retry without it, so this can be added at any time.
Storage is a plain smallint; the 1-5 label direction is a UI decision only.

```sql
alter table sets add column difficulty smallint;   -- 1-5 subjective effort, nullable
notify pgrst, 'reload schema';
```

---

## Phase 11 — Existing persistence and RLS hardening

Applied through the Supabase SQL Editor on 2026-07-13 from
[`20260713000100_harden_existing_persistence.sql`](../supabase/migrations/20260713000100_harden_existing_persistence.sql).

The live-schema preflight confirmed that `exercises.id`, `workouts.id`, and
`sets.id` are `bigint` identity columns; routine IDs are `uuid`; there were no
cross-owner set rows or invalid numeric/prescription rows; and
`scheduled_workouts` and `workouts.status = 'planned'` were both empty.

This migration:

- replaced permissive broad `ALL` policies with explicit authenticated,
  owner-and-parent-scoped policies;
- added a composite set/workout owner foreign key;
- fixed the missing ownership `USING` condition for routine-exercise updates;
- added validated value, prescription-shape, order, and ownership constraints;
- added the RLS/query supporting indexes;
- changed future public-schema default privileges to fail closed; and
- hardened `save_workout_sets` with an empty search path, fully qualified
  objects, bounded input, row locking, and authenticated-only execution while
  retaining its application-compatible signature.

The post-migration verification returned `true` for policy replacement, anon
and service-role denial, authenticated execution, function hardening, and all
validated constraints.

### Phase 11 follow-up — explicit authenticated API grants

Immediately after the hardening migration, authenticated application reads
returned empty because the project's historical table access depended on ACLs
that had not been inventoried or made explicit. No data was deleted: the SQL
Editor confirmed 43 workout rows and 362 set rows remained.

Applied
[`20260713000101_restore_authenticated_api_grants.sql`](../supabase/migrations/20260713000101_restore_authenticated_api_grants.sql)
through the SQL Editor on 2026-07-13. It explicitly grants the authenticated
role the table/sequence access required by the app while retaining RLS as the
row boundary, preserves the elevated service-role table contract, and revokes
anonymous/public table access. Verification returned `true` for all required
authenticated grants and anonymous denials, with the same 43 workouts and 362
sets present.

### Phase 11 follow-up — remove the redundant PostgREST relationship

After authenticated grants were restored, workout pages still rendered empty.
The data remained intact, but the new composite `sets_workout_owner_fkey` and
the old `sets_workout_id_fkey` both described `sets -> workouts`. PostgREST
could not choose a relationship for embedded `workouts(...sets(...))` queries;
the application DAL suppressed that read error and rendered an empty list.

Applied
[`20260713000102_remove_redundant_sets_workout_fk.sql`](../supabase/migrations/20260713000102_remove_redundant_sets_workout_fk.sql)
through the SQL Editor on 2026-07-13. It removed only the redundant original
foreign key. The validated composite owner foreign key and `ON DELETE CASCADE`
remain. Verification confirmed exactly one sets/workouts relationship, the
same 43 workouts and 362 sets, and the application workout list was restored.

Future relationship migrations must check PostgREST embedding ambiguity as
well as relational integrity. Data-access functions must also surface query
errors rather than converting them to empty collections.

---

## Phase 12 — Atomic routine snapshot persistence

Applied through the Supabase SQL Editor on 2026-07-13 from
[`20260713000200_atomic_routine_snapshot.sql`](../supabase/migrations/20260713000200_atomic_routine_snapshot.sql).

The `save_routine_snapshot(uuid, text, jsonb)` function now replaces a routine
name and its ordered exercise prescription in one transaction. It derives the
actor from `auth.uid()`, locks and verifies an owned non-preset routine, bounds
and validates the snapshot, uses an empty search path and fully qualified
objects, and grants execution only to `authenticated`.

The matching Server Action calls this RPC without a destructive direct-table
fallback. Critical workout and template DAL reads now throw contextual database
errors instead of silently presenting a failed query as an empty collection.

Post-migration verification returned `true` for anonymous/service denial,
authenticated execution, and function hardening. The migration did not mutate
existing content: 4 routines and 17 routine-exercise rows remained.

---

## Phase 13 — Profiles, trainer directory, and platform role

Applied through the Supabase SQL Editor on 2026-07-13 from
[`20260713000300_profiles_trainer_directory.sql`](../supabase/migrations/20260713000300_profiles_trainer_directory.sql).

The migration is additive and does not alter workouts, sets, routines,
routine exercises, bodyweight, or notes. It creates:

- private, owner-readable `profiles`, backfilled for every `auth.users` row
  and maintained by a bounded signup trigger;
- owner-readable `trainer_profiles` whose mutations go through validated RPCs;
- a safe authenticated directory DTO that exposes approved/published listing
  fields but never auth UUIDs, email, or review provenance;
- private `platform_roles` containing only the `platform_admin` authority; and
- bounded admin review functions that cannot access workout or health tables.

Anonymous and service-role execution of the public RPCs is denied; only
`authenticated` receives execution, with current actor and platform-role
checks inside the hardened definer functions. Platform administration does
not imply access to workouts, sets, bodyweight, or notes.

The migration, one-time bootstrap, pending/approved directory transition,
raw-table isolation, privilege-escalation denial, and new-user trigger were
successfully exercised against a disposable PostgreSQL 17 database. Static
security contracts are in `.claude/test_personal-trainer-migration.mjs`; the
real-JWT integration contract is gated in
`.claude/test_trainer-directory-rls.mjs`.

After live migration verification, one existing account can be bootstrapped
with the separate, environment-specific
[`bootstrap_platform_admin.sql`](../supabase/manual/bootstrap_platform_admin.sql).
The bootstrap is intentionally not part of the repeatable migration chain and
requires exactly one auth user matching the supplied login email.

Live verification returned `true` for all eight foundation, backfill, ACL,
base-table, directory-function, and hardening checks. Existing content was
preserved at 44 workouts, 379 sets, 6 routines, and 21 routine-exercise rows.
The initial platform administrator was then bootstrapped successfully through
the separate operator script; the account email is intentionally not recorded
in migration history.

The matching Next.js slice uses only the scoped Phase 13 functions for trainer
self-service, approved directory reads, and administrator review. It was
deployed and smoke-tested successfully on 2026-07-13 before the relationship
work began.

---

## Phase 14 — Bilateral trainer relationships and trainee consent

Applied to the live Supabase project through the SQL Editor on 2026-07-13 from
[`20260713000400_trainer_relationships_consent.sql`](../supabase/migrations/20260713000400_trainer_relationships_consent.sql)
after a successful disposable PostgreSQL replay.

This additive migration creates:

- `trainer_relationships`, with one-sided requests, bilateral activation,
  terminal decline/end states, and a partial unique index preventing two
  pending/active rows for the same trainer/trainee pair;
- `trainer_access_grants`, with independent `workout_results.read` and
  `bodyweight.read` categories, all-history/from-now scope, soft revocation,
  and trainee-only grant authority;
- `trainer_relationship_audit_events`, protected by an append-only mutation
  trigger; and
- authenticated request, accept, decline, end, grant, revoke, participant-list,
  and consent-history RPCs.

Authenticated users receive no direct table privileges on any of the three
tables. Every public RPC derives the actor from `auth.uid()`, re-checks current
state, uses `security definer` with an empty search path, and is denied to
`PUBLIC`, `anon`, and `service_role`. Ending a relationship locks its current
state and revokes all active category grants in the same transaction.

The migration intentionally does **not** alter or add policies to `workouts`,
`sets`, `body_weights`, routines, or notes, and it does not create a trainer
result-reading function. Therefore, an active relationship or even a stored
grant cannot expose health data in this phase.

### SQL Editor procedure

1. Open the linked migration and copy the entire file, from `begin;` through
   the final verification `select`.
2. In Supabase, open **SQL Editor → New query**, paste it, and press **Run**
   once. Do not select only part of the file.
3. The final result must show `true` for:
   `three_consent_tables_created`,
   `anonymous_consent_table_access_denied`,
   `authenticated_base_table_access_denied`,
   `all_consent_rpcs_are_hardened`,
   `consent_rpc_permissions_are_scoped`,
   `one_current_relationship_is_enforced`, and
   `audit_append_only_trigger_installed`.
4. Before first use, both `current_relationship_count` and
   `active_access_grant_count` should normally be `0`. The workout, set, and
   bodyweight counts must match their pre-migration values.
5. Paste the single verification result row back into the development thread
   before the application code is deployed.

The SQL was parsed and executed on PostgreSQL 17 after the Phase 13 migration.
A role-level behavior replay proved pending/bilateral transitions, duplicate
request rejection, unrelated-user denial, trainee-only independent grants,
scope changes, revocation, atomic end/revoke, minimal participant DTOs, and the
append-only audit trigger. Static contracts live in
`.claude/test_trainer-relationship-migration.mjs`; action contracts in
`.claude/test_trainer-relationship-actions.mjs`; and the dedicated real-JWT
contract in `.claude/test_trainer-relationship-rls.mjs`.

Live verification returned `true` for table creation, anonymous denial,
authenticated base-table denial, hardened RPCs, scoped execution permissions,
one-current-relationship uniqueness, and the append-only audit trigger. The
new tables were empty as expected (`0` relationships and `0` active grants),
and existing owner data was preserved at 44 workouts, 379 sets, and 0
bodyweight rows.

---

## Superseded — original Admin & Trainer Tables sketch

The original two-table sketch in
[../examples/admin-groups.md](../examples/admin-groups.md) is superseded and
must not be implemented directly. `roles` + `trainer_clients` do not represent
bilateral consent or scoped/revocable result access, and the active app no
longer uses `scheduled_workouts` for its calendar.

See
[personal-trainer-architecture.md](personal-trainer-architecture.md) for the
target schema, authorization model, prerequisites, and phased migration plan.
