/**
 * E2E smoke test for scenario: druh-tempo-timer (guided set → rest).
 * Drives the real app: start workout → pick a strength exercise → ▶ Guided →
 * Start → observe the full-screen tempo timer (big verb + countdown) →
 * Stop & log → assert a set is logged and the rest bar appears.
 *
 * Requires: app running at http://localhost:3000 and .claude/auth.json
 *   node .claude/setup-auth.mjs                 ← run once to create auth.json
 *   node .claude/test_guided-set-rest.mjs
 */
import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'fs'

const AUTH = '.claude/auth.json'
const SHOTS = '.claude/verify-shots/guided'
mkdirSync(SHOTS, { recursive: true })

if (!existsSync(AUTH)) {
  console.error('❌ No auth state. Run: node .claude/setup-auth.mjs')
  process.exit(1)
}

const results = []
const pass = (id, note = '') => { results.push({ id, ok: true, note }); console.log(`  ✅ ${id}${note ? ' — ' + note : ''}`) }
const fail = (id, note = '') => { results.push({ id, ok: false, note }); console.log(`  ❌ ${id}${note ? ' — ' + note : ''}`) }

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ storageState: AUTH, viewport: { width: 390, height: 844 } })
const page = await context.newPage()
const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png` })

try {
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' })
  if (!page.url().includes('/dashboard')) {
    console.error('❌ BLOCKED: auth expired. Run: node .claude/setup-auth.mjs')
    await browser.close(); process.exit(1)
  }

  console.log('\n── Guided set → rest ──')

  // Start a blank workout
  await page.locator('button', { hasText: /start workout/i }).first().click()
  await page.waitForURL('**/workout/**', { timeout: 10_000 })

  // Pick a strength exercise
  await page.locator('button', { hasText: /add exercise/i }).first().click()
  await page.waitForSelector('text=Select exercise', { timeout: 5_000 })
  const search = page.locator('input[placeholder*="Search" i]').first()
  await search.fill('Seated Cable Row')
  await page.waitForTimeout(300)
  await page.locator('ul li').filter({ hasText: /Seated Cable Row/i }).first().locator('button').first().click()
  await page.waitForSelector('text=Adding set', { timeout: 5_000 })

  // Enter the guided flow
  await page.locator('button', { hasText: /guided/i }).first().click()
  await page.waitForSelector('text=Guided set', { timeout: 5_000 })
  await shot('01-guided-setup')
  pass('G1', 'Guided setup opens with tempo steppers')

  // Start the timer
  await page.locator('button', { hasText: /^start$/i }).first().click()

  // A GET READY countdown runs first
  const ready = page.locator('text=/GET READY/i').first()
  const readyVisible = await ready.isVisible({ timeout: 2_000 }).catch(() => false)
  if (readyVisible) pass('G2a', 'GET READY countdown shows before the set'); else fail('G2a', 'No GET READY countdown')
  await shot('02-get-ready')

  // Then the full-screen timer shows a big action verb + whole-second countdown
  const verb = page.locator('text=/^(LOWER|HOLD|LIFT)$/').first()
  const verbVisible = await verb.isVisible({ timeout: 8_000 }).catch(() => false)
  if (verbVisible) pass('G2', 'Timer shows a big action verb'); else fail('G2', 'No action verb visible')
  await shot('03-timer-running')

  // Let the ready countdown (5s) + one rep (3-1-2-1 = 7s) elapse, then stop & log
  await page.waitForTimeout(13_000)
  await shot('04-timer-after-1rep')
  await page.locator('button', { hasText: /stop.*log/i }).first().click()

  // A set is logged and the rest bar appears
  const restBar = page.locator('text=/Resting|Rest over/').first()
  const restVisible = await restBar.isVisible({ timeout: 4_000 }).catch(() => false)
  if (restVisible) pass('G3', 'Rest timer auto-starts after the set'); else fail('G3', 'Rest bar did not appear')

  // The logged set row exists (reps recorded)
  const setRow = page.locator('text=/Reps/i').first()
  const setVisible = await setRow.isVisible({ timeout: 3_000 }).catch(() => false)
  if (setVisible) pass('G4', 'Set logged with reps'); else fail('G4', 'No set row found')
  await shot('05-rest-and-set')

  // Rest controls: ±15 and Done are present
  const done = page.locator('button', { hasText: /^done$/i }).first()
  if (await done.isVisible({ timeout: 2_000 }).catch(() => false)) pass('G5', 'Rest bar has a Done control')
  else fail('G5', 'Rest Done control missing')
} catch (err) {
  fail('EXCEPTION', String(err))
} finally {
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${failed.length ? '❌' : '✅'} ${results.length - failed.length}/${results.length} passed`)
  await browser.close()
  process.exit(failed.length ? 1 : 0)
}
