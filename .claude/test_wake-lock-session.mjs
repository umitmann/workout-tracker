/**
 * WP-07 Playwright coverage (ADR-0007) — written per .claude/verify_checklist.mjs
 * conventions, NOT run in this environment (no dev server / .claude/auth.json
 * available to this agent). Requires:
 *   1. `npm run dev` running against a real Supabase project
 *   2. .claude/auth.json — run `node .claude/setup-auth.mjs` first if missing
 *
 *   node .claude/test_wake-lock-session.mjs
 *
 * Pins the ADR-0007 session-scope invariant at the DOM level: the wake lock
 * is engaged for the whole active logging session (plain set entry, not just
 * inside a running timer) and released for completed (read-only) workouts.
 *
 * There is no existing DOM-observable flag for "lock held" (ADR-0007 leaves
 * that as an option, not a requirement), so this spies directly on
 * `navigator.wakeLock.request`/`sentinel.release` via an init script — the
 * same seam a real browser exposes, no production code changes needed to
 * observe it.
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

// Installed before any page script runs, so it captures the WorkoutLogger's
// mount-time `navigator.wakeLock.request('screen')` call, not just later
// ones. Records every request + every release on the returned sentinel.
await context.addInitScript(() => {
  window.__wakeLockCalls = [];
  const fakeSentinel = () => ({
    released: false,
    release() {
      this.released = true;
      window.__wakeLockCalls.push({ type: 'release' });
      return Promise.resolve();
    },
  });
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: {
      request(type) {
        window.__wakeLockCalls.push({ type: 'request', lockType: type });
        return Promise.resolve(fakeSentinel());
      },
    },
  });
});

const page = await context.newPage();

async function shot(name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function requestCount() {
  return page.evaluate(() => window.__wakeLockCalls.filter((c) => c.type === 'request').length);
}
async function releaseCount() {
  return page.evaluate(() => window.__wakeLockCalls.filter((c) => c.type === 'release').length);
}

try {
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });
  if (!page.url().includes('/dashboard')) {
    console.error('❌ BLOCKED: auth state expired. Run: node .claude/setup-auth.mjs');
    await browser.close();
    process.exit(1);
  }

  // ── Session-level lock engaged for plain set entry (not just a timer) ─────
  console.log('── docked/plain logging engages the wake lock at mount, before any timer runs (ADR-0007) ──');
  await page.locator('button', { hasText: /start workout/i }).first().click();
  await page.waitForURL('**/workout/**', { timeout: 10_000 });
  await page.waitForTimeout(500);
  await shot('wakelock-01-blank-workout');

  const initialRequests = await requestCount();
  if (initialRequests >= 1) pass('H5-session-scope', `wakeLock.request called ${initialRequests}x on mount, no timer running`);
  else fail('H5-session-scope', 'expected navigator.wakeLock.request to fire on WorkoutLogger mount');

  // ── Re-request on visibilitychange hidden->visible while active (L6) ──────
  console.log('\n── visibilitychange hidden->visible while active re-requests (L6) ──');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(200);
  const afterVisibilityToggle = await requestCount();
  if (afterVisibilityToggle > initialRequests) pass('L6-revisibility-reacquire', `requests went ${initialRequests} -> ${afterVisibilityToggle}`);
  else fail('L6-revisibility-reacquire', `expected an additional request after hidden->visible, stayed at ${afterVisibilityToggle}`);

  // ── Completed workout holds no lock ────────────────────────────────────────
  console.log('\n── completed (read-only) workout view holds no lock ──');
  const workoutUrl = page.url();
  await page.locator('button', { hasText: /^done$/i }).first().click();
  await page.waitForTimeout(1500);
  await shot('wakelock-02-after-done');

  // Reload the now-completed workout in a fresh page so mount-time behaviour
  // is unambiguous (no lock carried over from the in-progress session).
  await page.close();
  const completedPage = await context.newPage();
  await completedPage.goto(workoutUrl, { waitUntil: 'networkidle' });
  await completedPage.waitForTimeout(500);
  const completedRequests = await completedPage.evaluate(() => window.__wakeLockCalls.filter((c) => c.type === 'request').length);
  if (completedRequests === 0) pass('H5-completed-no-lock', 'no wakeLock.request on a completed workout view');
  else fail('H5-completed-no-lock', `expected 0 requests on completed view, got ${completedRequests}`);
  await completedPage.close();

} catch (err) {
  await shot('wakelock-ERROR');
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
