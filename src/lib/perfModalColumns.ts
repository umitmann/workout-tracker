import { DistanceUnit, convertKmTo, formatDistance } from './distanceUnit'

// Pure column-layout decision for LastPerfModal.tsx (WP-11, finding M4,
// checklist §19.8). Mirrors the cardio-vs-strength branch WorkoutLogger
// already applies to its own set rows (WorkoutLogger.tsx:1034-1064): a
// category of exactly 'cardio' renders Duration/Distance, everything else
// (including null/unknown categories, per ADR-0003 "category is a hint")
// renders Weight/Reps. Null-safe throughout — every missing value is an
// em-dash placeholder, never the string "null"/"undefined" or a thrown error.

export type PerfModalSetInput = {
  weight: number | null | undefined
  reps: number | null | undefined
  duration_minutes: number | null | undefined
  distance: number | null | undefined
}

export type PerfModalRow = {
  key: string
  primary: string
  secondary: string
}

export type PerfModalColumnsResult = {
  headers: [string, string]
  rows: PerfModalRow[]
}

const DASH = '—'

function fmt(value: number | null | undefined, unit: string): string {
  return value != null ? `${value}${unit}` : DASH
}

export function perfModalColumns(
  sets: PerfModalSetInput[],
  category: string | null | undefined,
  // WP-12: distance is stored in km; render in the user's preferred unit.
  distanceUnit: DistanceUnit = 'km',
): PerfModalColumnsResult {
  const isCardio = category === 'cardio'

  const headers: [string, string] = isCardio ? ['Duration', 'Distance'] : ['Weight', 'Reps']

  const rows: PerfModalRow[] = sets.map((s, i) => {
    if (isCardio) {
      return {
        key: String(i),
        primary: fmt(s.duration_minutes, ' min'),
        secondary: formatDistance(convertKmTo(s.distance ?? null, distanceUnit), distanceUnit) ?? DASH,
      }
    }
    return {
      key: String(i),
      primary: fmt(s.weight, ' kg'),
      secondary: s.reps != null ? String(s.reps) : DASH,
    }
  })

  return { headers, rows }
}
