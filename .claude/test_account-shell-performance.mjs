import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('every authenticated shell exposes a top-right account menu', async () => {
  const [shell, menu] = await Promise.all([
    source('../src/components/AppShell.tsx'),
    source('../src/components/AccountMenu.tsx'),
  ])
  assert.match(shell, /<AccountMenu/)
  assert.match(menu, /aria-label="Account menu"/)
  assert.match(menu, /href="\/account"/)
  assert.match(menu, /action=\{signOut\}/)
  assert.match(menu, /aria-expanded=\{open\}/)
  assert.match(menu, /event\.key === 'Escape'/)
})

test('account settings use the existing narrow profile RPC and keep email read-only', async () => {
  const [page, action, core, form] = await Promise.all([
    source('../src/app/account/page.tsx'),
    source('../src/app/actions/account.ts'),
    source('../src/app/actions/accountCores.ts'),
    source('../src/app/account/AccountProfileForm.tsx'),
  ])
  assert.match(page, /Account settings/)
  assert.match(action, /saveAccountProfileCore/)
  assert.match(core, /save_my_profile/)
  assert.match(form, /type="email"[\s\S]+readOnly/)
  assert.match(form, /autoComplete="name"/)
  assert.match(form, /autoComplete="photo"/)
})

test('the data layer shares the verified request auth context', async () => {
  const dal = await source('../src/lib/dal.ts')
  assert.match(dal, /import \{ getServerAuthContext \} from ['"]\.\/serverAuth['"]/)
  assert.doesNotMatch(dal, /const getAuthContext = cache/)
  assert.doesNotMatch(dal, /createServerSupabaseClient/)
})

test('read-only exercise discovery has a lightweight route loading boundary', async () => {
  for (const path of [
    '../src/app/routines/loading.tsx',
  ]) {
    const loading = await source(path)
    assert.match(loading, /AppPageLoading/)
  }
})

test('action-heavy route parents do not remount forms behind loading boundaries', async () => {
  for (const path of [
    '../src/app/account/loading.tsx',
    '../src/app/connections/loading.tsx',
    '../src/app/trainer/loading.tsx',
    '../src/app/trainers/loading.tsx',
  ]) {
    await assert.rejects(source(path), /ENOENT/)
  }
})

test('performance review states explicit safe cache boundaries', async () => {
  const review = await source('../docs/performance-review.md')
  assert.match(review, /Do not shared-cache/i)
  assert.match(review, /React `cache`/)
  assert.match(review, /loading\.tsx/)
  assert.match(review, /calendar/i)
  assert.match(review, /exercise catalog/i)
  assert.match(review, /measurement/i)
})
