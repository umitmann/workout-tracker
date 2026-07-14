import { test, expect, type Locator, type Page } from '@playwright/test'
import { newSignedInContext, ptE2eEnabled } from './support'

async function startWorkoutWithExercise(page: Page) {
  await page.goto('/dashboard')
  await page.getByRole('button', { name: /start workout/i }).click()
  await expect(page).toHaveURL(/\/workout\/\d+$/)
  await page.getByRole('button', { name: /add exercise/i }).click()
  const picker = page.getByRole('dialog', { name: /select exercise/i })
  await picker.getByRole('button', { name: /QA Snapshot Squat 47391/i }).click()
  await expect(page.getByText('Adding set')).toBeVisible()
}

async function addStrengthSet(page: Page, weight: string, reps: string) {
  const addCard = page.getByText('Adding set').locator('..').locator('..')
  await enterStepper(page, addCard, 'Weight (kg)', weight)
  await enterStepper(page, addCard, 'Reps', reps)
  await addCard.getByRole('button', { name: /^add$/i }).click()
}

async function enterStepper(page: Page, scope: Locator, label: string, value: string) {
  const input = scope.getByRole('textbox', { name: label, exact: true })
  const existing = await input.inputValue()
  await input.click()
  const numpad = page.getByRole('dialog', { name: `Enter ${label}` })
  for (let i = 0; i < existing.length; i += 1) {
    await numpad.getByRole('button', { name: /delete last digit/i }).click()
  }
  for (const digit of value) {
    await numpad.getByRole('button', { name: digit, exact: true }).click()
  }
  await numpad.getByRole('button', { name: /^done$/i }).click()
}

async function deleteWorkout(page: Page) {
  await page.getByRole('button', { name: /back/i }).first().click()
  const leave = page.getByRole('dialog', { name: /leave workout/i })
  await leave.getByRole('button', { name: /delete workout/i }).click()
  const confirm = page.getByRole('dialog', { name: /delete this workout/i })
  await confirm.getByRole('button', { name: /^delete$/i }).click()
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/)
}

async function restSecondsRemaining(page: Page): Promise<number> {
  const restHeader = page.getByText('Resting', { exact: true })
  const text = await restHeader.locator('..').textContent()
  const match = text?.match(/(\d+):(\d{2})/)
  if (!match) throw new Error(`Could not read rest countdown from: ${text}`)
  return Number(match[1]) * 60 + Number(match[2])
}

test.describe('active workout guided behavior', () => {
  test.skip(!ptE2eEnabled(), 'Set PT_E2E_ENABLED=true with disposable local fixtures.')

  test('keeps dropset weights until the user explicitly applies one weight to all sets', async ({ browser }) => {
    const session = await newSignedInContext(browser, 'exerciseClient')
    try {
      await startWorkoutWithExercise(session.page)
      await addStrengthSet(session.page, '60', '8')
      await addStrengthSet(session.page, '50', '6')

      await expect(session.page.getByText('60 kg', { exact: true })).toBeVisible()
      await expect(session.page.getByText('50 kg', { exact: true })).toBeVisible()

      await session.page.getByText('60 kg', { exact: true }).click()
      const applyAll = session.page.getByRole('button', { name: /apply weight to all sets/i })
      const editor = applyAll.locator('xpath=../..')
      await enterStepper(session.page, editor, 'Weight (kg)', '70')
      await applyAll.click()
      await session.page.getByRole('button', { name: /close set editor/i }).click()

      await expect(session.page.getByText('70 kg', { exact: true })).toHaveCount(2)
      await deleteWorkout(session.page)
    } finally {
      await session.context.close()
    }
  })

  test('guided completion restarts an already-running main rest timer', async ({ browser }) => {
    const session = await newSignedInContext(browser, 'exerciseClient')
    try {
      await startWorkoutWithExercise(session.page)
      await addStrengthSet(session.page, '60', '8')
      await addStrengthSet(session.page, '50', '1')

      // Plain Add completes the set and starts the main rest timer.
      await expect(session.page.getByText('Resting', { exact: true })).toBeVisible()
      await session.page.waitForTimeout(2_100)
      const beforeGuide = await restSecondsRemaining(session.page)

      await session.page.getByText('50 kg', { exact: true }).click()
      await session.page.getByRole('button', { name: /start guided set/i }).click()
      const setup = session.page.getByRole('dialog', { name: /guided set:/i })
      for (const [label, value] of [
        ['Goal reps', '1'],
        ['Down', '1'],
        ['Rest', '0'],
        ['Up', '0'],
        ['Hold', '0'],
      ] as const) {
        await enterStepper(session.page, setup, label, value)
      }
      await setup.getByRole('button', { name: /^start$/i }).click()
      const guidedAudio = session.page.getByRole('button', { name: /audio on/i })
      await expect(guidedAudio).toBeVisible()
      await session.page.getByRole('button', { name: /start now/i }).click()

      await expect(guidedAudio).toBeHidden({ timeout: 5_000 })
      await expect(session.page.getByText('Resting', { exact: true })).toBeVisible({ timeout: 5_000 })
      const afterGuide = await restSecondsRemaining(session.page)
      expect(afterGuide).toBeGreaterThan(beforeGuide)
      expect(afterGuide).toBeGreaterThanOrEqual(89)

      await deleteWorkout(session.page)
    } finally {
      await session.context.close()
    }
  })
})
