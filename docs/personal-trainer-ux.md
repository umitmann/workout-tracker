# Personal trainer UX analysis and product design

**Status:** implementation and QA source of truth

**Date:** 2026-07-14
**Scope:** authenticated app shell, trainer discovery, bilateral connection,
workout assignment, trainee plan review/start, permission management, trainer
result review, and platform review.

## What this analysis is grounded in

This is a heuristic and implementation analysis, not a claim of completed user
research. It combines:

- inspection of every current trainer, connection, dashboard, plan, and admin
  route;
- a mobile viewport review of the deployed application;
- the established behavior and authorization specifications;
- the live Phase 2–6 database contracts;
- WCAG 2.2 interaction and target-size requirements; and
- common service-design principles for consent-heavy, multi-role products.

The existing behavior specs are release contracts. The redesign adds clearer
paths and presentation around them; it does not weaken or rewrite their
authorization behavior.

## Product outcome

The experience should answer four questions immediately:

1. **What should I do next?**
2. **Who am I acting as here—trainee, trainer, or platform reviewer?**
3. **What information is visible to the other person right now?**
4. **What happens to an assigned plan or shared result if the relationship
   changes?**

The north-star experience is a calm training workspace, not an administration
panel. Security is visible in plain language at the point where a user makes a
decision, without forcing them to understand database roles or policies.

## Heuristic findings

### 1. The original information architecture was capability-first, not task-first

The dashboard exposed a row of equally weighted pills: templates, exercises,
trainers, trainee connections, trainer requests, and administration. This made
every destination look equally urgent and required users to remember where a
task lived.

**Impact:** high. Starting a workout—the primary recurring job—competed with
rare administration tasks. Trainer work also had no destination beyond a
request list.

**Resolution:** a persistent, role-aware shell now separates:

- Home / today's next action;
- reusable workout plans;
- the exercise library;
- the trainee's coaching relationship;
- the trainer's client workspace; and
- platform administration when authorized.

Mobile navigation contains at most five primary destinations. Secondary
destinations stay in page-level calls to action or the desktop rail.

### 2. Trainer functionality stopped after consent

The shipped UI could discover a trainer, request a connection, accept it, and
record permissions. It could not schedule a plan, show the plan to the trainee,
or present consent-scoped results to the trainer. The interface also said that
result reading was disabled after the database capability had been installed.

**Impact:** critical. The main customer value proposition ended halfway through
the journey.

**Resolution:** the interface now completes the Phase 4–6 loop:

```text
find trainer → connect → trainer client workspace → assign fixed plan
     → trainee reviews plan → trainee starts/logs → optionally shares result
     → trainer reviews completed result → trainee revokes or ends at any time
```

### 3. The plan and the performed workout lacked a clear mental separation

Users previously saw “planned” workouts mixed with performed workouts. A
trainer prescription needs different language and affordances from a result:
one is intent; the other is an owned health record.

**Impact:** high. It was unclear whether editing a template could change a
scheduled session and whether the trainer could edit the result.

**Resolution:** plan surfaces consistently state that:

- assignment creates a fixed snapshot;
- later template edits cannot change it;
- only the trainee can start and perform it;
- the resulting workout is owned by the trainee; and
- trainers never receive result-write controls.

### 4. Consent was technically strong but cognitively dense

The original connection card displayed both category forms, history scopes,
status badges, relationship actions, and audit navigation at once. The copy was
accurate but read like an implementation note.

**Impact:** high for comprehension. Users could perform the correct operation
but had to scan too much to understand the current state.

**Resolution:** the redesigned hierarchy is:

1. relationship status;
2. explicit “connection is not consent” explanation;
3. one primary **Manage access** action with both categories side by side;
4. independent advanced category controls retained for the established
   behavior contract; and
5. destructive relationship termination separated visually and confirmed in
   a focus-managed dialog.

Workout results and bodyweight remain separate switches. Neither is selected by
default. In-progress workouts are explicitly named as private.

### 5. “No data” and “no permission” were not distinguishable

For a trainer, an empty results area can mean several different things:

- the trainee did not grant access;
- access was revoked between render and read;
- the relationship ended;
- access is valid but no completed workouts exist; or
- an authorized read failed.

**Impact:** high. Ambiguous empty states can create pressure on a trainee to
share information or lead the trainer to assume a technical problem.

**Resolution:** the client workspace has separate states:

| State | UX response |
|---|---|
| Relationship pending | Planning and result surfaces stay closed |
| Relationship ended | “Access ended”; no scheduling control |
| Category private/revoked | “Results are not shared” / “Bodyweight is not shared” |
| Grant active, zero rows | “Access is active, but there are no…” |
| Authorized read fails closed | Same non-disclosing unavailable state; no raw error |
| Data available | Completed-only summary and bounded detail |

