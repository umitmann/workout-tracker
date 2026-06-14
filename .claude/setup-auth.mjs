/**
 * Run once to capture an authenticated session.
 * Opens a real browser — sign in normally, then close the tab.
 * Saves auth state to .claude/auth.json for reuse by verify_checklist.mjs.
 *
 *   node .claude/setup-auth.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

mkdirSync('.claude', { recursive: true });

const browser = await chromium.launch({ headless: false, slowMo: 100 });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();

await page.goto('http://localhost:3000');
console.log('Sign in to the app in the browser window that just opened.');
console.log('After you reach the dashboard, this script saves the session automatically.');

await page.waitForURL('**/dashboard', { timeout: 300_000 });
await context.storageState({ path: '.claude/auth.json' });
console.log('✅ Auth state saved to .claude/auth.json — you can run verify_checklist.mjs now.');
await browser.close();
