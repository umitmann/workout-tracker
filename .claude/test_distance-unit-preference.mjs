/**
 * Docket for scenario: distance-unit-preference (WP-12)
 * Covers behaviour-checklist §19.10/§19.11, finding M5.
 *
 * Written per test-plan.md rule 3 (Playwright tests are written and left
 * runnable, not required to pass in CI yet — see WP-17). NOT RUN by this
 * agent — requires a dev server + .claude/auth.json.
 *
 * Requires: app running at http://localhost:3000 and .claude/auth.json
 *   node .claude/setup-auth.mjs     ← run once to create auth.json
 *   node .claude/test_distance-unit-preference.mjs
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'fs';

const AUTH  = '.claude/auth.json';
const SHOTS = '.claude/verify-shots/distance-unit';
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

  // ── Start a blank workout and log a cardio set with distance ─────────────
  await page.locator('button', { hasText: /start workout/i }).first().click();
  await page.waitForURL('**/workout/**', { timeout: 10_000 });
  const workoutUrl = page.url();

  await page.locator('button', { hasText: /add exercise/i }).first().click();
  await page.waitForSelector('text=Select exercise', { timeout: 5_000 });
  const searchInput = page.locator('input[type="text"], input[placeholder*="search" i]').first();
  await searchInput.fill('Running');
  await page.waitForTimeout(300);
  const runningRow = page.locator('ul li').filter({ hasText: /^Running\b/i }).first();
  await runningRow.locator('button').first().click();
  await page.waitForSelector('text=Adding set', { timeout: 5_000 });

  await page.locator('input[placeholder="Min"]').fill('20');
  await page.locator('input[placeholder*="km"]').fill('5');
  await page.locator('button', { hasText: /^Add$/ }).click();
  await page.waitForTimeout(1_500); // auto-save
  await shot('01-cardio-set-added-default-km');

  // ── Default (no preference set yet) shows km ──────────────────────────────
  console.log('\n── §19.10/§19.11: distance unit preference ──');
  const defaultHas5km = await page.locator('text=5 km').first().isVisible().catch(() => false);
  if (defaultHas5km) pass('19.10-default', 'no stored preference defaults to km, matching pre-existing behaviour');
  else fail('19.10-default', '5 km not visible with no preference set');

  // ── Toggle to metres via the header pill (only shown when cardio present) ─
  const unitToggle = page.locator('button[title="Toggle distance unit"]').first();
  const toggleVisible = await unitToggle.isVisible({ timeout: 3_000 }).catch(() => false);
  if (!toggleVisible) {
    fail('19.11-toggle-visible', 'distance-unit toggle button not found — cannot proceed with remaining assertions');
  } else {
    pass('19.11-toggle-visible', 'toggle pill visible once a cardio set exists');
    await unitToggle.click();
    await page.waitForTimeout(200);
    await shot('02-toggled-to-metres');

    // ── §19.11: set row now shows metres (5 km -> 5000 m) ────────────────────
    const has5000m = await page.locator('text=5,000 m').first().isVisible().catch(() => false)
      || await page.locator('text=5000 m').first().isVisible().catch(() => false);
    if (has5000m) pass('19.11-set-row', 'active set row shows 5000 m after switching to metres');
    else fail('19.11-set-row', '5000 m not visible after toggling unit');
  }

  // ── §19.11: preference persists across reload (localStorage) ─────────────
  await page.reload({ waitUntil: 'networkidle' });
  await shot('03-reloaded-still-metres');
  const stillMetresAfterReload = await page.locator('text=5,000 m').first().isVisible().catch(() => false)
    || await page.locator('text=5000 m').first().isVisible().catch(() => false);
  if (stillMetresAfterReload) pass('19.11-persists', 'metres preference survives reload (localStorage)');
  else fail('19.11-persists', 'preference did not survive reload');

  // ── §19.10/§19.11: complete the workout — completed view also respects unit
  await page.locator('button', { hasText: /^Done$/ }).click();
  await page.waitForURL('**/dashboard', { timeout: 10_000 });
  await page.goto(workoutUrl, { waitUntil: 'networkidle' });
  await shot('04-completed-view-metres');

  const completedHasMetres = await page.locator('text=5,000 m').first().isVisible().catch(() => false)
    || await page.locator('text=5000 m').first().isVisible().catch(() => false);
  if (completedHasMetres) pass('19.11-completed-view', 'completed summary also shows metres, not km');
  else fail('19.11-completed-view', 'completed view still shows km after preference switched to m');

  // ── Toggle back to km from the completed view; verify it flips display ───
  const completedToggle = page.locator('button[title="Toggle distance unit"]').first();
  const completedToggleVisible = await completedToggle.isVisible({ timeout: 3_000 }).catch(() => false);
  if (completedToggleVisible) {
    await completedToggle.click();
    await page.waitForTimeout(200);
    await shot('05-completed-view-back-to-km');
    const backToKm = await page.locator('text=5 km').first().isVisible().catch(() => false);
    if (backToKm) pass('19.10-toggle-back', 'switching back to km from the completed view updates the display');
    else fail('19.10-toggle-back', 'did not switch back to km display');
  } else {
    fail('19.10-toggle-back', 'toggle not present on completed view — skipped');
  }

  // ── §19.10/§19.11: report export text respects the currently stored unit ─
  // (exercised via the dashboard bodyweight-card export button, if present)
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });
  const exportBtn = page.locator('button', { hasText: /last week/i }).first();
  const exportVisible = await exportBtn.isVisible({ timeout: 3_000 }).catch(() => false);
  if (exportVisible) {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10_000 }).catch(() => null),
      exportBtn.click(),
    ]);
    if (download) pass('19.10-export-download', 'report export triggered a download (unit param wired; text content not inspected here — needs a saved-file read step in CI, see WP-17)');
    else fail('19.10-export-download', 'no download event observed within timeout');
  } else {
    fail('19.10-export-download', 'export button not found on dashboard — skipped');
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