The trainee plan agenda follows the same distinction: a plan-service failure
shows **Plans temporarily unavailable** while the workout calendar and owned
history remain usable. Each opened plan mounts its own action state, so an
error from one start/cancel attempt cannot appear on another prescription.

### 6. Visual hierarchy and brand expression were too generic

The original sign-in page and authenticated pages used default white/zinc
surfaces, centered forms, and many uppercase orange buttons. Spacing and
containers were consistent enough to function but did not communicate a
distinct product or a hierarchy of action.

**Impact:** medium. The product felt like a collection of utilities rather
than one training environment.

**Resolution:** the visual system uses:

- warm neutral canvas and near-black ink;
- orange as an action/accent color rather than the color of every control;
- dark high-contrast hero surfaces for the dominant action;
- restrained borders and shadows for grouping;
- Geist throughout instead of falling back to Arial;
- compact uppercase eyebrows for orientation, not long button labels; and
- larger editorial headings with plain-language supporting copy.

### 7. Navigation and dialogs had inconsistent accessibility support

Several pages created their own header and back link. The connection end dialog
had ARIA attributes but no shared focus trap or focus restoration.

**Impact:** high for keyboard and assistive-technology users.

**Resolution:** authenticated surfaces use one shell with:

- a skip link;
- `main` landmark and deterministic content target;
- primary navigation labels;
- `aria-current="page"`;
- text plus icon navigation;
- parenthesized notification counts in accessible names;
- 44px-or-larger hit areas; and
- safe-area-aware mobile bottom navigation.

New and updated dialogs use the existing tested `Modal` primitive for focus
entry, trapping, Escape behavior, focus restoration, and destructive-backdrop
protection.

### 8. The layout did not make good use of larger screens

Most screens were constrained to a single narrow column even when their
information naturally split into a primary task and supporting context.

**Impact:** medium. Desktop users scrolled through information that could be
scanned side by side, while mobile users did not gain anything from the narrow
desktop constraint.

**Resolution:** layouts remain single-column on mobile and progressively split
on wider screens:

- dashboard: plans/calendar plus progress/coaching context;
- directory: results plus “how it works” guidance;
- trainer workspace: client calendar/results plus permission status;
- profile editor: form plus publishing/safety guidance; and
- admin review: application queue plus review standard.

## User and role models

### Trainee

**Job:** complete the right workout with minimal friction while retaining
control of personal data.

Key needs:

- see today's most relevant action first;
- understand who assigned a workout and what was prescribed;
- know that the prescription cannot silently change;
- start it once and land directly in the logger;
- understand the current sharing state without reading policy language; and
- revoke or end without contacting support.

### Trainer

**Job:** plan for a known client and learn from the subset of results that
client intentionally shares.

Key needs:

- separate pending requests from active clients;
- move from client list to one relationship-scoped workspace;
- assign from an owned reusable template;
- see upcoming assignments without access to the trainee's raw tables;
- distinguish private results from an empty shared history; and
- never mistake connection status for consent.

### Platform administrator

**Job:** maintain directory trust without becoming a health-data super-user.

Key needs:

- review only public listing fields;
- make approval state legible;
- never see account email or trainee data in the review surface; and
- retain a clear boundary between directory authority and delegated access.

## Information architecture

```text
Home
├── Start workout
├── Upcoming assigned plans
├── Training calendar
├── Bodyweight
└── Coaching entry points

Plans
├── Reusable templates
├── Create/edit template
└── Paste/import

Exercises
├── Search/filter
└── Exercise detail

My PT (trainee role)
├── Current/pending connections
├── Manage access
└── Consent/audit history

Clients (trainer role)
├── Requests
├── Active client list
└── Client workspace
    ├── Overview
    ├── Client calendar / assignment
    └── Completed results / bodyweight

Find a PT
├── Directory search
├── Trainer profile
└── Request connection

Admin (authorized only)
└── Trainer listing review
```

## Critical interaction contracts

### Assignment

1. The schedule control is present only for an active trainer-side
   relationship.
2. The trainer chooses one owned, non-preset template and a valid date.
3. Optional title and notes are bounded in the browser and revalidated in the
   Server Action and database.
4. Success explains that a fixed snapshot was created.
5. The trainee sees date, title, trainer attribution, notes, exercises, targets,
   tempo, and rest without receiving access to the trainer's routine row.

### Starting a plan

1. Only a scheduled plan owned by the current trainee exposes **Start
   workout**.
