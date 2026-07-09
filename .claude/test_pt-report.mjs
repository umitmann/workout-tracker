/**
 * Unit tests for buildReport — scenario: pt-export-report
 * Run: node --experimental-strip-types --test .claude/test_pt-report.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { buildReport } = await import('../src/lib/buildReport.ts')

const base = {
  rangeLabel: 'Last week',
  from: '2026-07-01',
  to: '2026-07-08',
  athlete: 'umit@example.com',
  workouts: [
    {
      date: '2026-07-02',
      exercises: [
        {
          name: 'Seated Cable Row',
          category: 'strength',
          sets: [
            { weight: 60, reps: 10, duration_minutes: null, distance: null },
            { weight: 65, reps: 8, duration_minutes: null, distance: null },
          ],
        },
        {
          name: 'Running',
          category: 'cardio',
          sets: [{ weight: null, reps: null, duration_minutes: 30, distance: 5 }],
        },
      ],
    },
  ],
  bodyWeights: [
    { date: '2026-07-01', weight: 82.5 },
    { date: '2026-07-08', weight: 81.2 },
  ],
}

test('includes header with range label and date span', () => {
  const out = buildReport(base)
  assert.match(out, /Last week/)
  assert.match(out, /2026-07-01/)
  assert.match(out, /2026-07-08/)
})

test('includes athlete label when provided', () => {
  assert.match(buildReport(base), /umit@example\.com/)
})

test('renders strength sets as weight x reps', () => {
  const out = buildReport(base)
  assert.match(out, /Seated Cable Row/)
  assert.match(out, /60 kg × 10/)
  assert.match(out, /65 kg × 8/)
})

test('renders cardio sets as duration and distance', () => {
  const out = buildReport(base)
  assert.match(out, /Running/)
  assert.match(out, /30 min/)
  assert.match(out, /5 km/)
})

test('summary counts workouts, sets, and total volume', () => {
  const out = buildReport(base)
  // volume = 60*10 + 65*8 = 600 + 520 = 1120
  assert.match(out, /Workouts:\s*1/)
  assert.match(out, /Total sets:\s*3/)
  assert.match(out, /1,?120/)
})

test('summary shows bodyweight change first -> last', () => {
  const out = buildReport(base)
  assert.match(out, /82\.5/)
  assert.match(out, /81\.2/)
  assert.match(out, /-1\.3|−1\.3/)
})

test('reps-only set (bodyweight exercise) renders without weight', () => {
  const out = buildReport({
    ...base,
    bodyWeights: [],
    workouts: [
      {
        date: '2026-07-03',
        exercises: [
          {
            name: 'Pull Up',
            category: 'strength',
            sets: [{ weight: null, reps: 12, duration_minutes: null, distance: null }],
          },
        ],
      },
    ],
  })
  assert.match(out, /Pull Up/)
  assert.match(out, /12 reps|× 12/)
  assert.doesNotMatch(out, /null/)
})

test('rest seconds are shown when recorded', () => {
  const out = buildReport({
    ...base,
    bodyWeights: [],
    workouts: [
      {
        date: '2026-07-04',
        exercises: [
          {
            name: 'Squat',
            category: 'strength',
            sets: [{ weight: 100, reps: 5, duration_minutes: null, distance: null, rest_seconds: 90 }],
          },
        ],
      },
    ],
  })
  assert.match(out, /100 kg × 5 \(rest 90s\)/)
})

test('empty range yields a clear no-data message', () => {
  const out = buildReport({ ...base, workouts: [], bodyWeights: [] })
  assert.match(out, /No workouts/i)
})

test('dates are rendered in chronological order', () => {
  const out = buildReport({
    ...base,
    bodyWeights: [],
    workouts: [
      { date: '2026-07-05', exercises: [] },
      { date: '2026-07-02', exercises: [] },
    ],
  })
  assert.ok(out.indexOf('Jul 2') < out.indexOf('Jul 5'), 'Jul 2 should appear before Jul 5')
})

// ─── WP-12: distance unit preference (checklist §19.10/§19.11, finding M5) ─
// buildReport stores distance in km (the DB's only unit — ADR-0003) and
// converts+labels at render time per an explicit `unit` param.

test('distance unit: defaults to km when no unit is passed (no behaviour change for existing callers)', () => {
  const out = buildReport(base)
  assert.match(out, /5 km/)
  assert.doesNotMatch(out, / m\b/)
})

test('distance unit: explicit unit "km" renders km (same as default)', () => {
  const out = buildReport({ ...base, unit: 'km' })
  assert.match(out, /5 km/)
})

test('distance unit: unit "m" converts the stored km value and renders metres', () => {
  const out = buildReport({ ...base, unit: 'm' })
  assert.match(out, /5,?000 m/)
  assert.doesNotMatch(out, /5 km/)
})

test('distance unit: "m" preference does not affect weight (kg) or duration (min) labels', () => {
  const out = buildReport({ ...base, unit: 'm' })
  assert.match(out, /60 kg × 10/)
  assert.match(out, /30 min/)
})

test('distance unit: fractional km converts cleanly to whole metres', () => {
  const out = buildReport({
    ...base,
    bodyWeights: [],
    unit: 'm',
    workouts: [
      {
        date: '2026-07-06',
        exercises: [
          { name: 'Running', category: 'cardio', sets: [{ weight: null, reps: null, duration_minutes: 5, distance: 0.4 }] },
        ],
      },
    ],
  })
  assert.match(out, /400 m/)
})

test('distance unit: null distance stays "—" regardless of unit', () => {
  const out = buildReport({
    ...base,
    bodyWeights: [],
    unit: 'm',
    workouts: [
      {
        date: '2026-07-06',
        exercises: [
          { name: 'Running', category: 'cardio', sets: [{ weight: null, reps: null, duration_minutes: 20, distance: null }] },
        ],
      },
    ],
  })
  assert.match(out, /20 min/)
  assert.doesNotMatch(out, /null/)
})

test('distance unit: an unrecognised unit string falls back to km rather than throwing', () => {
  assert.doesNotThrow(() => buildReport({ ...base, unit: 'furlongs' }))
  const out = buildReport({ ...base, unit: 'furlongs' })
  assert.match(out, /5 km/)
})
