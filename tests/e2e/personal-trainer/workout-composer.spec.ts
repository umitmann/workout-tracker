import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  newSignedInContext,
  ptExerciseE2eEnabled,
} from './support'

/**
 * Acceptance contract for the additive workout-composition assistant:
 *
 * - It opens from the existing template editor; classic, mobile anatomy, and
 *   desktop 3D entry points remain independent and available.
 * - The questionnaire uses native, labelled controls for goal, schedule,
 *   experience, and equipment. It does not write a template by itself.
 * - Every round addresses one clearly named programming need and offers one to
 *   three explainable, prescribed exercises. Adding or dismissing a choice
 *   recomputes the following round.
 * - Finishing returns the choices to the normal editor and uses its existing
 *   Save flow. These scenarios never start a workout.
 */

const guideName = 'Workout composition guide'
const workoutLabUrl = '/workouts/new?preview=workout-lab'

async function openGuide(page: Page): Promise<Locator> {
  const trigger = page.getByRole('button', { name: 'Guide my workout' })
  await expect(trigger).toBeVisible()
  await trigger.click()

  const guide = page.getByRole('dialog', { name: guideName })
  await expect(guide).toBeVisible()
  await expect(guide.getByRole('heading', { name: 'Build a workout that fits' })).toBeVisible()
  return guide
}

async function completeBodyweightQuestionnaire(guide: Locator) {
  await guide.getByRole('radio', { name: 'General health' }).check()
  await guide.getByLabel('Training days per week').selectOption('2')
  await guide.getByLabel('Minutes per session').selectOption('45')
  await guide.getByRole('radio', { name: 'Beginner' }).check()
  await guide.getByRole('checkbox', { name: 'Bodyweight' }).check()
  await guide.getByRole('button', { name: 'Show suggestions' }).click()

  const direction = guide.getByRole('region', { name: 'Your training direction' })
  await expect(direction).toContainText('General health')
  await expect(direction).toContainText(/full[ -]?body/i)
  await expect(direction).toContainText(/2 (days|sessions)/i)
}

async function expectSuggestionRound(guide: Locator, round: number): Promise<Locator> {
  await expect(guide.getByText(`Round ${round}`, { exact: true })).toBeVisible()

  const suggestions = guide.getByRole('region', { name: /^Suggestions for / })
  await expect(suggestions).toBeVisible()
  const cards = suggestions.locator('[data-recommendation-card]')
  await expect.poll(() => cards.count()).toBeGreaterThanOrEqual(1)
  const count = await cards.count()
  expect(count, `round ${round} must show one to three choices for one need`).toBeGreaterThanOrEqual(1)
  expect(count, `round ${round} must show one to three choices for one need`).toBeLessThanOrEqual(3)

  for (let index = 0; index < count; index += 1) {
    const card = cards.nth(index)
    await expect(card.getByRole('heading', { level: 3 })).toBeVisible()
    await expect(card.getByText(/^Why this fits:/i)).toBeVisible()
    await expect(card).toContainText(/\b\d+\s+sets?\b/i)
    await expect(card).toContainText(/\b\d+(?:[–-]\d+)?\s+reps?\b/i)
    await expect(card).toContainText(/Equipment:\s*Bodyweight/i)
  }

  return suggestions
}

async function deleteTemplateIfPresent(page: Page, templateName: string) {
  await page.evaluate(() => { document.documentElement.style.zoom = '1' }).catch(() => {})
  await page.goto('/workouts')
  const card = page.getByRole('listitem').filter({ hasText: templateName })
  if (await card.count() === 0) return

  await card.getByRole('button', { name: `Actions for ${templateName}` }).click()
  await card.getByRole('button', { name: 'Delete…' }).click()
  const confirmation = page.getByRole('dialog', { name: `Delete ${templateName}` })
  await confirmation.getByRole('button', { name: 'Delete template permanently' }).click()
  await expect(page.getByText(templateName, { exact: true })).toHaveCount(0)
}

