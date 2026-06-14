/**
 * Automated checklist verification for sections 11–15.
 * Requires .claude/auth.json — run setup-auth.mjs first if it doesn't exist.
 *
 *   node .claude/verify_checklist.mjs
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

async function dismissModal() {
  // Try ✕ button first, then Escape
  const x = page.locator('button').filter({ hasText: '✕' });
  if (await x.last().isVisible({ timeout: 500 }).catch(() => false)) {
    await x.last().click();
  } else {
    await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(300);
}

try {
  // ── Navigate to dashboard ─────────────────────────────────────────────────
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });
  const onDash = page.url().includes('/dashboard');
  if (!onDash) {
    console.error('❌ BLOCKED: auth state expired. Run: node .claude/setup-auth.mjs');
    await browser.close();
    process.exit(1);
  }
  await shot('01-dashboard');
  console.log('✅ authenticated\n');

  // ── Start a blank workout ─────────────────────────────────────────────────
  await page.locator('button', { hasText: /start workout/i }).first().click();
  await page.waitForURL('**/workout/**', { timeout: 10_000 });
  await shot('02-blank-workout');
  console.log('── Section 12: picker performance buttons ──');

  // ── 12.1: all four buttons visible per row ────────────────────────────────
  await page.locator('button', { hasText: /add exercise/i }).first().click();
  await page.waitForSelector('text=Select exercise', { timeout: 5_000 });
  await shot('03-picker-open');

  const row = page.locator('ul li').first();
  const iOk = await row.locator('button[title="Exercise info"]').isVisible();
  const cOk = await row.locator('button[title="Last session"]').isVisible();
  const tOk = await row.locator('button[title="Best session"]').isVisible();
  const bOk = await row.locator('button[title="Best · 60 days"]').isVisible();
  if (iOk && cOk && tOk && bOk) pass('12.1', 'i/clock/trophy/bolt visible in picker row');
  else fail('12.1', `i:${iOk} clock:${cOk} trophy:${tOk} bolt:${bOk}`);

  // ── 12.3: clock opens modal; picker stays open ────────────────────────────
  await row.locator('button[title="Last session"]').click();
  await page.waitForSelector('text=Last session', { timeout: 5_000 });
  await shot('04-picker-clock-modal');
  const pickerBehind = await page.locator('text=Select exercise').isVisible();
  if (pickerBehind) pass('12.3', 'picker open behind modal');
  else fail('12.3', 'picker closed when modal opened');

  // ── 12.4: dismiss → picker still open, no exercise selected ──────────────
  await dismissModal();
  await shot('05-after-modal-dismiss');
  const pickerStill = await page.locator('text=Select exercise').isVisible();
  const noForm      = !(await page.locator('text=Adding set').isVisible());
  if (pickerStill && noForm) pass('12.4', 'picker open, no add-form after dismiss');
  else fail('12.4', `picker:${pickerStill} noForm:${noForm}`);

  // ── Section 11: history buttons in add-set form ───────────────────────────
  console.log('\n── Section 11: history buttons in add-set form ──');
  // Select first exercise from picker
  await page.locator('ul li button').first().click();
  await page.waitForSelector('text=Adding set', { timeout: 5_000 });
  await shot('06-add-set-form');

  // ── 11.1: four buttons present in form ───────────────────────────────────
  // Scope to the form panel — it contains "Adding set" text
  const fi = await page.locator('button[title="Exercise info"]').first().isVisible();
  const fc = await page.locator('button[title="Last session"]').first().isVisible();
  const ft = await page.locator('button[title="Best session"]').first().isVisible();
  const fb = await page.locator('button[title="Best · 60 days"]').first().isVisible();
  if (fi && fc && ft && fb) pass('11.1', 'all four buttons in add-set form');
  else fail('11.1', `i:${fi} clock:${fc} trophy:${ft} bolt:${fb}`);

  // ── 11.2: clock modal opens without closing form ─────────────────────────
  await page.locator('button[title="Last session"]').first().click();
  await page.waitForSelector('text=Last session', { timeout: 5_000 });
  await shot('07-form-clock-modal');
  const formBehind = await page.locator('text=Adding set').isVisible();
  if (formBehind) pass('11.2', 'add-set form visible behind modal');
  else fail('11.2', 'add-set form hidden by modal');

  // ── 11.3: dismiss → form still there, inputs intact ──────────────────────
  await dismissModal();
  await shot('08-form-after-dismiss');
  const formStill = await page.locator('text=Adding set').isVisible();
  if (formStill) pass('11.3', 'form still showing after modal dismiss');
  else fail('11.3', 'form gone after dismiss');

  // ── Section 15: auto-save ─────────────────────────────────────────────────
  console.log('\n── Section 15: auto-save on Add ──');
  await page.locator('input[placeholder="kg"]').fill('80');
  await page.locator('input[placeholder="Reps"]').fill('8');
  await page.locator('button', { hasText: /^Add$/ }).click();
  await page.waitForTimeout(2_000); // let auto-save finish
  await shot('09-set-added');

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await shot('10-after-reload');
  const persisted = await page.locator('text=80 kg').isVisible();
  if (persisted) pass('15.2', 'set present after reload — auto-save confirmed');
  else fail('15.2', 'set missing after reload — auto-save did not run');

  // ── Section 14: inline add-set form ──────────────────────────────────────
  console.log('\n── Section 14: inline add-set form ──');
  try {
    // Add a second exercise
    await page.locator('button', { hasText: /add exercise/i }).first().click();
    await page.waitForSelector('text=Select exercise', { timeout: 5_000 });
    await page.locator('ul li').nth(2).locator('button').first().click();
    await page.waitForSelector('text=Adding set', { timeout: 5_000 });
    await page.locator('input[placeholder="kg"]').fill('50');
    await page.locator('input[placeholder="Reps"]').fill('12');
    await page.locator('button', { hasText: /^Add$/ }).click();
    await page.waitForTimeout(1_500);
    await shot('11-two-exercises');

    // Click "+" on the first exercise
    const plusBtns = page.locator('button.rounded-full:has-text("+")');
    await plusBtns.first().click();
    await page.waitForSelector('text=Adding set', { timeout: 5_000 });
    await shot('12-inline-form-first-exercise');

    const allH2s    = await page.locator('h2').all();
    const formBox   = await page.locator('div').filter({ hasText: 'Adding set' }).last().boundingBox();
    const h2Boxes   = await Promise.all(allH2s.map(h => h.boundingBox()));
    const secondH2Y = h2Boxes[1]?.y ?? Infinity;

    if (formBox && h2Boxes.length >= 2) {
      const formBottom = formBox.y + formBox.height;
      if (formBottom <= secondH2Y + 8) {
        pass('14.1', `form bottom ${formBottom.toFixed(0)}px above second header ${secondH2Y.toFixed(0)}px`);
      } else {
        fail('14.1', `form bottom ${formBottom.toFixed(0)}px is BELOW second header ${secondH2Y.toFixed(0)}px`);
      }
    } else {
      fail('14.1', `could not measure — formBox:${!!formBox} h2Count:${h2Boxes.length}`);
    }

    await plusBtns.last().click();
    await page.waitForTimeout(400);
    await shot('13-inline-form-second-exercise');
    const formBox2  = await page.locator('div').filter({ hasText: 'Adding set' }).last().boundingBox();
    const h2Boxes2  = await Promise.all((await page.locator('h2').all()).map(h => h.boundingBox()));
    const secondH2Y2 = h2Boxes2[1]?.y ?? 0;
    if (formBox2 && h2Boxes2.length >= 2) {
      if (formBox2.y >= secondH2Y2 - 8) {
        pass('14.4', `form top ${formBox2.y.toFixed(0)}px — below second header ${secondH2Y2.toFixed(0)}px`);
      } else {
        fail('14.4', `form top ${formBox2.y.toFixed(0)}px — still above second header after switching`);
      }
    } else {
      fail('14.4', 'could not measure after switch');
    }
  } catch (e14) {
    fail('14.x', `section 14 crashed: ${e14.message.split('\n')[0]}`);
    // Dismiss any open modal/picker — up to two overlays may be stacked
    for (let i = 0; i < 3; i++) {
      const overlay = page.locator('[class*="fixed inset-0"]').first();
      if (await overlay.isVisible({ timeout: 500 }).catch(() => false)) {
        await page.mouse.click(5, 5).catch(() => {});
        await page.waitForTimeout(400);
      } else break;
    }
  }

  // ── Section 18: exercise picker muscle & category filter ─────────────────
  console.log('\n── Section 18: exercise picker muscle & category filter ──');

  // Open picker fresh
  await page.locator('button', { hasText: /add exercise/i }).first().click();
  await page.waitForSelector('text=Select exercise', { timeout: 5_000 });

  // 18.1 — chip rows present, full list shown
  const muscleChipCount = await page.locator('button').filter({ hasText: /^(abdominals|biceps|chest|glutes|hamstrings|lats|quadriceps|shoulders|triceps|calves|forearms|traps|adductors|neck|lower back|middle back)$/ }).count();
  const categoryChipCount = await page.locator('button').filter({ hasText: /^(strength|cardio|stretching|powerlifting|plyometrics|strongman|olympic weightlifting)$/ }).count();
  const fullListCount = await page.locator('ul li').count();
  if (muscleChipCount >= 16 && categoryChipCount >= 7) pass('18.1', `${muscleChipCount} muscle chips, ${categoryChipCount} category chips, ${fullListCount} exercises`);
  else fail('18.1', `muscle chips: ${muscleChipCount}, category chips: ${categoryChipCount}`);

  // 18.2 — single muscle chip narrows list
  await page.locator('button').filter({ hasText: /^chest$/ }).first().click();
  await page.waitForTimeout(300);
  const afterChest = await page.locator('ul li').count();
  if (afterChest < fullListCount && afterChest > 0) pass('18.2', `chest: ${afterChest} < ${fullListCount}`);
  else fail('18.2', `chest filter gave ${afterChest} (full=${fullListCount})`);

  // 18.3 — second muscle chip uses OR (count ≥ single chip)
  await page.locator('button').filter({ hasText: /^triceps$/ }).first().click();
  await page.waitForTimeout(300);
  const afterChestTriceps = await page.locator('ul li').count();
  if (afterChestTriceps >= afterChest) pass('18.3', `chest+triceps OR: ${afterChestTriceps} ≥ chest-only ${afterChest}`);
  else fail('18.3', `count shrank to ${afterChestTriceps} — unexpected AND behaviour`);

  // 18.5 — add category chip (AND across dimensions)
  await page.locator('button').filter({ hasText: /^strength$/ }).first().click();
  await page.waitForTimeout(300);
  const afterStrength = await page.locator('ul li').count();
  if (afterStrength <= afterChestTriceps) pass('18.5', `chest|triceps + strength: ${afterStrength} ≤ ${afterChestTriceps}`);
  else fail('18.5', `count grew to ${afterStrength} — AND not applied across dimensions`);

  // 18.7 — conflicting combo → no-results message, no silent relax
  await page.locator('button').filter({ hasText: /^strength$/ }).first().click(); // deactivate
  await page.locator('button').filter({ hasText: /^cardio$/ }).first().click();   // activate
  await page.waitForTimeout(300);
  const noResultsMsg = await page.locator('text=No exercises match your filters').isVisible().catch(() => false);
  if (noResultsMsg) pass('18.7', 'zero-result message shown for chest|triceps + cardio');
  else fail('18.7', 'no-results message not shown');

  // 18.8 — Clear filters restores full list
  if (noResultsMsg) {
    await page.locator('button', { hasText: /clear filters/i }).click();
    await page.waitForTimeout(300);
    const afterClear = await page.locator('ul li').count();
    if (afterClear === fullListCount) pass('18.8', `restored to ${afterClear}`);
    else fail('18.8', `after clear: ${afterClear}, expected ${fullListCount}`);
  } else {
    fail('18.8', 'skipped — 18.7 did not show no-results message');
  }

  // 18.10 — close picker and reopen: filter state reset
  await page.locator('button').filter({ hasText: /^biceps$/ }).first().click(); // activate a filter
  await page.waitForTimeout(200);
  // Close via backdrop
  await page.mouse.click(5, 5);
  await page.waitForTimeout(400);
  await page.locator('button', { hasText: /add exercise/i }).first().click();
  await page.waitForSelector('text=Select exercise', { timeout: 5_000 });
  const countAfterReopen = await page.locator('ul li').count();
  if (countAfterReopen === fullListCount) pass('18.10', `filter reset on reopen: ${countAfterReopen}`);
  else fail('18.10', `after reopen: ${countAfterReopen}, expected ${fullListCount} (filter leaked)`);

  // 18.12 — info modal muscle chip tap → modal closes, picker filtered
  // Tap the list area to clear autoFocus from the search input before clicking a button in the list
  await page.locator('ul li').first().locator('button[title="Exercise info"]').click({ force: true });
  await page.waitForTimeout(1_500);
  const modalUp = await page.locator('text=Primary Muscles').isVisible().catch(() => false);
  const primaryParent = page.locator('div').filter({ hasText: /^Primary Muscles/ }).first();
  const primaryMuscleBtns = await primaryParent.locator('button').all();
  if (modalUp && primaryMuscleBtns.length > 0) {
    const muscleName = (await primaryMuscleBtns[0].textContent()).trim();
    await primaryMuscleBtns[0].click();
    await page.waitForTimeout(600);
    const modalGone = !(await page.locator('text=Primary Muscles').isVisible().catch(() => false));
    const pickerOpen = await page.locator('text=Select exercise').isVisible().catch(() => false);
    const filteredCount = await page.locator('ul li').count();
    if (modalGone && pickerOpen && filteredCount < fullListCount)
      pass('18.12', `tapped "${muscleName}" in info modal → modal closed, picker filtered to ${filteredCount}`);
    else fail('18.12', `modalGone:${modalGone} pickerOpen:${pickerOpen} count:${filteredCount}`);
  } else {
    fail('18.12', `modal:${modalUp} muscle buttons:${primaryMuscleBtns.length}`);
  }

  // Close picker
  await page.mouse.click(5, 5);
  await page.waitForTimeout(300);

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
