import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e/personal-trainer',
  testMatch: '**/*.spec.ts',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // The contract currently uses one dedicated trainer/trainee account set.
  // Increase this only after per-worker account/database fixtures exist.
  workers: 1,
  reporter: process.env.CI
    ? [['line'], ['html', { outputFolder: 'test-results/pt-html', open: 'never' }]]
    : [['list'], ['html', { outputFolder: 'test-results/pt-html', open: 'never' }]],
  outputDir: 'test-results/pt-artifacts',
  use: {
    baseURL: process.env.PT_E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: { ...devices['iPhone 13'] },
    },
  ],
})
