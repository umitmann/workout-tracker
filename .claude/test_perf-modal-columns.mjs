/**
 * Unit tests for perfModalColumns — scenario: cardio-aware performance modal
 * (WP-11, finding M4, checklist §19.8).
 *
 * Pure column-layout decision extracted from LastPerfModal.tsx: given the
 * set rows returned by getLastExercisePerformance/getBestExercisePerformance
 * and the exercise's category, decide which two columns to render (duration
 * + distance for cardio, weight + reps otherwise) and format each cell,
 * null-safe with an em-dash placeholder — mirroring the branch WorkoutLogger
 * already uses for its own set rows (WorkoutLogger.tsx:1034-1064).
 *
 * Run: node --experimental-strip-types --test .claude/test_perf-modal-columns.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { perfModalColumns } = await import('../src/lib/perfModalColumns.ts')

const DASH = '—'

// ─── category branch selection ──────────────────────────────────────────────

test('cardio category selects Duration/Distance headers', () => {
  const result = perfModalColumns([{ weight: null, reps: null, duration_minutes: 30, distance: 5 }], 'cardio')
  assert.deepEqual(result.headers, ['Duration', 'Distance'])
})

test('non-cardio (strength) category selects Weight/Reps headers', () => {
  const result = perfModalColumns([{ weight: 100, reps: 5, duration_minutes: null, distance: null }], 'strength')
  assert.deepEqual(result.headers, ['Weight', 'Reps'])
})

test('null category (unknown/legacy exercise) falls back to Weight/Reps', () => {
  const result = perfModalColumns([{ weight: 50, reps: 10, duration_minutes: null, distance: null }], null)
  assert.deepEqual(result.headers, ['Weight', 'Reps'])
})

test('empty-string category falls back to Weight/Reps (only the literal "cardio" string triggers the cardio branch)', () => {
  const result = perfModalColumns([{ weight: 50, reps: 10, duration_minutes: null, distance: null }], '')
  assert.deepEqual(result.headers, ['Weight', 'Reps'])
})

test('category comparison is case-sensitive — "Cardio"/"CARDIO" do not match the cardio branch', () => {
  // dal.ts / DB store category as the lowercase literal 'cardio' throughout
  // the codebase (ADR-0003); a differently-cased value is not silently
  // coerced — it is treated as "not cardio", matching how every other call
  // site in WorkoutLogger.tsx compares (`=== 'cardio'`, not case-insensitive).
  const upper = perfModalColumns([{ weight: null, reps: null, duration_minutes: 20, distance: null }], 'CARDIO')
  assert.deepEqual(upper.headers, ['Weight', 'Reps'])
})

// ─── row formatting: strength branch ────────────────────────────────────────

test('strength row: both weight and reps present', () => {
  const result = perfModalColumns([{ weight: 100, reps: 5, duration_minutes: null, distance: null }], 'strength')
  assert.deepEqual(result.rows, [{ key: '0', primary: '100 kg', secondary: '5' }])
})

test('strength row: weight null -> em-dash, reps present', () => {
  const result = perfModalColumns([{ weight: null, reps: 12, duration_minutes: null, distance: null }], 'strength')
  assert.deepEqual(result.rows[0], { key: '0', primary: DASH, secondary: '12' })
})

test('strength row: reps null -> em-dash, weight present', () => {
  const result = perfModalColumns([{ weight: 80, reps: null, duration_minutes: null, distance: null }], 'strength')
  assert.deepEqual(result.rows[0], { key: '0', primary: '80 kg', secondary: DASH })
})

test('strength row: both weight and reps null -> both em-dash', () => {
  const result = perfModalColumns([{ weight: null, reps: null, duration_minutes: null, distance: null }], 'strength')
  assert.deepEqual(result.rows[0], { key: '0', primary: DASH, secondary: DASH })
})

test('strength row: weight zero is a real value, not treated as missing', () => {
  // bodyweight-adjacent exercise logged with 0kg added load — 0 is falsy in
  // JS but must render as "0 kg", not "—" (the codebase-wide `!= null` check
  // is the right guard here, `!value` would be wrong).
  const result = perfModalColumns([{ weight: 0, reps: 8, duration_minutes: null, distance: null }], 'strength')
  assert.deepEqual(result.rows[0], { key: '0', primary: '0 kg', secondary: '8' })
})

test('strength row: reps zero is a real value, not treated as missing', () => {
  const result = perfModalColumns([{ weight: 50, reps: 0, duration_minutes: null, distance: null }], 'strength')
  assert.deepEqual(result.rows[0], { key: '0', primary: '50 kg', secondary: '0' })
})

// ─── row formatting: cardio branch ──────────────────────────────────────────

test('cardio row: both duration and distance present', () => {
  const result = perfModalColumns([{ weight: null, reps: null, duration_minutes: 30, distance: 5 }], 'cardio')
  assert.deepEqual(result.rows[0], { key: '0', primary: '30 min', secondary: '5 km' })
})

test('cardio row: duration only, distance null -> em-dash (checklist §19.3)', () => {
  const result = perfModalColumns([{ weight: null, reps: null, duration_minutes: 20, distance: null }], 'cardio')
  assert.deepEqual(result.rows[0], { key: '0', primary: '20 min', secondary: DASH })
})

test('cardio row: distance only, duration null -> em-dash', () => {
  const result = perfModalColumns([{ weight: null, reps: null, duration_minutes: null, distance: 10 }], 'cardio')
  assert.deepEqual(result.rows[0], { key: '0', primary: DASH, secondary: '10 km' })
})

test('cardio row: both duration and distance null -> both em-dash', () => {
  const result = perfModalColumns([{ weight: null, reps: null, duration_minutes: null, distance: null }], 'cardio')
  assert.deepEqual(result.rows[0], { key: '0', primary: DASH, secondary: DASH })
})

test('cardio row: duration zero is a real value ("0 min"), not missing', () => {
  const result = perfModalColumns([{ weight: null, reps: null, duration_minutes: 0, distance: null }], 'cardio')
  assert.deepEqual(result.rows[0], { key: '0', primary: '0 min', secondary: DASH })
})

test('cardio row: distance zero is a real value ("0 km"), not missing', () => {
  const result = perfModalColumns([{ weight: null, reps: null, duration_minutes: null, distance: 0 }], 'cardio')
  assert.deepEqual(result.rows[0], { key: '0', primary: DASH, secondary: '0 km' })
})

test('cardio row: fractional duration/distance render without rounding', () => {
  const result = perfModalColumns([{ weight: null, reps: null, duration_minutes: 32.5, distance: 5.15 }], 'cardio')
  assert.deepEqual(result.rows[0], { key: '0', primary: '32.5 min', secondary: '5.15 km' })
})

test('cardio row ignores stray weight/reps values if present (category decides the branch, not the data)', () => {
  // Defends against a future data bug where a cardio set somehow also has
  // weight/reps populated (e.g. a mode toggle per ADR-0003) — the column
  // choice must follow the exercise category passed in, not infer from
  // which fields happen to be non-null.
  const result = perfModalColumns([{ weight: 20, reps: 3, duration_minutes: 15, distance: null }], 'cardio')
  assert.deepEqual(result.rows[0], { key: '0', primary: '15 min', secondary: DASH })
})

test('strength row ignores stray duration/distance values if present', () => {
  const result = perfModalColumns([{ weight: 60, reps: 8, duration_minutes: 10, distance: 2 }], 'strength')
  assert.deepEqual(result.rows[0], { key: '0', primary: '60 kg', secondary: '8' })
})

// ─── multi-row / ordering / empty input ─────────────────────────────────────

test('multiple sets keep input order and get sequential string keys', () => {
  const result = perfModalColumns(
    [
      { weight: 100, reps: 5, duration_minutes: null, distance: null },
      { weight: 105, reps: 3, duration_minutes: null, distance: null },
      { weight: 90, reps: 8, duration_minutes: null, distance: null },
    ],
    'strength',
  )
  assert.deepEqual(result.rows.map((r) => r.key), ['0', '1', '2'])
  assert.deepEqual(result.rows.map((r) => r.primary), ['100 kg', '105 kg', '90 kg'])
})

test('empty sets array yields headers but zero rows (no crash)', () => {
  const result = perfModalColumns([], 'cardio')
  assert.deepEqual(result.headers, ['Duration', 'Distance'])
  assert.deepEqual(result.rows, [])
})

test('empty sets array with strength category yields Weight/Reps headers and zero rows', () => {
  const result = perfModalColumns([], 'strength')
  assert.deepEqual(result.headers, ['Weight', 'Reps'])
  assert.deepEqual(result.rows, [])
})

// ─── defensive / malformed-input robustness ─────────────────────────────────

test('sets containing undefined instead of null are treated the same as null (defensive — DB/JSON should not emit undefined, but a stray optional field must not crash or render "undefined")', () => {
  const result = perfModalColumns([{ weight: undefined, reps: 5, duration_minutes: null, distance: null }], 'strength')
  assert.deepEqual(result.rows[0], { key: '0', primary: DASH, secondary: '5' })
})

test('does not mutate the input sets array or its elements', () => {
  const input = [{ weight: 100, reps: 5, duration_minutes: null, distance: null }]
  const frozenRow = Object.freeze({ ...input[0] })
  input[0] = frozenRow
  Object.freeze(input)
  assert.doesNotThrow(() => perfModalColumns(input, 'strength'))
})

test('is a pure function: same input twice yields deepEqual (structurally identical) results', () => {
  const input = [{ weight: 42, reps: 7, duration_minutes: null, distance: null }]
  const a = perfModalColumns(input, 'strength')
  const b = perfModalColumns(input, 'strength')
  assert.deepEqual(a, b)
})

test('WP-12 glue: distanceUnit "m" converts the stored-km distance in cardio rows', () => {
  const { headers, rows } = perfModalColumns(
    [{ weight: null, reps: null, duration_minutes: 30, distance: 5 }],
    'cardio',
    'm',
  )
  assert.deepEqual(headers, ['Duration', 'Distance'])
  assert.equal(rows[0].secondary, '5,000 m')
})

test('WP-12 glue: distanceUnit omitted keeps the km default (backward compatible)', () => {
  const { rows } = perfModalColumns(
    [{ weight: null, reps: null, duration_minutes: 30, distance: 5 }],
    'cardio',
  )
  assert.equal(rows[0].secondary, '5 km')
})
