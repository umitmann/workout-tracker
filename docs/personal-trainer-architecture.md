# Personal trainer layer: architecture and migration plan

**Status:** Phases 2–6 live; application cut over to snapshot planning and consent-gated result DTOs
**Date:** 2026-07-14
**Scope:** Trainer discovery, explicit trainer/trainee relationships, workout
assignment, and trainee-controlled result sharing.

## Decision summary

The personal-trainer layer must not be implemented as a global `trainer` role
that automatically unlocks another user's data. It needs three independent
authorization concepts:

1. **Platform authority** — who may approve trainer listings or operate the
   platform.
2. **Trainer identity** — who has a published trainer profile and can be found.
3. **Delegated access** — which specific trainee has an active relationship
   with which trainer, and what that trainee currently permits the trainer to
   see.

The target design therefore uses:

- a public-safe trainer directory;
- a bilateral, revocable trainer/trainee relationship;
- explicit result-access grants that default to off;
- immutable workout-plan snapshots, separate from performed workouts;
- the trainee as the permanent owner of their workout and bodyweight data;
- narrowly scoped database functions for delegated operations, backed by RLS;
- no service-role key in trainer or administrator request paths.

The existing `examples/admin-groups.md` is useful behavioral input, but its
schema is not safe or complete enough to implement directly.

## Product assumptions for the first release

- The trainer directory is visible to authenticated users only.
- Only approved, published trainer profiles appear in search.
- Either party can initiate a connection, but it becomes active only after
  both parties have accepted.
- An active connection allows a trainer to assign plans. It does **not** grant
  access to results.
- Result sharing is off by default, includes completed workouts only, and is
  revocable immediately by the trainee.
- Bodyweight sharing is a separate permission and remains off by default.
- Trainers cannot modify workout results, set values, bodyweight, personal
  exercise notes, credentials, or account settings.
- A trainee may have more than one trainer. The schema does not force this
  product capability into the UI, but it avoids an unnecessary one-trainer
  data constraint.
- Ending a relationship removes delegated access immediately. Previously
  assigned plans remain in the trainee's calendar because they are snapshots
  owned by the trainee.

These are secure defaults. Changing one of them should be an explicit product
decision rather than an incidental schema change.

## Domain boundaries

```text
platform role ──approves──> trainer profile ──listed in──> directory
                                  │
trainee <──── bilateral relationship + consent ────> trainer
   │                              │                     │
   │                         access grants              │ owns
   │                              │                     │
   │ owns                         v                     v
   ├──── workout results <── workout plan snapshot <── routine
   └──── bodyweight              │
                                 └── starts one trainee-owned workout
```

Roles answer what an actor may do globally. Relationships and grants answer
what that actor may do to a particular resource. These must remain separate.

The authorization scopes are deliberately layered:

| Scope | Examples | Must not imply |
|---|---|---|
| Platform | Approve/suspend trainer listing | Routine access to health data |
| Organization (future) | Gym owner, staff trainer | Access to every member's results |
| Relationship | Trainer A connected to trainee B | Access to any other trainee |
| Resource/grant | Completed-workout read, bodyweight read | Write access or another data category |

## Target data model

The exact SQL types for foreign keys must be generated only after the live
schema has been captured as a versioned baseline. The repository currently
disagrees about several `uuid` versus `bigint` identifiers.

### Identity and discovery

#### `profiles`

Private application profile for every authenticated account.

| Column | Purpose |
|---|---|
| `user_id` | Primary key and FK to `auth.users` |
| `display_name` | App-facing name; do not query another user's auth metadata |
| `avatar_url` | Optional avatar |
| `time_zone` | IANA time zone for scheduling and notifications |
| `created_at`, `updated_at` | Lifecycle timestamps |

Owner-only RLS is sufficient. Other actors receive a minimal DTO from a
relationship or directory query, not unrestricted profile access.

#### `trainer_profiles`

Public-safe listing data, kept separate from private account data.

