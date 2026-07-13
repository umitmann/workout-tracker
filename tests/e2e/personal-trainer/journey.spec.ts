import { test, expect } from '@playwright/test'
import {
  actorCredentials,
  localDateDaysFromNow,
  newSignedInContext,
  ptE2eEnabled,
  requiredEnv,
} from './support'

test.describe('personal trainer consent journey', () => {
  test.skip(!ptE2eEnabled(), 'Set PT_E2E_ENABLED=true and provide the seeded multi-actor fixture environment.')

  test('discover → connect → assign → grant → revoke → end', async ({ browser }) => {
    const trainerName = requiredEnv('PT_E2E_TRAINER_NAME')
    const traineeName = requiredEnv('PT_E2E_TRAINEE_NAME')
    const templateName = requiredEnv('PT_E2E_TRAINER_TEMPLATE_NAME')
    const completedWorkoutMarker = requiredEnv('PT_E2E_COMPLETED_WORKOUT_MARKER')
    const privateBodyweightMarker = requiredEnv('PT_E2E_PRIVATE_BODYWEIGHT_MARKER')
    const scheduledDate = localDateDaysFromNow(7)

    const trainee = await newSignedInContext(browser, 'trainee')
    const trainer = await newSignedInContext(browser, 'trainer')

    try {
      await test.step('trainee finds an approved trainer without private account data', async () => {
        await trainee.page.goto('/trainers')
        await expect(trainee.page.getByRole('heading', { name: /personal trainers/i })).toBeVisible()
        await trainee.page.getByRole('searchbox', { name: /find a trainer/i }).fill(trainerName)
        await trainee.page.getByRole('button', { name: /search trainers/i }).click()

        const listing = trainee.page.getByRole('article').filter({ hasText: trainerName })
        await expect(listing).toBeVisible()
        await expect(listing).not.toContainText(actorCredentials('trainer').email)
        await listing.getByRole('link', { name: /view profile/i }).click()
        await trainee.page.getByRole('button', { name: /request training/i }).click()
        await expect(trainee.page.getByText(/request pending/i)).toBeVisible()
      })

      await test.step('trainer accepts; activation alone does not share results', async () => {
        await trainer.page.goto('/trainer/connections')
        const request = trainer.page.getByRole('article').filter({ hasText: traineeName })
        await expect(request.getByText(/pending/i)).toBeVisible()
        await request.getByRole('button', { name: /^accept$/i }).click()
        await expect(request.getByText(/active/i)).toBeVisible()

        await trainer.page.goto('/trainer/clients')
        await trainer.page.getByRole('link', { name: traineeName }).click()
        await expect(trainer.page.getByText(/results are not shared/i)).toBeVisible()
        await expect(trainer.page.getByText(completedWorkoutMarker)).toHaveCount(0)
      })

      let clientUrl = ''
      await test.step('active trainer assigns an immutable workout plan', async () => {
        clientUrl = trainer.page.url()
        await trainer.page.getByRole('button', { name: /schedule workout/i }).click()
        const dialog = trainer.page.getByRole('dialog', { name: /schedule workout/i })
        await dialog.getByLabel(/workout template/i).selectOption({ label: templateName })
        await dialog.getByLabel(/scheduled date/i).fill(scheduledDate)
        await dialog.getByRole('button', { name: /^assign$/i }).click()
        await expect(trainer.page.getByText(/workout assigned/i)).toBeVisible()

        await trainee.page.goto('/dashboard')
        await trainee.page.getByRole('button', { name: new RegExp(scheduledDate) }).click()
        const planDialog = trainee.page.getByRole('dialog')
        await expect(planDialog).toContainText(templateName)
        await expect(planDialog).toContainText(trainerName)
      })

      await test.step('trainee grants completed-workout access only', async () => {
        await trainee.page.goto('/connections')
        const connection = trainee.page.getByRole('article').filter({ hasText: trainerName })
        await connection.getByRole('button', { name: /manage access/i }).click()
        const accessDialog = trainee.page.getByRole('dialog', { name: /trainer access/i })
        await accessDialog.getByRole('checkbox', { name: /completed workout results/i }).check()
        await accessDialog.getByRole('button', { name: /^save access$/i }).click()
        await expect(trainee.page.getByText(/access updated/i)).toBeVisible()

        await trainer.page.goto(clientUrl)
        await expect(trainer.page.getByText(completedWorkoutMarker)).toBeVisible()
        await expect(trainer.page.getByText(/in progress/i)).toHaveCount(0)
        await expect(trainer.page.getByText(privateBodyweightMarker)).toHaveCount(0)
      })

      await test.step('revocation removes result access on the next request', async () => {
        await trainee.page.goto('/connections')
        const connection = trainee.page.getByRole('article').filter({ hasText: trainerName })
        await connection.getByRole('button', { name: /manage access/i }).click()
        const accessDialog = trainee.page.getByRole('dialog', { name: /trainer access/i })
        await accessDialog.getByRole('checkbox', { name: /completed workout results/i }).uncheck()
        await accessDialog.getByRole('button', { name: /^save access$/i }).click()

        await trainer.page.goto(clientUrl)
        await expect(trainer.page.getByText(/results are not shared/i)).toBeVisible()
        await expect(trainer.page.getByText(completedWorkoutMarker)).toHaveCount(0)
      })

      await test.step('ending the relationship blocks trainer planning immediately', async () => {
        await trainee.page.goto('/connections')
        const connection = trainee.page.getByRole('article').filter({ hasText: trainerName })
        await connection.getByRole('button', { name: /end relationship/i }).click()
        const confirm = trainee.page.getByRole('dialog', { name: /end relationship/i })
        await confirm.getByRole('button', { name: /^end relationship$/i }).click()
        await expect(connection.getByText(/ended/i)).toBeVisible()

        await trainer.page.goto(clientUrl)
        await expect(trainer.page.getByRole('heading', { name: /access ended/i })).toBeVisible()
        await expect(trainer.page.getByRole('button', { name: /schedule workout/i })).toHaveCount(0)
      })
    } finally {
      await Promise.all([trainee.context.close(), trainer.context.close()])
    }
  })
})
