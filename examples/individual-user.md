# Individual User (Current Implementation)

## Use Case

A single user logs in with Google and tracks their own workouts. They can only see and manage their own data. They can also select preset routines and schedule them for specific days.

## Roles

- `user` — default role, full access to their own data, no access to others

## Auth

- Google SSO via Supabase Auth
- Email/password login via Supabase Auth (future: add alongside Google SSO)
- Session managed with `@supabase/ssr`
- Callback route: `/auth/callback`
- Post-login redirect: `/dashboard`

## Schema

### `exercises` table
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | primary key |
| `name` | text | exercise name |
| `category` | text | e.g. 'strength', 'cardio' |
| `equipment` | text | e.g. 'barbell', 'dumbbell' |
| `muscles` | text[] | primary muscles targeted |
| `muscles_secondary` | text[] | secondary muscles |
| `images` | text[] | image URLs |
| `instructions` | text[] | step-by-step instructions |
| `created_at` | timestamp | auto |

### `workouts` table
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | primary key |
| `user_id` | uuid | references auth.users |
| `date` | date | workout date |
| `created_at` | timestamp | auto |

### `sets` table
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | primary key |
| `workout_id` | uuid | references workouts |
| `exercise_id` | uuid | references exercises |
| `user_id` | uuid | references auth.users |
| `weight` | numeric | kg or lbs, null for cardio |
| `reps` | integer | null for cardio |
| `duration_minutes` | numeric | cardio only |
| `distance` | numeric | cardio only, optional |
| `created_at` | timestamp | auto |

### `routines` table (future)
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | primary key |
| `user_id` | uuid | references auth.users (null if preset/system routine) |
| `name` | text | e.g. 'Push Day', 'Full Body A' |
| `is_preset` | boolean | true = system-provided template |
| `created_at` | timestamp | auto |

### `routine_exercises` table (future)
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | primary key |
| `routine_id` | uuid | references routines |
| `exercise_id` | uuid | references exercises |
| `sets` | integer | suggested number of sets |
| `reps` | integer | suggested reps |
| `order` | integer | display order within routine |

### `scheduled_workouts` table (future)
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | primary key |
| `user_id` | uuid | references auth.users |
| `routine_id` | uuid | references routines |
| `scheduled_date` | date | the day it's planned for |
| `workout_id` | uuid | references workouts (null until completed) |
| `created_at` | timestamp | auto |

## Scheduling Flow

1. User browses preset routines or their own saved routines
2. User picks a routine and selects a date on the calendar
3. A row is inserted into `scheduled_workouts`
4. On the dashboard calendar, scheduled days are highlighted differently from completed days
5. When the user starts the workout on that day, a `workouts` row is created and linked back via `workout_id`

## RLS Policies

All tables restrict reads and writes to the authenticated user's own rows:
```sql
-- workouts
auth.uid() = user_id

-- sets
auth.uid() = user_id

-- scheduled_workouts
auth.uid() = user_id
```

`exercises` is a shared read-only library — all authenticated users can read it, only admins can insert.

Preset routines (`is_preset = true`) are readable by all authenticated users. User-created routines are private.