| Column | Purpose |
|---|---|
| `id` | Non-auth public identifier used by directory routes |
| `user_id` | Unique FK to the trainer's auth user |
| `display_name`, `avatar_url`, `bio` | Explicitly public-safe listing content |
| `specialties` | Controlled list used by search/filtering |
| `remote_available`, `location_text` | Coarse discovery fields; no private address |
| `accepting_clients` | Directory filter |
| `listing_status` | `draft`, `published`, or `paused` |
| `verification_status` | `pending`, `approved`, `rejected`, or `suspended` |
| `created_at`, `updated_at` | Lifecycle timestamps |

An authenticated directory query may return only approved and published
listings. Email, auth UUID, billing data, moderation notes, and private contact
data are never directory fields. The owner may read their own base row, but
other authenticated users must use a safe-column directory function; all
owner/admin mutations use separate bounded functions.

#### `platform_roles`

Platform operations only. The initial role should be `platform_admin`; there
is no reason to materialize a default `user` role for every account.

Platform administrators may approve listings and handle relationship abuse.
They do not automatically receive routine access to health/workout data. If a
future support workflow genuinely requires that access, implement a separate,
time-limited, audited break-glass operation.

Trainer qualification does not live in this table. It lives in
`trainer_profiles.verification_status`.

### Relationship and consent

#### `trainer_relationships`

One row represents one invitation/connection lifecycle.

| Column | Purpose |
|---|---|
| `id` | Relationship identifier |
| `trainer_id`, `trainee_id` | Auth-user FKs; must differ |
| `initiated_by` | Must equal one of the two parties |
| `status` | `pending`, `active`, `declined`, `ended`, or `expired` |
| `trainer_accepted_at`, `trainee_accepted_at` | Proof of bilateral acceptance |
| `activated_at` | Set only after both acceptance timestamps exist |
| `ended_at`, `ended_by` | Revocation provenance |
| `created_at`, `updated_at` | Lifecycle timestamps |

Use a partial unique index to allow at most one `pending`/`active` relationship
per trainer/trainee pair while retaining ended rows for audit. No client should
directly update status columns; request, accept, decline, and end operations go
through transition functions.

#### `trainer_access_grants`

Fine-grained, trainee-issued access. Initial permission values:

- `workout_results.read`
- `bodyweight.read`

Each grant records `relationship_id`, `permission`, `granted_by`,
`granted_at`, an optional workout-date range, and `revoked_at`/`revoked_by`.
`granted_by` must be the relationship's trainee. A grant is effective only
while its relationship is active, even if it has not yet been explicitly
revoked.

The first UI should offer:

- workouts from the grant date onward; or
- all completed workout history.

Bodyweight must never be bundled silently with workout-result access.

If the product later needs one-off sharing, add `workout_result_shares` keyed
by relationship and workout. Do not overload the connection status for this.

### Plans and performed workouts

#### `workout_plans`

A prescription/schedule, whether self-created or trainer-assigned.

| Column | Purpose |
|---|---|
| `id` | Plan identifier |
| `trainee_id` | Permanent owner/recipient |
| `relationship_id` | Nullable; present for trainer-assigned plans |
| `assigned_by` | Creator; equals trainee for self-scheduled plans |
| `source_routine_id` | Nullable provenance only; not the live plan contents |
| `scheduled_date` | Trainee-local calendar date |
| `title`, `instructions` | Snapshot-level prescription |
| `status` | `scheduled`, `cancelled`, `started`, or `completed` |
| `created_at`, `updated_at`, `cancelled_at` | Lifecycle timestamps |

#### `workout_plan_exercises`

Immutable snapshot of the routine at assignment time. It contains ordered
exercise IDs and prescribed set details, reps, weight, duration, distance,
tempo, and rest target. The snapshot is essential:

- a trainer editing a reusable routine later cannot silently change an
  already assigned workout;
- the trainee can still open the plan after the relationship ends;
- result-versus-prescription comparison has a stable baseline;
- the trainer's private routine never has to be shared with the trainee.

Assignments are edited by creating a new revision or replacing an unstarted
plan atomically. Started or completed plan snapshots are immutable.

#### Existing `workouts`

After migration, `workouts` represents performed sessions only:

- add nullable, unique `plan_id`;
- retain `user_id` as the trainee/owner;
- restrict status to `in_progress` or `completed` after legacy planned rows
  have migrated;
- never add a trainer write policy to `workouts` or `sets`.

