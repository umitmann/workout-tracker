import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test'

export type TestActor =
  | 'trainee'
  | 'trainer'
  | 'otherTrainer'
  | 'applicant'
  | 'admin'
  | 'exerciseTrainer'
  | 'exerciseClient'
  | 'exerciseOutsider'

type Credentials = {
  email: string
  password: string
}

export function ptE2eEnabled(): boolean {
  return process.env.PT_E2E_ENABLED === 'true'
}

export function ptDirectoryE2eEnabled(): boolean {
  return process.env.PT_DIRECTORY_E2E_ENABLED === 'true'
}

export function ptRelationshipE2eEnabled(): boolean {
  return process.env.PT_RELATIONSHIP_E2E_ENABLED === 'true'
}

export function ptExerciseE2eEnabled(): boolean {
  return process.env.PT_EXERCISE_E2E_ENABLED === 'true'
}

export function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required PT E2E environment variable: ${name}`)
  return value
}

export function actorCredentials(actor: TestActor): Credentials {
  const prefixes: Record<TestActor, string> = {
    trainee: 'PT_E2E_TRAINEE',
    trainer: 'PT_E2E_TRAINER',
    otherTrainer: 'PT_E2E_OTHER_TRAINER',
    applicant: 'PT_E2E_APPLICANT',
    admin: 'PT_E2E_ADMIN',
    exerciseTrainer: 'PT_EXERCISE_E2E_TRAINER',
    exerciseClient: 'PT_EXERCISE_E2E_CLIENT',
    exerciseOutsider: 'PT_EXERCISE_E2E_OUTSIDER',
  }
  const prefix = prefixes[actor]
  return {
    email: requiredEnv(`${prefix}_EMAIL`),
    password: requiredEnv(`${prefix}_PASSWORD`),
  }
}

export async function signIn(page: Page, actor: TestActor): Promise<void> {
  const credentials = actorCredentials(actor)
  await page.goto('/')
  await page.getByPlaceholder('Email').fill(credentials.email)
  await page.getByPlaceholder('Password').fill(credentials.password)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/)
}

export async function newSignedInContext(
  browser: Browser,
  actor: TestActor,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await signIn(page, actor)
  return { context, page }
}

export function localDateDaysFromNow(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
