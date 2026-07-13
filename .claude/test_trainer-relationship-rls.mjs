/**
 * Real-JWT relationship/consent contract for a dedicated Supabase fixture.
 * This is intentionally stateful and ends the relationship in cleanup so it
 * can be rerun. It must never target production accounts.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const enabled = process.env.PT_RELATIONSHIP_RLS_ENABLED === 'true'

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required relationship RLS variable: ${name}`)
  return value
}

function fixture() {
  return {
    url: required('NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    traineeToken: required('PT_RELATIONSHIP_TRAINEE_ACCESS_TOKEN'),
    trainerToken: required('PT_RELATIONSHIP_TRAINER_ACCESS_TOKEN'),
    outsiderToken: required('PT_RELATIONSHIP_OUTSIDER_ACCESS_TOKEN'),
    trainerProfileId: required('PT_RELATIONSHIP_TRAINER_PROFILE_ID'),
    traineeWorkoutId: Number(required('PT_RELATIONSHIP_TRAINEE_WORKOUT_ID')),
    traineeBodyweightId: required('PT_RELATIONSHIP_TRAINEE_BODYWEIGHT_ID'),
  }
}

function asUser(url, anonKey, accessToken) {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

async function listRelationships(client) {
  return client.rpc('list_my_trainer_relationships')
}

test('bilateral connection and independent consent fail closed under real actor JWTs', { skip: !enabled }, async () => {
  const f = fixture()
  const trainee = asUser(f.url, f.anonKey, f.traineeToken)
  const trainer = asUser(f.url, f.anonKey, f.trainerToken)
  const outsider = asUser(f.url, f.anonKey, f.outsiderToken)
  let relationshipId = null

  try {
    for (const actor of [trainee, trainer, outsider]) {
      for (const table of [
        'trainer_relationships',
        'trainer_access_grants',
        'trainer_relationship_audit_events',
      ]) {
        const raw = await actor.from(table).select('*').limit(1)
        assert.ok(raw.error, `${table} must have no authenticated base-table SELECT grant`)
      }
    }

    const requested = await trainee.rpc('request_trainer_relationship', {
      p_trainer_profile_id: f.trainerProfileId,
    })
    assert.equal(requested.error, null)
    relationshipId = requested.data
    assert.match(String(relationshipId), /^[0-9a-f-]{36}$/i)

    const duplicate = await trainee.rpc('request_trainer_relationship', {
      p_trainer_profile_id: f.trainerProfileId,
    })
    assert.ok(duplicate.error, 'a second pending/current relationship must be rejected')

    const outsiderEnd = await outsider.rpc('end_trainer_relationship', {
      p_relationship_id: relationshipId,
    })
    assert.ok(outsiderEnd.error, 'an unrelated actor must not transition an enumerated id')
    const outsiderList = await listRelationships(outsider)
    assert.equal(outsiderList.error, null)
    assert.deepEqual(outsiderList.data, [])

    const trainerPending = await listRelationships(trainer)
    assert.equal(trainerPending.error, null)
    const pending = trainerPending.data?.find((row) => row.relationship_id === relationshipId)
    assert.equal(pending?.status, 'pending')
    assert.equal(pending?.awaiting_my_response, true)

    const accepted = await trainer.rpc('accept_trainer_relationship', {
      p_relationship_id: relationshipId,
    })
    assert.equal(accepted.error, null)

    const active = await listRelationships(trainer)
    const activeRow = active.data?.find((row) => row.relationship_id === relationshipId)
    assert.equal(activeRow?.status, 'active')
    assert.equal(activeRow?.workout_results_access, false)
    assert.equal(activeRow?.bodyweight_access, false)

    // Relationship activation alone does not broaden the owner-only raw RLS.
    const rawWorkout = await trainer.from('workouts').select('id').eq('id', f.traineeWorkoutId)
    assert.equal(rawWorkout.error, null)
    assert.deepEqual(rawWorkout.data, [])
    const rawBodyweight = await trainer.from('body_weights').select('id').eq('id', f.traineeBodyweightId)
    assert.equal(rawBodyweight.error, null)
    assert.deepEqual(rawBodyweight.data, [])

    const selfGrant = await trainer.rpc('grant_trainer_access', {
      p_relationship_id: relationshipId,
      p_permission: 'workout_results.read',
      p_history_scope: 'all',
    })
    assert.ok(selfGrant.error, 'a trainer must not grant itself access')

    const granted = await trainee.rpc('grant_trainer_access', {
      p_relationship_id: relationshipId,
      p_permission: 'workout_results.read',
      p_history_scope: 'from_now',
    })
    assert.equal(granted.error, null)

    const trainerGranted = await listRelationships(trainer)
    const grantedRow = trainerGranted.data?.find((row) => row.relationship_id === relationshipId)
    assert.equal(grantedRow?.workout_results_access, true)
    assert.equal(grantedRow?.bodyweight_access, false)
    assert.ok(grantedRow?.workout_results_date_from)

    // Phase 3 records consent but intentionally exposes no result-read RPC.
    const disabledResultRead = await trainer.rpc('trainer_get_completed_workouts', {
      p_relationship_id: relationshipId,
      p_from: '2000-01-01',
      p_to: '2100-01-01',
    })
    assert.ok(disabledResultRead.error)

    const revoked = await trainee.rpc('revoke_trainer_access', {
      p_relationship_id: relationshipId,
      p_permission: 'workout_results.read',
    })
    assert.equal(revoked.error, null)
    const afterRevoke = await listRelationships(trainer)
    assert.equal(
      afterRevoke.data?.find((row) => row.relationship_id === relationshipId)?.workout_results_access,
      false,
    )

    const audit = await trainee.rpc('list_trainer_relationship_audit', {
      p_relationship_id: relationshipId,
    })
    assert.equal(audit.error, null)
    assert.ok((audit.data?.length ?? 0) >= 5)
    for (const event of audit.data ?? []) {
      assert.equal(Object.hasOwn(event, 'actor_id'), false)
      assert.equal(Object.hasOwn(event, 'trainer_id'), false)
      assert.equal(Object.hasOwn(event, 'trainee_id'), false)
      assert.equal(Object.hasOwn(event, 'email'), false)
    }
  } finally {
    if (relationshipId) {
      await trainee.rpc('end_trainer_relationship', { p_relationship_id: relationshipId })
    }
  }
})