test.describe('guided workout composition', () => {
  test.skip(
    !ptExerciseE2eEnabled(),
    'Set PT_EXERCISE_E2E_ENABLED=true with the disposable exercise-client fixture.',
  )

  test('questionnaire constrains one-to-three suggestions and saves through the classic editor', async ({ browser }) => {
    const actor = await newSignedInContext(browser, 'exerciseClient')
    const templateName = `E2E Guided Composition ${Date.now()}`

    try {
      await actor.page.setViewportSize({ width: 390, height: 844 })
      await actor.page.goto(workoutLabUrl)
      await actor.page.getByPlaceholder('Workout name…').fill(templateName)

      await expect(actor.page.getByRole('button', { name: 'Add exercise' })).toBeVisible()
      const guide = await openGuide(actor.page)
      await completeBodyweightQuestionnaire(guide)

      let suggestions = await expectSuggestionRound(guide, 1)
      const firstCard = suggestions.locator('[data-recommendation-card]').first()
      const firstExercise = (await firstCard.getByRole('heading', { level: 3 }).innerText()).trim()
      await firstCard.getByRole('button', { name: `Add ${firstExercise}` }).click()

      suggestions = await expectSuggestionRound(guide, 2)
      await expect(suggestions.getByRole('heading', { name: firstExercise, exact: true })).toHaveCount(0)

      await guide.getByRole('button', { name: 'Undo last add' }).click()
      suggestions = await expectSuggestionRound(guide, 1)
      const restoredCard = suggestions.locator('[data-recommendation-card]').filter({ hasText: firstExercise })
      await expect(restoredCard).toHaveCount(1)
      await restoredCard.getByRole('button', { name: `Add ${firstExercise}` }).click()
      suggestions = await expectSuggestionRound(guide, 2)

      const dismissedCard = suggestions.locator('[data-recommendation-card]').first()
      const dismissedExercise = (await dismissedCard.getByRole('heading', { level: 3 }).innerText()).trim()
      await dismissedCard.getByRole('button', { name: `Not for me: ${dismissedExercise}` }).click()

      suggestions = await expectSuggestionRound(guide, 3)
      await expect(suggestions.getByRole('heading', { name: dismissedExercise, exact: true })).toHaveCount(0)

      await guide.getByRole('button', { name: 'Finish recommendations' }).click()
      await expect(guide).toHaveCount(0)

      // Recommendations become ordinary editable template rows. Saving remains
      // the established template action rather than a second persistence path.
      await expect(actor.page.getByText(firstExercise, { exact: true })).toBeVisible()
      await expect(actor.page.getByRole('button', { name: 'Add exercise' })).toBeVisible()
      await actor.page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(actor.page).toHaveURL(/\/workouts$/)

      const saved = actor.page.getByRole('listitem').filter({ hasText: templateName })
      await expect(saved).toBeVisible()
      await expect(saved).toContainText('1 exercise')
    } finally {
      await deleteTemplateIfPresent(actor.page, templateName).catch(() => {})
      await actor.context.close()
    }
  })

  test('questionnaire and recommendation rounds are keyboard-safe and reflow through 200% zoom', async ({ browser }) => {
    const actor = await newSignedInContext(browser, 'exerciseClient')

    try {
      await actor.page.setViewportSize({ width: 390, height: 844 })
      await actor.page.goto(workoutLabUrl)
      const trigger = actor.page.getByRole('button', { name: 'Guide my workout' })
      const guide = await openGuide(actor.page)

      await expect.poll(() => actor.page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true)

      await actor.page.keyboard.press('Escape')
      await expect(guide).toHaveCount(0)
      await expect(trigger).toBeFocused()

      const reopenedGuide = await openGuide(actor.page)
      await completeBodyweightQuestionnaire(reopenedGuide)
      await expectSuggestionRound(reopenedGuide, 1)

      await reopenedGuide.getByRole('button', { name: 'Back to questionnaire' }).click()
      await expect(reopenedGuide.getByLabel('Training days per week')).toHaveValue('2')
      await expect(reopenedGuide.getByLabel('Minutes per session')).toHaveValue('45')
      await reopenedGuide.getByLabel('Training days per week').selectOption('4')
      await expect(reopenedGuide.getByRole('group', { name: 'This session focus' })).toBeVisible()
      await reopenedGuide.getByRole('radio', { name: 'Lower body' }).check()
      await reopenedGuide.getByLabel('Training days per week').selectOption('2')
      await expect(reopenedGuide.getByRole('group', { name: 'This session focus' })).toHaveCount(0)
      await reopenedGuide.getByRole('button', { name: 'Show suggestions' }).click()
      await expectSuggestionRound(reopenedGuide, 1)

      for (const zoom of [0.8, 1, 1.5, 2]) {
        await actor.page.evaluate((value) => { document.documentElement.style.zoom = String(value) }, zoom)
        const layout = await actor.page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          content: document.documentElement.scrollWidth,
        }))
        expect(layout.content, `guide overflow at ${zoom * 100}% zoom`).toBeLessThanOrEqual(layout.viewport + 1)
        await expect(reopenedGuide.getByRole('button', { name: 'Close guide' })).toBeVisible()
      }
      await actor.page.evaluate(() => { document.documentElement.style.zoom = '1' })

      const results = await new AxeBuilder({ page: actor.page })
        .include('[role="dialog"]')
        .disableRules(['color-contrast'])
        .analyze()
      expect(
        results.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical'),
      ).toEqual([])
    } finally {
      await actor.context.close()
    }
  })

  test('the assistant remains additive to classic, mobile anatomy, and desktop 3D planning', async ({ browser }) => {
    const actor = await newSignedInContext(browser, 'exerciseClient')

    try {
      await actor.page.setViewportSize({ width: 390, height: 844 })
      await actor.page.goto(workoutLabUrl)

      await expect(actor.page.getByRole('button', { name: 'Guide my workout' })).toBeVisible()
      await expect(actor.page.getByRole('button', { name: 'Add exercise' })).toBeVisible()
      await actor.page.getByRole('button', { name: /choose muscles and see your load/i }).click()
      const anatomy = actor.page.getByRole('dialog', { name: /mobile muscle planner/i })
      await expect(anatomy).toBeVisible()
      await anatomy.getByRole('button', { name: /close muscle planner/i }).click()
      await expect(actor.page.getByRole('button', { name: 'Guide my workout' })).toBeVisible()

      const guide = await openGuide(actor.page)
      await completeBodyweightQuestionnaire(guide)
      let suggestions = await expectSuggestionRound(guide, 1)
      const firstNeed = await suggestions.getAttribute('aria-label')
      await guide.getByRole('button', { name: 'Skip this gap' }).click()
      suggestions = await expectSuggestionRound(guide, 2)
      await expect.poll(() => suggestions.getAttribute('aria-label')).not.toBe(firstNeed)
      await guide.getByRole('button', { name: 'Choose manually' }).click()
      await expect(guide).toHaveCount(0)
      const picker = actor.page.getByRole('dialog', { name: 'Select exercise' })
      await expect(picker).toBeVisible()
      await actor.page.keyboard.press('Escape')
      await expect(picker).toHaveCount(0)

      await actor.page.setViewportSize({ width: 1280, height: 900 })
      const desktopToggle = actor.page.getByRole('button', { name: 'Open 3D generator' })
      await expect(desktopToggle).toBeVisible()
      await desktopToggle.click()
      await expect(actor.page.getByTestId('desktop-workout-generator')).toBeVisible()

      await actor.page.getByRole('button', { name: 'Use classic editor' }).click()
      await expect(actor.page.getByTestId('desktop-workout-generator')).toHaveCount(0)
      await expect(actor.page.getByRole('button', { name: 'Guide my workout' })).toBeVisible()
      await expect(actor.page.getByRole('button', { name: 'Add exercise' })).toBeVisible()
    } finally {
      await actor.context.close()
    }
  })

  test('unfinished planning tools stay hidden without the preview link', async ({ browser }) => {
    const actor = await newSignedInContext(browser, 'exerciseClient')
    try {
      await actor.page.setViewportSize({ width: 390, height: 844 })
      await actor.page.goto('/workouts/new')
      await expect(actor.page.getByRole('button', { name: 'Guide my workout' })).toHaveCount(0)
      await expect(actor.page.getByRole('button', { name: /choose muscles and see your load/i })).toHaveCount(0)
      await expect(actor.page.getByRole('button', { name: 'Add exercise' })).toBeVisible()

      await actor.page.goto(workoutLabUrl)
      await expect(actor.page.getByRole('button', { name: 'Guide my workout' })).toBeVisible()
      await expect(actor.page.getByRole('button', { name: /choose muscles and see your load/i })).toBeVisible()
    } finally {
      await actor.context.close()
    }
  })
})
