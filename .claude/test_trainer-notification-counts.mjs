import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  countTrainerRelationshipNotifications,
  trainerNotificationLabel,
} = await import('../src/lib/trainerRelationshipNotifications.ts')

function relationship(overrides = {}) {
  return {
    my_role: 'trainer',
    status: 'pending',
    awaiting_my_response: true,
    ...overrides,
  }
}

test('a pending trainer request requiring acceptance increments PT Requests', () => {
  assert.deepEqual(
    countTrainerRelationshipNotifications([relationship()]),
    { trainee: 0, trainer: 1 },
  )
})

test('a pending trainee invitation requiring acceptance increments My PT', () => {
  assert.deepEqual(
    countTrainerRelationshipNotifications([
      relationship({ my_role: 'trainee' }),
    ]),
    { trainee: 1, trainer: 0 },
  )
})

test('outgoing pending requests do not create a notification badge', () => {
  assert.deepEqual(
    countTrainerRelationshipNotifications([
      relationship({ awaiting_my_response: false }),
      relationship({ my_role: 'trainee', awaiting_my_response: false }),
    ]),
    { trainee: 0, trainer: 0 },
  )
})

test('active and terminal relationships are not notifications', () => {
  const rows = ['active', 'declined', 'ended', 'expired'].flatMap((status) => [
    relationship({ status }),
    relationship({ status, my_role: 'trainee' }),
  ])
  assert.deepEqual(
    countTrainerRelationshipNotifications(rows),
    { trainee: 0, trainer: 0 },
  )
})

test('notification counts aggregate independently for users acting in both roles', () => {
  assert.deepEqual(
    countTrainerRelationshipNotifications([
      relationship(),
      relationship(),
      relationship({ my_role: 'trainee' }),
      relationship({ status: 'active' }),
      relationship({ awaiting_my_response: false }),
    ]),
    { trainee: 1, trainer: 2 },
  )
})

test('labels use the requested parenthesized count only when actionable items exist', () => {
  assert.equal(trainerNotificationLabel('PT Requests', 0), 'PT Requests')
  assert.equal(trainerNotificationLabel('PT Requests', 1), 'PT Requests (1)')
  assert.equal(trainerNotificationLabel('My PT', 12), 'My PT (12)')
})
