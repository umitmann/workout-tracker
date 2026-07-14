# Performance and caching review

Review date: 2026-07-14. Scope: the authenticated Next.js 16 App Router,
Supabase data access, navigation, exercise media, and the personal-trainer
workflows. This review follows the checked-in Next.js 16 guidance rather than
older App Router caching defaults.

## Executive finding

The application is database- and authentication-round-trip bound, not
CPU-bound. Most screens render as Server Components and ship relatively little
page-specific JavaScript, which is a sound baseline. The largest avoidable
latency was duplicate verified-auth calls within one render: `dal.ts` owned a
different React request cache from `serverAuth.ts`, while several pages also
called Supabase Auth directly. The release consolidates those reads behind one
request-scoped `getServerAuthContext`.

The app contains health data and relationship-scoped data. Do not shared-cache
workouts, sets, bodyweight, relationships, consent, account profiles, trainer
client views, or client-only exercises. A cache key containing a user ID is not
enough when the cached function also closes over request cookies or a Supabase
client. A missed key or delayed permission invalidation would become a data
leak. Request deduplication and browser-private caches are the appropriate
tools for those resources.

## What changed

| Area | Finding | Resolution | Expected effect |
|---|---|---|---|
| Verified auth | Separate React caches caused repeat `getUser()` requests in a render. | Every server DAL read now reuses `getServerAuthContext`; direct page callers on high-traffic routes were consolidated too. | Removes one or more network auth round trips from common renders. |
| Dynamic navigation | A `loading.tsx` can enable partial prefetch, but a parent boundary around a Server Action form can remount it during revalidation and erase its success/error state. | A lightweight boundary is used only for the read-only exercise library. Account, connection, directory-application, and trainer-tool parents deliberately have none. | Faster exercise-library transitions without compromising mutation feedback or established flows. |
| Calendar | A month change previously involved Server Action router-state races. | The existing private GET transport, in-memory current-session cache, and bounded adjacent-month prefetch remain. | Fast next/previous navigation without shared health-data caching. |
| YouTube | Eager embeds in a list could create many third-party connections and large page cost. | Videos appear only in exercise detail/info surfaces; iframes use `loading="lazy"` and `youtube-nocookie.com`. | No YouTube cost on library/list load; media loads only when explanation is viewed. |
| Exercise discovery | The catalog was globally readable before trainer scoping. | A database RPC returns only platform, public, owned, or current-client discoverable rows. Historical entitlements stay outside discovery. | Correct permission-aware payloads and no client-only cross-user cache risk. |
| Query waterfalls | Main dashboard reads already use `Promise.all`; client-result and directory pages also parallelize independent reads. | Retained; new account and exercise management screens follow the same pattern. | Avoids serial database waits. |

## Cache and prefetch policy

| Resource | Policy | Reason / invalidation |
|---|---|---|
| Verified user + Supabase client | React `cache`, request lifetime only | Deduplicates safely while preserving fresh session validation per request. |
| Workout month currently viewed | Component-memory map | Private health data; discarded on reload and explicitly refreshed after mutation. |
| Adjacent workout months | Prefetch previous and next month only | High likelihood and bounded cost. Abort on unmount; failures are silent until an explicit navigation retries visibly. |
| Visible read-only exercise route | Default `<Link>` prefetch plus `loading.tsx` | Lets Next 16 partially prefetch the library shell without forcing full private-data fetches. Action-heavy parent routes intentionally opt out because remounting destroys transient form state. |
| Exercise catalog | Request dedupe only for now | It contains relationship-scoped rows. A future browser-private endpoint cache is safe only with a short TTL and explicit invalidation after relationship/exercise changes. |
| Exercise YouTube video | Browser/YouTube caching, lazy iframe | No preconnect or eager iframe: most visits never open a technique explanation. |
| Platform-only legacy exercises | Candidate for shared cache after data split | Safe only after a dedicated function returns rows with `visibility='platform'`; never mix this with client rows. |
| Trainer public directory | Candidate for short shared cache | DTO is public-safe to authenticated users, but mutations need tag invalidation. Current scale does not justify the extra invalidation surface yet. |
| Workouts, sets, bodyweight, account, consent, relationships, client results | No persistent/shared server cache | Sensitive and immediately revocable. Fetch fresh under RLS. |

