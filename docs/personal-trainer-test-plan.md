# Personal trainer test strategy

This strategy verifies the contracts in
[`personal-trainer-architecture.md`](personal-trainer-architecture.md) without
turning every layer into a duplicate of every other layer.

## Test pyramid

| Layer | Purpose | Command |
|---|---|---|
| Pure unit | Directory/application validation and action guards; relationship state machine, permission matrix, date scope, plan lifecycle, snapshot validation | `npm run test:pt:unit` |
| Migration contract | Additive schema, fail-closed ACLs, bilateral state/consent constraints, append-only audit, safe DTOs, hardened RPCs | `npm run test:pt:migration` |
| Directory RLS integration | Real JWTs, owner-only base rows, listing visibility, privilege-escalation denial | `npm run test:pt:directory-rls` |
| Relationship RLS integration | Real JWTs, raw-table denial, bilateral activation, trainee-only grants, unrelated-user denial, revoke/end | `npm run test:pt:relationship-rls` |
| Planning RLS integration | Real JWTs, plan base-table denial, snapshot assignment, outsider denial, concurrent one-start invariant | `npm run test:pt:planning-rls` |
| Exercise RLS integration | Real JWTs, approved owner writes, public/client discovery, guessed-ID denial, archive and historical entitlement | `npm run test:pt:exercise-rls` |
| Supabase/RLS integration | Real JWTs, raw-table isolation, delegated-results RPC, minimal DTO | `npm run test:pt:rls` |
| Playwright E2E | Directory/admin boundaries, full consent journey, account menu, scoped exercise/video journey, and responsive WCAG/keyboard shell checks | `npm run test:pt:e2e` |
| k6 load | Directory, exercise library, connections, connected-client calendar, and completed-results read paths | `npm run test:pt:load` |

The default unit suite includes the PT unit tests. The other layers require
dedicated infrastructure and skip or fail fast when their explicit enablement
contract is absent; they are not silently represented as passing coverage.

## Unit contracts

`.claude/test_personal-trainer-access.mjs` covers:

- valid and invalid calendar dates;
- approved/published trainer discovery;
- one-sided requests and bilateral activation;
- decline/end terminal states and actor membership;
- approved trainer + active relationship + owned routine assignment;
- present/future date validation;
- completed-only workout result access;
- independent workout/bodyweight permissions;
- trainee-only grant authority, scope boundaries, and revocation;
- unrelated/suspended/ended actors failing closed;
- trainee ownership after relationship end;
- cancel/start plan transitions; and
- detached, ordered, bounded prescription snapshots.

The helpers in `src/lib/personalTrainerAccess.ts` are pure policy logic, not a
security boundary. Server Actions and database functions must re-authorize
against current persisted state.

`.claude/test_trainer-validation.mjs` and `.claude/test_trainer-actions.mjs`
cover the deployed directory slice: bounded and normalized form/search input,
status tampering, unauthenticated short-circuiting, fail-closed administrator
checks, exact safe RPC payloads, and non-leaking error responses.

`.claude/test_trainer-relationship-actions.mjs` pins the Phase 3 action
boundary: authentication precedes validation; only UUIDs and bounded
permission/scope values reach the exact RPC; account IDs are never accepted;
and duplicate, authorization, and internal database errors are translated
without leaking schema details. `.claude/test_trainer-relationship-ui.mjs`
prevents direct-table mutations, accidental result-reader imports, route guard
loss, or merging the two consent categories.

`.claude/test_dal-server-boundary.mjs` and
`.claude/test_proxy-protection.mjs` prevent the adjacent regressions found in
the architecture audit: reintroducing a service-role key into the regular DAL,
losing the `server-only` boundary, omitting a protected route matcher, or
removing the page-level verified-user/current-admin checks.

`.claude/test_personal-trainer-migration.mjs` is included in the default unit
suite. It verifies that the Phase 2 migration is additive to existing workout
data, enables RLS, keeps role membership private, exposes only safe directory
columns, hardens every definer function, and gives trainer self-service no way
to choose its verification status. The SQL was also replayed with its admin
bootstrap and authorization transitions against a disposable PostgreSQL 17
database before SQL Editor handoff.

