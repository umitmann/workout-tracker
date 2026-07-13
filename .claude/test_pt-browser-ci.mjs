import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)

async function source(path) {
  return readFile(new URL(path, root), 'utf8')
}

test('the public PT browser command runs only the credential-free UX contract', async () => {
  const pkg = JSON.parse(await source('package.json'))
  const command = pkg.scripts['test:pt:e2e:public']

  assert.equal(typeof command, 'string')
  assert.match(command, /playwright test/)
  assert.match(command, /playwright\.pt\.config\.ts/)
  assert.match(command, /ux-accessibility\.spec\.ts/)
  assert.match(command, /--grep ["']account access UX["']/)
  assert.match(command, /PT_E2E_START_SERVER=true/)
  assert.doesNotMatch(command, /journey|authorization|relationships-consent|directory-application/)
})

test('the PT Playwright config starts a production server only when explicitly requested', async () => {
  const config = await source('playwright.pt.config.ts')

  assert.match(config, /PT_E2E_START_SERVER/)
  assert.match(config, /webServer:/)
  assert.match(config, /npm run start/)
  assert.doesNotMatch(config, /npm run dev|next dev/)
})

test('CI builds the app and runs the public Chromium gate without actor credentials', async () => {
  const workflow = await source('.github/workflows/ci.yml')

  assert.match(workflow, /^\s{2}browser:\s*$/m)
  assert.match(workflow, /actions\/checkout@v6/)
  assert.match(workflow, /actions\/setup-node@v6/)
  assert.doesNotMatch(workflow, /actions\/(?:checkout|setup-node)@v4/)
  assert.match(workflow, /playwright install --with-deps chromium/)
  assert.match(workflow, /NEXT_PUBLIC_SUPABASE_URL=\S+\s+NEXT_PUBLIC_SUPABASE_ANON_KEY=\S+\s+npm run build/)
  assert.match(workflow, /npm run test:pt:e2e:public/)
  assert.match(workflow, /if:\s*failure\(\)/)
  assert.match(workflow, /actions\/upload-artifact@v4/)
  assert.match(workflow, /test-results\/pt-artifacts/)
  assert.match(workflow, /test-results\/pt-html/)
  assert.doesNotMatch(workflow, /PT_(?:E2E|PLAN|RELATIONSHIP|DIRECTORY).*PASSWORD|PT_E2E_ENABLED=true|secrets\./)
})
