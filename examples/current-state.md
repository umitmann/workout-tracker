# Current Working State

## Phase 1 — Complete
- Next.js project initialized at `~/Documents/workout-tracker`
- GitHub repo: https://github.com/umitmann/workout-tracker
- Vercel auto-deploy connected: https://workout-tracker-six-flame.vercel.app
- Supabase project connected (`https://ohhyblgvpztennjidvad.supabase.co`)
- Google SSO working via Supabase Auth
- Auth callback route: `/auth/callback` → redirects to `/dashboard`

---

## Phase 2 — Complete

### Auth
- `proxy.ts` protects `/dashboard`, `/routines`, `/workout`, `/workouts` — unauthenticated users redirected to `/`
- Authenticated users redirected away from `/` to `/dashboard`
- Dashboard reads session server-side, shows avatar + name + sign-out button
- Sign-out via Server Action
- Registration gated by `REGISTRATION_ENABLED` env var (currently `false`)

### Tables — all created and verified
- `exercises` — RLS: authenticated users can read; array columns `text[]`
- `workouts` — RLS: users manage their own; has `status` and `template_id` columns (see Phase 4)
- `sets` — RLS: users manage their own
- `routines` — RLS: users read presets + their own; write only their own
- `routine_exercises` — RLS: all authenticated users can read; users manage their own; has `weight` column (see Phase 4)
- `scheduled_workouts` — RLS: users manage their own (unused — superseded by `workouts.status`)

