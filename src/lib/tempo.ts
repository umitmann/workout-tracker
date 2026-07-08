// Pure tempo (DRUH: down-rest-up-hold) state machine for the guided rep timer.
// DB-free so it can be unit-tested; the React timer component drives it per frame.

export const TEMPO_PHASES = ['down', 'rest', 'up', 'hold'] as const
export type TempoPhase = (typeof TEMPO_PHASES)[number]

export type TempoConfig = {
  down: number
  rest: number
  up: number
  hold: number
}

export const TEMPO_PHASE_LABEL: Record<TempoPhase, string> = {
  down: 'Down',
  rest: 'Rest',
  up: 'Up',
  hold: 'Hold',
}

export function parseTempo(input: string): TempoConfig | null {
  const parts = input.split('-').map((p) => p.trim())
  if (parts.length !== 4) return null
  const nums = parts.map((p) => Number(p))
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null
  const [down, rest, up, hold] = nums
  return { down, rest, up, hold }
}

export function formatTempo(cfg: TempoConfig): string {
  return `${cfg.down}-${cfg.rest}-${cfg.up}-${cfg.hold}`
}

export function repDuration(cfg: TempoConfig): number {
  return cfg.down + cfg.rest + cfg.up + cfg.hold
}

export type PhaseState = {
  phase: TempoPhase
  remaining: number
}

// Given elapsed seconds within a single rep, return the active phase and the
// time remaining in it. Zero-length phases are skipped. Elapsed is clamped into
// the rep window so the caller can pass raw elapsed % repDuration or the raw value.
export function phaseAt(cfg: TempoConfig, elapsedInRep: number): PhaseState {
  const total = repDuration(cfg)
  if (total <= 0) return { phase: 'down', remaining: 0 }

  let t = elapsedInRep
  if (t < 0) t = 0
  if (t >= total) t = total - 0.0001 // keep inside the last non-empty segment

  let start = 0
  for (const phase of TEMPO_PHASES) {
    const dur = cfg[phase]
    if (dur <= 0) continue
    const end = start + dur
    if (t < end) return { phase, remaining: end - t }
    start = end
  }

  // Fallback: last non-empty phase
  const last = [...TEMPO_PHASES].reverse().find((p) => cfg[p] > 0) ?? 'down'
  return { phase: last, remaining: 0 }
}
