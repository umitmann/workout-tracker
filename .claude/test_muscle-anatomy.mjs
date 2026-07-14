import { test } from 'node:test'
import assert from 'node:assert/strict'

import { MUSCLE_ANATOMY_REGIONS, muscleRegionCoverage } from '../src/lib/muscleAnatomy.ts'
import { MUSCLE_GROUPS } from '../src/lib/muscleGroups.ts'

const seedMuscles = MUSCLE_GROUPS.flatMap((group) => group.muscles).sort()

test('the 3D anatomy covers every catalog muscle with at least one region', () => {
  assert.deepEqual([...muscleRegionCoverage()].sort(), seedMuscles)
})

test('every anatomical region has a stable id and finite transform', () => {
  const ids = new Set()
  for (const region of MUSCLE_ANATOMY_REGIONS) {
    assert.ok(region.id)
    assert.ok(!ids.has(region.id), `duplicate region id ${region.id}`)
    ids.add(region.id)
    assert.ok(seedMuscles.includes(region.muscle), `unsupported muscle ${region.muscle}`)
    assert.ok(['front', 'back', 'side'].includes(region.view))
    assert.equal(region.position.length, 3)
    assert.equal(region.scale.length, 3)
    assert.ok(region.position.every(Number.isFinite))
    assert.ok(region.scale.every((value) => Number.isFinite(value) && value > 0))
    assert.ok(region.rotation.every(Number.isFinite))
  }
})

test('the body has meaningful front and back coverage', () => {
  const front = new Set(MUSCLE_ANATOMY_REGIONS.filter((region) => region.view === 'front').map((region) => region.muscle))
  const back = new Set(MUSCLE_ANATOMY_REGIONS.filter((region) => region.view === 'back').map((region) => region.muscle))
  for (const muscle of ['chest', 'abdominals', 'biceps', 'quadriceps']) assert.ok(front.has(muscle))
  for (const muscle of ['lats', 'traps', 'glutes', 'hamstrings', 'calves']) assert.ok(back.has(muscle))
})