Starting a plan atomically creates one trainee-owned workout and links it to
the plan. The logger reads the plan snapshot when there are no saved sets,
matching the current rule that template values are not persisted as actual
sets until the trainee saves.

#### `access_audit_events`

Append-only events for relationship requests/acceptance/end, grant/revoke,
plan assignment/cancellation, and trainer result reads. Store actor, subject,
relationship/resource IDs, event type, and timestamp—not entire workout
payloads. Normal users cannot mutate audit events.

## Authorization matrix

| Operation | Trainee | Connected trainer | Platform admin |
|---|---|---|---|
| Search approved trainer listings | Yes | Yes | Yes |
| Edit a trainer listing | No | Own only | Approve/suspend only |
| Request/accept/end relationship | Own side | Own side | Abuse handling only |
| Assign or cancel an unstarted plan | Self plans | Active relationship only | No |
| View assigned plan | Own | Own assignment while relationship active | No |
| Start/perform/edit workout | Own | Never | Never by default |
| View completed workout results | Own | Active relationship + active result grant | No by default |
| View in-progress workout | Own | Never | No by default |
| View bodyweight | Own | Active relationship + separate bodyweight grant | No by default |
| Edit results/bodyweight/notes | Own | Never | Never by default |

Ending the relationship makes every trainer operation fail immediately. A
cached page may remain visible until navigation, but every new read or write
must re-check current database state.

## Enforcement architecture

### Database

- Keep owner RLS on `workouts`, `sets`, `body_weights`, `exercise_notes`, and
  `routines`.
- Do not add broad trainer `SELECT` policies to raw health-data tables in the
  first release. Delegated reads should use narrow database functions that
  return minimal result DTOs and write a read-audit event.
- Use hardened functions for relationship transitions, grant/revoke,
  assign-from-routine, start-plan, and trainer result reads.
- Require an approved, non-suspended trainer profile as well as an active
  relationship for every delegated trainer operation. Pausing directory
  publication alone does not end an existing relationship.
- Every function derives the actor from `auth.uid()`; it never trusts a
  caller-supplied actor/user ID.
- For `security definer` functions: use `set search_path = ''`, fully qualify
  every object, revoke execute from `PUBLIC`/`anon`, grant only the necessary
  authenticated role, and test direct RPC invocation as an attacker.
- Put RLS-only helper functions in an unexposed `private` schema. Helpers must
  check relationship status and grant validity in the database, not in JWT
  user metadata.
- Add indexes on both sides of relationships, active grants, plan recipient +
  date, and all columns used by RLS/helper predicates.
- Add database constraints for status values, positive/count bounds, valid
  date ranges, actor membership, and parent ownership. Application validation
  is additional—not a replacement for constraints.

### Next.js application

- Treat Proxy as an optional optimistic redirect only.
- Add a server-only authentication primitive (`requireUser`) in the DAL and
  call it from every data read, Server Action, and route handler.
- Mark DAL/service-role modules with `import 'server-only'`.
- Treat every exported Server Action as a public endpoint: validate IDs,
  dates, strings, array sizes, state transitions, and current authorization.
- Split owner and trainer DAL functions so a target `userId` cannot be added
  casually to an existing owner query.
- Return explicit DTOs. A trainer result DTO should contain only completed
  workout date, prescribed-versus-actual exercise/set data, and fields covered
  by the active grant.
- Never construct a service-role client for a user-triggered trainer or admin
  request.

## Architecture and safety findings

These were the findings from the initial audit. Their current disposition is
kept here so a fixed issue is not silently rediscovered or mistaken for an
open release blocker. Live schema/ACL evidence and exact migration history are
recorded in [`database.md`](database.md).

### P0 — before PT feature work

1. **Resolved — the migration history was not machine-replayable.**
   `docs/database.md` remains the human-readable history, while the additive
   `20260713000000_baseline_workout_tracker.sql` now captures the inventoried
   pre-hardening schema before the nine hardening/PT migrations. Repeated local
   `supabase db reset` runs rebuild the complete database from an empty project.
   Generated database types remain useful follow-up maintenance, but they are
   no longer a recovery blocker.

