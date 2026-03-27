# Current Working State

## Phase 1 — Complete
- Next.js project initialized at `~/Documents/workout-tracker`
- GitHub repo: https://github.com/umitmann/workout-tracker
- Vercel auto-deploy connected: https://workout-tracker-six-flame.vercel.app
- Supabase project connected (`https://ohhyblgvpztennjidvad.supabase.co`)
- Google SSO working via Supabase Auth
- Auth callback route: `/auth/callback` → redirects to `/dashboard`

## Phase 2 — In Progress

### Tables created
- `workouts` — with RLS policy (users manage their own)
- `sets` — with RLS policy (users manage their own)
- `exercises` — with RLS policy (authenticated users can read)

### exercises table columns
- `id` (uuid, primary key)
- `created_at` (timestamp)
- `name` (text, not null)
- `category` (text)
- `equipment` (text)
- `muscles` (text[])
- `muscles_secondary` (text[])
- `images` (text[])
- `instructions` (text[])

Note: `muscle_group` was removed in favour of `muscles` and `muscles_secondary`.

### Known Issues to Revisit
- **Toggle confusion in Supabase Table Editor**: Primary key toggle was mistaken for nullable toggle.
  Revisit exercises table columns to confirm:
  - `muscles`, `muscles_secondary`, `images`, `instructions`, `equipment` are nullable
  - None of them accidentally have primary key enabled

### Next Steps (Next Session)

#### 1. Auth — Supabase Login Flow
- Read session on `/dashboard` using `@supabase/ssr`
- Protect `/dashboard` — redirect unauthenticated users to `/`
- Display user info (name, avatar) on dashboard
- Add sign out button

#### 2. Finish Phase 2 — Exercises Seed
- Confirm exercises table column settings are correct (nullable, no wrong toggles)
- Write seed script to fetch from `yuhonas/free-exercise-db` and import into Supabase
- Run seed script and verify data in Table Editor

#### 3. Add Scheduling Tables to Supabase
Create these tables (see `individual-user.md` and `admin-groups.md` for full schema):

**`routines`**
- `id` (uuid, primary key)
- `user_id` (uuid, nullable — null means system/preset routine)
- `name` (text)
- `is_preset` (boolean, default false)
- `created_at` (timestamp)

**`routine_exercises`**
- `id` (uuid, primary key)
- `routine_id` (uuid, references routines)
- `exercise_id` (uuid, references exercises)
- `sets` (integer)
- `reps` (integer)
- `order` (integer)

**`scheduled_workouts`**
- `id` (uuid, primary key)
- `user_id` (uuid, references auth.users)
- `routine_id` (uuid, references routines)
- `scheduled_date` (date)
- `assigned_by` (uuid, nullable — trainer uid if trainer-assigned)
- `workout_id` (uuid, nullable — filled in when completed)
- `created_at` (timestamp)

RLS for scheduling tables:
- `routines`: users can read all presets + their own; write only their own
- `routine_exercises`: readable by all authenticated users
- `scheduled_workouts`: users manage their own rows

#### 4. Move to Phase 3 — Core Features
