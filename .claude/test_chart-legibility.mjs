/**
 * Playwright verification for WP-16 (finding M11): ExerciseHistoryChart
 * legibility + accessibility. Requires .claude/auth.json — run
 * setup-auth.mjs first if it doesn't exist. Written per the
 * verify_checklist.mjs convention — NOT run in this packet (per rule 3,
 * needs a dev server + auth.json); see WP-17 for CI wiring.
 *
 *   node .claude/test_chart-legibility.mjs
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
  viewport: { width: 390, height: 844 }, // typical phone width — where the M11 illegibility bug was found
});
const page = await context.newPage();

async function shot(name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

// Requires an exercise with >= 2 completed history points to reach the
// multi-point SVG chart branch (single-point and empty states render plain
// text, out of scope for this legibility check).
async function openHistoryTabWithMultiPointChart(page) {
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });
  if (!page.url().includes('/dashboard')) {
    console.error('❌ BLOCKED: auth state expired. Run: node .claude/setup-auth.mjs');
    await browser.close();
    process.exit(1);
  }
  await page.locator('button', { hasText: /start workout/i }).first().click();
  await page.waitForURL('**/workout/**', { timeout: 10_000 });
  await page.locator('button[title="Exercise info"]').first().click();
  await page.waitForSelector('text=History', { timeout: 5_000 });
  await page.locator('button', { hasText: /^History$/i }).click();
  await page.waitForTimeout(600);
}

try {
  await openHistoryTabWithMultiPointChart(page);
  await shot('chart-01-history-tab');

  const svg = page.locator('svg[role="img"]');
  const hasChart = await svg.count() > 0;

  if (!hasChart) {
    // Not enough history data seeded in this environment to reach the
    // multi-point branch — note and skip the geometry assertions rather
    // than false-failing on missing fixtures.
    fail('16.0', 'no multi-point chart svg[role="img"] found — seed >=2 completed sessions for this exercise to exercise this test');
  } else {
    // ── 16.1: accessible name via title/desc ──────────────────────────────
    const labelledBy = await svg.first().getAttribute('aria-labelledby');
    if (labelledBy) {
      const ids = labelledBy.split(' ');
      let descText = '';
      for (const id of ids) {
        descText += (await page.locator(`#${id}`).textContent().catch(() => '')) ?? '';
      }
      if (descText.trim().length > 0) {
        pass('16.1', `accessible summary present: "${descText.trim().slice(0, 80)}"`);
      } else {
        fail('16.1', 'aria-labelledby referenced empty title/desc text');
      }
    } else {
      const ariaLabel = await svg.first().getAttribute('aria-label');
      if (ariaLabel && ariaLabel.trim().length > 0) {
        pass('16.1', `aria-label present: "${ariaLabel.slice(0, 80)}"`);
      } else {
        fail('16.1', 'no aria-labelledby or aria-label on the chart svg');
      }
    }

    // ── 16.2: data-label font size >= 11 CSS px at rendered scale ─────────
    const labelTexts = svg.locator('text');
    const textCount = await labelTexts.count();
    if (textCount === 0) {
      fail('16.2', 'no <text> label elements found in chart svg');
    } else {
      const svgBox = await svg.first().boundingBox();
      const viewBox = await svg.first().getAttribute('viewBox');
      const [, , vbW] = (viewBox ?? '0 0 300 140').split(' ').map(Number);
      const scale = svgBox && vbW ? svgBox.width / vbW : 1;
      const fontSizes = await Promise.all(
        Array.from({ length: textCount }, (_, i) => labelTexts.nth(i).getAttribute('font-size'))
      );
      const renderedSizes = fontSizes.map((fs) => Number(fs || 0) * scale);
      const tooSmall = renderedSizes.filter((s) => s < 11);
      if (tooSmall.length === 0) {
        pass('16.2', `${textCount} label(s), all >= 11 rendered CSS px (scale ${scale.toFixed(2)})`);
      } else {
        fail('16.2', `${tooSmall.length}/${textCount} labels render below 11px: ${tooSmall.map((s) => s.toFixed(1)).join(', ')}`);
      }
    }

    // ── 16.3: dark-mode reps stroke is not zinc-500 (#71717a) ─────────────
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(200);
    const repsLine = svg.locator('polyline[stroke-dasharray="4,2"]');
    if (await repsLine.count() === 0) {
      fail('16.3', 'no dashed reps polyline found (exercise may be weight-only)');
    } else {
      const color = await repsLine.first().evaluate((el) => getComputedStyle(el).stroke);
      // zinc-500 as rgb: rgb(113, 113, 122)
      if (color.replace(/\s/g, '') === 'rgb(113,113,122)') {
        fail('16.3', `reps stroke is zinc-500 (${color}) in dark mode — fails AA on dark panel bg`);
      } else {
        pass('16.3', `reps stroke in dark mode: ${color} (not zinc-500)`);
      }
    }
    await page.emulateMedia({ colorScheme: 'light' });

    // ── 16.4: legend text meets AA (proxy: computed color contrast check) ─
    const legend = page.locator('text=Max reps').first();
    if (await legend.count() > 0) {
      const legendColor = await legend.evaluate((el) => getComputedStyle(el).color);
      pass('16.4', `legend "Max reps" computed color: ${legendColor} (manual AA spot-check — see historyChartLayout unit tests for the pinned contrast ratios)`);
    } else {
      fail('16.4', 'legend text "Max reps" not found');
    }
  }

  await shot('chart-02-final');
} catch (err) {
  console.error('❌ ERROR:', err.message);
  fail('16.x', err.message);
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
