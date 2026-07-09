/**
 * Playwright verification for WP-11 (finding M4, checklist §19.8): the
 * performance-history modal (LastPerfModal, opened via the clock/trophy/bolt
 * icons) must show a Duration/Distance column for cardio exercises instead
 * of hardcoding Weight/Reps and rendering em-dashes for every cardio set.
 *
 * WRITTEN, NOT RUN as part of this packet (per docs/test-plan.md — Playwright
 * suites are written and left runnable, made CI-green in WP-17). Follows the
 * pattern in verify_checklist.mjs / test_touch-targets.mjs /
 * test_cardio-exercise-unit-aware-logging.mjs.
 *
 * Requires: app running at http://localhost:3000 and .claude/auth.json
 *   node .claude/setup-auth.mjs     ← run once to create auth.json
 *   node .claude/test_perf-modal-cardio.mjs
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'fs';

const AUTH  = '.claude/auth.json';
const SHOTS = '.claude/verify-shots/perf-modal-cardio';
mkdirSync(SHOTS, { recursive: true });

if (!existsSync(AUTH)) {
  console.error('❌ No auth state. Run: node .claude/setup-auth.mjs');
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
const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png` });

try {
  // ── Auth check ────────────────────────────────────────────────────────────
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });
  if (!page.url().includes('/dashboard')) {
    console.error('❌ BLOCKED: auth expired. Run: node .claude/setup-auth.mjs');
    await browser.close(); process.exit(1);
  }

  // ── Workout #1: log a cardio set for "Running" and complete it, so there is
  //    completed-workout history for the perf modal to show ─────────────────
  await page.locator('button', { hasText: /start workout/i }).first().click();
  await page.waitForURL('**/workout/**', { timeout: 10_000 });

  await page.locator('button', { hasText: /add exercise/i }).first().click();
  await page.waitForSelector('text=Select exercise', { timeout: 5_000 });
  const search1 = page.locator('input[type="text"], input[placeholder*="search" i]').first();
  await search1.fill('Running');
  await page.waitForTimeout(300);
  const runningRow = page.locator('ul li').filter({ hasText: /^Running\b/i }).first();
  await runningRow.locator('button').first().click();
  await page.waitForSelector('text=Adding set', { timeout: 5_000 });

  await page.locator('input[placeholder="Min"]').fill('28');
  await page.locator('input[placeholder*="km"]').fill('4.5');
  await page.locator('button', { hasText: /^Add$/ }).click();
  await page.waitForTimeout(1_500); // autosave

  await page.locator('button', { hasText: /^Done$/ }).click();
  await page.waitForURL('**/dashboard', { timeout: 10_000 });
  await shot('01-post-complete-dashboard');

  // ── Workout #2: log Running again — this time open the Last-session modal
  //    from the active add-set form's clock icon before adding the new set,
  //    so it queries history from workout #1 ─────────────────────────────────
  await page.locator('button', { hasText: /start workout/i }).first().click();
  await page.waitForURL('**/workout/**', { timeout: 10_000 });

  await page.locator('button', { hasText: /add exercise/i }).first().click();
  await page.waitForSelector('text=Select exercise', { timeout: 5_000 });
  const search2 = page.locator('input[type="text"], input[placeholder*="search" i]').first();
  await search2.fill('Running');
  await page.waitForTimeout(300);
  const runningRow2 = page.locator('ul li').filter({ hasText: /^Running\b/i }).first();
  await runningRow2.locator('button').first().click();
  await page.waitForSelector('text=Adding set', { timeout: 5_000 });
  await shot('02-add-set-form-running-again');

  console.log('\n── §19.8: cardio set in performance-history modal ──');
  await page.locator('button[title="Last session"]').first().click();
  await page.waitForSelector('text=Last session', { timeout: 5_000 });
  await shot('03-last-session-modal-cardio');

  const durationHeader = await page.locator('text=Duration').first().isVisible().catch(() => false);
  const distanceHeader = await page.locator('text=Distance').first().isVisible().catch(() => false);
  const weightHeader   = await page.locator('text=Weight').first().isVisible().catch(() => false);
  if (durationHeader && distanceHeader && !weightHeader)
    pass('19.8a', 'modal shows Duration/Distance headers, not Weight');
  else
    fail('19.8a', `Duration:${durationHeader} Distance:${distanceHeader} Weight:${weightHeader}`);

  const has28min = await page.locator('text=28 min').isVisible().catch(() => false);
  const has45km  = await page.locator('text=4.5 km').isVisible().catch(() => false);
  if (has28min && has45km)
    pass('19.8b', 'modal shows real duration/distance VALUES, not em-dashes');
  else
    fail('19.8b', `28min:${has28min} 4.5km:${has45km} (finding M4 regression — em-dashes instead of values)`);

  // Close via ✕ (Modal contract — §20.4/§20.6)
  await page.locator('button', { hasText: '✕' }).last().click();
  await page.waitForTimeout(300);

  // ── Contrast case: strength exercise still shows Weight/Reps unchanged ────
  console.log('\n── Regression guard: strength exercise perf modal unchanged ──');
  await page.locator('button', { hasText: /add exercise/i }).first().click();
  await page.waitForSelector('text=Select exercise', { timeout: 5_000 });
  const search3 = page.locator('input[type="text"], input[placeholder*="search" i]').first();
  await search3.fill('Bench Press');
  await page.waitForTimeout(300);
  const benchRow = page.locator('ul li').filter({ hasText: /bench press/i }).first();
  const benchFound = await benchRow.isVisible({ timeout: 3_000 }).catch(() => false);
  if (benchFound) {
    await benchRow.locator('button').first().click();
    await page.waitForSelector('text=Adding set', { timeout: 5_000 });
    await page.locator('button[title="Last session"]').first().click();
    await page.waitForSelector('text=Last session', { timeout: 5_000 });
    await shot('04-last-session-modal-strength');
    const weightHeader2 = await page.locator('text=Weight').first().isVisible().catch(() => false);
    const repsHeader2   = await page.locator('text=Reps').first().isVisible().catch(() => false);
    const durationHeader2 = await page.locator('text=Duration').first().isVisible().catch(() => false);
    if (weightHeader2 && repsHeader2 && !durationHeader2)
      pass('19.8c', 'strength exercise perf modal still shows Weight/Reps, not Duration (no regression)');
    else
      fail('19.8c', `Weight:${weightHeader2} Reps:${repsHeader2} Duration:${durationHeader2}`);
  } else {
    fail('19.8c', 'Bench Press not found in picker — skipped strength contrast check');
  }

} catch (err) {
  await shot('ERROR');
  console.error('\n💥 Unexpected error:', err.message);
} finally {
  await browser.close();
}

// ── Report ────────────────────────────────────────────────────────────────
console.log('\n─────────────────────────────');
const passed = results.filter(r => r.ok).length;
const failed = results.filter(r => !r.ok).length;
results.forEach(r => console.log(`${r.ok ? '✅' : '❌'} ${r.id}${r.note ? ' — ' + r.note : ''}`));
console.log(`\n${passed}/${results.length} passed${failed > 0 ? ` · ${failed} FAILED` : ''}`);
if (failed > 0) process.exit(1);
