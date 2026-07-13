import { test, expect } from '@playwright/test'
import {
  actorCredentials,
  newSignedInContext,
  ptDirectoryE2eEnabled,
  requiredEnv,
} from './support'

test.describe('trainer directory, application, and review surface', () => {
  test.skip(
    !ptDirectoryE2eEnabled(),
    'Set PT_DIRECTORY_E2E_ENABLED=true and provide dedicated applicant/admin fixtures.',
  )

  test('draft application stays private, is visible to admin, and admin route denies a trainee', async ({
    browser,
  }) => {
    const applicantName = requiredEnv('PT_E2E_APPLICANT_NAME')
    const applicant = await newSignedInContext(browser, 'applicant')
    const admin = await newSignedInContext(browser, 'admin')
    const trainee = await newSignedInContext(browser, 'trainee')

    try {
      await test.step('applicant saves an idempotent private draft through the real Server Action', async () => {
        await applicant.page.goto('/trainers/apply')
        await applicant.page.getByLabel(/public display name/i).fill(applicantName)
        await applicant.page.getByLabel(/public bio/i).fill('Playwright directory application fixture.')
        await applicant.page.getByLabel(/^specialties$/i).fill('strength training, mobility')
        await applicant.page.getByLabel(/^location$/i).fill('Amsterdam')
        await applicant.page.getByLabel(/available for remote training/i).check()
        await applicant.page.getByLabel(/currently accepting clients/i).check()
        await applicant.page.getByLabel(/directory state/i).selectOption('draft')
        await applicant.page.getByRole('button', { name: /create trainer profile|save trainer profile/i }).click()
        await expect(applicant.page.getByRole('status')).toContainText(/draft saved/i)
      })

      await test.step('a draft cannot be discovered by another authenticated user', async () => {
        await trainee.page.goto(`/trainers?q=${encodeURIComponent(applicantName)}`)
        await expect(
          trainee.page.getByRole('article').filter({ hasText: applicantName }),
        ).toHaveCount(0)
      })

      await test.step('platform admin can review listing content without seeing account email', async () => {
        await admin.page.goto('/admin/trainers?status=all')
        const application = admin.page.getByRole('article').filter({ hasText: applicantName })
        await expect(application).toBeVisible()
        await expect(application).not.toContainText(actorCredentials('applicant').email)
        await expect(
          application.getByRole('button', { name: /approve|reject|suspend/i }).first(),
        ).toBeVisible()
      })

      await test.step('ordinary trainee cannot render the admin review surface', async () => {
        await trainee.page.goto('/admin/trainers')
        await expect(trainee.page.getByRole('heading', { name: /not found/i })).toBeVisible()
        await expect(trainee.page.getByText(applicantName)).toHaveCount(0)
      })
    } finally {
      await Promise.all([
        applicant.context.close(),
        admin.context.close(),
        trainee.context.close(),
      ])
    }
  })
})