2. **Resolved — template replacement could erase a template.**
   `saveTemplateExercisesCore` updates the name, deletes all
   `routine_exercises`, then inserts replacements in separate requests. The
   update/delete results are ignored. A failed insert leaves the reusable
   template empty—the exact wrong base for trainer prescriptions. Replace
   this with an atomic, ownership-checking database function before trainer
   scheduling. `save_routine_snapshot` is now deployed, the destructive
   fallback was removed, and failure/rollback tests are green.

3. **Resolved — deployment of the atomic set-save function was unverifiable.** The
   function exists only as SQL documentation in this repository. The runtime
   intentionally falls back when it is absent; that fallback prevents an
   empty workout but can leave duplicated sets after a failed cleanup. Move
   and harden the function in the migration baseline, then remove the
   indefinite schema-degrade path after all environments are migrated. The
   hardened function and explicit execute grants are now live-verified.

4. **Prevented — the old trainer design granted too much by relationship alone.** The
   proposal makes trainer/client membership sufficient to read all workouts
   and sets and suggests service-role bypass for super-admin access. It has no
   bilateral state, consent scope, revocation provenance, result permission,
   audit, or separation between platform admin and trainer identity. Do not
   implement those policies.

### P1 — hardening in the same foundation phase

5. **Resolved for new planning — planning and performance were conflated.**
   Trainer assignments now live in immutable `workout_plans` snapshots and
   create a trainee-owned `workouts` row only through the atomic start RPC.
   The Phase 6 bridge safely covers legacy writes; live reconciliation found
   no legacy planned or scheduled rows to migrate.

6. **Resolved for the PT lifecycle — lifecycle and input invariants were mostly
   UI conventions.** Bounded assignment, cancellation, and one-time start are
   enforced again by hardened database functions. Server Actions authenticate
   before validation and expose only safe errors; direct calls cannot bypass
   relationship, routine-ownership, date, or transition checks.

7. **Resolved — the server data boundary was inconsistent.** `src/lib/dal.ts` held a
   service-role client but had no `server-only` import. `getAllExercises`
   bypassed RLS without an auth check, while `/routines` relied on Proxy. The
   Proxy matcher also omitted `/workouts`, even though those pages performed
   their own checks. The DAL is now explicitly server-only, exercise reads use
   the authenticated request client instead of a service-role key, the Proxy
   matcher covers both workout route families, and trainer/admin pages repeat
   verified-user/current-role checks at the secure data boundary.

8. **Resolved for current persistence — parent integrity was not consistently expressed in documented RLS.** For
   example, the documented `sets` update policy checks only the set's
   `user_id`, not that its target workout has the same owner. Audit the live
   RLS and constraints with direct PostgREST tests, not only injected fakes.
   Composite ownership constraints and strict policies are now live-verified;
   every new PT child table must repeat this audit.

9. **Resolved — the documented `save_workout_sets` definer needed hardening.** It pins the
   caller correctly, but uses `search_path = public` and grants authenticated
   execution without first revoking default/public execution. Replace this in
   the versioned migration with fully qualified objects, an empty search path,
   explicit revokes/grants, payload bounds, and status checks. The replacement
   is deployed with an empty search path and scoped execution grants.

10. **The dependency audit has one unresolved upstream advisory.** The direct
    high-severity Next.js advisory and transitive WebSocket/esbuild findings
    were patched by upgrading Next.js to 16.2.10, `eslint-config-next` to
    16.2.10, and `tsx` to 4.23.1. The latest stable Next.js still pins PostCSS
    8.4.31, which npm reports for a moderate stringification XSS advisory.
    `npm audit fix --force` proposes an invalid downgrade to Next.js 9.3.3;
    do not take it. Track the upstream Next.js release and keep
    `npm audit --audit-level=high` as the immediate CI/release gate.

11. **Resolved — speculative dashboard reads raced later navigation.** The
    calendar used read-only Server Actions in a mount effect to prefetch four
    adjacent months. A late Next 16 action response could reapply the
    dashboard's router tree after the user had opened a trainer request,
    interrupting Accept and other work. Calendar month reads now use a bounded,
    authenticated, private/no-store `GET /api/calendar` route, prefetch only the
    two adjacent months, abort on unmount, and surface on-demand failures. This
    also separates queries from mutations and removes avoidable database load.

