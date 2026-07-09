/**
 * Playwright verification for WP-09 (ADR-0008): 44px minimum touch targets +
 * set-delete two-tap confirm. Requires .claude/auth.json — run
 * setup-auth.mjs first if it doesn't exist. Written per the
 * verify_checklist.mjs convention — not run in CI yet (see WP-17).
 *
 *   node .claude/test_touch-targets.mjs
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

const MIN = 44;

const results = [];
function pass(id, note = '') { results.push({ id, ok: true,  note }); console.log(`  ✅ ${id}${note ? ' — ' + note : ''}`); }
function fail(id, note = '') { results.push({ id, ok: false, note }); console.log(`  ❌ ${id}${note ? ' — ' + note : ''}`); }

// asserts every locator in `locators` has boundingBox() width/height >= MIN
async function assertMinHitArea(id, label, locator) {
  const count = await locator.count();
  if (count === 0) { fail(id, `${label}: no elements found`); return; }
  const boxes = await Promise.all(Array.from({ length: count }, (_, i) => locator.nth(i).boundingBox()));
  const tooSmall = boxes
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => !b || b.width < MIN || b.height < MIN);
  if (tooSmall.length === 0) {
    pass(id, `${label}: ${count} target(s), all >= ${MIN}x${MIN}`);
  } else {
    fail(id, `${label}: ${tooSmall.length}/${count} below ${MIN}px — ${tooSmall.map(({ b, i }) => `#${i}:${b ? `${b.width.toFixed(0)}x${b.height.toFixed(0)}` : 'null'}`).join(', ')}`);
  }
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: AUTH,
  viewport: { width: 360, height: 800 }, // narrowest common mobile width — see ADR-0008
});
const page = await context.newPage();

async function shot(name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

try {
  // ── Get into a workout with at least one exercise and one set ────────────
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });
  if (!page.url().includes('/dashboard')) {
    console.error('❌ BLOCKED: auth state expired. Run: node .claude/setup-auth.mjs');
    await browser.close();
    process.exit(1);
  }

  await page.locator('button', { hasText: /start workout/i }).first().click();
  await page.waitForURL('**/workout/**', { timeout: 10_000 });

  await page.locator('button', { hasText: /add exercise/i }).first().click();
  await page.waitForSelector('text=Select exercise', { timeout: 5_000 });
  await page.locator('ul li button').first().click();
  await page.waitForSelector('text=Adding set', { timeout: 5_000 });

  await page.locator('input[placeholder="kg"]').fill('40');
  await page.locator('input[placeholder="Reps"]').fill('10');
  await page.locator('button', { hasText: /^Add$/ }).click();
  await page.waitForTimeout(800);
  await shot('01-touch-targets-set-added');

  console.log('\n── Exercise-header icon buttons (i/clock/trophy/bolt) ──');
  await assertMinHitArea('9.1', 'info (i)', page.locator('button[title="Exercise info"]'));
  await assertMinHitArea('9.2', 'last session (clock)', page.locator('button[title="Last session"]'));
  await assertMinHitArea('9.3', 'best session (trophy)', page.locator('button[title="Best session"]'));
  await assertMinHitArea('9.4', 'best-60 (bolt)', page.locator('button[title="Best · 60 days"]'));

  console.log('\n── Reorder arrows (only visible with 2+ exercises) ──');
  await page.locator('button', { hasText: /add exercise/i }).first().click();
  await page.waitForSelector('text=Select exercise', { timeout: 5_000 });
  await page.locator('ul li button').nth(1).click();
  await page.waitForSelector('text=Adding set', { timeout: 5_000 });
  await page.locator('input[placeholder="kg"]').fill('20');
  await page.locator('input[placeholder="Reps"]').fill('15');
  await page.locator('button', { hasText: /^Add$/ }).click();
  await page.waitForTimeout(800);
  await shot('02-touch-targets-two-exercises');

  await assertMinHitArea('9.5', 'reorder ↑', page.locator('button[title="Move exercise up"]'));
  await assertMinHitArea('9.6', 'reorder ↓', page.locator('button[title="Move exercise down"]'));
  await assertMinHitArea('9.7', 'quick-add (+)', page.locator('button[title="Quick-add a set"]'));

  console.log('\n── Add-set form icon row ──');
  await page.locator('button[title="Quick-add a set"]').first().click();
  await page.waitForSelector('text=Adding set', { timeout: 5_000 });
  await assertMinHitArea('9.8', 'add-set form info/history row', page.locator('div', { hasText: 'Adding set' }).locator('button[title="Exercise info"], button[title="Last session"], button[title="Best session"], button[title="Best · 60 days"]'));
  await page.mouse.click(5, 5);
  await page.waitForTimeout(300);

  console.log('\n── Set-delete ✕: two-tap confirm (§3.15-3.17 pattern) ──');
  await assertMinHitArea('9.9', 'set-delete ✕', page.locator('button[title="Delete set"]'));

  const deleteBtn = page.locator('button[title="Delete set"]').first();
  await deleteBtn.click();
  await page.waitForTimeout(300);
  await shot('03-delete-armed-confirm-cancel');

  const confirmVisible = await page.locator('button', { hasText: /^Confirm$/ }).isVisible().catch(() => false);
  const cancelVisible  = await page.locator('button', { hasText: /^Cancel$/ }).isVisible().catch(() => false);
  const setStillThereAfterFirstTap = await page.locator('text=40 kg').isVisible().catch(() => false);
  if (confirmVisible && cancelVisible && setStillThereAfterFirstTap) {
    pass('9.10', 'first tap arms Confirm/Cancel, set still present');
  } else {
    fail('9.10', `confirm:${confirmVisible} cancel:${cancelVisible} setPresent:${setStillThereAfterFirstTap}`);
  }

  // Cancel path
  await page.locator('button', { hasText: /^Cancel$/ }).first().click();
  await page.waitForTimeout(300);
  const setStillThereAfterCancel = await page.locator('text=40 kg').isVisible().catch(() => false);
  const confirmGoneAfterCancel = !(await page.locator('button', { hasText: /^Confirm$/ }).isVisible().catch(() => false));
  if (setStillThereAfterCancel && confirmGoneAfterCancel) {
    pass('9.11', 'Cancel dismisses prompt, set unchanged');
  } else {
    fail('9.11', `setPresent:${setStillThereAfterCancel} confirmGone:${confirmGoneAfterCancel}`);
  }

  // Confirm path
  await deleteBtn.click();
  await page.waitForTimeout(300);
  await page.locator('button', { hasText: /^Confirm$/ }).first().click();
  await page.waitForTimeout(300);
  await shot('04-delete-confirmed');
  const setGoneAfterConfirm = !(await page.locator('text=40 kg').isVisible().catch(() => false));
  if (setGoneAfterConfirm) {
    pass('9.12', 'Confirm removes the set');
  } else {
    fail('9.12', 'set still present after Confirm');
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
