/**
 * Unit tests for src/lib/localDate.ts — WP-06 (ADR-0005: local dates everywhere).
 * Run: node --import tsx --test .claude/test_local-date.mjs
 *
 * TZ-matrix note: this file re-execs itself as subprocesses with
 * TZ=America/Los_Angeles and TZ=Pacific/Auckland (rather than baking TZ into
 * the npm script) so `npm run test:unit` stays a single portable invocation
 * and still proves the helper is TZ-independent. The in-process tests below
 * run under whatever TZ the parent process has (developer machine default /
 * CI default, typically UTC) — the spawned children cover the two
 * interesting edges: a large negative UTC offset (west of UTC, Los Angeles)
 * and a large positive UTC offset that also observes a different calendar
 * date than UTC for much of the day (Auckland).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const {
  localDateStr,
  classifyCalendarDay,
  dateNDaysBefore,
} = await import('../src/lib/localDate.ts')

// ─── localDateStr — in-process (default/CI TZ) ─────────────────────────────

test('localDateStr: zero-pads single-digit month and day', () => {
  assert.equal(localDateStr(new Date(2026, 0, 5, 12, 0, 0)), '2026-01-05')
})

test('localDateStr: zero-pads single-digit month only', () => {
  assert.equal(localDateStr(new Date(2026, 2, 25, 0, 0, 0)), '2026-03-25')
})

test('localDateStr: zero-pads single-digit day only', () => {
  assert.equal(localDateStr(new Date(2026, 10, 3, 0, 0, 0)), '2026-11-03')
})

test('localDateStr: double-digit month and day pass through unchanged', () => {
  assert.equal(localDateStr(new Date(2026, 11, 31, 23, 59, 59)), '2026-12-31')
})

test('localDateStr: defaults to "now" when called with no argument', () => {
  const before = new Date()
  const result = localDateStr()
  // Sanity: matches YYYY-MM-DD shape and is plausible relative to "before".
  assert.match(result, /^\d{4}-\d{2}-\d{2}$/)
  const [y, m, d] = result.split('-').map(Number)
  assert.equal(y, before.getFullYear())
  assert.equal(m, before.getMonth() + 1)
  assert.equal(d, before.getDate())
})

test('localDateStr: midnight (00:00:00.000) stays on that calendar day, not the previous one', () => {
  assert.equal(localDateStr(new Date(2026, 6, 8, 0, 0, 0, 0)), '2026-07-08')
})

test('localDateStr: 23:59:59.999 stays on that calendar day, not the next one', () => {
  assert.equal(localDateStr(new Date(2026, 6, 8, 23, 59, 59, 999)), '2026-07-08')
})

test('localDateStr: leap-day Feb 29 2028 formats correctly', () => {
  assert.equal(localDateStr(new Date(2028, 1, 29, 10, 0, 0)), '2028-02-29')
})

test('localDateStr: year boundary Dec 31 -> Jan 1 stays distinguishable', () => {
  assert.equal(localDateStr(new Date(2026, 11, 31, 23, 30, 0)), '2026-12-31')
  assert.equal(localDateStr(new Date(2027, 0, 1, 0, 30, 0)), '2027-01-01')
})

test('localDateStr: never uses toISOString/UTC fields (11:30pm local, positive-offset construction check)', () => {
  // Construct a Date whose LOCAL fields say one day but whose UTC fields (as
  // read via getUTC*) would say a different day if TZ has any nonzero
  // offset in this environment. We assert only against local fields to keep
  // the in-process test TZ-agnostic; the real UTC-vs-local proof is the
  // subprocess matrix below.
  const d = new Date(2026, 6, 8, 23, 30, 0)
  assert.equal(localDateStr(d), `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
})

// ─── classifyCalendarDay (CalendarView isPast/isFuture/isToday) ────────────

test('classifyCalendarDay: same date as today -> isToday, not past, not future', () => {
  const result = classifyCalendarDay('2026-07-08', '2026-07-08')
  assert.deepEqual(result, { isToday: true, isPast: false, isFuture: false })
})

test('classifyCalendarDay: date before today -> isPast', () => {
  const result = classifyCalendarDay('2026-07-07', '2026-07-08')
  assert.deepEqual(result, { isToday: false, isPast: true, isFuture: false })
})

test('classifyCalendarDay: date after today -> isFuture', () => {
  const result = classifyCalendarDay('2026-07-09', '2026-07-08')
  assert.deepEqual(result, { isToday: false, isPast: false, isFuture: true })
})

test('classifyCalendarDay: month boundary — last day of month is "past" relative to first of next month', () => {
  const result = classifyCalendarDay('2026-06-30', '2026-07-01')
  assert.deepEqual(result, { isToday: false, isPast: true, isFuture: false })
})

test('classifyCalendarDay: year boundary — Dec 31 is past relative to Jan 1 the following year', () => {
  const result = classifyCalendarDay('2025-12-31', '2026-01-01')
  assert.deepEqual(result, { isToday: false, isPast: true, isFuture: false })
})

test('classifyCalendarDay: 11:30pm local case — an evening local date must classify as today, not tomorrow', () => {
  // Simulates a user at 11:30pm local time on 2026-07-08, regardless of the
  // host machine's own TZ (asserted independent of host offset — the actual
  // UTC-7 (America/Los_Angeles) proof that this disagrees with the banned
  // toISOString() approach lives in the TZ-matrix subprocess tests below,
  // which pin TZ explicitly). classifyCalendarDay takes pre-computed local
  // date strings, so this asserts the *consumer* contract: as long as both
  // the cell date and "today" are produced by localDateStr from the same
  // local Date, 11:30pm local on the 8th correctly self-classifies as today.
  const localNow = new Date(2026, 6, 8, 23, 30, 0) // 11:30pm local, July 8
  const today = localDateStr(localNow)
  assert.equal(today, '2026-07-08', 'localDateStr must not roll to the 9th at 11:30pm local')
  const result = classifyCalendarDay('2026-07-08', today)
  assert.deepEqual(result, { isToday: true, isPast: false, isFuture: false })
})

test('classifyCalendarDay: UTC-7 sanity — the naive toISOString() approach would have disagreed at 11:30pm', { skip: process.env.TZ !== 'America/Los_Angeles' }, () => {
  // Only meaningful (and only run) inside the TZ=America/Los_Angeles child
  // process, where the host offset actually reproduces the ADR-0005 bug.
  const localNow = new Date(2026, 6, 8, 23, 30, 0)
  const localToday = localDateStr(localNow)
  const utcNaiveToday = localNow.toISOString().split('T')[0]
  assert.notEqual(utcNaiveToday, localToday, 'sanity: UTC truncation should disagree with local under UTC-7')
})

test('classifyCalendarDay: malformed/empty date strings do not throw and classify via plain string comparison', () => {
  assert.doesNotThrow(() => classifyCalendarDay('', '2026-07-08'))
  assert.doesNotThrow(() => classifyCalendarDay('2026-07-08', ''))
})

// ─── dateNDaysBefore (used by dal.ts 60/90-day windows + PT report ranges) ─

test('dateNDaysBefore: 6 days before 2026-07-08 is 2026-07-02 (week report window)', () => {
  assert.equal(dateNDaysBefore('2026-07-08', 6), '2026-07-02')
})

test('dateNDaysBefore: 29 days before 2026-07-08 is 2026-06-09 (month report window)', () => {
  assert.equal(dateNDaysBefore('2026-07-08', 29), '2026-06-09')
})

test('dateNDaysBefore: 60 days before 2026-07-08 crosses two month boundaries correctly', () => {
  assert.equal(dateNDaysBefore('2026-07-08', 60), '2026-05-09')
})

test('dateNDaysBefore: 0 days before returns the same date (identity)', () => {
  assert.equal(dateNDaysBefore('2026-07-08', 0), '2026-07-08')
})

test('dateNDaysBefore: crosses a year boundary', () => {
  assert.equal(dateNDaysBefore('2026-01-05', 10), '2025-12-26')
})

test('dateNDaysBefore: crosses a leap-day boundary correctly (2028 is a leap year)', () => {
  assert.equal(dateNDaysBefore('2028-03-01', 1), '2028-02-29')
})

test('dateNDaysBefore: crosses a non-leap-year Feb/Mar boundary correctly', () => {
  assert.equal(dateNDaysBefore('2026-03-01', 1), '2026-02-28')
})

// ─── TZ matrix: spawn subprocesses under different timezones ───────────────

const SELF = fileURLToPath(import.meta.url)

function runInChildTZ(tz) {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', SELF, '--tz-child'],
    { env: { ...process.env, TZ: tz }, encoding: 'utf8' },
  )
  return result
}

test('TZ matrix: America/Los_Angeles — 2026-07-08 23:30 local stays on the 8th', { skip: process.argv.includes('--tz-child') }, () => {
  const result = runInChildTZ('America/Los_Angeles')
  assert.equal(result.status, 0, `child failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`)
  assert.match(result.stdout, /LA_OK/)
})

test('TZ matrix: Pacific/Auckland — 2026-07-08 23:30 local stays on the 8th', { skip: process.argv.includes('--tz-child') }, () => {
  const result = runInChildTZ('Pacific/Auckland')
  assert.equal(result.status, 0, `child failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`)
  assert.match(result.stdout, /AUCKLAND_OK/)
})

// When re-exec'd as a child with --tz-child, run the actual TZ-dependent
// assertion and print a sentinel instead of registering more node:test
// tests (avoids double test-runner registration/reporting in the child).
if (process.argv.includes('--tz-child')) {
  const d = new Date(2026, 6, 8, 23, 30, 0)
  const str = localDateStr(d)
  if (str !== '2026-07-08') {
    console.error(`FAIL: localDateStr(23:30 local July 8) under TZ=${process.env.TZ} produced ${str}`)
    process.exit(1)
  }
  // Robustness: dateNDaysBefore must not drift across a US spring-forward
  // DST transition (2026-03-08 in America/Los_Angeles) — only meaningful
  // under that TZ, but harmless (and still correct) under Auckland too.
  const acrossDst = dateNDaysBefore('2026-03-15', 10)
  if (acrossDst !== '2026-03-05') {
    console.error(`FAIL: dateNDaysBefore across DST under TZ=${process.env.TZ} produced ${acrossDst}, expected 2026-03-05`)
    process.exit(1)
  }
  const tag = process.env.TZ === 'America/Los_Angeles' ? 'LA_OK' : 'AUCKLAND_OK'
  console.log(tag)
  process.exit(0)
}
