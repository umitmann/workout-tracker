# Workout Tracker

A Next.js app for tracking workouts, built with Supabase and Google SSO.

- **Live:** https://workout-tracker-six-flame.vercel.app
- **Repo:** https://github.com/umitmann/workout-tracker

## Docs

- [Database setup & SQL](docs/database.md)
- [Individual user schema & flows](examples/individual-user.md)
- [Admin & trainer groups (future)](examples/admin-groups.md)
- [Current build state](examples/current-state.md)

## Stack

- Next.js 16 (App Router)
- Supabase (Postgres + Auth)
- Tailwind CSS v4
- Deployed on Vercel

## Local development

```bash
npm install
npm run dev
```

Copy `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
REGISTRATION_ENABLED=false
```