`.claude/test_trainer-relationship-migration.mjs` verifies the additive Phase
3 schema, bilateral state consistency, partial uniqueness, current-state row
locking, trainee grant provenance, atomic end/revoke, append-only audit,
minimal participant DTOs, and exact RPC execute grants. The Phase 2 + Phase 3
chain and an eight-event request/accept/grant/revoke/end behavior scenario were
also executed successfully against disposable PostgreSQL 17.

`.claude/test_trainer-planning-migrations.mjs` pins the live Phase 4–6 chain:
private immutable plan tables, composite owner/date linkage, exact
plan lifecycle RPC grants, active-relationship assignment, category-specific
completed-result/bodyweight reads, payload-free read audit, idempotent legacy
mapping, and the temporary legacy-write bridge. A full PostgreSQL 17 replay
also covered source-routine mutation after assignment, outsider denial,
in-progress result exclusion, relationship-end revocation, account deletion,
legacy anomaly/reconciliation paths, and two concurrent starts of one plan;
exactly one start committed.

`.claude/test_trainer-planning-actions.mjs` pins authentication-before-
validation, bounded assignment input, exact RPC payloads, one-plan start and
cancel calls, and non-leaking action errors. `.claude/test_trainer-workspace-ui.mjs`
pins server-only narrow planning/result DALs, protected client workspaces,
accessible shared dialogs, independent consent controls, immutable-plan
logger hydration, and role-aware navigation. These contracts were added
without modifying the established Playwright consent journey.

## Supabase/RLS integration contract

The trainer-directory slice has its own real-JWT contract:

```bash
PT_DIRECTORY_RLS_ENABLED=true \
NEXT_PUBLIC_SUPABASE_URL=... \
NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
PT_DIRECTORY_TRAINEE_ACCESS_TOKEN=... \
PT_DIRECTORY_APPROVED_TRAINER_ACCESS_TOKEN=... \
PT_DIRECTORY_APPROVED_NAME='Approved Trainer' \
PT_DIRECTORY_PENDING_NAME='Pending Trainer' \
PT_DIRECTORY_SUSPENDED_NAME='Suspended Trainer' \
npm run test:pt:directory-rls
```

It proves that anonymous calls fail, pending/suspended listings stay hidden,
an unrelated user cannot read the base trainer table or create an admin role,
and a trainer can read only their own base listing. Run it only against a
dedicated seeded project; the production SQL Editor verification is
non-mutating and does not manufacture test users.

The Phase 3 relationship contract runs independently of result sharing:

```bash
PT_RELATIONSHIP_RLS_ENABLED=true \
NEXT_PUBLIC_SUPABASE_URL=... \
NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
PT_RELATIONSHIP_TRAINEE_ACCESS_TOKEN=... \
PT_RELATIONSHIP_TRAINER_ACCESS_TOKEN=... \
PT_RELATIONSHIP_OUTSIDER_ACCESS_TOKEN=... \
PT_RELATIONSHIP_TRAINER_PROFILE_ID=... \
PT_RELATIONSHIP_TRAINEE_WORKOUT_ID=... \
PT_RELATIONSHIP_TRAINEE_BODYWEIGHT_ID=... \
npm run test:pt:relationship-rls
```

Use three dedicated users with an approved/published/accepting trainer and a
trainee-owned workout/bodyweight fixture. The test proves raw consent tables
are inaccessible, the outsider cannot enumerate or transition the connection,
activation alone leaves owner-only health RLS unchanged, only the trainee can
grant, and the Phase 3 result-read RPC remains absent. Cleanup ends the
relationship so the fixture can be rerun.

The Phase 4 planning contract is deliberately stateful and must run only on a
disposable seeded project. It assigns and starts one future plan, then races
two real Data API calls and requires exactly one to succeed:

```bash
PT_PLANNING_RLS_ENABLED=true \
NEXT_PUBLIC_SUPABASE_URL=... \
NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
PT_PLANNING_TRAINEE_ACCESS_TOKEN=... \
PT_PLANNING_TRAINER_ACCESS_TOKEN=... \
PT_PLANNING_OUTSIDER_ACCESS_TOKEN=... \
PT_PLANNING_ACTIVE_RELATIONSHIP_ID=... \
PT_PLANNING_TRAINER_ROUTINE_ID=... \
PT_PLANNING_SCHEDULED_DATE=2026-07-20 \
npm run test:pt:planning-rls
```

Use a unique future date or reset the disposable fixture between runs. The
test also proves that no authenticated actor can read raw plan tables, an
outsider receives no plan DTO, and only the trainee receives the linked
`in_progress` workout.

