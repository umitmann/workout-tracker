/**
 * Run once to capture an authenticated session for headless testing.
 * Uses email/password auth — no Google OAuth, no blocked pop-ups.
 *
 * Prerequisites:
 *   1. Set TEST_EMAIL and TEST_PASSWORD in .env.local
 *   2. The account must already exist (register once via the app's Register tab)
 *
 *   node .claude/setup-auth.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'fs';

mkdirSync('.claude', { recursive: true });

// Load .env.local
let env = {};
try {
  const raw = readFileSync('.env.local', 'utf-8');
  for (const line of raw.split('\n')) {
    const [k, ...rest] = line.split('=');
    if (k && rest.length) env[k.trim()] = rest.join('=').trim();
  }
} catch {}

const email    = env['TEST_EMAIL'];
const password = env['TEST_PASSWORD'];

if (!email || !password) {
  console.error('❌ TEST_EMAIL or TEST_PASSWORD not set in .env.local');
  console.error('   Add them and re-run, e.g.:');
  console.error('     TEST_EMAIL=test@example.com');
  console.error('     TEST_PASSWORD=supersecret123');
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page    = await context.newPage();

console.log(`Signing in as ${email}…`);
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

// Click "Sign In" tab (active by default, but be explicit)
const signInTab = page.locator('button', { hasText: /^Sign In$/ });
if (await signInTab.isVisible()) await signInTab.click();

await page.locator('input[name="email"]').fill(email);
await page.locator('input[name="password"]').fill(password);
await page.locator('button[type="submit"]').click();

try {
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
} catch {
  const err = await page.locator('.text-red-500').first().textContent().catch(() => '');
  console.error(`❌ Sign-in failed: ${err || 'unknown error (wrong credentials?)'}`);
  await browser.close();
  process.exit(1);
}

await context.storageState({ path: '.claude/auth.json' });
console.log('✅ Auth state saved to .claude/auth.json — run verify_checklist.mjs now.');
await browser.close();
