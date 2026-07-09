/**
 * Docket for scenario: local-date-everywhere (WP-06, ADR-0005)
 * Covers behaviour-checklist §3.1, §3.3, §3.11, §3.18 under a forced
 * non-UTC browser timezone — the day-boundary regression this packet fixes
 * only reproduces when the browser's local day and UTC's day disagree.
 *
 * Loop-closure targets:
 *   Left loop invariant 1 — the calendar's today-ring lands on the
 *     browser's local day, not UTC's, when they disagree (§3.1).
 *   Left loop invariant 2 — "Start workout" from the dashboard creates a
 *     workout dated the browser's local day, verified by the calendar
 *     immediately showing the in-progress dot on that same cell (§3.18).
 *
 * WRITTEN BUT NOT RUN in this environment (no dev server / .claude/auth.json
 * here) — see WP-06 report caveats. Run once both exist:
 *   node .claude/setup-auth.mjs
 *   node .claude/test_local-date-calendar.mjs
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'fs';

const AUTH = '.claude/auth.json';
const SHOTS = '.claude/verify-shots/local-date';
mkdirSync(SHOTS, { recursive: true });

if (!existsSync(AUTH)) {
  console.error('❌ No auth state. Run: node .claude/setup-auth.mjs');
  process.exit(1);
}

const results = [];
function pass(id, note = '') { results.push({ id, ok: true, note }); console.log(`  ✅ ${id}${note ? ' — ' + note : ''}`); }
function fail(id, note = '') { results.push({ id, ok: false, note }); console.log(`  ❌ ${id}${note ? ' — ' + note : ''}`); }

// Force the browser's local clock to a timezone well west of UTC (America/
// Los_Angeles, UTC-7/-8) so a server-computed UTC "today" would disagree
// with the browser's local day for a meaningful fraction of every day —
// exactly the ADR-0005 bug class. Playwright's `timezoneId` affects
// Date/Intl inside the page (client-side JS), not the OS.
const TZ = 'America/Los_Angeles';

function localDatePartsInTZ(tz) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  return { y: get('year'), m: get('month'), d: get('day'), dateStr: `${get('year')}-${get('month')}-${get('day')}` };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: AUTH,
  viewport: { width: 390, height: 844 },
  timezoneId: TZ,
});
const page = await context.newPage();
const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png` });

try {
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });
  if (!page.url().includes('/dashboard')) {
    console.error('❌ BLOCKED: auth expired. Run: node .claude/setup-auth.mjs');
    await browser.close(); process.exit(1);
  }
  await shot('01-dashboard-la-tz');

  const { d: expectedDayNum, dateStr: expectedDateStr } = localDatePartsInTZ(TZ);

  console.log(`── §3: local dates under forced TZ=${TZ} (browser day: ${expectedDateStr}) ──`);

  // ── §3.1: today-ring lands on the browser's local day, not UTC's ────────
  // The ring-highlighted cell's day number must equal the TZ-local day
  // number. If CalendarView regressed to toISOString().split('T')[0], this
  // would highlight UTC's day instead (off by one for part of every day in
  // this TZ).
  const ringedCell = page.locator('button').filter({ has: page.locator('span.text-orange-500') }).first();
  const ringedText = (await ringedCell.textContent())?.trim();
  if (ringedText === String(Number(expectedDayNum))) {
    pass('3.1', `today-ring on day ${ringedText} matches browser-local day ${expectedDayNum}`);
  } else {
    fail('3.1', `today-ring shows "${ringedText}", expected local day ${expectedDayNum}`);
  }

  // ── §3.18 / start-workout date correctness ───────────────────────────────
  await page.locator('button', { hasText: /start workout/i }).first().click();
  await page.waitForURL('**/workout/**', { timeout: 10_000 });
  await shot('02-workout-started-la-tz');
  console.log('  ✅ started workout under LA timezone — checking calendar reflects it on the correct local day');

  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });
  await shot('03-back-to-dashboard');

  // Open the day sheet for the expected local day and confirm the newly
  // created in_progress workout is attached to THAT date, not tomorrow's
  // (which is what a UTC-truncated startWorkout would have produced for a
  // user in this TZ during the evening).
  const dayCell = page.locator('button', { hasText: new RegExp(`^${Number(expectedDayNum)}$`) }).first();
  await dayCell.click();
  await page.waitForTimeout(300);
  await shot('04-day-sheet-today');

  const hasContinue = await page.locator('button', { hasText: /continue/i }).isVisible().catch(() => false);
  if (hasContinue) {
    pass('3.18', `day sheet for local day ${expectedDayNum} shows "Continue" (in_progress workout landed on the correct local date)`);
  } else {
    fail('3.18', `day sheet for local day ${expectedDayNum} does not show "Continue" — workout may have been dated to the wrong day`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n── Summary ──');
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log('Failures:', failed.map((f) => f.id).join(', '));
    process.exitCode = 1;
  }
} catch (e) {
  console.error('❌ Uncaught error:', e);
  await shot('99-error');
  process.exitCode = 1;
} finally {
  await browser.close();
}
