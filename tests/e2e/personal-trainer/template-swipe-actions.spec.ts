import { test, expect, type Locator } from '@playwright/test'
import { newSignedInContext, ptExerciseE2eEnabled } from './support'

async function dragHorizontally(surface: Locator, deltaX: number) {
  const box = await surface.boundingBox()
  if (!box) throw new Error('Template swipe surface is not visible')

  const startX = box.x + box.width / 2
  const y = box.y + Math.min(box.height / 2, 44)
  const page = surface.page()
  await page.mouse.move(startX, y)
  await page.mouse.down()
  await page.mouse.move(startX + deltaX, y, { steps: 8 })
  await page.mouse.up()
}

test.describe('workout template swipe actions', () => {
  test.skip(!ptExerciseE2eEnabled(), 'Set PT_EXERCISE_E2E_ENABLED=true to run stateful template swipe behavior.')

  test('left starts immediately while right always confirms deletion', async ({ browser }) => {
    const actor = await newSignedInContext(browser, 'exerciseClient')
    const templateName = `E2E Swipe Template ${Date.now()}`

    try {
      await actor.page.goto('/workouts/new')
      await actor.page.getByPlaceholder('Workout name…').fill(templateName)
      await actor.page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(actor.page).toHaveURL(/\/workouts$/)

      let card = actor.page.getByRole('listitem').filter({ hasText: templateName })
      await expect(card).toBeVisible()
      await expect(actor.page.getByText('Swipe right to delete')).toBeVisible()
      await expect(actor.page.getByText('Swipe left to start')).toBeVisible()

      await dragHorizontally(card.locator('[data-template-swipe-surface]'), -100)
      await expect(actor.page).toHaveURL(/\/workout\/\d+$/)

      await actor.page.getByRole('button', { name: /back/i }).first().click()
      const leaveDialog = actor.page.getByRole('dialog', { name: 'Leave workout?' })
      await leaveDialog.getByRole('button', { name: 'Delete workout' }).click()
      const workoutDeleteDialog = actor.page.getByRole('dialog', { name: 'Delete this workout?' })
      await workoutDeleteDialog.getByRole('button', { name: 'Delete', exact: true }).click()
      await expect(actor.page).toHaveURL(/\/dashboard(?:\?|$)/)

      await actor.page.goto('/workouts')
      card = actor.page.getByRole('listitem').filter({ hasText: templateName })
      await dragHorizontally(card.locator('[data-template-swipe-surface]'), 100)

      let templateDeleteDialog = actor.page.getByRole('dialog', { name: `Delete ${templateName}` })
      await expect(templateDeleteDialog).toBeVisible()
      await templateDeleteDialog.getByRole('button', { name: 'Cancel' }).click()
      await expect(card).toBeVisible()

      await dragHorizontally(card.locator('[data-template-swipe-surface]'), 100)
      templateDeleteDialog = actor.page.getByRole('dialog', { name: `Delete ${templateName}` })
      await templateDeleteDialog.getByRole('button', { name: 'Delete template permanently' }).click()
      await expect(actor.page).toHaveURL(/\/workouts$/)
      await expect(actor.page.getByText(templateName, { exact: true })).toHaveCount(0)
    } finally {
      await actor.context.close()
    }
  })
})
