import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { ANATOMY_MODEL_URL } from '../src/lib/anatomyModel.ts'

test('the segmented anatomy asset is optimized, named, and meshopt-compressed', async () => {
  const asset = await readFile(new URL(`../public${ANATOMY_MODEL_URL}`, import.meta.url))
  assert.equal(asset.subarray(0, 4).toString('ascii'), 'glTF')
  assert.ok(asset.byteLength > 500_000, 'unexpectedly empty anatomy asset')
  assert.ok(asset.byteLength < 2_500_000, `anatomy asset is too large: ${asset.byteLength} bytes`)

  const searchable = asset.toString('latin1')
  assert.match(searchable, /EXT_meshopt_compression/)
  assert.match(searchable, /bodyparts3d_muscle_atlas/)
  assert.match(searchable, /muscle__quadriceps__right_rectus_femoris/)
  assert.match(searchable, /muscle__traps__left_transverse_trapezius/)
})

test('the immutable model cache and attribution are checked into the app', async () => {
  const [config, notice] = await Promise.all([
    readFile(new URL('../next.config.ts', import.meta.url), 'utf8'),
    readFile(new URL('../public/models/README.md', import.meta.url), 'utf8'),
  ])
  assert.match(config, /source: '\/models\/bodyparts3d-muscles\.b37dea4a\.glb'/)
  assert.match(config, /max-age=31536000, immutable/)
  assert.match(notice, /BodyParts3D/)
  assert.match(notice, /CC BY 4\.0/)
})
