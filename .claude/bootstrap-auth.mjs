/**
 * Non-interactive replacement for setup-auth.mjs (WP-17, finding M12).
 *
 * setup-auth.mjs requires a human to have already registered the test
 * account by hand and to run the script locally. This script has the same
 * job — capture an authenticated Playwright storageState to
 * .claude/auth.json — but reads its credentials from an explicit env
 * contract instead of .env.local, so it can run unattended in CI (or any
 * headless box) once a seeded test account and reachable app URL exist:
 *
 *   SUPABASE_TEST_EMAIL     - email of a pre-existing, already-registered
 *                             test account (this script does not create
 *                             accounts; that's a Supabase-seeding concern,
 *                             out of scope for this packet)
 *   SUPABASE_TEST_PASSWORD  - its password
 *   SUPABASE_TEST_BASE_URL  - base URL of the running app to sign in against
 *                             (e.g. http://localhost:3000). Optional when
 *                             { allowDefaultBaseUrl: true } — defaults to
 *                             http://localhost:3000 for local dev-server use.
 *
 * Usage (documented in README.md):
 *   SUPABASE_TEST_EMAIL=... SUPABASE_TEST_PASSWORD=... \
 *     node .claude/bootstrap-auth.mjs
 *
 * This script never reads stdin/TTY and exits non-zero on any failure, so a
 * CI job can gate on it. It is deliberately NOT wired into ci.yml's
 * lint/tsc/test:unit/test:filters job — that job runs on every push with no
 * secrets, per WP-17's brief. Running this script (and the Playwright tier
 * it unlocks) against a seeded ephemeral Supabase project is a follow-up
 * infrastructure step that needs real secrets configured in the repo, which
 * this sandbox cannot provision or verify.
 */
import { mkdirSync } from 'node:fs'

/**
 * Pure env-contract validator — no I/O, no process access. Exported so
 * .claude/test_ci-config.mjs can assert the contract without launching a
 * browser or touching the filesystem.
 *
 * @param {Record<string, string | undefined>} env
 * @param {{ allowDefaultBaseUrl?: boolean }} [opts]
 * @returns {{ ok: true, email: string, password: string, baseUrl: string } | { ok: false, error: string }}
 */
export function readTestEnv(env, opts = {}) {
  const email = env.SUPABASE_TEST_EMAIL
  if (!email) {
    return { ok: false, error: 'Missing required env var: SUPABASE_TEST_EMAIL' }
  }
  const password = env.SUPABASE_TEST_PASSWORD
  if (!password) {
    return { ok: false, error: 'Missing required env var: SUPABASE_TEST_PASSWORD' }
  }
  let baseUrl = env.SUPABASE_TEST_BASE_URL
  if (!baseUrl) {
    if (opts.allowDefaultBaseUrl) {
      baseUrl = 'http://localhost:3000'
    } else {
      return { ok: false, error: 'Missing required env var: SUPABASE_TEST_BASE_URL' }
    }
  }
  return { ok: true, email, password, baseUrl }
}

async function main() {
  const result = readTestEnv(process.env, { allowDefaultBaseUrl: true })
  if (!result.ok) {
    console.error(`❌ ${result.error}`)
    console.error('   Set SUPABASE_TEST_EMAIL, SUPABASE_TEST_PASSWORD, and (optionally)')
    console.error('   SUPABASE_TEST_BASE_URL, then re-run:')
    console.error('     node .claude/bootstrap-auth.mjs')
    process.exit(1)
  }
  const { email, password, baseUrl } = result

  mkdirSync('.claude', { recursive: true })

  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()

  console.log(`Signing in as ${email} against ${baseUrl}…`)
  await page.goto(baseUrl, { waitUntil: 'networkidle' })

  const signInTab = page.locator('button', { hasText: /^Sign In$/ })
  if (await signInTab.isVisible()) await signInTab.click()

  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.locator('button[type="submit"]').click()

  try {
    await page.waitForURL('**/dashboard', { timeout: 15_000 })
  } catch {
    const err = await page.locator('.text-red-500').first().textContent().catch(() => '')
    console.error(`❌ Sign-in failed: ${err || 'unknown error (wrong credentials?)'}`)
    await browser.close()
    process.exit(1)
  }

  await context.storageState({ path: '.claude/auth.json' })
  console.log('✅ Auth state saved to .claude/auth.json — run verify_checklist.mjs now.')
  await browser.close()
}

// Only run the browser flow when invoked directly (`node bootstrap-auth.mjs`),
// not when imported by the test file for readTestEnv().
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
