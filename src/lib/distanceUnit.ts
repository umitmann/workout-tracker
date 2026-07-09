// Pure distance-unit formatting for the km/m display preference (checklist
// §19.10/§19.11, finding M5). The DB always stores distance in kilometres
// (ADR-0003 — no schema/unit_type column) — this module never changes that;
// it only decides what to show the user.
//
// Two-step pipeline, deliberately kept separate:
//   1. convertKmTo(storedKm, unit) — the ONE place km->m arithmetic happens.
//   2. formatDistance(valueInUnit, unit) — pure 1:1 formatting/labelling of a
//      value already expressed in `unit`. Never converts.
// Call sites compose them: formatDistance(convertKmTo(set.distance, unit), unit).

export type DistanceUnit = 'km' | 'm'

export const DEFAULT_DISTANCE_UNIT: DistanceUnit = 'km'

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

// Normalizes any unrecognised/missing unit value down to a real DistanceUnit
// so callers (and users who somehow get a corrupted localStorage value)
// never hit a throw or an unlabelled number — falls back to km, matching
// today's hardcoded behaviour.
function normalizeUnit(unit: unknown): DistanceUnit {
  return unit === 'm' ? 'm' : 'km'
}

// Converts a distance stored in km (the DB's only unit) to the requested
// display unit. Sign-preserving (bad/negative data is not silently zeroed —
// that would hide a data problem). null/undefined/non-finite -> null: a
// missing distance must never be coerced into the number 0.
export function convertKmTo(storedKm: number | null | undefined, unit: unknown): number | null {
  if (!isFiniteNumber(storedKm)) return null
  return normalizeUnit(unit) === 'm' ? storedKm * 1000 : storedKm
}

// Formats a value already expressed in `unit` (see module doc — this does
// NOT convert). null/undefined/non-finite -> null so callers can render
// their own "—" placeholder instead of ever printing "NaN km".
export function formatDistance(value: number | null | undefined, unit: unknown): string | null {
  if (!isFiniteNumber(value)) return null
  const u = normalizeUnit(unit)
  if (u === 'm') {
    // Sub-metre precision isn't meaningful for logged runs/rides; round to
    // the nearest whole metre. toLocaleString avoids scientific notation
    // for large inputs (Number#toString would emit e+ past 1e21, and more
    // importantly avoids float noise like 400.6 -> "400.60000000000002");
    // grouped thousands matches buildReport's fmtNumber() style used for
    // every other quantity in the report.
    const rounded = Math.round(value)
    return `${rounded.toLocaleString('en-US', { useGrouping: true, maximumFractionDigits: 0 })} m`
  }
  // km: keep up to 2 meaningful decimal places, trim a trailing .0/.00, and
  // group thousands — matches buildReport's pre-existing fmtNumber() style
  // for every other quantity in the report (weight, volume), so a very long
  // ride/run reads "1,234.5 km" rather than a jarring unformatted "1234.5".
  const rounded = Math.round(value * 100) / 100
  return `${rounded.toLocaleString('en-US', { useGrouping: true, maximumFractionDigits: 2 })} km`
}

// ─── Persisted preference ──────────────────────────────────────────────────
// Matches WorkoutLogger's existing readStored/writeStored convention (SSR-
// safe, try/catch around JSON + localStorage) under the same 'wt.<name>' key
// naming scheme, but exported here so BOTH WorkoutLogger and BodyweightCard
// (the report-export UI, a separate component tree) can read/write the same
// preference without duplicating the storage plumbing.

export const DISTANCE_UNIT_STORAGE_KEY = 'wt.distanceUnit'

export function readDistanceUnitPref(): DistanceUnit {
  if (typeof window === 'undefined') return DEFAULT_DISTANCE_UNIT
  try {
    const raw = window.localStorage.getItem(DISTANCE_UNIT_STORAGE_KEY)
    if (raw == null) return DEFAULT_DISTANCE_UNIT
    return normalizeUnit(JSON.parse(raw))
  } catch {
    // Corrupted JSON, localStorage unavailable (private mode / disabled) —
    // fall back rather than let a stale/malformed preference break the page.
    return DEFAULT_DISTANCE_UNIT
  }
}

export function writeDistanceUnitPref(unit: DistanceUnit): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DISTANCE_UNIT_STORAGE_KEY, JSON.stringify(unit))
  } catch {
    /* ignore quota/availability, same as WorkoutLogger's writeStored */
  }
}
