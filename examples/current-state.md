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
- **Dashboard** — shows today's date, last 5 workouts with set counts, Start Workout + Workouts + Browse Exercises buttons
- **Exercise browser** (`/routines`) — searchable, filterable by category, 873 exercises
- **Exercise detail** (`/routines/[id]`) — image, category, equipment, primary/secondary muscles, step-by-step instructions
- **Workout logging** (`/workout/[id]`) — sets held client-side until Finish (bulk-inserted on save); add/edit/delete sets inline; load template to pre-populate; abandon prompt on back navigation; `i` info button per exercise
- **Workout templates** (`/workouts`) — create/edit/delete named templates with planned exercises, sets, reps, and weight; import into active workout via "Load template"
- **Exercise info modal** — `i` button in workout logger and template editor opens modal with image carousel, muscles pills, and numbered instructions

### Architecture notes (Phase 3 additions)
- `getAllExercises()` cached with `unstable_cache` (service-role client, revalidate: false) — DB hit once per server lifetime
- Exercise info fetched lazily per-click via `getExerciseDetails(id)` server action
- New shared component: `ExercisePickerSheet.tsx` — used by both WorkoutLogger and TemplateEditor
- New component: `ExerciseInfoModal.tsx`

### Phase 4 — Workout templates + deferred persistence (complete)

**Schema change required (run once in Supabase SQL editor):**
```sql
ALTER TABLE routine_exercises ADD COLUMN weight numeric;
NOTIFY pgrst, 'reload schema';
```

**Routes added:**
| Route | Type | Description |
|---|---|---|
| `/workouts` | Server | List user's workout templates |
| `/workouts/new` | Server + Client | Create new template |
| `/workouts/[id]` | Server + Client | Edit existing template |

**New files:**
- `src/app/workouts/page.tsx` — template list with delete
- `src/app/workouts/new/page.tsx` — thin server shell → TemplateEditor
- `src/app/workouts/[id]/page.tsx` — loads template + exercises → TemplateEditor
- `src/app/workouts/[id]/TemplateEditor.tsx` — client component; exercise picker, sets/reps/weight inputs per exercise, save/delete
- `src/app/workout/[id]/ExercisePickerSheet.tsx` — extracted picker shared by logger + editor
- `src/app/actions/templates.ts` — createTemplate, saveTemplateExercises, deleteTemplate, fetchUserTemplates

**Key architectural decisions:**
- Sets are no longer saved immediately to DB; `WorkoutLogger` holds them in `LocalSet[]` state
- `finishWorkout(workoutId, sets[])` bulk-inserts all sets at once, then redirects
- Back navigation in the logger shows an "Abandon workout?" prompt; confirming calls `deleteWorkout` to clean up the empty workout row
- Inline set editing: clicking a set chip enters edit mode (weight/reps inputs + confirm/cancel)
- Template import: "Load template" button fetches user templates lazily, then expands each `routine_exercise` into N `LocalSet` entries (N = planned sets count)

## Known Issues

- **Add button does nothing** — `addSet` server action returns silently. Error is now surfaced below the input row so the actual failure message is visible. Likely cause: RLS policy on `sets` blocking the insert, or a foreign key type mismatch. Needs testing with the error message visible.

## Next Steps

- Resolve Add button issue (check error message now shown in UI)
- Scheduling: assign routines to specific dates (`scheduled_workouts` table is ready)
- Preset routines: seed the `routines` and `routine_exercises` tables
- Trainer/admin features (see `examples/admin-groups.md`)
