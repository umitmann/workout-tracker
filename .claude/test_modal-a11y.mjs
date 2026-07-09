/**
 * Playwright a11y verification for the shared Modal primitive (WP-08,
 * ADR-0008). Written per the pattern in verify_checklist.mjs — requires a
 * running dev server (`npm run dev`) and .claude/auth.json (run
 * `npm run test:auth-setup` first if it doesn't exist).
 *
 * WRITTEN, NOT RUN as part of this packet (per docs/test-plan.md WP-08 —
 * Playwright suites are written and left runnable, made CI-green in WP-17).
 *
 *   node .claude/test_modal-a11y.mjs
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

/** Common assertions for any open dialog: role, aria-modal, accessible name. */
async function assertDialogSemantics(id, locator) {
  const role = await locator.getAttribute('role');
  const modal = await locator.getAttribute('aria-modal');
  const name = (await locator.getAttribute('aria-label')) ?? (await locator.getAttribute('aria-labelledby'));
  if (role === 'dialog' && modal === 'true' && name) {
    pass(`${id}-semantics`, `role/aria-modal/name present ("${name}")`);
  } else {
    fail(`${id}-semantics`, `role:${role} aria-modal:${modal} name:${name}`);
  }
}

/** Focus should land inside the dialog panel on open. */
async function assertFocusInside(id, locator) {
  const inside = await locator.evaluate((el) => el.contains(document.activeElement));
  if (inside) pass(`${id}-focus-in`, 'active element is inside the dialog');
  else fail(`${id}-focus-in`, 'focus did not move into the dialog on open');
}