## Migration plan

Each phase is deployable behind feature flags. Destructive cleanup happens
only after production verification and a rollback window.

### Phase 0 — establish a trustworthy database baseline

1. Preserve `docs/database.md` as the human-readable migration history and add
   an executable Supabase migration directory for repeatable environments.
2. Reconcile that documented history with the linked project's actual schema,
   extensions, functions, grants, constraints, indexes, and RLS policies as
   the executable baseline.
3. Resolve every `uuid`/`bigint` documentation mismatch and generate database
   TypeScript types from the baseline.
4. Prove that a fresh local/test database can be rebuilt from migrations and
   seeds.
5. Add migration drift checks to CI.

**Gate:** schema reset succeeds; generated types compile; owner-versus-attacker
RLS integration tests pass against local Supabase.

### Phase 1 — harden existing persistence and authorization

1. Version and harden `save_workout_sets`.
2. Replace template delete-then-insert with an atomic
   `save_routine_snapshot` function; check and surface every error.
3. Add status/date/value constraints and valid state transitions.
4. Add parent-ownership constraints/policies for set and routine children.
5. Add `server-only`, `requireUser`, boundary validation, and explicit DTOs.
6. Inventory `scheduled_workouts`: record counts and integrity; do not assume
   it is empty merely because the app no longer reads it.

**Gate:** failure-injection tests cannot erase templates or sets; direct API
tests cannot cross user boundaries; current solo-user behavior is unchanged.

### Phase 2 — profiles and trainer directory

**Implementation status (2026-07-13):** the additive schema is live and the
protected trainer directory, trainer self-application/edit screen, and
platform-admin review screen are implemented. Unit/static gates pass; a
deployment smoke test, real-JWT integration run, and production-like directory
load baseline remain release evidence, not additional SQL work.

1. Add `profiles`, `trainer_profiles`, and `platform_roles` additively.
2. Backfill each existing auth user into `profiles` using minimal metadata.
3. Add trainer application/edit and platform approval transitions.
4. Add authenticated directory search over approved, published fields only.

**Gate:** unpublished/suspended profiles and private account fields cannot be
retrieved by another authenticated user or by `anon`.

### Phase 3 — relationships, consent, and audit

**Implementation status (2026-07-13):** the live SQL Editor migration passed
all verification gates with existing owner data preserved. Narrow RPCs, Server
Actions, participant DTOs, connection screens, consent controls, and
consent-history UI are implemented and replay-tested. The deployed browser
smoke and dedicated multi-actor JWT run remain release evidence. Result-reading
APIs are deliberately absent in this phase.

1. Add `trainer_relationships`, `trainer_access_grants`, indexes, constraints,
   and append-only audit events.
2. Implement request, accept, decline, end, grant, and revoke functions.
3. Build trainee and trainer connection screens.
4. Keep all result APIs disabled in this phase; prove that an active
   relationship alone reveals no workout or bodyweight data.

**Gate:** both-party acceptance is required; duplicate active connections are
impossible; revoke/end takes effect on the next request.

### Phase 4 — snapshot-based workout planning

**Implementation status (2026-07-14):** the additive snapshot schema, plan
RPCs, lifecycle enforcement, and one-start concurrency guard are live. The
application assigns through the RPC, presents attributed snapshot plans on
the trainee dashboard, and hydrates the existing logger from the snapshot
after atomic start. Live verification preserved 44 workouts and 379 sets.

1. Add `workout_plans` and `workout_plan_exercises`.
2. Implement atomic `assign_workout_from_routine`: verify trainer identity,
   approved status, active relationship, routine ownership, payload bounds,
   and scheduled date; copy a snapshot; append an audit event.
3. Add the trainee calendar read model combining plans and performed workouts.
4. Implement atomic `start_workout_plan`, linked by `workouts.plan_id`.
5. Allow only the trainee and the assigning trainer (while connected) to
   cancel an unstarted plan. Never hard-delete it in normal workflows.

**Gate:** changing/deleting the source routine cannot change an assignment;
trainers cannot assign to unrelated users; the trainee can start exactly one
workout per plan under concurrent requests.

### Phase 5 — result sharing and trainer dashboard

