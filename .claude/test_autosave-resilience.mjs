/**
 * WP-04 Playwright coverage (ADR-0004) — written per .claude/verify_checklist.mjs
 * conventions, NOT run in this environment (no dev server / .claude/auth.json
 * available to this agent). Requires:
 *   1. `npm run dev` running against a real Supabase project
 *   2. .claude/auth.json — run `node .claude/setup-auth.mjs` first if missing
 *
 *   node .claude/test_autosave-resilience.mjs
 *
 * Covers behaviour-checklist §15.1-15.3 plus the ADR-0004 failure-surfacing
 * contract:
 *   (a) add 3 sets rapidly, reload → all 3 present, in order (§15.3)
 *   (b) route-intercept the save action to fail, add a set → visible
 *       error/unsaved indicator appears, beforeunload guard armed
 *   (c) "Done" with a failing save → stays on the logger with the error
 *       shown, does NOT redirect to /dashboard
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

// Adds one set via the picker + add-set form, assuming the picker is closed
// and at least one exercise exists. Uses whatever exercise is first in the
// list so this works against any seeded account.
async function addOneSet(weight) {
  await page.locator('button', { hasText: /add exercise/i }).first().click();
  await page.waitForSelector('text=Select exercise', { timeout: 5_000 });
  await page.locator('ul li button').first().click();
  await page.waitForSelector('text=Adding set', { timeout: 5_000 });
  // The weight Stepper renders type="number" inputMode="numeric" (Stepper.tsx)
  // — there is no inputmode="decimal" input anywhere in the add-set form.
  const weightInput = page.locator('input[type="number"]').first();
  await weightInput.fill(String(weight));
  await page.locator('button', { hasText: /^add$/i }).first().click();
}

try {
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });
  if (!page.url().includes('/dashboard')) {
    console.error('❌ BLOCKED: auth state expired. Run: node .claude/setup-auth.mjs');
    await browser.close();
    process.exit(1);
  }

  // ── (a) Rapid adds persist in order, survive reload — §15.3 ───────────────
  console.log('── (a) rapid adds, reload, order preserved (§15.1-15.3) ──');
  await page.locator('button', { hasText: /start workout/i }).first().click();
  await page.waitForURL('**/workout/**', { timeout: 10_000 });
  const workoutUrl = page.url();
  await shot('autosave-01-blank');

  await addOneSet(101);
  await addOneSet(102);
  await addOneSet(103);
  await shot('autosave-02-three-sets-added');

  await page.waitForTimeout(1500); // let the save queue drain
  await page.goto(workoutUrl, { waitUntil: 'networkidle' });
  await shot('autosave-03-after-reload');

  const weightsAfterReload = await page.locator('text=/10[123]/').allTextContents();
  const allThreePresent = ['101', '102', '103'].every((w) => weightsAfterReload.some((t) => t.includes(w)));
  if (allThreePresent) pass('15.3', `all 3 sets present after reload: ${weightsAfterReload.join(', ')}`);
  else fail('15.3', `expected 101/102/103 present, saw: ${weightsAfterReload.join(', ')}`);

  // ── (b) Failing save surfaces an error + arms beforeunload ────────────────
  console.log('\n── (b) forced save failure -> visible error, beforeunload armed (ADR-0004) ──');
  await page.route('**/*', async (route) => {
    const req = route.request();
    // Server actions POST to the page URL with a Next-Action header.
    if (req.method() === 'POST' && req.headers()['next-action']) {
      await route.abort('failed');
    } else {
      await route.continue();
    }
  });

  await addOneSet(104);
  await page.waitForTimeout(1000);
  await shot('autosave-04-forced-failure');

  const errorVisible = await page.locator('text=/not saved/i').isVisible().catch(() => false);
  if (errorVisible) pass('ADR-0004-error', 'visible "not saved" indicator after forced failure');
  else fail('ADR-0004-error', 'no visible error indicator after forced save failure');

  // beforeunload guard: dispatching the event with preventDefault called
  // means Chromium would show the native "leave site?" prompt. We can't
  // easily assert the native dialog headlessly, so instead assert the
  // handler calls preventDefault by checking defaultPrevented after dispatch.
  const guardArmed = await page.evaluate(() => {
    const evt = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(evt);
    return evt.defaultPrevented;
  });
  if (guardArmed) pass('ADR-0004-guard', 'beforeunload guard armed while save is failing');
  else fail('ADR-0004-guard', 'beforeunload did not preventDefault while save is failing');

  // ── (c) "Done" with a failing save does not redirect ──────────────────────
  console.log('\n── (c) Done with failing save -> stays on logger, no redirect ──');
  await page.locator('button', { hasText: /^done$/i }).first().click();
  await page.waitForTimeout(1500);
  await shot('autosave-05-done-with-failure');
  const stillOnLogger = page.url().includes('/workout/');
  const errorStillVisible = await page.locator('text=/not saved/i').isVisible().catch(() => false);
  if (stillOnLogger && errorStillVisible) pass('ADR-0004-done-no-redirect', 'Done did not redirect while save failing');
  else fail('ADR-0004-done-no-redirect', `url:${page.url()} errorVisible:${errorStillVisible}`);

  await page.unroute('**/*');

} catch (err) {
  await shot('autosave-ERROR');
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
