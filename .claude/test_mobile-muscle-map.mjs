import { test } from 'node:test'
import assert from 'node:assert/strict'

const { MUSCLE_GROUPS } = await import('../src/lib/muscleGroups.ts')
const { MOBILE_MUSCLE_REGIONS } = await import('../src/lib/mobileMuscleMap.ts')

test('the phone anatomy map exposes every muscle used by the workout catalog', () => {
  const mapped = new Set(MOBILE_MUSCLE_REGIONS.map((region) => region.muscle))
  const expected = new Set(MUSCLE_GROUPS.flatMap((group) => group.muscles))
  assert.deepEqual([...mapped].sort(), [...expected].sort())
})

test('the anatomy map provides front and back orientation and unique tap targets', () => {
  assert.ok(MOBILE_MUSCLE_REGIONS.some((region) => region.view === 'front'))
  assert.ok(MOBILE_MUSCLE_REGIONS.some((region) => region.view === 'back'))
  const ids = MOBILE_MUSCLE_REGIONS.map((region) => region.id)
  assert.equal(new Set(ids).size, ids.length)
})