The relationship/result-sharing contract below is runnable against a dedicated
seeded project now that the result migration is live.

Enable only against a disposable or dedicated seeded Supabase project:

```bash
PT_RLS_ENABLED=true \
NEXT_PUBLIC_SUPABASE_URL=... \
NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
PT_RLS_TRAINEE_ACCESS_TOKEN=... \
PT_RLS_TRAINER_ACCESS_TOKEN=... \
PT_RLS_OTHER_TRAINER_ACCESS_TOKEN=... \
PT_RLS_COMPLETED_WORKOUT_ID=... \
PT_RLS_IN_PROGRESS_WORKOUT_ID=... \
PT_RLS_ACTIVE_GRANT_RELATIONSHIP_ID=... \
PT_RLS_NO_GRANT_RELATIONSHIP_ID=... \
PT_RLS_ENDED_RELATIONSHIP_ID=... \
PT_RLS_BODYWEIGHT_DATE=2026-07-12 \
PT_RLS_BODYWEIGHT_VALUE=82.1 \
PT_RLS_RANGE_FROM=2026-07-01 \
PT_RLS_RANGE_TO=2026-07-31 \
npm run test:pt:rls
```

The seeded fixture must represent three distinct users: trainee, connected
trainer, and unrelated trainer. The contract deliberately calls Supabase
directly, proving that hiding controls in the browser is not the authorization
boundary. Raw `workouts` remains owner-only; delegated completed results are
available only through `trainer_get_completed_workouts` and
`trainer_get_completed_workout_sets`; bodyweight is available only through its
separate function and grant. The active-grant fixture therefore needs both
categories enabled, while the Phase 3 relationship contract independently
proves that granting/revoking one category cannot mutate the other.

Add fixture automation alongside the executable PT migrations. Do not put a
service-role key in the browser suite or run destructive setup against the
production project.

## Disposable local release workflow

The repository now contains a clean-room baseline and a local fixture builder,
so the stateful tiers do not depend on hand-created Supabase accounts:

```bash
npx supabase db reset --workdir .context/supabase-qa

# Export API_URL, ANON_KEY, and SERVICE_ROLE_KEY from `supabase status -o env`,
# then create 22 isolated actors and their seeded relationships/data.
NEXT_PUBLIC_SUPABASE_URL="$API_URL" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \
SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
npm run test:pt:local:fixtures
```

The builder refuses a non-loopback Supabase URL. It writes credentials and JWTs
only to ignored `.context/pt-local-qa.env` with mode `0600`; it never prints
them. Source that file, build/start the app against the local project, and use
the strict runner:

```bash
PT_E2E_BASE_URL=http://127.0.0.1:3002 npm run test:pt:e2e:release
```

For a local k6 run, `npm run test:pt:local:load-session` signs in separate
trainee and trainer browser contexts and writes cookie headers only to ignored
`.context/pt-load-local.env` with mode `0600`. The helper accepts loopback app
URLs only. This enables all five read-only load surfaces without copying a
session secret into source or terminal output.

## Playwright contract

The directory/application/admin slice is executable now and has its own gate.
It saves the dedicated applicant as a draft, which is idempotent across runs,
then proves the draft is absent from discovery, visible to a platform admin,
free of account email, and inaccessible through the admin route to a trainee.

```text
PT_DIRECTORY_E2E_ENABLED=true
PT_E2E_BASE_URL=http://localhost:3000
PT_E2E_TRAINEE_EMAIL / PT_E2E_TRAINEE_PASSWORD
PT_E2E_APPLICANT_EMAIL / PT_E2E_APPLICANT_PASSWORD / PT_E2E_APPLICANT_NAME
PT_E2E_ADMIN_EMAIL / PT_E2E_ADMIN_PASSWORD
```

Use dedicated non-production accounts. The admin account must hold
`platform_admin`; the applicant account must not be used as the approved
trainer fixture because this test intentionally leaves its listing as a draft.

The connect/assign/grant/revoke/end journey is separately gated by
`PT_E2E_ENABLED` because it mutates dedicated multi-actor fixtures.

Required environment:

