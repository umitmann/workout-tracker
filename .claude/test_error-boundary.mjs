/**
 * WP-13 Playwright coverage (finding M6) — written per .claude/verify_checklist.mjs
 * conventions, NOT run in this environment (no dev server / .claude/auth.json
 * available to this agent; also blocked on WP-17/M12 — these suites are not
 * yet CI-runnable). Requires:
 *   1. `npm run dev` running against a real Supabase project
 *   2. .claude/auth.json — run `node .claude/setup-auth.mjs` first if missing
 *
 *   node .claude/test_error-boundary.mjs
 *
 * Covers: a render/data error mid-workout shows the error.tsx boundary
 * (retry button calling reset() + a dashboard link) instead of a blank page,
 * and that retry actually re-renders the segment when the fault clears.
 *
 * Forcing the error: WorkoutLogger renders from server-fetched props with no
 * built-in "throw on demand" hook, and adding one to production code purely
 * to make this error visible would be exactly the kind of try/catch-shaped
 * scope creep the packet forbids (the boundary should catch real errors, not
 * a simulated flag). Instead this intercepts the workout page's own
 * navigation response — the same `page.route` technique
 * test_autosave-resilience.mjs (WP-04) uses to force a failing save — and
 * truncates the HTML/RSC payload so the client tree fails to hydrate. This
 * is inherently more brittle than a dedicated test hook would be (Next's
 * internal payload format is not a public contract), which is exactly why
 * it's written-not-run rather than gating CI; WP-17 should reconsider a
 * proper seam once Playwright is CI-runnable.
 */
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'fs';

const AUTH  = '.claude/auth.json';
const SHOTS = '.claude/verify-shots';
mkdirSync(SHOTS, { recursive: true });

if (!existsSync(AUTH)) {
  console.error('❌ No auth state found. Run: node .claude/setup-auth.mjs');
  process.exit(1);
}

const results = [];
function pass(id, note = '') { results.push({ id, ok: true,  note }); console.log(`  ✅ ${id}${note ? ' — ' + note : ''}`); }
function fail(id, note = '') { results.push({ id, ok: false, note }); console.log(`  ❌ ${id}${note ? ' — ' + note : ''}`); }

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: AUTH,
  viewport: { width: 390, height: 844 },
});
const page = await context.newPage();

async function shot(name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

try {
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });
  if (!page.url().includes('/dashboard')) {
    console.error('❌ BLOCKED: auth state expired. Run: node .claude/setup-auth.mjs');
    await browser.close();
    process.exit(1);
  }

  await page.locator('button', { hasText: /start workout/i }).first().click();
  await page.waitForURL('**/workout/**', { timeout: 10_000 });
  const workoutUrl = page.url();
  await shot('error-boundary-01-blank-workout');

  // ── Force a render error by corrupting the page's own navigation payload ──
  console.log('── force render error mid-workout → error.tsx boundary, not a blank page ──');
  let faultActive = true;
  await page.route(workoutUrl, async (route) => {
    if (!faultActive) return route.continue();
    const response = await route.fetch();
    const body = await response.text();
    // Truncate hard enough that the client tree cannot hydrate correctly —
    // this reliably produces a thrown render error rather than a graceful
    // degrade, without touching production code.
    await route.fulfill({
      status: response.status(),
      headers: response.headers(),
      body: body.slice(0, Math.floor(body.length / 3)),
    });
  });

  await page.goto(workoutUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1500);
  await shot('error-boundary-02-forced-error');

  const boundaryVisible = await page.locator('text=/something went wrong/i').isVisible().catch(() => false);
  const blankBody = (await page.locator('body').innerText().catch(() => '')).trim().length === 0;
  if (boundaryVisible && !blankBody) pass('M6-boundary', 'error.tsx fallback shown instead of a blank page');
  else fail('M6-boundary', `boundaryVisible:${boundaryVisible} blankBody:${blankBody}`);

  const retryVisible = await page.locator('button', { hasText: /try again/i }).isVisible().catch(() => false);
  const dashboardLinkVisible = await page.locator('a[href="/dashboard"]', { hasText: /dashboard/i }).isVisible().catch(() => false);
  if (retryVisible) pass('M6-retry-present', 'retry (reset()) button rendered');
  else fail('M6-retry-present', 'no retry button found');
  if (dashboardLinkVisible) pass('M6-dashboard-link', 'dashboard link rendered');
  else fail('M6-dashboard-link', 'no dashboard link found');

  // ── Retry recovers once the fault clears ──────────────────────────────────
  console.log('\n── retry (reset()) recovers once the underlying fault clears ──');
  faultActive = false;
  await page.locator('button', { hasText: /try again/i }).click();
  await page.waitForTimeout(1500);
  await shot('error-boundary-03-after-retry');
  const recovered = await page.locator('text=/something went wrong/i').isVisible().catch(() => false);
  const backOnWorkout = page.url().includes('/workout/');
  if (!recovered && backOnWorkout) pass('M6-retry-recovers', 'boundary cleared, workout UI back after reset()');
  else fail('M6-retry-recovers', `stillShowingBoundary:${recovered} onWorkout:${backOnWorkout}`);

  await page.unroute(workoutUrl);

} catch (err) {
  await shot('error-boundary-ERROR');
  console.error('\n💥 Unexpected error:', err.message);
} finally {
  await browser.close();
}

console.log('\n─────────────────────────────');
const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).length;
results.forEach((r) => console.log(`${r.ok ? '✅' : '❌'} ${r.id}${r.note ? ' — ' + r.note : ''}`));
console.log(`\n${passed}/${results.length} passed${failed > 0 ? ` · ${failed} FAILED` : ''}`);
if (failed > 0) process.exit(1);