/** Tab should never move focus outside the dialog panel while it's open. */
async function assertTabTrapped(id, locator, presses = 8) {
  for (let i = 0; i < presses; i++) await page.keyboard.press('Tab');
  const stillInside = await locator.evaluate((el) => el.contains(document.activeElement));
  if (stillInside) pass(`${id}-tab-trap`, `${presses} Tabs stayed inside the dialog`);
  else fail(`${id}-tab-trap`, 'focus escaped the dialog while tabbing');
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

  // ── Exercise picker sheet ─────────────────────────────────────────────────
  console.log('── Picker sheet ──');
  const triggerBtn = page.locator('button', { hasText: /add exercise/i }).first();
  await triggerBtn.click();
  await page.waitForSelector('text=Select exercise', { timeout: 5_000 });
  await shot('a11y-01-picker-open');
  const pickerDialog = page.locator('[role="dialog"]').first();
  await assertDialogSemantics('picker', pickerDialog);
  await assertFocusInside('picker', pickerDialog);
  await assertTabTrapped('picker', pickerDialog);

  // Escape closes the picker and focus returns to the trigger.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const pickerGone = !(await page.locator('text=Select exercise').isVisible().catch(() => false));
  const focusBackOnTrigger = await triggerBtn.evaluate((el) => el === document.activeElement);
  if (pickerGone) pass('picker-escape-closes', 'Escape dismissed the sheet');
  else fail('picker-escape-closes', 'sheet still visible after Escape');
  if (focusBackOnTrigger) pass('picker-focus-restore', 'focus returned to the "Add exercise" trigger');
  else fail('picker-focus-restore', 'focus did not return to the trigger');

  // ── Info modal opened from within the picker (stacked dialog) ────────────
  console.log('\n── Info modal (stacked on picker) ──');
  await triggerBtn.click();
  await page.waitForSelector('text=Select exercise', { timeout: 5_000 });
  const infoBtn = page.locator('button[title="Exercise info"]').first();
  await infoBtn.click();
  await page.waitForSelector('[role="dialog"]', { timeout: 5_000 });
  await shot('a11y-02-info-modal-stacked');
  const dialogs = page.locator('[role="dialog"]');
  const dialogCount = await dialogs.count();
  if (dialogCount === 2) pass('info-stacked-count', 'picker + info modal both present in the DOM');
  else fail('info-stacked-count', `expected 2 stacked dialogs, found ${dialogCount}`);

  const infoDialog = dialogs.last();
  await assertDialogSemantics('info', infoDialog);
  await assertFocusInside('info', infoDialog);

  // Escape should close only the topmost (info) dialog, leaving the picker open.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const pickerStillOpen = await page.locator('text=Select exercise').isVisible().catch(() => false);
  const infoClosed = (await dialogs.count()) === 1;
  if (pickerStillOpen && infoClosed) pass('info-escape-topmost-only', 'Escape closed only the stacked info modal');
  else fail('info-escape-topmost-only', `picker open:${pickerStillOpen} info closed:${infoClosed}`);

  // Focus should return to the info-button trigger, not escape to the page.
  const focusBackOnInfoBtn = await infoBtn.evaluate((el) => el === document.activeElement);
  if (focusBackOnInfoBtn) pass('info-focus-restore', 'focus returned to the info trigger inside the picker');
  else fail('info-focus-restore', 'focus did not return to the info trigger');

  await page.keyboard.press('Escape'); // close the picker itself
  await page.waitForTimeout(300);

  // ── Destructive confirm: Abandon workout ──────────────────────────────────
  console.log('\n── Destructive confirm (Abandon) does not close on backdrop click ──');
  await page.locator('button', { hasText: /^← Back$/ }).click().catch(() => {});
  const abandonVisible = await page.locator('text=Abandon workout?').isVisible({ timeout: 2_000 }).catch(() => false);
  if (abandonVisible) {
    await shot('a11y-03-abandon-confirm');
    const abandonDialog = page.locator('[role="dialog"]').filter({ hasText: 'Abandon workout?' });
    await assertDialogSemantics('abandon', abandonDialog);

    // Backdrop click must NOT close a destructive confirm — explicit button only.
    await page.mouse.click(5, 5);
    await page.waitForTimeout(300);
    const stillOpenAfterBackdrop = await page.locator('text=Abandon workout?').isVisible().catch(() => false);
    if (stillOpenAfterBackdrop) pass('abandon-backdrop-noop', 'backdrop click did not dismiss the destructive confirm');
    else fail('abandon-backdrop-noop', 'destructive confirm closed on backdrop click — regression vs ADR-0008');

    // Escape still works (ADR-0008 only exempts backdrop click, not Escape/button).
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const closedByEscape = !(await page.locator('text=Abandon workout?').isVisible().catch(() => false));
    if (closedByEscape) pass('abandon-escape-closes', 'Escape still dismisses the destructive confirm');
    else fail('abandon-escape-closes', 'Escape did not dismiss the destructive confirm');
  } else {
    fail('abandon-confirm-shown', 'could not trigger the Abandon confirmation from Back');
  }
  {
    // §13 (review fix): dismissing a modal opened from a scrolled picker row
    // must not shift the picker list's scroll position (Modal uses
    // focus({preventScroll:true}) on restore).
    await page.locator('button', { hasText: /add exercise/i }).first().click();
    await page.waitForSelector('text=Select exercise', { timeout: 5_000 });
    const list = page.locator('[role="dialog"] ul').first();
    await list.evaluate((el) => { el.scrollTop = el.scrollHeight / 2 });
    const beforeScroll = await list.evaluate((el) => el.scrollTop);
    const infoBtn = page.locator('[role="dialog"] ul li button[title="Exercise info"]').last();
    await infoBtn.click();
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const afterScroll = await list.evaluate((el) => el.scrollTop);
    if (Math.abs(afterScroll - beforeScroll) <= 1) pass('s13-scroll-restored', `picker scrollTop stable (${beforeScroll} -> ${afterScroll})`);
    else fail('s13-scroll-restored', `picker scrollTop shifted ${beforeScroll} -> ${afterScroll} after modal dismiss`);
    await page.keyboard.press('Escape');
  }

} catch (e) {
  fail('crash', e.message.split('\n')[0]);
} finally {
  await browser.close();
}

console.log('\n── Summary ──');
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) {
  console.log('Failed:', failed.map((f) => f.id).join(', '));
  process.exit(1);
}
