import { test, expect } from '@playwright/test'
import { newSignedInContext, ptE2eEnabled } from './support'

test.describe('installable mobile shell', () => {
  test('serves a valid manifest, icons, worker safety headers, and offline fallback', async ({ request, page }) => {
    const manifestResponse = await request.get('/manifest.webmanifest')
    expect(manifestResponse.ok()).toBeTruthy()
    const manifest = await manifestResponse.json()
    expect(manifest.display).toBe('standalone')
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ sizes: '192x192' }),
      expect.objectContaining({ sizes: '512x512' }),
      expect.objectContaining({ purpose: 'maskable' }),
    ]))

    for (const path of ['/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/apple-touch-icon.png']) {
      const response = await request.get(path)
      expect(response.ok(), path).toBeTruthy()
      expect(response.headers()['content-type']).toContain('image/png')
    }

    const worker = await request.get('/sw.js')
    expect(worker.ok()).toBeTruthy()
    expect(worker.headers()['content-type']).toContain('application/javascript')
    expect(worker.headers()['cache-control']).toContain('no-cache')
    expect(worker.headers()['content-security-policy']).toContain("default-src 'self'")

    await page.goto('/offline')
    await expect(page.getByRole('heading', { name: /reconnect before logging/i })).toBeVisible()
    await expect(page.getByText(/workout and account data stay network-only/i)).toBeVisible()
  })
})

test.describe('phone anatomy and install UX', () => {
  test.skip(!ptE2eEnabled(), 'Set PT_E2E_ENABLED=true with disposable local fixtures.')

  test('mobile planner opens opt-in, remains usable at zoom, and does not mount desktop 3D', async ({ browser }) => {
    const session = await newSignedInContext(browser, 'exerciseClient')
    try {
      await session.page.setViewportSize({ width: 390, height: 844 })
      await session.page.goto('/workouts/new')
      await expect(session.page.getByRole('button', { name: /choose muscles and see your load/i })).toBeVisible()
      await session.page.getByRole('button', { name: /choose muscles and see your load/i }).click()
      const planner = session.page.getByRole('dialog', { name: /mobile muscle planner/i })
      await expect(planner.getByRole('img', { name: /front muscle anatomy/i })).toBeVisible()
      await expect(planner.getByRole('img', { name: /back muscle anatomy/i })).toBeVisible()
      await expect(session.page.getByTestId('desktop-workout-generator')).toHaveCount(0)

      await planner.getByRole('button', { name: 'Select quadriceps', exact: true }).click()
      await expect(planner.getByRole('heading', { name: /matching exercises/i })).toBeVisible()
      await expect(planner.getByRole('button', { name: /^add /i }).first()).toBeVisible()

      for (const zoom of [0.8, 1, 1.5, 2]) {
        await session.page.evaluate((value) => { document.documentElement.style.zoom = String(value) }, zoom)
        const overflow = await session.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow, `horizontal overflow at ${zoom * 100}% zoom`).toBeLessThanOrEqual(1)
        await expect(planner.getByRole('button', { name: /close muscle planner/i })).toBeVisible()
      }
      await session.page.evaluate(() => { document.documentElement.style.zoom = '1' })
      await planner.getByRole('button', { name: /close muscle planner/i }).click()
    } finally {
      await session.context.close()
    }
  })

  test('account gives iPhone home-screen instructions', async ({ browser }) => {
    const session = await newSignedInContext(browser, 'exerciseClient')
    try {
      await session.page.goto('/account')
      await expect(session.page.getByRole('heading', { name: /install workout tracker/i })).toBeVisible()
      await expect(session.page.getByText(/tap the share button/i)).toBeVisible()
      await expect(session.page.getByText(/add to home screen/i)).toBeVisible()
    } finally {
      await session.context.close()
    }
  })
})