2. The start operation is database-serialized and returns one linked workout.
3. The UI follows that ID directly to the logger.
4. An empty newly started workout hydrates from the immutable snapshot.
5. Once any results exist, saved results—not the prescription—are the logger's
   source of truth.

### Result sharing

1. Both categories start off.
2. Each category has an independent history scope.
3. The trainer interface reads completed workouts only.
4. Bodyweight requires its own grant and its own RPC.
5. Revocation and relationship end are checked again on every database call.
6. The browser never receives raw relationship, workout, set, bodyweight, auth
   user, or grant table rows.

## Content design rules

- Prefer the user's task: “Schedule workout,” not “Create plan snapshot.”
- Explain consequences before the decision, especially for consent and
  destructive actions.
- Use “private,” “shared,” and “revoked” consistently.
- Never imply that the application is medical care or that a trainer has
  platform-wide authority.
- Avoid celebratory language for sharing more data. Both sharing and keeping
  data private are valid states.
- Pair empty states with the relevant next action, but do not pressure the user
  to connect or grant access.

## Visual and interaction system

### Tokens

- Canvas: warm neutral `#f7f6f2`; dark `#0d100e`
- Ink: `#1c211d`; dark `#f2f4f0`
- Brand/action: AA-safe burnt orange `#c2410c`; stronger hover `#9a3412`
- Success: emerald, used for active/shared/completed state only
- Warning/pending: amber
- Destructive/revocation: red, reserved for explicit destructive controls

### Shape and spacing

- primary panels: 24–28px radius;
- controls: 12–16px radius;
- minimum interactive target: 44px, primary touch controls 48–56px;
- mobile page gutter: 20px;
- desktop content width: route-dependent, up to 80rem; and
- spacing follows a 4px base with 12/16/20/24/32px dominant intervals.

### Responsive behavior

- 360px is the narrow QA floor;
- mobile uses bottom navigation and bottom-sheet dialogs;
- desktop uses a persistent left rail and centered content canvas;
- tables become stacked definition lists/cards where horizontal comparison is
  not essential; and
- no primary action relies on hover.

## Accessibility acceptance criteria

- Unique page title and one descriptive page-level heading.
- Landmarks and a working skip link.
- Accessible navigation names and current-page state.
- No icon-only control without a name.
- Minimum 44x44 CSS-pixel target for primary and destructive actions.
- Dialog focus enters, remains trapped, closes with Escape when safe, and
  returns to its trigger.
- Destructive dialogs do not dismiss through an accidental backdrop tap.
- Status feedback uses polite live regions; blocking errors use alerts.
- Text and control contrast target WCAG 2.2 AA.
- Meaning is never communicated by color alone.
- Animations respect `prefers-reduced-motion`.
- 200% zoom and 360px layouts have no document-level horizontal overflow.

## QA matrix

| Surface | Functional | Authorization | UX/a11y | Responsive |
|---|---|---|---|---|
| Sign in | email/OAuth entry | redirect/session | labels, tabs, errors | mobile + desktop |
| Directory | search/filter/page | approved listings only | empty/error/result count | 360/390/1280 |
| Connection | request/accept/end | participant only | status, confirm, live feedback | mobile + desktop |
| Access | grant/update/revoke | trainee only | independent controls, consequence copy | bottom sheet + desktop dialog |
| Assignment | routine/date/copy | active approved trainer | bounded form, pending/success/error | bottom sheet + desktop dialog |
| Plan review | attribution/detail | trainee/eligible assigning trainer | immutable copy, one start CTA | mobile + desktop |
| Client results | list/detail/bodyweight | active relationship + exact grant | private vs empty vs data | stacked cards |
| Admin | filter/review | platform admin only | authority boundary copy | mobile + desktop |

## Measurement after release

Instrument only product events, never health payloads:

- directory search to profile-view rate;
- profile view to request rate;
- request to bilateral activation rate and time;
- active client to first assignment rate;
- assignment to trainee plan-open and plan-start rate;
- permission-management completion and revocation rate;
- result view availability state (private/empty/data/error) without values;
- task error rate and repeated-submit rate; and
- mobile versus desktop abandonment by step.

Success is not “more data shared.” Success is fewer failed or ambiguous tasks,
faster movement from intent to a completed workout, and users correctly
predicting what another person can access.

## Remaining research work

Before broad commercialization, run moderated usability sessions with at least:

- trainees who have never worked with a trainer;
- trainees currently coached remotely;
- independent trainers managing 5–20 clients;
- keyboard and screen-reader users; and
- users uncomfortable sharing body measurements.

Test comprehension before interaction: show a connection or client screen for
five seconds, remove it, and ask what is shared, who can schedule, and what
happens after revocation. If users cannot answer correctly, the hierarchy or
copy—not the user—needs revision.
