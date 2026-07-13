import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/proxy.ts', import.meta.url), 'utf8')

for (const route of [
  'dashboard',
  'routines',
  'workout',
  'workouts',
  'trainers',
  'trainer',
  'connections',
  'admin',
]) {
  test(`proxy matcher includes /${route}`, () => {
    assert.match(source, new RegExp(`['\"]/${route}/:path\\*['\"]`))
  })
}

test('trainer and admin pages still perform their own verified-user checks', async () => {
  const [directory, application, admin] = await Promise.all([
    readFile(new URL('../src/app/trainers/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/trainers/apply/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/admin/trainers/page.tsx', import.meta.url), 'utf8'),
  ])
  for (const page of [directory, application, admin]) {
    assert.match(page, /getServerAuthContext\(\)/)
    assert.match(page, /if \(!user\) redirect\('\/'\)/)
  }
})

test('the admin page has a current database-backed role check', async () => {
  const admin = await readFile(
    new URL('../src/app/admin/trainers/page.tsx', import.meta.url),
    'utf8',
  )
  assert.match(admin, /currentUserIsPlatformAdmin\(\)/)
  assert.match(admin, /notFound\(\)/)
})
