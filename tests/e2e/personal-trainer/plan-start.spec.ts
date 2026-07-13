import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required plan-start E2E variable: ${name}`)
  return value
}

async function signIn(
  browser: Browser,
  actor: 'TRAINEE' | 'TRAINER',
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto('/')
  await page.getByLabel('Email').fill(required(`PT_PLAN_E2E_${actor}_EMAIL`))
  await page.getByLabel('Password').fill(required(`PT_PLAN_E2E_${actor}_PASSWORD`))
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/)
  return { context, page }
}

function futureLocalDate(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

test.describe('immutable plan start in the real logger', () => {
  test.skip(
    process.env.PT_PLAN_START_E2E_ENABLED !== 'true',
    'Use a resettable active-relationship fixture to run the stateful plan-start journey.',
  )

  test('trainer assigns snapshot → trainee reviews → one linked workout opens', async ({ browser }) => {
    const relationshipId = required('PT_PLAN_E2E_RELATIONSHIP_ID')
    const templateName = required('PT_PLAN_E2E_TEMPLATE_NAME')
    const exerciseMarker = required('PT_PLAN_E2E_TEMPLATE_EXERCISE_MARKER')
    const trainerName = required('PT_PLAN_E2E_TRAINER_NAME')
    const scheduledDate = futureLocalDate(11)
    const uniqueTitle = `Snapshot QA ${Date.now()}`
    const trainer = await signIn(browser, 'TRAINER')
    const trainee = await signIn(browser, 'TRAINEE')

    try {
      await test.step('assignment is created from the trainer client workspace', async () => {
        await trainer.page.goto(`/trainer/clients/${relationshipId}`)
        await trainer.page.getByRole('button', { name: /schedule workout/i }).click()
        const dialog = trainer.page.getByRole('dialog', { name: /schedule workout/i })
        await dialog.getByLabel(/workout template/i).selectOption({ label: templateName })
        await dialog.getByLabel(/scheduled date/i).fill(scheduledDate)
        await dialog.getByLabel(/session title/i).fill(uniqueTitle)
        await dialog.getByLabel(new RegExp(`notes for`, 'i')).fill('Keep the prescription exactly as assigned.')
        await dialog.getByRole('button', { name: /^assign$/i }).click()
        await expect(dialog.getByRole('status')).toContainText(/workout assigned/i)
      })

      await test.step('trainee sees attribution and the immutable exercise snapshot', async () => {
        await trainee.page.goto('/dashboard')
        await trainee.page.getByRole('button', {
          name: `Open workout plan on ${scheduledDate}: ${uniqueTitle}`,
        }).click()
        const dialog = trainee.page.getByRole('dialog', {
          name: `${uniqueTitle} workout plan`,
        })
        await expect(dialog).toContainText(trainerName)
        await expect(dialog).toContainText(exerciseMarker)
        await expect(dialog).toContainText(/prescription is fixed at assignment/i)
        await expect(dialog.getByRole('button', { name: /^start workout$/i })).toHaveCount(1)
        await dialog.getByRole('button', { name: /^start workout$/i }).click()
      })

      await test.step('atomic start opens the existing logger with the prescribed exercise', async () => {
        await expect(trainee.page).toHaveURL(/\/workout\/\d+$/)
        await expect(trainee.page.getByText(exerciseMarker, { exact: false }).first()).toBeVisible()

        // Keep the disposable fixture tidy at the workout layer. The started
        // plan/audit row remains intentionally immutable and is removed only
        // by resetting this dedicated test project.
        await trainee.page.getByRole('button', { name: /back/i }).first().click()
        const leave = trainee.page.getByRole('dialog', { name: /leave workout/i })
        await leave.getByRole('button', { name: /delete workout/i }).click()
        const confirm = trainee.page.getByRole('dialog', { name: /delete this workout/i })
        await confirm.getByRole('button', { name: /^delete$/i }).click()
        await expect(trainee.page).toHaveURL(/\/dashboard(?:\?|$)/)
      })
    } finally {
      await Promise.all([trainer.context.close(), trainee.context.close()])
    }
  })
})
