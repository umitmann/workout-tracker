import AxeBuilder from '@axe-core/playwright'
import { test, expect, type Page } from '@playwright/test'
import { newSignedInContext, ptE2eEnabled } from './support'

type TargetIssue = {
  name: string
  width: number
  height: number
}

async function seriousA11yViolations(page: Page) {
  const scan = await new AxeBuilder({ page })
    // Development-only Next.js tooling is injected outside the product UI.
    .exclude('[aria-label="Open Next.js Dev Tools"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()

  return scan.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious')
}

async function undersizedVisibleTargets(page: Page): Promise<TargetIssue[]> {
  return page.locator('a[href], button, input, select, textarea').evaluateAll((elements) => (
    elements.flatMap((element) => {
      const target = element as HTMLElement
      const rect = target.getBoundingClientRect()
      const style = window.getComputedStyle(target)
      if (
        target.getAttribute('aria-label') === 'Open Next.js Dev Tools'
        ||
        style.display === 'none'
        || style.visibility === 'hidden'
        || rect.width === 0
        || rect.height === 0
        || target.closest('[inert]')
      ) return []

      // WCAG 2.2 AA requires 24×24 CSS px. The product design target is the
      // more forgiving 44 px on either axis for primary touch controls.
      if (rect.width >= 44 || rect.height >= 44) return []
      return [{
        name: target.getAttribute('aria-label') || target.textContent?.trim() || target.tagName,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }]
    })
  ))
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }))
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport)
}

test.describe('account access UX', () => {
  test('is responsive, keyboard-operable, and free of serious WCAG violations', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible()
    await expect(page.getByLabel('Email')).toHaveAttribute('autocomplete', 'email')
    await expect(page.getByLabel('Password')).toHaveAttribute('autocomplete', 'current-password')
    await expectNoHorizontalOverflow(page)
    expect(await undersizedVisibleTargets(page)).toEqual([])

    const signInTab = page.getByRole('tab', { name: 'Sign in' })
    const registerTab = page.getByRole('tab', { name: 'Register' })
    await signInTab.focus()
    await page.keyboard.press('ArrowRight')
    await expect(registerTab).toBeFocused()
    await expect(registerTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('heading', { name: 'Start your training log.' })).toBeVisible()

    const mobileViolations = await seriousA11yViolations(page)
    expect(mobileViolations, JSON.stringify(mobileViolations, null, 2)).toEqual([])

    await page.setViewportSize({ width: 1280, height: 900 })
    await expect(page.getByRole('heading', { level: 1, name: /your training\./i })).toBeVisible()
    await expectNoHorizontalOverflow(page)
    expect(await undersizedVisibleTargets(page)).toEqual([])

    const desktopViolations = await seriousA11yViolations(page)
    expect(desktopViolations, JSON.stringify(desktopViolations, null, 2)).toEqual([])

    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await expectNoHorizontalOverflow(page)
    expect(await undersizedVisibleTargets(page)).toEqual([])
    const darkModeViolations = await seriousA11yViolations(page)
    expect(darkModeViolations, JSON.stringify(darkModeViolations, null, 2)).toEqual([])
  })
})

test.describe('authenticated application shell UX', () => {
  test.skip(!ptE2eEnabled(), 'Set PT_E2E_ENABLED=true to run the authenticated shell audit.')

  test('keeps role navigation understandable across mobile and desktop', async ({ browser }) => {
    const trainee = await newSignedInContext(browser, 'trainee')

    try {
      await trainee.page.setViewportSize({ width: 390, height: 844 })
      await trainee.page.goto('/dashboard')

      const mobileNavigation = trainee.page.getByRole('navigation', { name: 'Primary navigation' }).filter({ visible: true })
      await expect(mobileNavigation.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page')
      await expect(mobileNavigation.getByRole('link', { name: /My PT(?: \(\d+\))?$/ })).toBeVisible()
      await expectNoHorizontalOverflow(trainee.page)
      expect(await undersizedVisibleTargets(trainee.page)).toEqual([])

      await trainee.page.keyboard.press('Tab')
      const skipLink = trainee.page.getByRole('link', { name: 'Skip to content' })
      await expect(skipLink).toBeFocused()
      await trainee.page.keyboard.press('Enter')
      await expect(trainee.page.locator('#main-content')).toBeFocused()

      const mobileViolations = await seriousA11yViolations(trainee.page)
      expect(mobileViolations, JSON.stringify(mobileViolations, null, 2)).toEqual([])

      await trainee.page.setViewportSize({ width: 1280, height: 900 })
      const desktopNavigation = trainee.page.getByRole('navigation', { name: 'Primary navigation' }).filter({ visible: true })
      await expect(desktopNavigation.getByRole('link', { name: 'Find a PT' })).toBeVisible()
      await expectNoHorizontalOverflow(trainee.page)

      const desktopViolations = await seriousA11yViolations(trainee.page)
      expect(desktopViolations, JSON.stringify(desktopViolations, null, 2)).toEqual([])
    } finally {
      await trainee.context.close()
    }
  })
})
