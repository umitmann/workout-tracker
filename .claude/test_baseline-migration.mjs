import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'

const migrationsDirectory = new URL('../supabase/migrations/', import.meta.url)
const baselineName = '20260713000000_baseline_workout_tracker.sql'
const baselineUrl = new URL(baselineName, migrationsDirectory)

const sql = await readFile(baselineUrl, 'utf8')

test('the clean-room baseline is the first migration in the chain', async () => {
  const migrationNames = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith('.sql'))
    .sort()

  assert.equal(migrationNames[0], baselineName)
  assert.equal(migrationNames[1], '20260713000100_harden_existing_persistence.sql')
})

test('the baseline creates every legacy table additively in dependency order', () => {
  const tables = [
    'exercises',
    'routines',
    'routine_exercises',
    'workouts',
    'sets',
    'scheduled_workouts',
    'body_weights',
    'exercise_notes',
  ]

  let previousIndex = -1
  for (const table of tables) {
    const pattern = new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}\\b`, 'i')
    const match = pattern.exec(sql)
    assert.ok(match, `missing additive baseline table ${table}`)
    assert.ok(match.index > previousIndex, `${table} must follow its table dependencies`)
    previousIndex = match.index
  }

  assert.doesNotMatch(sql, /\b(?:drop\s+table|truncate|delete\s+from)\b/i)
})

test('the baseline matches the live bigint identities and owner relationships', () => {
  for (const table of ['exercises', 'workouts', 'sets']) {
    assert.match(
      sql,
      new RegExp(
        `create\\s+table[\\s\\S]+?public\\.${table}\\s*\\([\\s\\S]+?id\\s+bigint\\s+generated\\s+by\\s+default\\s+as\\s+identity`,
        'i',
      ),
      `${table}.id must remain a bigint BY DEFAULT identity`,
    )
  }

  assert.match(sql, /workout_id\s+bigint\s+not null[\s\S]+references public\.workouts\s*\(id\)/i)
  assert.match(sql, /exercise_id\s+bigint\s+not null[\s\S]+references public\.exercises\s*\(id\)/i)
  assert.match(sql, /user_id\s+uuid\s+not null[\s\S]+references auth\.users\s*\(id\)/i)
})

test('the baseline exposes every column consumed by the hardening and PT chain', () => {
  for (const fragment of [
    /status\s+text\s+not null\s+default 'in_progress'/i,
    /template_id\s+uuid/i,
    /set_details\s+jsonb/i,
    /tempo\s+text/i,
    /rest_seconds\s+integer/i,
    /difficulty\s+smallint/i,
    /scheduled_date\s+date\s+not null/i,
    /weight\s+numeric\s+not null/i,
    /note\s+text/i,
  ]) {
    assert.match(sql, fragment)
  }
})

test('all legacy tables start behind RLS and authenticated-only policies', () => {
  for (const table of [
    'exercises',
    'routines',
    'routine_exercises',
    'workouts',
    'sets',
    'scheduled_workouts',
    'body_weights',
    'exercise_notes',
  ]) {
    assert.match(
      sql,
      new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i'),
      `${table} must enable RLS before the hardening migration`,
    )
  }

  assert.doesNotMatch(sql, /create\s+policy[\s\S]+?\bto\s+(?:PUBLIC|anon)\b/i)
  assert.match(sql, /create policy "routines: read presets and own"[\s\S]+to authenticated/i)
  assert.match(sql, /create policy "routine_exercises: read own and presets"[\s\S]+to authenticated/i)
  assert.match(sql, /create policy "scheduled_workouts: users select their own"[\s\S]+to authenticated/i)
  assert.match(sql, /create policy "body_weights: users select their own"[\s\S]+to authenticated/i)
  assert.match(sql, /create policy "exercise_notes: select own"[\s\S]+to authenticated/i)
})
