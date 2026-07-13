# ADR-0005: Calendar dates use the user's local day, never UTC

**Status:** Accepted — implemented 2026-07-09 (see docs/quality-survey-2026-07-09.md § Resolution)
**Date:** 2026-07-09
**Source:** [Quality survey 2026-07-09](../quality-survey-2026-07-09.md) finding H2

## Context
"Today" and every date-range boundary are computed as
`new Date().toISOString().split('T')[0]` — the **UTC** date — in at least nine places:
`actions/workouts.ts:75,93`, `actions/bodyweight.ts:18`, `actions/reports.ts:12,22`,
`lib/dal.ts:340,395`, `CalendarView.tsx:86`, `TemplateEditor.tsx:58`,
`BodyweightCard.tsx:16`.

For a user west of UTC (Americas), the evening is already "tomorrow" in UTC:

- "Start workout" at 7 pm local creates a workout dated tomorrow.
- The calendar highlights tomorrow's cell as today, and `dateStr > today`
  misclassifies cells as future/past — which flips the checklist §3.3–3.8 behaviour
  between "log now" (in_progress) and "schedule" (planned).
- History/best-session ("last 60/90 days") and report windows are off by a day at the
  boundary.

Additionally, server-computed "today" uses the *server's* clock (UTC on Vercel), so no
server-side fix alone can know the user's local day.

## Decision
The **client's local calendar day** is the source of truth for all workout, bodyweight,
and calendar dates.

1. Add a small helper `localDateStr(d = new Date()): string` (built from
   `getFullYear/getMonth/getDate`, zero-padded) in `src/lib` — the only sanctioned way
   to produce a `YYYY-MM-DD` from a `Date`. `toISOString().split('T')[0]` is banned for
   calendar dates.
2. Server actions never default to "today" themselves: the client always passes the
   date explicitly (`startWorkout(date)`, `logBodyWeight(weight, date)`, report
   from/to). Server-side date validation stays (format check), but the value originates
   client-side.
3. Range queries in `dal.ts` derive their `since` boundary from a caller-supplied local
   date where the semantics are user-facing ("last 60 days" of *my* days).

## Consequences
- **Positive:** an 11 pm set lands on the day the user experienced; calendar
  today-highlight, past/future classification, and report windows become correct in
  every timezone. `localDateStr` is trivially unit-testable with a fixed `Date`.
- **Negative:** touches every call site listed above; server actions gain a required
  parameter (breaking their internal signatures). Existing rows keep their (possibly
  shifted) historical dates — no backfill; the error is at most one day and not
  distinguishable after the fact.
- **Note:** `buildReport`'s `fmtDateLong(iso + 'T00:00:00')` already parses as local
  time deliberately — this decision aligns the rest of the app with it.

## Alternatives considered
- **Store timestamps (timestamptz) and derive dates at render** — rejected: the domain
  is calendar-day-based (one workout *day*); migrating `workouts.date` and every query
  is far more invasive than fixing the day computation.
- **Store the user's IANA timezone in a profile and compute server-side** — deferred:
  correct but adds profile plumbing; passing the client-computed local date achieves
  the same result with less machinery. Revisit if server-initiated features (e.g. the
  roadmap's reminder emails) need to know the user's "today".