```text
PT_E2E_ENABLED=true
PT_E2E_BASE_URL=http://localhost:3000
PT_E2E_TRAINEE_EMAIL / PT_E2E_TRAINEE_PASSWORD / PT_E2E_TRAINEE_NAME
PT_E2E_TRAINER_EMAIL / PT_E2E_TRAINER_PASSWORD / PT_E2E_TRAINER_NAME
PT_E2E_OTHER_TRAINER_EMAIL / PT_E2E_OTHER_TRAINER_PASSWORD
PT_E2E_TRAINER_TEMPLATE_NAME
PT_E2E_COMPLETED_WORKOUT_MARKER
PT_E2E_PRIVATE_BODYWEIGHT_MARKER
PT_E2E_PENDING_TRAINER_NAME
PT_E2E_SUSPENDED_TRAINER_NAME
PT_E2E_TRAINEE_PUBLIC_ID
```

Use dedicated accounts. The main journey ends the relationship so it can be
rerun; the database should permit a new relationship after an ended one.
Playwright uses accessible roles/names, retains traces/screenshots/video only
on failure, retries only in CI, and uses one worker until per-worker account
fixtures exist.

`ux-accessibility.spec.ts` adds a non-mutating public check that runs without
fixture credentials: 390px and 1280px overflow, 44px product touch targets,
keyboard-operable auth tabs, reduced-motion/dark-mode coverage, and automated
serious/critical WCAG A/AA checks.
Its authenticated role-navigation, skip-link, and dashboard Axe audit runs
under the existing `PT_E2E_ENABLED` fixture gate. The Playwright project pins
Chromium explicitly so its engine matches the `mobile-chromium` project name.

`npm run test:pt:e2e:public` builds on an existing production artifact, starts
it with Playwright's `webServer`, and selects exactly the credential-free
account-access suite. CI first runs `next build`, installs Chromium and its
system dependencies, then executes this command in a separate browser job.
This gate contains no actor credentials and cannot mutate relationship or
health data; the stateful suites remain separately fixture-gated.

The separate immutable start journey uses a resettable active relationship so
it does not compete with the established connect/consent fixture. It assigns a
uniquely titled snapshot, verifies trainer attribution and the prescribed
exercise, starts exactly one linked workout in the real logger, and deletes
that workout afterward. The immutable plan/audit row is intentionally cleaned
only by resetting the dedicated test project.

```text
PT_PLAN_START_E2E_ENABLED=true
PT_PLAN_E2E_TRAINEE_EMAIL / PT_PLAN_E2E_TRAINEE_PASSWORD
PT_PLAN_E2E_TRAINER_EMAIL / PT_PLAN_E2E_TRAINER_PASSWORD / PT_PLAN_E2E_TRAINER_NAME
PT_PLAN_E2E_RELATIONSHIP_ID
PT_PLAN_E2E_TEMPLATE_NAME
PT_PLAN_E2E_TEMPLATE_EXERCISE_MARKER
```

The suite is run against a production build or a deployed test environment,
not mocked Server Components. A passing skipped suite is not release evidence;
the deployment job must enable and reject skips for each released slice:
`PT_DIRECTORY_E2E_ENABLED`, `PT_RELATIONSHIP_E2E_ENABLED`, `PT_E2E_ENABLED`,
and `PT_PLAN_START_E2E_ENABLED` with their isolated resettable fixtures.

The narrower Phase 3 browser journey is enabled separately with
`PT_RELATIONSHIP_E2E_ENABLED=true`. It needs the dedicated trainee/trainer
credentials plus `PT_E2E_TRAINER_NAME`, `PT_E2E_TRAINEE_NAME`, and a private
`PT_E2E_COMPLETED_WORKOUT_MARKER`. It covers directory request, trainer
acceptance, default-closed categories, from-now workout consent, trainer-visible
consent metadata without results, revoke, audit history, and relationship end.

For formal release evidence, use the strict runner after exporting every
fixture variable above and the separate plan-start fixture:

```bash
PT_E2E_CONFIRM_DISPOSABLE_TARGET=yes npm run test:pt:e2e:release
```

The runner validates all variables before Playwright starts, forces every
feature gate on so a skipped suite cannot look green, rejects remote plaintext
HTTP, and refuses the known production application URL. It is intentionally
usable only against localhost or an isolated, resettable HTTPS test target.

## Load contract

Install [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) on the load
runner and use a non-production environment with production-like data volume.
The default profile exercises the authenticated directory for two minutes at
10 requests/second. Dedicated consent-scoped fixtures opt into the calendar
and completed-result scenarios by providing their path variables:

