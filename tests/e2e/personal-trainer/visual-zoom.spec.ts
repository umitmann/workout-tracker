import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { newSignedInContext } from './support'

const visualEnabled = process.env.PT_VISUAL_E2E_ENABLED === 'true'
const outputRoot = process.env.PT_VISUAL_OUTPUT ?? '.context/visual-audit'

type AuditViewport = {
  name: string
  width: number
  height: number
  zoom?: number
}

const routeViewports: AuditViewport[] = [
  { name: 'mobile-320', width: 320, height: 800 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1280', width: 1280, height: 900 },
]

const zoomViewports: AuditViewport[] = [
  { name: 'zoom-80', width: 390, height: 844, zoom: 0.8 },
  { name: 'zoom-100', width: 390, height: 844, zoom: 1 },
  { name: 'zoom-125', width: 390, height: 844, zoom: 1.25 },
  { name: 'zoom-150', width: 390, height: 844, zoom: 1.5 },
  { name: 'zoom-200', width: 390, height: 844, zoom: 2 },
]

function safeName(value: string) {
  return value.replace(/^\//, '').replaceAll('/', '-').replaceAll(/[^a-z0-9-]/gi, '_') || 'root'
}

async function auditLayout(page: Page, label: string) {
  const result = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth
    const documentWidth = document.documentElement.scrollWidth
    const visible = (element: Element, rect: DOMRect) => {
      const style = getComputedStyle(element)
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) !== 0
        && rect.width > 0
        && rect.height > 0
    }
    const describe = (element: Element) => {
      const node = element as HTMLElement
      return node.getAttribute('aria-label')
        || node.getAttribute('title')
        || node.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80)
        || node.tagName
    }

    const offscreenControls = Array.from(
      document.querySelectorAll('button, a[href], input, select, textarea'),
    ).flatMap((element) => {
      const rect = element.getBoundingClientRect()
      if (!visible(element, rect) || rect.bottom < 0 || rect.top > window.innerHeight) return []
      if (rect.left >= -1 && rect.right <= viewportWidth + 1) return []
      return [{
        name: describe(element),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        viewportWidth,
      }]
    }).slice(0, 20)

    return { viewportWidth, documentWidth, offscreenControls }
  })

  expect.soft(
    result.documentWidth,
    `${label}: document width ${result.documentWidth}px exceeds viewport ${result.viewportWidth}px`,
  ).toBeLessThanOrEqual(result.viewportWidth + 1)
  expect.soft(result.offscreenControls, `${label}: controls extend beyond the viewport`).toEqual([])
}

async function capturePage(
  page: Page,
  actor: string,
  route: string,
  viewport: AuditViewport,
  colorScheme: 'light' | 'dark',
  options: { navigate?: boolean; ready?: () => Promise<void> } = {},
) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
  await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
  if (options.navigate !== false) {
    await page.goto(route)
    await expect(page.locator('#main-content')).toBeVisible({ timeout: 20_000 })
  }
  await expect(page.locator('body')).toBeVisible()
  await options.ready?.()
  await page.evaluate((zoom) => {
    document.documentElement.style.zoom = String(zoom ?? 1)
  }, viewport.zoom)
  await page.waitForTimeout(150)

  const label = `${actor}:${route}:${viewport.name}:${colorScheme}`
  await auditLayout(page, label)
  const dir = join(outputRoot, actor)
  mkdirSync(dir, { recursive: true })
  await page.screenshot({
    path: join(dir, `${safeName(route)}__${viewport.name}__${colorScheme}.png`),
    fullPage: true,
  })
}

test.describe('full application visual and zoom audit', () => {
  test.skip(!visualEnabled, 'Set PT_VISUAL_E2E_ENABLED=true with disposable local fixtures.')

  test('major role surfaces reflow without horizontal overflow', async ({ browser }) => {
    test.slow()
    const routeSets = [
      {
        actor: 'trainee' as const,
        routes: ['/dashboard', '/workouts', '/routines', '/trainers', '/connections', '/account'],
      },
      {
        actor: 'trainer' as const,
        routes: ['/dashboard', '/workouts', '/routines', '/trainer/clients', '/trainer/connections'],
      },
      {
        actor: 'admin' as const,
        routes: ['/dashboard', '/admin/trainers'],
      },
    ]

    for (const routeSet of routeSets) {
      const session = await newSignedInContext(browser, routeSet.actor)
      try {
        for (const route of routeSet.routes) {
          for (const viewport of routeViewports) {
            for (const colorScheme of ['light', 'dark'] as const) {
              await capturePage(session.page, routeSet.actor, route, viewport, colorScheme)
            }
          }
        }
      } finally {
        await session.page.close({ runBeforeUnload: false })
      }
    }
  })

  test('dense active workout remains usable from 80% through 200% zoom', async ({ browser }) => {
    test.slow()
    const session = await newSignedInContext(browser, 'exerciseClient')
    session.page.on('dialog', (dialog) => void dialog.accept())
    try {
      await session.page.setViewportSize({ width: 390, height: 844 })
      await session.page.goto('/dashboard')
      await session.page.getByRole('button', { name: /start workout/i }).click()
      await expect(session.page).toHaveURL(/\/workout\/\d+$/)
      await session.page.getByRole('button', { name: /add exercise/i }).click()
      const picker = session.page.getByRole('dialog', { name: /select exercise/i })
      await picker.getByRole('button', { name: /QA Snapshot Squat 47391/i }).click()
      await expect(session.page.getByText('Adding set')).toBeVisible()
      const addCard = session.page.getByText('Adding set').locator('..').locator('..')
      await addCard.getByRole('button', { name: /increase weight/i }).click()
      await addCard.getByRole('button', { name: /increase reps/i }).click()
      await addCard.getByRole('button', { name: /^add$/i }).click()
      await expect(session.page.getByText('Resting', { exact: true })).toBeVisible()

      for (const viewport of zoomViewports) {
        for (const colorScheme of ['light', 'dark'] as const) {
          await capturePage(
            session.page,
            'active-workout',
            '/active-workout',
            viewport,
            colorScheme,
            {
              navigate: false,
              ready: async () => {
                await expect(session.page.getByText('Adding set')).toBeVisible()
              },
            },
          )
        }
      }

      // Keep the disposable fixture clean.
      await session.page.evaluate(() => { document.documentElement.style.zoom = '1' })
      await session.page.getByRole('button', { name: /back/i }).first().click()
      const leave = session.page.getByRole('dialog', { name: /leave workout/i })
      await leave.getByRole('button', { name: /delete workout/i }).click()
      const confirm = session.page.getByRole('dialog', { name: /delete this workout/i })
      await confirm.getByRole('button', { name: /^delete$/i }).click()
      await expect(session.page).toHaveURL(/\/dashboard(?:\?|$)/)
    } finally {
      await session.page.close({ runBeforeUnload: false })
    }
  })
})
