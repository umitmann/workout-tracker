import AxeBuilder from '@axe-core/playwright'
import { test, expect } from '@playwright/test'
import { ptExerciseE2eEnabled, signIn } from './support'

test.describe('desktop 3D workout generator', () => {
  test.skip(!ptExerciseE2eEnabled(), 'Set PT_EXERCISE_E2E_ENABLED=true with disposable local fixtures.')

  test('selecting and programming an exercise updates the explainable muscle map', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', isMobile: false, hasTouch: false, deviceScaleFactor: 1 })
    const page = await context.newPage()
    try {
      await signIn(page, 'exerciseClient')
      await page.goto('/workouts/new?preview=workout-lab')

      const toggle = page.getByRole('button', { name: 'Open 3D generator' })
      await expect(toggle).toBeVisible()
      await expect(page.getByTestId('desktop-workout-generator')).toHaveCount(0)
      await toggle.click()

      const generator = page.getByTestId('desktop-workout-generator')
      await expect(generator).toBeVisible()
      await expect(generator.getByLabel(/Interactive 3D muscle map/)).toBeVisible()
      await expect(generator.getByRole('button', { name: 'Front view' })).toBeVisible()
      await expect(generator.getByRole('button', { name: 'Back view' })).toBeVisible()

      await generator.getByRole('searchbox', { name: 'Search exercises' }).fill('QA Snapshot Squat 47391')
      await generator.getByRole('button', { name: 'Add QA Snapshot Squat 47391' }).click()
      await expect(generator.getByLabel('Selected workout').getByRole('heading', { name: 'QA Snapshot Squat 47391' })).toBeVisible()

      const quadriceps = generator.getByRole('button', { name: 'Filter exercises by quadriceps' })
      await expect(quadriceps).toContainText('100%')
      await expect(quadriceps).toContainText('3 eq')
      await expect(generator.getByText('3', { exact: true }).first()).toBeVisible()

      const sets = generator.getByRole('spinbutton', { name: 'QA Snapshot Squat 47391 sets' })
      await sets.fill('5')
      await expect(sets).toHaveValue('5')
      await expect(quadriceps).toContainText('5 eq')
      await expect(generator.getByText('5', { exact: true }).first()).toBeVisible()

      await quadriceps.click()
      await expect(quadriceps).toHaveAttribute('aria-pressed', 'true')
      await expect(generator.getByRole('button', { name: 'Add QA Snapshot Squat 47391' })).toBeVisible()

      await generator.getByRole('button', { name: 'Fine-tune advanced targets' }).click()
      await expect(page.getByTestId('desktop-workout-generator')).toHaveCount(0)
      await expect(page.getByText('QA Snapshot Squat 47391', { exact: true })).toBeVisible()

      await page.getByRole('button', { name: 'Open 3D generator' }).click()
      await expect(page.getByRole('spinbutton', { name: 'QA Snapshot Squat 47391 sets' })).toHaveValue('5')
    } finally {
      await context.close()
    }
  })

  test('desktop generator has no serious accessibility violations and reflows safely to classic', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark', isMobile: false, hasTouch: false, deviceScaleFactor: 1 })
    const page = await context.newPage()
    try {
      await signIn(page, 'exerciseClient')
      await page.goto('/workouts/new?preview=workout-lab')
      await page.getByRole('button', { name: 'Open 3D generator' }).click()
      await expect(page.getByTestId('desktop-workout-generator')).toBeVisible()

      const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze()
      expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])

      for (const width of [1024, 1280, 1440, 1920]) {
        await page.setViewportSize({ width, height: 900 })
        await expect(page.getByTestId('desktop-workout-generator')).toBeVisible()
        const layout = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }))
        expect(layout.scrollWidth, `desktop generator overflow at ${width}px`).toBeLessThanOrEqual(layout.clientWidth + 1)
      }

      await page.setViewportSize({ width: 390, height: 844 })
      await expect(page.getByTestId('desktop-workout-generator')).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Open 3D generator' })).toBeHidden()
      await expect(page.getByRole('button', { name: 'Add exercise' })).toBeVisible()
      const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(documentWidth).toBeLessThanOrEqual(391)
    } finally {
      await context.close()
    }
  })

  test('mobile starts and stays on the existing workout editor', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    })
    const page = await context.newPage()
    try {
      await signIn(page, 'exerciseClient')
      await page.goto('/workouts/new')
      await expect(page.getByTestId('desktop-workout-generator')).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Open 3D generator' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Guide my workout' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: /choose muscles and see your load/i })).toHaveCount(0)
      await page.getByRole('button', { name: 'Add exercise' }).click()
      await expect(page.getByRole('dialog', { name: 'Select exercise' })).toBeVisible()
    } finally {
      await context.close()
    }
  })
})
