# Workout Tracker

A Next.js app for tracking workouts, built with Supabase and Google SSO.

- **Live:** https://workout-tracker-six-flame.vercel.app
- **Repo:** https://github.com/umitmann/workout-tracker

## Docs

- [Database setup & SQL](docs/database.md)
- [Individual user schema & flows](examples/individual-user.md)
- [Personal trainer architecture & migration plan](docs/personal-trainer-architecture.md)
- [Personal trainer test strategy](docs/personal-trainer-test-plan.md)
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

## Testing

Three tiers, from fastest/no-infra to slowest/full-infra:

1. **Unit tests** — pure `node --test` files under `.claude/test_*.mjs`, no
   network, no Supabase, no dev server:
   ```bash
   npm run test:unit
   npm run test:pt:unit
   npm run test:filters
   npm run test:pt:migration
   ```
2. **CI** — `.github/workflows/ci.yml` runs the high-severity dependency audit,
   lint, TypeScript, unit/data-access, and filter suites on every push and pull
   request. This tier needs **no secrets** — it never talks to Supabase or a
   dev server.
3. **Playwright behaviour checklist** — `.claude/verify_checklist.mjs` (plus
   the other `.claude/test_*.mjs` Playwright suites) drives a real browser
   against a running dev server with an authenticated session. This tier is
   written and left runnable (see `docs/test-plan.md` rule 3) but is **not**
   part of the `ci.yml` job above, because it needs a live app + Supabase
   project. To run it:

   ```bash
   npm run dev   # in one terminal

   # in another terminal, once you have a seeded Supabase test account:
   SUPABASE_TEST_EMAIL=you@example.com \
   SUPABASE_TEST_PASSWORD=yourpassword \
   SUPABASE_TEST_BASE_URL=http://localhost:3000 \
     node .claude/bootstrap-auth.mjs   # or: npm run test:auth-bootstrap

   npm run test:checklist
   ```

   `bootstrap-auth.mjs` is the non-interactive counterpart to the older
   `setup-auth.mjs` (`npm run test:auth-setup`, which reads credentials from
   `.env.local` and is meant for local one-off use): it takes its contract
   entirely from the `SUPABASE_TEST_*` env vars above, reads no `.env.local`
   file, prompts for nothing, and exits non-zero on any failure — so it can
   run unattended once those three variables are set as CI secrets against a
   seeded ephemeral (or dedicated test) Supabase project and app deployment.
   Provisioning that seeded Supabase project/account and wiring the secrets
   into a CI job is a follow-up infrastructure step, not covered by this
   repo's current CI workflow.
