# Admin & Trainer Groups (Future Feature)

## Use Case

A personal trainer (admin) should be able to:
- View workout data of clients assigned to them (not all users)
- Schedule workouts/routines for their clients on specific days
- Clients see trainer-assigned workouts on their calendar and can complete them

## Roles

- `user` — default, can only see and manage their own data
- `trainer` — can view client data, schedule workouts for assigned clients
- `super_admin` — can see all data (platform owner only)

## Auth

- Same as individual user: Google SSO or email/password via Supabase Auth
- Role is determined by the `roles` table, not the auth provider

## Proposed Schema

### `roles` table
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | primary key |
| `user_id` | uuid | references auth.users |
| `role` | text | 'user' / 'trainer' / 'super_admin' |

### `trainer_clients` table
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | primary key |
| `trainer_id` | uuid | references auth.users |
| `client_id` | uuid | references auth.users |
| `created_at` | timestamp | auto |

### `scheduled_workouts` table (shared with individual user)
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | primary key |
| `user_id` | uuid | the client who will do the workout |
| `routine_id` | uuid | references routines |
| `scheduled_date` | date | the day it's planned for |
| `assigned_by` | uuid | references auth.users (null if self-scheduled, trainer uid if assigned) |
| `workout_id` | uuid | references workouts (null until completed) |
| `created_at` | timestamp | auto |

## Trainer Scheduling Flow

1. Trainer opens a client's profile via `/trainer/[clientId]/dashboard`
2. Trainer picks a routine and selects a date on the client's calendar
3. A row is inserted into `scheduled_workouts` with `user_id = clientId` and `assigned_by = trainerUid`
4. Client sees the scheduled workout on their own dashboard calendar (highlighted differently)
5. Client completes it normally — `workout_id` gets filled in on completion

## RLS Approach

- Users can only read/write their own rows
- Trainers can read workouts/sets for assigned clients:
  ```sql
  EXISTS (
    SELECT 1 FROM trainer_clients
    WHERE trainer_id = auth.uid()
    AND client_id = workouts.user_id
  )
  ```
- Trainers can INSERT into `scheduled_workouts` for assigned clients:
  ```sql
  EXISTS (
    SELECT 1 FROM trainer_clients
    WHERE trainer_id = auth.uid()
    AND client_id = scheduled_workouts.user_id
  )
  ```
- Trainers cannot edit or delete a client's completed workout data
- Super admin bypasses RLS via service role key (never exposed to client)

## Notes

- Trainer assignment is explicit via invite flow, not self-serve
- Clients can see who assigned a scheduled workout via `assigned_by`
- Trainer view is read-only for historical data, write-only for scheduling
- Consider a separate `/trainer/[clientId]/dashboard` route for trainer view
