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
- `proxy.ts` protects `/dashboard`, `/routines`, `/workout` — unauthenticated users redirected to `/`
- Authenticated users redirected away from `/` to `/dashboard`
- Dashboard reads session server-side, shows avatar + name + sign-out button
- Sign-out via Server Action
- Registration gated by `REGISTRATION_ENABLED` env var (currently `false`)
  - New signups blocked at `/auth/callback`, redirected with `?error=registration_disabled`
  - Existing users unaffected

### Tables — all created and verified
- `exercises` — RLS: authenticated users can read; array columns `text[]`; `equipment` added manually
- `workouts` — RLS: users manage their own
- `sets` — RLS: users manage their own
- `routines` — RLS: users read presets + their own; write only their own
- `routine_exercises` — RLS: all authenticated users can read; users manage their own
- `scheduled_workouts` — RLS: users manage their own

### Exercises seed
- 873 exercises seeded from `yuhonas/free-exercise-db`
- Data stored locally at `scripts/exercises.json` (committed to repo)
- Run: `npx tsx scripts/seed-exercises.ts` (requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`)

### Known gotchas
- `exercises.id` and `workouts.id` are `bigint` (Table Editor default) — foreign keys must match
- Schema cache may need refresh after column changes: `notify pgrst, 'reload schema';`

## Phase 3 — Complete

### Architecture decisions
- **Data Access Layer** (`src/lib/dal.ts`) — all DB queries live here, auth checked inside each function
- **Server Actions** verify auth internally (proxy alone is not sufficient per Next.js 16 docs)
- `params` and `searchParams` are `Promise` in Next.js 16 — must be `await`-ed in page components
- Only the workout logger (`WorkoutLogger.tsx`) is a Client Component; everything else is Server Components

### Routes
| Route | Type | Description |
|---|---|---|
| `/` | Server | Sign-in page (Google SSO) |
| `/dashboard` | Server | Recent workouts + start workout + browse link |
| `/routines` | Server + Client | Exercise browser with search + category filter |
| `/routines/[id]` | Server | Exercise detail (muscles, instructions, images) |
| `/workout/[id]` | Server + Client | Active workout logger |

### Core features implemented
- **Dashboard** — shows today's date, last 5 workouts with set counts, Start Workout + Browse Exercises buttons
- **Exercise browser** (`/routines`) — searchable, filterable by category, 873 exercises
- **Exercise detail** (`/routines/[id]`) — image, category, equipment, primary/secondary muscles, step-by-step instructions
- **Workout logging** (`/workout/[id]`) — start workout creates DB row, add sets (exercise + weight + reps), delete sets, finish returns to dashboard; resumable (pre-loads existing sets on page load)

## Next Steps

- Scheduling: assign routines to specific dates (`scheduled_workouts` table is ready)
- Preset routines: seed the `routines` and `routine_exercises` tables
- Trainer/admin features (see `examples/admin-groups.md`)