### Exercises seed
- 873 exercises seeded from `yuhonas/free-exercise-db`
- Data stored locally at `scripts/exercises.json` (committed to repo)
- Run: `npx tsx scripts/seed-exercises.ts` (requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`)

### Known gotchas
- `exercises.id` is `bigint` — foreign keys in `sets` and `routine_exercises` must also be `bigint`
- Schema cache may need refresh after column changes: `NOTIFY pgrst, 'reload schema';`
- `params` and `searchParams` are `Promise` in Next.js 16 — must be `await`-ed in page components

---

## Phase 3 — Complete

### Architecture decisions
- **Data Access Layer** (`src/lib/dal.ts`) — all DB queries live here, auth checked inside each function
- **Server Actions** verify auth internally (proxy alone is insufficient per Next.js 16 docs)
- `getAllExercises()` wrapped with `unstable_cache` using a service-role Supabase client (no cookies) — DB hit once per server lifetime; `use cache` was tried but blocked by `cookies()` inside the cached scope
- Exercise details fetched lazily per-click via `getExerciseDetails(id)` server action — avoids loading heavy data for all 873 exercises upfront

### Routes (Phase 3)
| Route | Type | Description |
|---|---|---|
| `/` | Server | Sign-in page (Google SSO) |
| `/dashboard` | Server + Client | Calendar view + start workout |
| `/routines` | Server + Client | Exercise browser with search + category filter |
| `/routines/[id]` | Server | Exercise detail (muscles, instructions, images) |
| `/workout/[id]` | Server + Client | Active workout logger |

### Shared components
- `ExercisePickerSheet.tsx` — bottom sheet with search; used by WorkoutLogger and TemplateEditor
- `ExerciseInfoModal.tsx` — full-screen modal with image carousel, muscles, instructions, and history chart tab

---

## Phase 4 — Complete

### Schema migrations (run once in Supabase SQL editor)
```sql
-- Add planned weight to routine exercises
ALTER TABLE routine_exercises ADD COLUMN weight numeric;

-- Add status lifecycle and template linkage to workouts
ALTER TABLE workouts ADD COLUMN status text NOT NULL DEFAULT 'in_progress';
ALTER TABLE workouts ADD COLUMN template_id bigint REFERENCES routines(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
```

### All routes
| Route | Type | Description |
|---|---|---|
| `/` | Server | Sign-in page |
| `/dashboard` | Server + Client | Calendar view, month navigation, start/schedule/log workouts |
| `/routines` | Server + Client | Exercise browser |
| `/routines/[id]` | Server | Exercise detail |
| `/workout/[id]` | Server + Client | Active workout logger |
| `/workouts` | Server | Workout template list |
| `/workouts/new` | Server + Client | Create template |
| `/workouts/[id]` | Server + Client | Edit template |

### Features

**Dashboard — calendar view**
- Replaced recent-workouts list with a full monthly calendar (`CalendarView.tsx`)
- Month navigation via `?y=&m=` search params (prev/next arrows)
- Each day shows workout status: planned (border), in_progress (filled), completed (filled + checkmark)
- Tapping a past/today empty day → options to log a workout or schedule one from a template
- Tapping a planned day → "Start" button transitions it to in_progress and redirects to logger
- Tapping an in_progress day → resumes the logger
- "Start workout", "Templates", "Exercises" buttons in header

**Workout templates (`/workouts`)**
- Create/edit/delete named templates
- Each template has a list of exercises with planned sets count, reps, and weight
- "Start now" on a template: saves template, creates a workout, pre-populates sets from planned values, redirects to logger
- "Save" saves without starting
- Template list shows exercise count; delete button per row

**Workout logger (`/workout/[id]`)**
- Sets held entirely in client state (`LocalSet[]`) until explicitly saved
- "Save" button: saves sets to DB without completing (stays `in_progress`); warns user on first save that this is a mid-session save, not a finish
- "Done" button: saves sets and marks workout as `completed`; redirects to dashboard
- "← Back" opens an abandon prompt — confirming deletes the workout row and redirects
- Inline set editing: tap a set chip to edit weight/reps; Enter or ✓ to confirm, ✕ to cancel
- "Load template" button: lazy-fetches user's templates; selecting one expands `routine_exercises` into `LocalSet[]` (N sets per exercise)
- `i` button per exercise group: lazy-fetches full exercise data and opens `ExerciseInfoModal`
- `beforeunload` handler prevents accidental tab close when sets are unsaved

**Exercise info modal**
- Tabs: Info (image carousel, equipment, muscles pills, instructions) and History
- History tab: lazy-fetches `getExerciseHistory()` for the last 90 days of completed workouts
- History chart: SVG polyline with dot markers; toggles between max weight and total volume
- Handles single-data-point case (shows value + date instead of chart)

### Key server actions (`src/app/actions/workouts.ts`)
| Action | Description |
|---|---|
| `startWorkout()` | Creates `in_progress` workout for today, redirects to logger |
| `startWorkoutFromTemplate(templateId)` | Creates workout, pre-populates sets from template, redirects |
| `logWorkoutForDate(date, templateId?)` | Creates `in_progress` workout for any past/today date |
| `scheduleWorkout(date, templateId?)` | Creates `planned` workout for a future date |
| `startPlannedWorkout(workoutId)` | Transitions `planned` → `in_progress`, pre-populates sets, redirects |
| `saveWorkoutProgress(workoutId, sets[])` | Bulk-replaces sets, keeps status `in_progress`, no redirect |
| `completeWorkout(workoutId, sets[])` | Bulk-replaces sets, sets status `completed`, redirects to dashboard |
| `deleteWorkout(workoutId)` | Deletes workout row (and cascade-deletes sets), redirects |

### DAL functions (`src/lib/dal.ts`)
| Function | Description |
|---|---|
| `getAllExercises()` | Cached (service-role, revalidate: false) — id, name, category, equipment |
| `getExerciseDetails(id)` | Full exercise data including muscles, images, instructions |
| `getExerciseHistory(id, limitDays?)` | Per-workout max weight + total volume for last N days of completed workouts |
| `getWorkoutWithSets(id)` | Workout row + all sets with exercise name join |
| `getMonthWorkouts(year, month)` | All workouts in a calendar month with status and set count |
| `getUserTemplates()` | User's routines with nested routine_exercises + exercise names |
| `getTemplate(id)` | Single template with full routine_exercises detail |

---

## Known Issues
- None currently tracked.

## Next Steps
- Preset / system-provided routines (seed `routines` with `is_preset = true`)
- Trainer/admin features — assign workouts to clients (see `examples/admin-groups.md`)
- Progress page — overall volume/frequency trends across all exercises
