import { test, expect } from '@playwright/test'
import {
  newSignedInContext,
  ptExerciseE2eEnabled,
} from './support'

test.describe('authenticated account panel', () => {
  test.skip(!ptExerciseE2eEnabled(), 'Set PT_EXERCISE_E2E_ENABLED=true to run account and custom-exercise UX.')

  test('opens from the top-right and exposes settings and sign out', async ({ browser }) => {
    const actor = await newSignedInContext(browser, 'exerciseClient')
    try {
      await actor.page.setViewportSize({ width: 390, height: 844 })
      const menuButton = actor.page.getByRole('button', { name: 'Account menu' })
      await expect(menuButton).toBeVisible()
      await menuButton.click()
      await expect(menuButton).toHaveAttribute('aria-expanded', 'true')
      await expect(actor.page.getByRole('menuitem', { name: 'My account' })).toBeVisible()
      await expect(actor.page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible()

      await actor.page.keyboard.press('Escape')
      await expect(menuButton).toHaveAttribute('aria-expanded', 'false')
      await expect(menuButton).toBeFocused()
      await menuButton.click()

      await actor.page.getByRole('menuitem', { name: 'My account' }).click()
      await expect(actor.page).toHaveURL(/\/account$/)
      await expect(actor.page.getByRole('heading', { name: 'Account settings' })).toBeVisible()
      await expect(actor.page.getByLabel('Email')).toHaveAttribute('readonly', '')
      await expect(actor.page.getByLabel('Display name')).toBeVisible()
      await expect(actor.page.getByLabel('Time zone')).toBeVisible()

      await actor.page.getByLabel('Display name').fill('E2E Account Client')
      await actor.page.getByRole('button', { name: 'Save account settings' }).click()
      await expect(actor.page.getByRole('status')).toHaveText('Account settings saved.')
      await menuButton.click()
      await expect(
        actor.page.getByRole('menu', { name: 'Account' }).getByText('E2E Account Client', { exact: true }),
      ).toBeVisible()
    } finally {
      await actor.context.close()
    }
  })
})

test.describe('trainer-authored exercise journey', () => {
  test.skip(!ptExerciseE2eEnabled(), 'Set PT_EXERCISE_E2E_ENABLED=true to run trainer exercise behavior.')

  test('trainer creates scoped video exercises and discovery follows the audience', async ({ browser }) => {
    // Exercise names are owner-unique even after archival. A per-run marker
    // keeps this browser journey repeatable against a long-lived QA database.
    const runMarker = Date.now()
    const clientsName = `E2E Client Tempo Squat ${runMarker}`
    const publicName = `E2E Public Mobility Flow ${runMarker}`
    const trainer = await newSignedInContext(browser, 'exerciseTrainer')

    try {
      await trainer.page.goto('/routines')
      await trainer.page.getByRole('link', { name: 'Create exercise' }).click()
      await expect(trainer.page).toHaveURL(/\/trainer\/exercises$/)
      await expect(trainer.page.getByRole('heading', { name: 'Create an exercise' })).toBeVisible()
      const createForm = trainer.page.getByRole('form', { name: 'Create exercise' })

      await createForm.getByLabel('Exercise name').fill(clientsName)
      await createForm.getByLabel('Category').fill('strength')
      await createForm.getByLabel('Equipment').fill('dumbbell')
      await createForm.getByLabel('Primary muscles').fill('quadriceps, glutes')
      await createForm.getByText('Anatomical detail').click()
      await createForm.getByLabel('Primary anatomy').fill('Rectus femoris, Vastus lateralis')
      await createForm.getByLabel('Instructions').fill('Brace before descending.\nDrive through the whole foot.')
      await createForm.getByLabel('YouTube explanation').fill('https://youtu.be/dQw4w9WgXcQ')
      await createForm.getByLabel('My active clients').check()
      await createForm.getByRole('button', { name: 'Create exercise' }).click()
      await expect(createForm.getByRole('status')).toContainText('created for your clients')
      await expect(trainer.page.getByText(clientsName, { exact: true })).toBeVisible()

      await createForm.getByLabel('Exercise name').fill(publicName)
      await createForm.getByLabel('Category').fill('mobility')
      await createForm.getByLabel('Instructions').fill('Move slowly through a comfortable range.')
      await createForm.getByLabel('Everyone').check()
      await createForm.getByRole('button', { name: 'Create exercise' }).click()
      await expect(createForm.getByRole('status')).toContainText('created for everyone')
      await expect(trainer.page.getByText(publicName, { exact: true })).toBeVisible()
    } finally {
      await trainer.context.close()
    }

    const client = await newSignedInContext(browser, 'exerciseClient')
    try {
      await client.page.goto('/routines')
      await expect(client.page.getByText(clientsName, { exact: true })).toBeVisible()
      await expect(client.page.getByText(publicName, { exact: true })).toBeVisible()
      await client.page.getByRole('link', { name: new RegExp(clientsName) }).click()
      const video = client.page.getByTitle(`${clientsName} video explanation`)
      await expect(video).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
      await expect(video).toHaveAttribute('loading', 'lazy')
    } finally {
      await client.context.close()
    }

    const outsider = await newSignedInContext(browser, 'exerciseOutsider')
    try {
      await outsider.page.goto('/routines')
      await expect(outsider.page.getByText(publicName, { exact: true })).toBeVisible()
      await expect(outsider.page.getByText(clientsName, { exact: true })).toHaveCount(0)
    } finally {
      await outsider.context.close()
    }
  })
})
