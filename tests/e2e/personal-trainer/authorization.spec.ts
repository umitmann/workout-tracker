import { test, expect } from '@playwright/test'
import { actorCredentials, newSignedInContext, ptE2eEnabled, requiredEnv } from './support'

test.describe('personal trainer privacy boundaries', () => {
  test.skip(!ptE2eEnabled(), 'Set PT_E2E_ENABLED=true and provide the seeded multi-actor fixture environment.')

  test('unapproved and suspended trainers do not appear in discovery', async ({ browser }) => {
    const trainee = await newSignedInContext(browser, 'trainee')
    try {
      await trainee.page.goto('/trainers')
      const search = trainee.page.getByRole('searchbox', { name: /find a trainer/i })

      for (const hiddenName of [
        requiredEnv('PT_E2E_PENDING_TRAINER_NAME'),
        requiredEnv('PT_E2E_SUSPENDED_TRAINER_NAME'),
      ]) {
        await search.fill(hiddenName)
        await trainee.page.getByRole('button', { name: /search trainers/i }).click()
        await expect(trainee.page.getByRole('article').filter({ hasText: hiddenName })).toHaveCount(0)
      }
    } finally {
      await trainee.context.close()
    }
  })

  test('unrelated trainer cannot enumerate another trainee dashboard', async ({ browser }) => {
    const otherTrainer = await newSignedInContext(browser, 'otherTrainer')
    const traineePublicId = requiredEnv('PT_E2E_TRAINEE_PUBLIC_ID')
    const completedWorkoutMarker = requiredEnv('PT_E2E_COMPLETED_WORKOUT_MARKER')
    const traineeEmail = actorCredentials('trainee').email
    try {
      await otherTrainer.page.goto(`/trainer/clients/${encodeURIComponent(traineePublicId)}`)
      await expect(otherTrainer.page.getByRole('heading', { name: /access denied|not found/i })).toBeVisible()
      await expect(otherTrainer.page.getByText(completedWorkoutMarker)).toHaveCount(0)
      await expect(otherTrainer.page.getByText(traineeEmail)).toHaveCount(0)
    } finally {
      await otherTrainer.context.close()
    }
  })
})
