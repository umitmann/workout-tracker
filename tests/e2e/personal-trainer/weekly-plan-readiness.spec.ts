import { test, expect, type Browser } from '@playwright/test'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required weekly-plan E2E variable: ${name}`)
  return value
}

async function signIn(browser: Browser, actor: 'TRAINEE' | 'TRAINER') {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto('/')
  await page.getByLabel('Email').fill(required(`PT_PLAN_E2E_${actor}_EMAIL`))
  await page.getByLabel('Password').fill(required(`PT_PLAN_E2E_${actor}_PASSWORD`))
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/)
  return { context, page }
}

function localDateParts(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function currentMonday() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  return localDateParts(date)
}

test.describe('flexible weekly plans and daily readiness', () => {
  test.skip(
    process.env.PT_PLAN_START_E2E_ENABLED !== 'true',
    'Use the resettable PT plan fixture for the stateful weekly journey.',
  )

  test('trainer assigns two workouts → trainee chooses, starts, and checks in', async ({ browser }) => {
    const relationshipId = required('PT_PLAN_E2E_RELATIONSHIP_ID')
    const templateName = required('PT_PLAN_E2E_TEMPLATE_NAME')
    const trainer = await signIn(browser, 'TRAINER')
    const trainee = await signIn(browser, 'TRAINEE')

    try {
      await test.step('trainer composes a week with a repeated template', async () => {
        await trainer.page.goto(`/trainer/clients/${relationshipId}`)
        await trainer.page.getByRole('button', { name: /schedule workout/i }).click()
        const dialog = trainer.page.getByRole('dialog', { name: /schedule workout/i })
        await dialog.getByRole('button', { name: /flexible week/i }).click()
        await dialog.getByLabel(/week beginning/i).fill(currentMonday())
        await dialog.getByLabel('Workout 1 template').selectOption({ label: templateName })
        await dialog.getByRole('button', { name: /add another workout/i }).click()
        await dialog.getByLabel('Workout 2 template').selectOption({ label: templateName })
        await dialog.getByRole('button', { name: /assign 2 for the week/i }).click()
        await expect(dialog.getByRole('status')).toContainText(/2 workouts assigned for the week/i)
      })

      await test.step('trainee sees both pending and chooses today for one', async () => {
        await trainee.page.goto('/dashboard')
        await expect(trainee.page.getByText(/2 left this week/i)).toBeVisible()
        const plans = trainee.page.getByRole('button', { name: `Open weekly workout plan ${templateName}` })
        await expect(plans).toHaveCount(2)
        await plans.first().click()
        const dialog = trainee.page.getByRole('dialog', { name: `${templateName} workout plan` })
        await dialog.getByLabel(/choose your training day/i).fill(localDateParts())
        await dialog.getByRole('button', { name: /save day/i }).click()
        await expect(dialog).toHaveCount(0)
      })

      await test.step('selected weekly workout starts once and the check-in persists', async () => {
        await trainee.page.getByRole('button', { name: `Open weekly workout plan ${templateName}` }).first().click()
        await trainee.page.getByRole('button', { name: /^start today$/i }).click()
        await expect(trainee.page).toHaveURL(/\/workout\/\d+$/)
        await trainee.page.getByRole('button', { name: /^done$/i }).click()
        await expect(trainee.page).toHaveURL(/\/dashboard(?:\?|$)/)
        await trainee.page.getByRole('button', { name: 'Great' }).click()
        await expect(trainee.page.getByRole('status')).toContainText(/feeling saved/i)
        await expect(trainee.page.getByRole('button', { name: 'Great' })).toHaveAttribute('aria-pressed', 'true')
        await trainee.page.reload()
        await expect(trainee.page.getByRole('button', { name: 'Great' })).toHaveAttribute('aria-pressed', 'true')
      })
    } finally {
      await Promise.all([trainer.context.close(), trainee.context.close()])
    }
  })
})