## Loading and rendering analysis

- The root layout remains a Server Component. Interactive JavaScript is kept
  in narrow components such as the account menu, forms, calendar, and logger.
- The workout logger is intentionally the largest client surface. It owns
  timers, autosave, clipboard, wake lock, and local set state; splitting those
  indiscriminately would add coordination cost without reducing the required
  interaction graph.
- Exercise images are plain remote URLs and currently lack a trusted host
  allowlist. Moving them to `next/image` is deferred until image origins and
  dimensions are normalized; doing it now would either break catalog images or
  require an unsafe wildcard.
- `Link prefetch={true}` is deliberately not forced for authenticated dynamic
  screens. Next's default partial prefetch plus loading boundary avoids running
  expensive private queries for links a user may never open.
- The dashboard's independent data calls begin together. Plan reads stay
  fail-soft so a plan API incident cannot block the workout log and history.

## Measurement protocol

Release QA records:

1. production `next build` success and route output;
2. authenticated Playwright navigation timing for dashboard, exercise library,
   account, and trainer exercise management on mobile Chromium;
3. HTTP request counts during a cold dashboard render to confirm auth request
   deduplication inside the React render;
4. k6 checks for the existing PT endpoints plus exercise discovery;
5. zero cross-user visibility failures in direct JWT/RLS tests.

### Measured local production baseline

The optimized build was served with `next start` against a clean local
Supabase stack and isolated actors. These numbers are a regression baseline,
not a claim about production infrastructure:

| Mobile Chromium route | HTTP | Load event | Requests | Third-party requests |
|---|---:|---:|---:|---:|
| Dashboard | 200 | 73 ms | 15 | 0 |
| Exercise library | 200 | 62 ms | 15 | 0 |
| Account | 200 | 106 ms | 15 | 0 |
| Trainer exercise manager | 200 | 100 ms | 15 | 0 |

The read-only nominal load run held directory + scoped exercise discovery at
20 requested iterations/second for one minute: 1,201 responses, no failures,
no dropped iterations, 100% semantic checks, and exercise-library p95/p99 of
71/82 ms. Directory p95/p99 was 73/82 ms.

The deliberately combined five-surface run requested 53 iterations/second for
two minutes: 6,363 requests, no dropped iterations, median 19 ms, aggregate
p95 410 ms, and every per-surface latency limit passed. Exercise discovery was
p95 396 ms and p99 1.15 s. However, only 72% of semantic checks passed because
the single local authentication stack intermittently redirected authenticated
requests under that concurrency. This is a capacity/auth-availability finding,
not a reason to cache private authorization. The release load contract now
classifies every non-200—including redirects—as `http_req_failed`, in addition
to its existing explicit status and fixture checks.

Before scaling traffic, run the five-surface profile against staging with the
production Supabase plan and observability. If the same redirects occur, scale
or tune the authentication/database tier and inspect `getUser()` failures.
Do not mask them with shared user/session caching or stale relationship data.

A post-UX-change 15-second combined smoke run exercised the same five surfaces
for 797 authenticated requests: zero failures, zero dropped iterations, 100%
semantic checks, aggregate p95 76 ms, and per-surface p95 between 70 and 79 ms.
This confirms the UI changes did not introduce a short-run regression; it does
not replace the longer staging soak required by the authentication finding
above.

## Next thresholds

Introduce another cache only when measurement shows a p95 regression or
origin-load problem. Before adding it, the change must document data
classification, cache owner (shared or browser-private), complete key inputs,
maximum stale permission window, mutation invalidators, and a cross-user test.
For this app, correctness and revocation latency outrank a small synthetic TTFB
gain.