- directory: 10 requests/second;
- exercise library: 10 requests/second;
- trainee connections: 8 requests/second (opt in with a path);
- client calendar: 15 requests/second; and
- completed results: 10 requests/second.

`.claude/test_trainer-load-contract.mjs` keeps this profile read-only and pins
its arrival-rate executors, authentication-cookie separation, redirect denial,
fixture-marker checks, dropped-iteration gate, and every p95/p99/error/check
threshold even on machines where the k6 binary is unavailable.

Required variables:

```bash
PT_LOAD_BASE_URL=https://test.example \
PT_LOAD_DIRECTORY_PATH='/trainers?q=strength' \
PT_LOAD_EXERCISES_PATH='/routines' \
PT_LOAD_TRAINEE_COOKIE='sb-...=...' \
PT_LOAD_DIRECTORY_MARKER='Approved Trainer' \
npm run test:pt:load
```

The Phase 3 connection read surface can be enabled independently:

```bash
PT_LOAD_CONNECTIONS_PATH='/connections' \
PT_LOAD_CONNECTIONS_MARKER='Connections and consent' \
PT_LOAD_CONNECTIONS_RPS=8 \
npm run test:pt:load
```

For the live relationship/result routes, add:

```bash
PT_LOAD_CLIENT_CALENDAR_PATH='/trainer/clients/<fixture-id>?view=calendar' \
PT_LOAD_CLIENT_RESULTS_PATH='/trainer/clients/<fixture-id>?view=results' \
PT_LOAD_TRAINER_COOKIE='sb-...=...' \
PT_LOAD_CALENDAR_MARKER='Client calendar' \
PT_LOAD_RESULTS_MARKER='Completed workouts' \
npm run test:pt:load
```

Initial gates are under 1% HTTP failures, no dropped iterations, over 99%
checks, and these latency limits:

| Surface | p95 | p99 |
|---|---:|---:|
| Directory | 600 ms | 1,200 ms |
| Exercise library | 650 ms | 1,300 ms |
| Trainee connections | 700 ms | 1,400 ms |
| Client calendar | 800 ms | 1,500 ms |
| Completed results | 900 ms | 1,800 ms |

These are starting service objectives, not measurements. Record a baseline on
production-like infrastructure, then adjust with evidence. Do not relax a
threshold merely to make a regression pass. Keep write/contention tests in a
disposable environment with idempotency keys; the shared load suite is
read-only by design.

## Release gate

A PT release requires:

1. unit + TypeScript + lint green;
2. Supabase/RLS tests green with real actor JWTs;
3. Playwright green with zero skipped PT tests;
4. migration reset/backfill reconciliation green;
5. load thresholds green on the release candidate; and
6. no raw workout/bodyweight response or trace containing data outside the
   actor's current grant; and
7. `npm audit --audit-level=high` green, with any accepted lower-severity
   upstream advisory recorded in the architecture risk register.

## 2026-07-14 final local release evidence

The final candidate was rebuilt from an empty local database, not an evolved
developer schema:

- all ten migrations applied successfully on repeated `supabase db reset`
  runs, followed by the 19-actor fixture seed;
- the complete unit command ran 764 tests: 763 passed and one intentional
  timezone-environment sanity check skipped; the separate data-access,
  filter, and migration commands passed 5/5, 11/11, and 35/35;
- 13/13 real-JWT integration checks passed: 4 directory, 7 delegated result,
  1 planning/concurrency, and 1 relationship/consent scenario;
- the strict production-build Playwright run passed 8/8 with no skips or
  retries, including the unchanged established consent journeys plus the new
  responsive/accessibility coverage; and
- a Dockerized k6 run completed 273 authenticated requests and 1,092 content
  checks across directory, trainee connections, client calendar, and completed
  results with 0 failures and 0 dropped iterations. Surface p95 latency ranged
  from 63.35 ms to 76.29 ms on the local stack, below every pinned threshold.

TypeScript and the production build completed successfully. ESLint reported 0
errors and 35 pre-existing warnings; none originated in the PT release files.
`npm audit --audit-level=high` passed while continuing to report the two
documented moderate PostCSS advisories pinned transitively by Next.js.

During the sequential browser run, tracing found a real navigation race caused
by calendar prefetch through Server Actions. The read path was moved to an
authenticated no-store Route Handler and guarded by a unit contract; the same
strict Playwright suite then passed from a fresh reset. Failure artifacts were
used diagnostically and contain only disposable local actors.
