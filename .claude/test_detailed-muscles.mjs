import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  DETAILED_MUSCLES,
  OPENSIM_LOWER_ACTUATORS,
  OPENSIM_UPPER_ACTUATORS,
  canonicalBroadMuscle,
  detailedMuscleKeysForBroadMuscle,
} from '../src/lib/detailedMuscles.ts'
import { ANATOMY_MODEL_MESHES } from '../src/lib/anatomyModel.ts'
import { MUSCLE_GROUPS } from '../src/lib/muscleGroups.ts'

test('the taxonomy inventories every side-neutral OpenSim lower and upper actuator', () => {
  assert.equal(OPENSIM_LOWER_ACTUATORS.length, 40)
  assert.equal(OPENSIM_UPPER_ACTUATORS.length, 50)
  assert.equal(new Set(OPENSIM_LOWER_ACTUATORS).size, 40)
  assert.equal(new Set(OPENSIM_UPPER_ACTUATORS).size, 50)

  for (const actuator of OPENSIM_LOWER_ACTUATORS) {
    assert.ok(
      DETAILED_MUSCLES.some(
        (muscle) => muscle.opensimModel === 'RajagopalLaiUhlrich2023' && muscle.opensimActuators.includes(actuator),
      ),
      `missing lower-body actuator ${actuator}`,
    )
  }
  for (const actuator of OPENSIM_UPPER_ACTUATORS) {
    assert.ok(
      DETAILED_MUSCLES.some(
        (muscle) => muscle.opensimModel === 'StanfordVAUpperExtremity' && muscle.opensimActuators.includes(actuator),
      ),
      `missing upper-body actuator ${actuator}`,
    )
  }
})

test('common trainer-entered broad aliases resolve to the catalog contract', () => {
  assert.equal(canonicalBroadMuscle('core'), 'abdominals')
  assert.equal(canonicalBroadMuscle('quads'), 'quadriceps')
  assert.equal(canonicalBroadMuscle('upper back'), 'middle back')
  assert.equal(canonicalBroadMuscle('Rear Delts'), 'shoulders')
})

test('taxonomy keys are stable and every broad workout muscle has a detailed fallback', () => {
  const keys = DETAILED_MUSCLES.map((muscle) => muscle.key)
  assert.equal(new Set(keys).size, keys.length)
  for (const muscle of DETAILED_MUSCLES) {
    assert.match(muscle.key, /^[a-z0-9]+(?:_[a-z0-9]+)*$/)
    assert.ok(muscle.label.length > 2)
    assert.ok(muscle.broadMuscle.length > 1)
  }

  for (const broadMuscle of MUSCLE_GROUPS.flatMap((group) => group.muscles)) {
    assert.ok(
      detailedMuscleKeysForBroadMuscle(broadMuscle).length > 0,
      `missing detailed fallback for ${broadMuscle}`,
    )
  }
})

test('every segmented 3D surface points at a valid detailed taxonomy key', () => {
  const keys = new Set(DETAILED_MUSCLES.map((muscle) => muscle.key))
  for (const mesh of ANATOMY_MODEL_MESHES) {
    assert.ok(keys.has(mesh.detailedMuscle), `unknown detailed surface ${mesh.detailedMuscle}`)
  }
})
