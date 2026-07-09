/**
 * Unit tests for src/lib/distanceUnit.ts — WP-12 (checklist §19.10/§19.11,
 * finding M5: distance unit preference km/m).
 * Run: node --import tsx --test .claude/test_distance-unit.mjs
 *
 * Contract (per test-plan.md WP-12):
 *   formatDistance(value, unit): (5, 'km') -> '5 km'; (400, 'm') -> '400 m'.
 *   `value` is already expressed in `unit` — formatDistance does NOT convert
 *   between km and m; it only rounds/labels. Conversion from the DB's
 *   always-km storage happens at the (separate) convertKmTo() step, which
 *   call sites use before formatting. This split keeps formatDistance a pure
 *   1:1 formatter (easy to test/reason about) and keeps the km->m arithmetic
 *   in exactly one place.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  formatDistance,
  convertKmTo,
  DEFAULT_DISTANCE_UNIT,
  DISTANCE_UNIT_STORAGE_KEY,
  readDistanceUnitPref,
  writeDistanceUnitPref,
} = await import('../src/lib/distanceUnit.ts')

// ─── formatDistance — the two pinned examples from the test plan ──────────

test('formatDistance: (5, "km") -> "5 km"', () => {
  assert.equal(formatDistance(5, 'km'), '5 km')
})

test('formatDistance: (400, "m") -> "400 m"', () => {
  assert.equal(formatDistance(400, 'm'), '400 m')
})

// ─── null / undefined — the "distance omitted" case (§19.3) ───────────────

test('formatDistance: null -> null (caller renders the em-dash, not this helper)', () => {
  assert.equal(formatDistance(null, 'km'), null)
})

test('formatDistance: undefined -> null (defensive — same as null)', () => {
  assert.equal(formatDistance(undefined, 'km'), null)
})

// ─── zero ───────────────────────────────────────────────────────────────────

test('formatDistance: zero km is a legitimate value, not "missing"', () => {
  assert.equal(formatDistance(0, 'km'), '0 km')
})

test('formatDistance: zero metres is a legitimate value, not "missing"', () => {
  assert.equal(formatDistance(0, 'm'), '0 m')
})

// ─── decimals — km keeps meaningful precision, m rounds to whole units ────

test('formatDistance: km keeps up to 2 decimal places', () => {
  assert.equal(formatDistance(5.2, 'km'), '5.2 km')
  assert.equal(formatDistance(5.25, 'km'), '5.25 km')
})

test('formatDistance: km trims a trailing .0', () => {
  assert.equal(formatDistance(5.0, 'km'), '5 km')
})

test('formatDistance: km rounds beyond 2 decimals rather than truncating', () => {
  assert.equal(formatDistance(5.005, 'km'), '5.01 km') // banker's-style half-up at the 2dp boundary is fine either way; must not throw/NaN
})

test('formatDistance: metres round to the nearest whole metre (no meaningful sub-metre precision for a run)', () => {
  assert.equal(formatDistance(400.6, 'm'), '401 m')
  assert.equal(formatDistance(400.4, 'm'), '400 m')
})

// ─── negative values — invalid data, must not crash or silently invert ────

test('formatDistance: negative km does not throw; renders with the sign preserved', () => {
  assert.doesNotThrow(() => formatDistance(-5, 'km'))
  assert.equal(formatDistance(-5, 'km'), '-5 km')
})

test('formatDistance: negative metres does not throw; renders with the sign preserved', () => {
  assert.doesNotThrow(() => formatDistance(-400, 'm'))
  assert.equal(formatDistance(-400, 'm'), '-400 m')
})

// ─── non-finite input — NaN/Infinity must degrade to null, never "NaN km" ──

test('formatDistance: NaN -> null (never renders the string "NaN")', () => {
  assert.equal(formatDistance(NaN, 'km'), null)
})

test('formatDistance: Infinity -> null', () => {
  assert.equal(formatDistance(Infinity, 'km'), null)
})

test('formatDistance: -Infinity -> null', () => {
  assert.equal(formatDistance(-Infinity, 'm'), null)
})

// ─── unrecognised unit — fall back rather than throw ───────────────────────

test('formatDistance: unrecognised unit string falls back to the default unit label instead of throwing', () => {
  assert.doesNotThrow(() => formatDistance(5, 'furlongs'))
  assert.match(formatDistance(5, 'furlongs'), /km|m$/)
})

test('formatDistance: missing/undefined unit falls back to the default unit', () => {
  assert.doesNotThrow(() => formatDistance(5, undefined))
})

// ─── large values — no scientific notation, no overflow artifacts ─────────

test('formatDistance: large km value renders in full, no exponential notation', () => {
  const out = formatDistance(123456.789, 'km')
  assert.doesNotMatch(out, /e\+/i)
})

test('formatDistance: large metres value renders as a whole, comma-grouped number, no exponential notation', () => {
  const out = formatDistance(1234567, 'm')
  assert.doesNotMatch(out, /e\+/i)
  assert.equal(out, '1,234,567 m')
})

// ─── convertKmTo — the DB (always km) -> display-unit conversion step ─────

test('convertKmTo: km -> km is identity', () => {
  assert.equal(convertKmTo(5, 'km'), 5)
})

test('convertKmTo: km -> m multiplies by 1000', () => {
  assert.equal(convertKmTo(5, 'm'), 5000)
})

test('convertKmTo: 0.4 km -> 400 m (the checklist §19.11 example distance)', () => {
  assert.equal(convertKmTo(0.4, 'm'), 400)
})

test('convertKmTo: null -> null (never coerces missing distance to 0)', () => {
  assert.equal(convertKmTo(null, 'm'), null)
})

test('convertKmTo: undefined -> null', () => {
  assert.equal(convertKmTo(undefined, 'm'), null)
})

test('convertKmTo: NaN -> null', () => {
  assert.equal(convertKmTo(NaN, 'm'), null)
})

test('convertKmTo: Infinity -> null', () => {
  assert.equal(convertKmTo(Infinity, 'km'), null)
})

test('convertKmTo: negative km converts sign-preserving (bad data, must not silently become 0)', () => {
  assert.equal(convertKmTo(-2, 'm'), -2000)
})

test('convertKmTo: zero km converts to zero, not null (zero is a real value)', () => {
  assert.equal(convertKmTo(0, 'm'), 0)
  assert.equal(convertKmTo(0, 'km'), 0)
})

test('convertKmTo: unrecognised unit treated as km (identity, no throw)', () => {
  assert.doesNotThrow(() => convertKmTo(5, 'furlongs'))
  assert.equal(convertKmTo(5, 'furlongs'), 5)
})

// ─── composition — the pattern every call site uses ────────────────────────

test('composition: convertKmTo then formatDistance reproduces the checklist §19.11 example end to end', () => {
  const storedKm = 0.4
  assert.equal(formatDistance(convertKmTo(storedKm, 'm'), 'm'), '400 m')
})

test('composition: null stored distance stays null through the whole pipeline', () => {
  assert.equal(formatDistance(convertKmTo(null, 'm'), 'm'), null)
})

test('composition: km-preference round-trips a fractional stored value', () => {
  assert.equal(formatDistance(convertKmTo(5.2, 'km'), 'km'), '5.2 km')
})

// ─── DEFAULT_DISTANCE_UNIT — the fallback when no preference is stored yet ─

test('DEFAULT_DISTANCE_UNIT is "km" (matches today\'s hardcoded behaviour, so existing users see no change until they opt into m)', () => {
  assert.equal(DEFAULT_DISTANCE_UNIT, 'km')
})

// ─── persisted preference — shared between WorkoutLogger and BodyweightCard ─
// Matches the existing WorkoutLogger localStorage convention (readStored/
// writeStored around a 'wt.<name>' key), but exported from this module so
// both call sites share one read/write implementation instead of each
// reinventing SSR-safe try/catch localStorage access.

test('DISTANCE_UNIT_STORAGE_KEY follows the existing "wt.<name>" convention', () => {
  assert.equal(DISTANCE_UNIT_STORAGE_KEY, 'wt.distanceUnit')
})

test('readDistanceUnitPref: no window (SSR) -> default, does not throw', () => {
  const savedWindow = globalThis.window
  delete globalThis.window
  try {
    assert.doesNotThrow(() => readDistanceUnitPref())
    assert.equal(readDistanceUnitPref(), 'km')
  } finally {
    if (savedWindow !== undefined) globalThis.window = savedWindow
  }
})

test('readDistanceUnitPref: nothing stored yet -> default "km"', () => {
  const store = new Map()
  globalThis.window = { localStorage: fakeLocalStorage(store) }
  try {
    assert.equal(readDistanceUnitPref(), 'km')
  } finally {
    delete globalThis.window
  }
})

test('writeDistanceUnitPref then readDistanceUnitPref round-trips "m"', () => {
  const store = new Map()
  globalThis.window = { localStorage: fakeLocalStorage(store) }
  try {
    writeDistanceUnitPref('m')
    assert.equal(readDistanceUnitPref(), 'm')
  } finally {
    delete globalThis.window
  }
})

test('readDistanceUnitPref: corrupted JSON in storage -> default, does not throw', () => {
  const store = new Map([[DISTANCE_UNIT_STORAGE_KEY, '{not valid json']])
  globalThis.window = { localStorage: fakeLocalStorage(store) }
  try {
    assert.doesNotThrow(() => readDistanceUnitPref())
    assert.equal(readDistanceUnitPref(), 'km')
  } finally {
    delete globalThis.window
  }
})

test('readDistanceUnitPref: stored value is an unrecognised unit string -> default, not thrown through', () => {
  const store = new Map([[DISTANCE_UNIT_STORAGE_KEY, JSON.stringify('furlongs')]])
  globalThis.window = { localStorage: fakeLocalStorage(store) }
  try {
    assert.equal(readDistanceUnitPref(), 'km')
  } finally {
    delete globalThis.window
  }
})

test('writeDistanceUnitPref: localStorage throwing (quota/private mode) is swallowed, not thrown to caller', () => {
  globalThis.window = {
    localStorage: {
      getItem() { return null },
      setItem() { throw new Error('QuotaExceededError') },
    },
  }
  try {
    assert.doesNotThrow(() => writeDistanceUnitPref('m'))
  } finally {
    delete globalThis.window
  }
})

function fakeLocalStorage(store) {
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null },
    setItem(key, value) { store.set(key, String(value)) },
  }
}