**Implementation status (2026-07-14):** the three consent-gated, audited result
RPCs are live. The client workspace reads completed results and bodyweight
only through their narrow DTOs, distinguishes private from empty states, and
keeps both permissions independently revocable. Raw owner tables remain
closed to trainers.

1. Add the trainee-facing permission UI with clear scope and revoke copy.
2. Add narrow completed-results/bodyweight read functions. The first workout
   contract is `trainer_get_completed_workouts`; re-check active relationship
   + active grant on every call and append a read-audit event.
3. Build trainer client/calendar/result views from dedicated DTOs.
4. Show the trainee who can currently access which categories of data.

**Gate:** active/no-grant returns no results; workout grant never reveals
bodyweight; in-progress workouts are never returned; revocation and
relationship end deny all new trainer reads immediately.

### Phase 6 — migrate legacy planned workouts

**Implementation status (2026-07-14):** the non-destructive, idempotent
backfill and compatibility bridge are live, and the application uses the new
plan read/write path. Verification found zero legacy planned workouts, zero
legacy scheduled rows, zero mappings, and zero anomalies. Keep the bridge and
legacy structures through a stable reconciliation window; their removal is a
separate future migration.

1. Add an idempotent mapping/backfill for existing
   `workouts.status = 'planned'` rows into self-owned `workout_plans`.
2. Snapshot the currently referenced routine as the best available legacy
   prescription, and flag anomalies (sets already present, missing templates,
   invalid statuses) for review rather than dropping them.
3. If `scheduled_workouts` contains rows, migrate them separately and preserve
   their provenance. If it is empty, record that verification.
4. Dual-read old and new plans, switch all new scheduling writes to
   `workout_plans`, compare counts, then stop reading legacy planned rows.
5. Only after a stable release: remove migrated legacy rows/table, disallow
   `planned` on `workouts`, and remove compatibility/degrade code.

**Gate:** per-user/date plan counts reconcile, no performed workout or set is
deleted, calendar behavior matches before and after cutover.

### Phase 7 — optional organizations/groups

Do not block the one-to-one PT release on gyms or teams. If group ownership is
required later, add `organizations` and `organization_memberships` with
organization-local roles such as owner/admin/trainer. Organization membership
must still not grant workout-result access; the individual trainer/trainee
relationship and trainee grant remain the privacy boundary.

## Required verification matrix

Run every row through Server Actions **and** direct Supabase API/RPC calls:

| State | Assign plan | Read completed results | Read in-progress | Read bodyweight |
|---|---:|---:|---:|---:|
| Unrelated trainer | Deny | Deny | Deny | Deny |
| Pending relationship | Deny | Deny | Deny | Deny |
| Active, no grants | Allow | Deny | Deny | Deny |
| Active + workout grant | Allow | Allow | Deny | Deny |
| Active + bodyweight grant only | Allow | Deny | Deny | Allow |
| Ended relationship, grants remain | Deny | Deny | Deny | Deny |
| Different trainer on same trainee | Own connection only | Own grant only | Deny | Own grant only |

Also test invitation races, duplicate schedule calls, plan-start races, source
routine edits, grant expiry/date boundaries, relationship end during a read,
malformed/bulk payloads, ID enumeration, and every function's execute grants.

The existing fake-client unit tests remain valuable for action behavior, but
they cannot prove deployed RLS, grants, constraints, or definer-function
security. A local Supabase integration tier is mandatory before the PT layer
ships.

## Rollout and rollback

- Ship additive schema first, then hidden UI, then a small approved-trainer
  cohort.
- Keep owner-only workflows and the old calendar read path available until
  reconciliation gates pass.
- Use kill switches for directory publication, new connections, plan
  assignment, and trainer result reads independently.
- Ending a relationship or revoking a grant is always available even if other
  PT features are disabled.
- Never roll back by dropping new data. Disable new writes, keep dual reads,
  fix forward, and clean up only after backups and reconciliation.

## External guidance used

- [Next.js authentication and authorization](https://nextjs.org/docs/app/guides/authentication)
- [Next.js data security](https://nextjs.org/docs/app/guides/data-security)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase local development and migrations](https://supabase.com/docs/guides/local-development)
