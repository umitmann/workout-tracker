import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const manifest = (await import('../src/app/manifest.ts')).default()

test('manifest supports iPhone and Android standalone installation', () => {
  assert.equal(manifest.start_url, '/')
  assert.equal(manifest.scope, '/')
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.orientation, 'any')
  const icons = manifest.icons ?? []
  assert.ok(icons.some((icon) => icon.sizes === '192x192'))
  assert.ok(icons.some((icon) => icon.sizes === '512x512'))
  assert.ok(icons.some((icon) => String(icon.purpose).includes('maskable')))
  for (const icon of icons) assert.ok(existsSync(`public${icon.src}`), `missing ${icon.src}`)
  assert.ok(existsSync('public/apple-touch-icon.png'))
})

test('service worker never caches authenticated health-data routes', () => {
  const worker = readFileSync('public/sw.js', 'utf8')
  assert.match(worker, /\/api\//)
  assert.match(worker, /\/workout/)
  assert.match(worker, /request\.mode === ['"]navigate['"]/)
  assert.match(worker, /\/offline/)
  assert.doesNotMatch(worker, /caches\.put\(request/)
})
