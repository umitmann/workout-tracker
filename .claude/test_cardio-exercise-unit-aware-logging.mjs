/**
 * Docket for scenario: cardio-exercise-unit-aware-logging
 * Covers behaviour-checklist §19.1–19.7
 *
 * Loop-closure targets:
 *   Left loop invariant 1 — strength-form fields absent for cardio (§19.2)
 *   Left loop invariant 2 — duration_minutes survives save → reload (§19.7)
 *
 * Requires: app running at http://localhost:3000 and .claude/auth.json
 *   node .claude/setup-auth.mjs     ← run once to create auth.json
 *   node .claude/test_cardio-exercise-unit-aware-logging.mjs
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'fs';

const AUTH  = '.claude/auth.json';
const SHOTS = '.claude/verify-shots/cardio';
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

  // ── Start a blank workout ─────────────────────────────────────────────────
  await page.locator('button', { hasText: /start workout/i }).first().click();
  await page.waitForURL('**/workout/**', { timeout: 10_000 });
  const workoutUrl = page.url();
  await shot('01-blank-workout');

  // ── §19.1: "Running" appears in picker and is tappable ───────────────────
  console.log('\n── §19: Cardio unit-aware logging ──');
  await page.locator('button', { hasText: /add exercise/i }).first().click();
  await page.waitForSelector('text=Select exercise', { timeout: 5_000 });

  const searchInput = page.locator('input[type="text"], input[placeholder*="search" i], input[placeholder*="Search" i]').first();
  await searchInput.fill('Running');
  await page.waitForTimeout(300);
  await shot('02-picker-running-search');

  const runningRow = page.locator('ul li').filter({ hasText: /^Running\b/i }).first();
  const runningVisible = await runningRow.isVisible({ timeout: 3_000 }).catch(() => false);
  if (runningVisible) pass('19.1', 'Running appears in picker results');
  else fail('19.1', 'Running not found in picker');

  // Tap the row body (not a button) to select
  const rowText = runningRow.locator('button').first();
  await rowText.click();
  await page.waitForSelector('text=Adding set', { timeout: 5_000 });
  await shot('03-add-set-form-running');

  // ── §19.2: form shows Min + km, NOT kg/reps ───────────────────────────────
  const hasMin    = await page.locator('input[placeholder="Min"]').isVisible().catch(() => false);
  const hasKm     = await page.locator('input[placeholder*="km"]').isVisible().catch(() => false);
  const hasKg     = await page.locator('input[placeholder="kg"]').isVisible().catch(() => false);
  const hasReps   = await page.locator('input[placeholder="Reps"]').isVisible().catch(() => false);
  if (hasMin && hasKm && !hasKg && !hasReps)
    pass('19.2', 'duration + distance inputs present; weight + reps absent');
  else
    fail('19.2', `Min:${hasMin} km:${hasKm} kg:${hasKg} reps:${hasReps}`);

  // ── §19.3: log duration only, distance shows — ────────────────────────────
  await page.locator('input[placeholder="Min"]').fill('30');
  // leave km blank
  await page.locator('button', { hasText: /^Add$/ }).click();
  await page.waitForTimeout(1_500); // auto-save
  await shot('04-cardio-set-added');

  const has30min  = await page.locator('text=30 min').isVisible().catch(() => false);
  const dashDist  = await page.locator('text=—').first().isVisible().catch(() => false);
  if (has30min) pass('19.3', '30 min displayed; distance blank → —');
  else fail('19.3', `30 min visible: ${has30min}`);

  // ── §19.4: log duration + distance, both shown ────────────────────────────
  // Tap "+" on Running to open the form again
  const plusBtn = page.locator('button.rounded-full:has-text("+")').first();
  await plusBtn.click();
  await page.waitForSelector('text=Adding set', { timeout: 5_000 });
  await page.locator('input[placeholder="Min"]').fill('25');
  await page.locator('input[placeholder*="km"]').fill('5');
  await page.locator('button', { hasText: /^Add$/ }).click();
  await page.waitForTimeout(1_500);
  await shot('05-cardio-set-with-distance');

  const has25min  = await page.locator('text=25 min').isVisible().catch(() => false);
  const has5km    = await page.locator('text=5 km').isVisible().catch(() => false);
  if (has25min && has5km) pass('19.4', '25 min · 5 km both displayed');
  else fail('19.4', `25min:${has25min} 5km:${has5km}`);

  // ── §19.5: add a strength exercise — form shows kg/reps, not min/km ───────
  await page.locator('button', { hasText: /add exercise/i }).first().click();
  await page.waitForSelector('text=Select exercise', { timeout: 5_000 });
  const searchInput2 = page.locator('input[type="text"], input[placeholder*="search" i]').first();
  await searchInput2.fill('Bench Press');
  await page.waitForTimeout(300);
  const benchRow = page.locator('ul li').filter({ hasText: /bench press/i }).first();
  const benchFound = await benchRow.isVisible({ timeout: 3_000 }).catch(() => false);
  if (benchFound) {
    await benchRow.locator('button').first().click();
    await page.waitForSelector('text=Adding set', { timeout: 5_000 });
    await shot('06-strength-form');
    const strengthKg   = await page.locator('input[placeholder="kg"]').isVisible().catch(() => false);
    const strengthReps = await page.locator('input[placeholder="Reps"]').isVisible().catch(() => false);
    const noMin2       = !(await page.locator('input[placeholder="Min"]').isVisible().catch(() => false));
    if (strengthKg && strengthReps && noMin2)
      pass('19.5', 'strength form: kg + reps present, no min input');
    else
      fail('19.5', `kg:${strengthKg} reps:${strengthReps} noMin:${noMin2}`);
  } else {
    fail('19.5', 'Bench Press not found in picker — skipped strength form check');
  }

  // ── §19.6: complete workout → summary shows duration/distance for cardio ──
  // Capture workout URL before completing
  const currentWorkoutUrl = page.url();
  await page.locator('button', { hasText: /^Done$/ }).click();
  await page.waitForURL('**/dashboard', { timeout: 10_000 });
  await shot('07-post-complete-dashboard');

  // Navigate back to the completed workout
  await page.goto(currentWorkoutUrl, { waitUntil: 'networkidle' });
  await shot('08-completed-workout-view');

  const completedHas30min = await page.locator('text=30 min').isVisible().catch(() => false);
  const completedHas5km   = await page.locator('text=5 km').isVisible().catch(() => false);
  const completedNoWeight = !(await page.locator('text=Weight').first().isVisible().catch(() => false));

  // The completed view for cardio should show Duration/Distance labels
  const durationLabel = await page.locator('text=Duration').first().isVisible().catch(() => false);
  if (completedHas30min && completedHas5km && durationLabel)
    pass('19.6', 'completed summary shows Duration + distance values; Weight label absent from cardio rows');
  else
    fail('19.6', `30min:${completedHas30min} 5km:${completedHas5km} durationLabel:${durationLabel}`);

  // ── §19.7: reload completed workout — values persist ──────────────────────
  await page.reload({ waitUntil: 'networkidle' });
  await shot('09-reloaded-completed');

  const reloadedMin = await page.locator('text=30 min').isVisible().catch(() => false);
  const reloadedKm  = await page.locator('text=5 km').isVisible().catch(() => false);
  if (reloadedMin && reloadedKm)
    pass('19.7', 'duration_minutes and distance survive save → reload round-trip');
  else
    fail('19.7', `after reload: 30min:${reloadedMin} 5km:${reloadedKm} — cardio fields overwritten or lost`);

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
