# Personal trainer test strategy

This strategy verifies the contracts in
[`personal-trainer-architecture.md`](personal-trainer-architecture.md) without
turning every layer into a duplicate of every other layer.

## Test pyramid

| Layer | Purpose | Command |
|---|---|---|
| Pure unit | Directory/application validation and action guards; relationship state machine, permission matrix, date scope, plan lifecycle, snapshot validation | `npm run test:pt:unit` |
| Migration contract | Additive schema, fail-closed ACLs, safe DTOs, hardened RPCs, admin isolation | `npm run test:pt:migration` |
| Directory RLS integration | Real JWTs, owner-only base rows, listing visibility, privilege-escalation denial | `npm run test:pt:directory-rls` |
| Supabase/RLS integration | Real JWTs, raw-table isolation, delegated-results RPC, minimal DTO | `npm run test:pt:rls` |
| Playwright E2E | Current directory/application/admin boundary plus the gated future consent journey | `npm run test:pt:e2e` |
| k6 load | Directory, connected-client calendar, and completed-results read paths | `npm run test:pt:load` |

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

The relationship/result-sharing contract below becomes runnable after those
later migrations are installed.

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
PT_RLS_RANGE_FROM=2026-07-01 \
PT_RLS_RANGE_TO=2026-07-31 \
npm run test:pt:rls
```

The seeded fixture must represent three distinct users: trainee, connected
trainer, and unrelated trainer. The contract deliberately calls Supabase
directly, proving that hiding controls in the browser is not the authorization
boundary. Raw `workouts` remains owner-only; delegated completed results are
available only through `trainer_get_completed_workouts`.

Add fixture automation alongside the executable PT migrations. Do not put a
service-role key in the browser suite or run destructive setup against the
production project.

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

The later connect/assign/grant/revoke/end journey remains separately gated by
`PT_E2E_ENABLED` until its migrations and routes land.

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

The suite is run against a production build or a deployed test environment,
not mocked Server Components. A passing skipped suite is not release evidence;
the deployment job must enable and reject skips for the phase being released
(`PT_DIRECTORY_E2E_ENABLED` now, and `PT_E2E_ENABLED` once the full journey
lands).

## Load contract

Install [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) on the load
runner and use a non-production environment with production-like data volume.
The default, currently runnable profile exercises the authenticated directory
for two minutes at 10 requests/second. Later phases opt into the calendar and
completed-result scenarios by providing their path variables:

- directory: 10 requests/second;
- client calendar: 15 requests/second; and
- completed results: 10 requests/second.

Required variables:

```bash
PT_LOAD_BASE_URL=https://test.example \
PT_LOAD_DIRECTORY_PATH='/trainers?q=strength' \
PT_LOAD_TRAINEE_COOKIE='sb-...=...' \
PT_LOAD_DIRECTORY_MARKER='Approved Trainer' \
npm run test:pt:load
```

After the relationship/result routes land, add:

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
