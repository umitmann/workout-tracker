/**
 * Playwright verification for WP-18 (findings L2, L3, L4): small UX fixes
 * bundle. Requires .claude/auth.json — run setup-auth.mjs first if it
 * doesn't exist. Written per the verify_checklist.mjs convention — not run
 * in CI yet (see WP-17).
 *
 *   node .claude/test_ux-fixes.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'fs';

const AUTH  = '.claude/auth.json';
const SHOTS = '.claude/verify-shots/ux-fixes';
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
  viewport: { width: 390, height: 844 }, // mobile viewport per WP-18 spec
});
const page = await context.newPage();

async function shot(name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

try {
  // ── L4: document.title is the product name (no page interaction needed) ──
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });
  if (!page.url().includes('/dashboard')) {
    console.error('❌ BLOCKED: auth state expired. Run: node .claude/setup-auth.mjs');
    await browser.close();
    process.exit(1);
  }
  const title = await page.title();
  if (/workout tracker/i.test(title)) pass('18.1', `document.title = "${title}"`);
  else fail('18.1', `document.title = "${title}" (expected to contain "Workout Tracker")`);

  const themeColorContent = await page.locator('meta[name="theme-color"]').first().getAttribute('content').catch(() => null);
  if (themeColorContent) pass('18.2', `theme-color meta present: ${themeColorContent}`);
  else fail('18.2', 'no theme-color meta tag found');

  // ── Get into an active workout with a strength exercise ───────────────────
  await page.locator('button', { hasText: /start workout/i }).first().click();
  await page.waitForURL('**/workout/**', { timeout: 10_000 });

  await page.locator('button', { hasText: /add exercise/i }).first().click();
  await page.waitForSelector('text=Select exercise', { timeout: 5_000 });
  await page.locator('ul li button').first().click();
  await page.waitForSelector('text=Adding set', { timeout: 5_000 });

  // ── L3: inputMode + partial-decimal preservation on the weight stepper ───
  const weightInput = page.locator('input[aria-label="Weight (kg)"]').first();
  const weightInputMode = await weightInput.getAttribute('inputmode');
  if (weightInputMode === 'decimal') pass('18.3', 'weight stepper input has inputMode="decimal"');
  else fail('18.3', `weight stepper inputMode="${weightInputMode}" (expected "decimal")`);

  const repsInputMode = await page.locator('input[aria-label="Reps"]').first().getAttribute('inputmode');
  if (repsInputMode === 'numeric') pass('18.4', 'reps stepper input has inputMode="numeric"');
  else fail('18.4', `reps stepper inputMode="${repsInputMode}" (expected "numeric")`);

  await weightInput.fill('2.');
  const midTypeValue = await weightInput.inputValue();
  if (midTypeValue === '2.') pass('18.5', 'typing "2." preserves the trailing decimal (no snap to 0)');
  else fail('18.5', `weight input value = "${midTypeValue}" (expected "2." to be preserved pre-blur)`);

  await weightInput.type('5');
  const midTypeValue2 = await weightInput.inputValue();
  if (midTypeValue2 === '2.5') pass('18.6', 'typing "2.5" preserves the full decimal pre-blur');
  else fail('18.6', `weight input value = "${midTypeValue2}" (expected "2.5")`);

  await page.locator('input[aria-label="Reps"]').first().click(); // blur weight
  await page.waitForTimeout(150);
  const committedValue = await weightInput.inputValue();
  if (committedValue === '2.5') pass('18.7', 'value commits to 2.5 on blur, unchanged');
  else fail('18.7', `weight input value after blur = "${committedValue}" (expected "2.5")`);
  await shot('01-decimal-preserved');

  // ── L2: rest countdown stays visible when a field is focused ─────────────
  await page.locator('input[aria-label="Reps"]').first().fill('10');
  await page.locator('button', { hasText: /^Add$/ }).click();
  await page.waitForTimeout(500);

  const startRestBtn = page.locator('button', { hasText: /start rest/i }).first();
  if (await startRestBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await startRestBtn.click();
  }
  await page.waitForTimeout(500);
  const restingLabel = page.locator('text=/Resting|Rest over/').first();
  const restingVisible = await restingLabel.isVisible({ timeout: 3_000 }).catch(() => false);
  if (restingVisible) pass('18.8', 'rest countdown is running');
  else fail('18.8', 'rest countdown did not start — cannot verify L2');

  // Focus the weight input for the next set while resting is active
  await page.locator('input[aria-label="Weight (kg)"]').first().click();
  await page.waitForTimeout(300);
  await shot('02-field-focused-while-resting');

  const restBoxDuring = await restingLabel.boundingBox().catch(() => null);
  const restStillVisible = await restingLabel.isVisible().catch(() => false);
  if (restStillVisible && restBoxDuring) pass('18.9', `countdown still visible while field focused (top=${restBoxDuring.y.toFixed(0)})`);
  else fail('18.9', 'countdown not visible while a field is focused — L2 regression');

  // Scroll the page — the countdown should remain on-screen (sticky)
  await page.evaluate(() => window.scrollTo(0, 200));
  await page.waitForTimeout(200);
  await shot('03-scrolled-while-resting-focused');
  const restBoxAfterScroll = await restingLabel.boundingBox().catch(() => null);
  const stillInViewport = restBoxAfterScroll && restBoxAfterScroll.y >= 0 && restBoxAfterScroll.y < 200;
  if (stillInViewport) pass('18.10', 'countdown remains within the visible viewport after scroll (sticky held)');
  else fail('18.10', `countdown box after scroll: ${JSON.stringify(restBoxAfterScroll)} — expected to stay pinned near the top`);

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
