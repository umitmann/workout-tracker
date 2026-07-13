import { test, expect } from '@playwright/test'
import {
  newSignedInContext,
  ptRelationshipE2eEnabled,
  requiredEnv,
} from './support'

test.describe('trainer relationship and consent surface', () => {
  test.skip(
    !ptRelationshipE2eEnabled(),
    'Set PT_RELATIONSHIP_E2E_ENABLED=true and provide dedicated trainer/trainee fixtures.',
  )

  test('request → bilateral activation → scoped grant → revoke → end', async ({ browser }) => {
    const trainerName = requiredEnv('PT_E2E_TRAINER_NAME')
    const traineeName = requiredEnv('PT_E2E_TRAINEE_NAME')
    const privateWorkoutMarker = requiredEnv('PT_E2E_COMPLETED_WORKOUT_MARKER')
    const trainee = await newSignedInContext(browser, 'trainee')
    const trainer = await newSignedInContext(browser, 'trainer')

    try {
      await test.step('trainee requests the trainer from the approved directory profile', async () => {
        await trainee.page.goto(`/trainers?q=${encodeURIComponent(trainerName)}`)
        const listing = trainee.page.getByRole('article').filter({ hasText: trainerName })
        await listing.getByRole('link', { name: /view profile/i }).click()
        await trainee.page.getByRole('button', { name: /request training/i }).click()
        await expect(trainee.page.getByRole('status')).toContainText(/request pending/i)
      })

      await test.step('trainer accepts, with both data categories still closed', async () => {
        await trainer.page.goto('/dashboard')
        const notificationLink = trainer.page.getByRole('link', {
          name: /^PT Requests \(1\)$/i,
        })
        await expect(notificationLink).toBeVisible()
        await notificationLink.click()
        const request = trainer.page.getByRole('article').filter({ hasText: traineeName })
        await expect(request.getByText(/^pending$/i)).toBeVisible()
        await request.getByRole('button', { name: /^accept$/i }).click()
        await expect(request.getByRole('status')).toContainText(/connection active/i)

        await trainer.page.goto('/dashboard')
        await expect(trainer.page.getByRole('link', { name: /^PT Requests$/i })).toBeVisible()
        await expect(trainer.page.getByRole('link', { name: /PT Requests \(/i })).toHaveCount(0)

        await trainer.page.goto('/trainer/connections')
        await trainer.page.reload()
        const active = trainer.page.getByRole('article').filter({ hasText: traineeName })
        await expect(active.getByText(/not shared/i)).toHaveCount(2)
        await expect(active).not.toContainText(privateWorkoutMarker)
      })

      await test.step('trainee grants only completed-workout consent from today', async () => {
        await trainee.page.goto('/connections')
        const connection = trainee.page.getByRole('article').filter({ hasText: trainerName })
        const workoutPermission = connection.getByRole('region', { name: /completed workout results/i })
        await workoutPermission.getByRole('combobox', { name: /history included/i }).selectOption('from_now')
        await workoutPermission.getByRole('button', { name: /grant access/i }).click()
        await expect(workoutPermission.getByRole('status')).toContainText(/permission granted/i)
        await expect(connection.getByText(/bodyweight history/i)).toBeVisible()
        await expect(connection.getByText(/^not shared$/i)).toBeVisible()
      })

      await test.step('trainer sees consent metadata but no result payload in Phase 3', async () => {
        await trainer.page.goto('/trainer/connections')
        const connection = trainer.page.getByRole('article').filter({ hasText: traineeName })
        await expect(connection.getByText(/shared from/i)).toBeVisible()
        await expect(connection.getByText(/bodyweight history/i)).toBeVisible()
        await expect(connection).not.toContainText(privateWorkoutMarker)
      })

      await test.step('trainee revokes, reviews audit history, and ends the relationship', async () => {
        await trainee.page.goto('/connections')
        const connection = trainee.page.getByRole('article').filter({ hasText: trainerName })
        const workoutPermission = connection.getByRole('region', { name: /completed workout results/i })
        await workoutPermission.getByRole('button', { name: /revoke access/i }).click()
        await expect(workoutPermission.getByRole('status')).toContainText(/permission revoked/i)

        await connection.getByRole('link', { name: /view consent history/i }).click()
        await expect(trainee.page.getByRole('heading', { name: /consent history/i })).toBeVisible()
        await expect(trainee.page.getByText(/sharing permission granted/i)).toBeVisible()
        await expect(trainee.page.getByText(/sharing permission revoked/i)).toBeVisible()

        await trainee.page.goto('/connections')
        const activeConnection = trainee.page.getByRole('article').filter({ hasText: trainerName })
        await activeConnection.getByRole('button', { name: /^end relationship$/i }).click()
        const dialog = trainee.page.getByRole('dialog', { name: /end relationship/i })
        await dialog.getByRole('button', { name: /^end relationship$/i }).click()
        await expect(activeConnection.getByRole('status')).toContainText(/connection ended/i)
      })
    } finally {
      // Best-effort fixture cleanup makes a failed mid-journey run rerunnable.
      try {
        await trainee.page.goto('/connections')
        const connection = trainee.page.getByRole('article').filter({ hasText: trainerName }).first()
        const endButton = connection.getByRole('button', {
          name: /^(?:end relationship|cancel request)$/i,
        }).first()
        if (await endButton.isVisible()) {
          await endButton.click()
          const dialog = trainee.page.getByRole('dialog')
          await dialog.getByRole('button', {
            name: /^(?:end relationship|cancel request)$/i,
          }).click()
        }
      } catch {
        // The primary assertion failure remains the useful test result.
      }
      await Promise.all([trainee.context.close(), trainer.context.close()])
    }
  })
})
