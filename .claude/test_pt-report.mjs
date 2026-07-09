/**
 * Unit tests for buildReport — scenario: pt-export-report
 * Run: node --import tsx --test .claude/test_pt-report.mjs
 *
 * WP-15 (findings M10/L5): pins previously-untested branches — bodyweight-only
 * report (empty workouts + >=2 weigh-ins), single weigh-in (no delta arrow),
 * and TZ-independence of the date-header formatting (fmtDateLong is not
 * exported, so the TZ matrix below drives it indirectly through buildReport's
 * rendered date header, spawning subprocesses the same way
 * .claude/test_local-date.mjs pins localDateStr — see that file's header
 * comment for the rationale on why TZ is varied via subprocess rather than
 * baked into the npm script).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

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

// ─── WP-15 (M10): bodyweight-only report — no workouts, 2+ weigh-ins ───────

test('bodyweight-only report (no workouts, 2 weigh-ins): shows the no-workouts message AND the weight delta arrow', () => {
  const out = buildReport({
    ...base,
    workouts: [],
    bodyWeights: [
      { date: '2026-07-01', weight: 80 },
      { date: '2026-07-08', weight: 78 },
    ],
  })
  assert.match(out, /No workouts/i)
  assert.match(out, /80 kg → 78 kg/)
})

test('bodyweight-only report: weight LOSS renders the minus sign, not a bare dash', () => {
  const out = buildReport({
    ...base,
    workouts: [],
    bodyWeights: [
      { date: '2026-07-01', weight: 80 },
      { date: '2026-07-08', weight: 78 },
    ],
  })
  assert.match(out, /\(−2 kg\)/, 'delta must use the minus sign U+2212, magnitude only (no double negative)')
})

test('bodyweight-only report: weight GAIN renders the plus sign', () => {
  const out = buildReport({
    ...base,
    workouts: [],
    bodyWeights: [
      { date: '2026-07-01', weight: 78 },
      { date: '2026-07-08', weight: 80 },
    ],
  })
  assert.match(out, /78 kg → 80 kg \(\+2 kg\)/)
})

test('bodyweight-only report: no workouts AND no weigh-ins shows only the no-workouts message, nothing else', () => {
  const out = buildReport({ ...base, workouts: [], bodyWeights: [] })
  assert.match(out, /No workouts/i)
  assert.doesNotMatch(out, /Bodyweight/)
  assert.doesNotMatch(out, /→/)
})

// ─── WP-15 (M10): single weigh-in — no delta, no arrow ─────────────────────

test('single weigh-in (workouts present): shows "Bodyweight: 80 kg" with no arrow and no delta', () => {
  const out = buildReport({
    ...base,
    bodyWeights: [{ date: '2026-07-03', weight: 80 }],
  })
  assert.match(out, /Bodyweight: 80 kg/)
  assert.doesNotMatch(out, /→/)
  assert.doesNotMatch(out, /\(\+|\(−|\(±/)
})

test('single weigh-in (no workouts): "Bodyweight: 80 kg" alongside the no-workouts message, still no arrow', () => {
  const out = buildReport({
    ...base,
    workouts: [],
    bodyWeights: [{ date: '2026-07-03', weight: 80 }],
  })
  assert.match(out, /No workouts/i)
  assert.match(out, /Bodyweight: 80 kg/)
  assert.doesNotMatch(out, /→/)
})

test('two weigh-ins on the SAME date (first === last by date): treated as a single reading, no delta arrow', () => {
  // bodyweightSummary's branch is keyed on date equality, not array length —
  // this pins that a same-day duplicate (e.g. logged twice) does not spuriously
  // render a "no change" delta.
  const out = buildReport({
    ...base,
    bodyWeights: [
      { date: '2026-07-03', weight: 80 },
      { date: '2026-07-03', weight: 80 },
    ],
  })
  assert.match(out, /Bodyweight: 80 kg/)
  assert.doesNotMatch(out, /→/)
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

// ─── WP-15 (M10): fmtDateLong is TZ-independent (parses the ISO date string
// as a local midnight Date, not through any UTC-truncating path) ──────────
//
// fmtDateLong is a private (unexported) helper in buildReport.ts, so we pin
// it indirectly through buildReport()'s rendered date header — the header is
// the only observable surface. We spawn subprocesses under two very different
// UTC offsets (one west, one east, both nowhere near UTC) the same way
// .claude/test_local-date.mjs pins localDateStr, so this test is meaningful
// on any CI host regardless of its own default TZ.

const SELF = fileURLToPath(import.meta.url)

function runInChildTZ(tz) {
  return spawnSync(process.execPath, ['--import', 'tsx', SELF, '--tz-child'], {
    env: { ...process.env, TZ: tz },
    encoding: 'utf8',
  })
}

test('fmtDateLong: TZ=Pacific/Auckland renders 2026-01-01 as Jan 1, never Dec 31', { skip: process.argv.includes('--tz-child') }, () => {
  const result = runInChildTZ('Pacific/Auckland')
  assert.equal(result.status, 0, `child failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`)
  assert.match(result.stdout, /AUCKLAND_OK/, `child output:\n${result.stdout}\n${result.stderr}`)
})

test('fmtDateLong: TZ=America/Los_Angeles renders 2026-01-01 as Jan 1, never Jan 2', { skip: process.argv.includes('--tz-child') }, () => {
  const result = runInChildTZ('America/Los_Angeles')
  assert.equal(result.status, 0, `child failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`)
  assert.match(result.stdout, /LA_OK/, `child output:\n${result.stdout}\n${result.stderr}`)
})

// When re-exec'd as a child with --tz-child, run the actual TZ-dependent
// assertion and print a sentinel instead of registering more node:test tests
// (avoids double test-runner registration/reporting in the child) — same
// pattern as .claude/test_local-date.mjs.
if (process.argv.includes('--tz-child')) {
  const { buildReport: buildReportChild } = await import('../src/lib/buildReport.ts')
  const out = buildReportChild({
    rangeLabel: 'New Year',
    from: '2026-01-01',
    to: '2026-01-01',
    workouts: [{ date: '2026-01-01', exercises: [] }],
    bodyWeights: [],
  })
  if (!/Jan 1\b/.test(out)) {
    console.error(`FAIL: fmtDateLong('2026-01-01') under TZ=${process.env.TZ} did not render "Jan 1":\n${out}`)
    process.exit(1)
  }
  if (/Dec 31|Jan 2\b/.test(out)) {
    console.error(`FAIL: fmtDateLong('2026-01-01') under TZ=${process.env.TZ} drifted to an adjacent day:\n${out}`)
    process.exit(1)
  }
  const tag = process.env.TZ === 'America/Los_Angeles' ? 'LA_OK' : 'AUCKLAND_OK'
  console.log(tag)
  process.exit(0)
}
