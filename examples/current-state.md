# Current Working State

## Phase 1 — Complete
- Next.js project initialized at `~/Documents/workout-tracker`
- GitHub repo: https://github.com/umitmann/workout-tracker
- Vercel auto-deploy connected: https://workout-tracker-six-flame.vercel.app
- Supabase project connected (`https://ohhyblgvpztennjidvad.supabase.co`)
- Google SSO working via Supabase Auth
- Auth callback route: `/auth/callback` → redirects to `/dashboard`

## Phase 2 — Complete

### Auth
- `proxy.ts` protects `/dashboard` — unauthenticated users redirected to `/`
- Authenticated users redirected away from `/` to `/dashboard`
- Dashboard reads session server-side, shows avatar + name + sign-out button
- Sign-out via Server Action
- Registration gated by `REGISTRATION_ENABLED` env var (currently `false`)
  - New signups blocked at `/auth/callback`, redirected with `?error=registration_disabled`
  - Existing users unaffected

### Tables — all created and verified
- `exercises` — RLS: authenticated users can read; array columns confirmed as `text[]`
- `workouts` — RLS: users manage their own
- `sets` — RLS: users manage their own
- `routines` — RLS: users read presets + their own; write only their own
- `routine_exercises` — RLS: all authenticated users can read; users manage their own
- `scheduled_workouts` — RLS: users manage their own

### Known gotcha — id types
Tables created via Supabase Table Editor have `bigint` ids, not `uuid`.
Foreign keys referencing them must match:
- `exercises.id` → `bigint` — `routine_exercises.exercise_id` is `bigint`
- `workouts.id` → `bigint` — `scheduled_workouts.workout_id` is `bigint`
- `routines.id` → `uuid` (created via SQL)

## Phase 3 — Next Steps

### 1. Exercises Seed — Complete
- 873 exercises seeded from `yuhonas/free-exercise-db`
- Data stored locally at `scripts/exercises.json` (committed to repo)
- Seed script: `npx tsx scripts/seed-exercises.ts` (requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`)
- Images stored as full GitHub raw URLs

### 2. Core Features — Next
- Dashboard calendar showing scheduled and completed workouts
- Workout logging flow (start workout → log sets → complete)
- Routine browser (preset + user-created)
