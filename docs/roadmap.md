# Roadmap

Planned features and use-cases. Items here are not yet implemented. Each entry should link to a design doc or issue when work begins.

---

## Backlog

### Email notifications for planned workouts

Send a reminder email to the user on the morning of a scheduled (planned) workout.

**Scope:**
- Trigger: a `planned` workout exists for today's date
- Channel: transactional email (e.g. Supabase Edge Function + Resend / SendGrid)
- Opt-in setting per user (default on)
- Email contains: workout date, template name (if any), link to open the logger

**Open questions:**
- Scheduling mechanism: Supabase cron (pg_cron) or external cron hitting an Edge Function?
- Should reminders also fire for in-progress workouts that were not completed by end of day?

---

## Personal Trainer use-case

Enable a *trainer* role that can manage workouts for one or more client users.

### Features

| # | Feature | Notes |
|---|---------|-------|
| PT-1 | **Plan workouts for clients** | Trainer can schedule workouts on a client's calendar, assign templates, set target weights/reps |
| PT-2 | **View other people's workouts** | Trainer dashboard shows all client calendars and completed workout summaries |
| PT-3 | **Grant admin rights to another user** | Owner of an account (or super-admin) can elevate another user to `admin` role, giving full read/write access across all user data |

### Role model

Three roles are envisioned:

| Role | Capabilities |
|---|---|
| `user` | Default. Can only see and modify their own data. |
| `trainer` | Can see and schedule workouts for their assigned clients. Cannot modify client account settings. |
| `admin` | Full read/write across all users. Can assign/revoke trainer relationships and promote other users to admin. |

### Database changes needed

The `scheduled_workouts` table already has `assigned_by uuid` to track trainer-assigned workouts without a migration.

Two new tables will be required:

```sql
-- Maps users to roles
create table user_roles (
  user_id  uuid not null references auth.users on delete cascade,
  role     text not null check (role in ('user', 'trainer', 'admin')),
  primary key (user_id, role)
);

-- Maps trainers to their clients
create table trainer_clients (
  trainer_id  uuid not null references auth.users on delete cascade,
  client_id   uuid not null references auth.users on delete cascade,
  granted_at  timestamptz default now(),
  primary key (trainer_id, client_id)
);
```

RLS policies will need to be extended on `workouts`, `sets`, and `routines` to allow trainers to read/write on behalf of their clients.

> See `docs/database.md` → "Future — Admin & Trainer Tables" for the original note.

---

## Done

| Feature | Merged |
|---|---|
| Monthly calendar view | `main` |
| Exercise history chart (90 days) | `main` |
| Copy / paste workout clipboard | `dev` |
| Performance modals: last session, best session, best · 60 days | `dev` |
| Calendar day popup with workout overview + copy icon | `dev` |
