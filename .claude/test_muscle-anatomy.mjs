import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ANATOMY_MODEL_ATTRIBUTION,
  ANATOMY_MODEL_MESHES,
  ANATOMY_MODEL_URL,
  anatomyModelCoverage,
} from '../src/lib/anatomyModel.ts'
import { MUSCLE_ANATOMY_REGIONS, muscleRegionCoverage } from '../src/lib/muscleAnatomy.ts'
import { createMusclePathGeometry } from '../src/lib/musclePathGeometry.ts'
import { MUSCLE_GROUPS } from '../src/lib/muscleGroups.ts'

const seedMuscles = MUSCLE_GROUPS.flatMap((group) => group.muscles).sort()

test('the 3D anatomy covers every catalog muscle with at least one region', () => {
  assert.deepEqual([...muscleRegionCoverage()].sort(), seedMuscles)
})

test('every fallback compartment has a stable id and valid anatomical metadata', () => {
  const ids = new Set()
  for (const region of MUSCLE_ANATOMY_REGIONS) {
    assert.ok(region.id)
    assert.ok(!ids.has(region.id), `duplicate region id ${region.id}`)
    ids.add(region.id)
    assert.ok(seedMuscles.includes(region.muscle), `unsupported muscle ${region.muscle}`)
    assert.ok(['front', 'back', 'side'].includes(region.view))
    assert.ok(['fusiform', 'fan', 'pennate', 'sheet'].includes(region.architecture))
  }
})

test('the detailed model uses stable, cacheable BodyParts3D mesh metadata', () => {
  assert.match(ANATOMY_MODEL_URL, /^\/models\/bodyparts3d-muscles\.[a-f0-9]+\.glb$/)
  assert.equal(ANATOMY_MODEL_ATTRIBUTION.name, 'BodyParts3D')
  assert.equal(ANATOMY_MODEL_ATTRIBUTION.license, 'CC BY 4.0')
  assert.match(ANATOMY_MODEL_ATTRIBUTION.sourceUrl, /^https:\/\//)
  assert.match(ANATOMY_MODEL_ATTRIBUTION.licenseUrl, /^https:\/\//)

  const nodeNames = new Set()
  for (const mesh of ANATOMY_MODEL_MESHES) {
    assert.match(mesh.nodeName, /^muscle__[a-z0-9_]+__[a-z0-9_]+$/)
    assert.ok(!nodeNames.has(mesh.nodeName), `duplicate anatomy node ${mesh.nodeName}`)
    nodeNames.add(mesh.nodeName)
    assert.ok(seedMuscles.includes(mesh.muscle), `unsupported detailed muscle ${mesh.muscle}`)
    assert.match(mesh.sourcePartId, /^FJ\d+M?$/)
  }
})

test('detailed meshes use bilateral heads and compartments instead of one blob per group', () => {
  const coverage = anatomyModelCoverage()
  for (const muscle of ['traps', 'shoulders', 'chest', 'biceps', 'triceps', 'forearms', 'glutes', 'abductors', 'adductors', 'quadriceps', 'hamstrings', 'calves']) {
    assert.ok(coverage.has(muscle), `missing detailed mesh coverage for ${muscle}`)
  }

  for (const muscle of ['traps', 'shoulders', 'chest', 'triceps', 'quadriceps', 'hamstrings', 'calves']) {
    const compartments = ANATOMY_MODEL_MESHES.filter((mesh) => mesh.muscle === muscle)
    assert.ok(compartments.length >= 4, `${muscle} should use multiple anatomical compartments`)
    assert.ok(compartments.some((mesh) => mesh.side === 'left'), `${muscle} missing left side`)
    assert.ok(compartments.some((mesh) => mesh.side === 'right'), `${muscle} missing right side`)
  }
})

test('procedural regions are path-based fallback compartments with tapered profiles', () => {
  for (const region of MUSCLE_ANATOMY_REGIONS) {
    assert.ok(region.path.length >= 2, `${region.id} needs origin and insertion`)
    assert.ok(region.path.every((point) => point.length === 3 && point.every(Number.isFinite)))
    assert.ok(region.radius > 0)
    assert.ok(region.depthScale > 0)
    assert.ok(region.taper > 0 && region.taper < 1)
  }
})

test('path geometry creates a finite, indexed, lit muscle belly', () => {
  const source = MUSCLE_ANATOMY_REGIONS.find((region) => region.path.length >= 3)
  assert.ok(source)
  const geometry = createMusclePathGeometry(source)
  try {
    const positions = geometry.getAttribute('position')
    const normals = geometry.getAttribute('normal')
    assert.ok(positions.count > 40)
    assert.equal(normals.count, positions.count)
    assert.ok(geometry.index && geometry.index.count > 0)
    assert.ok(Array.from(positions.array).every(Number.isFinite))
    geometry.computeBoundingBox()
    assert.ok(geometry.boundingBox)
    assert.ok(geometry.boundingBox.max.y > geometry.boundingBox.min.y)
  } finally {
    geometry.dispose()
  }
})

test('the body has meaningful front and back coverage', () => {
  const front = new Set(MUSCLE_ANATOMY_REGIONS.filter((region) => region.view === 'front').map((region) => region.muscle))
  const back = new Set(MUSCLE_ANATOMY_REGIONS.filter((region) => region.view === 'back').map((region) => region.muscle))
  for (const muscle of ['chest', 'abdominals', 'biceps', 'quadriceps']) assert.ok(front.has(muscle))
  for (const muscle of ['lats', 'traps', 'glutes', 'hamstrings', 'calves']) assert.ok(back.has(muscle))
})
