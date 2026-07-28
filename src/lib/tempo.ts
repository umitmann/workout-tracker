// Pure tempo (DRUH: down-rest-up-hold) state machine for the guided rep timer.
// DB-free so it can be unit-tested; the React timer component drives it per frame.

export const TEMPO_PHASES = ['down', 'rest', 'up', 'hold'] as const
export type TempoPhase = (typeof TEMPO_PHASES)[number]

export function normalizeTempoPhase(value: unknown): TempoPhase {
  return typeof value === 'string' && (TEMPO_PHASES as readonly string[]).includes(value)
    ? value as TempoPhase
    : 'down'
}

export function phasesStartingAt(startPhase: TempoPhase = 'down'): TempoPhase[] {
  const start = TEMPO_PHASES.indexOf(startPhase)
  return [...TEMPO_PHASES.slice(start), ...TEMPO_PHASES.slice(0, start)]
}

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

// Plain-language action cues shown BIG during a guided set. "Lower" (not "let
// go") communicates a controlled eccentric; both pauses are isometric "holds".
// `icon` is a directional symbol reinforcing the verb (↓ lower, ↑ lift, ⏸ hold).
export const TEMPO_PHASE_CUE: Record<TempoPhase, { verb: string; sub: string; icon: string }> = {
  down: { verb: 'LOWER', sub: 'control it down', icon: '↓' },
  rest: { verb: 'HOLD', sub: 'pause at the bottom', icon: '⏸' },
  up: { verb: 'LIFT', sub: 'drive up', icon: '↑' },
  hold: { verb: 'HOLD', sub: 'squeeze at the top', icon: '⏸' },
}

// Whole seconds remaining in a phase, counting down (3 → 2 → 1); never fractional.
export function secondsLeft(remaining: number): number {
  return Math.max(0, Math.ceil(remaining - 1e-6))
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
export function phaseAt(
  cfg: TempoConfig,
  elapsedInRep: number,
  startPhase: TempoPhase = 'down',
): PhaseState {
  const total = repDuration(cfg)
  if (total <= 0) return { phase: 'down', remaining: 0 }

  let t = elapsedInRep
  if (t < 0) t = 0
  if (t >= total) t = total - 0.0001 // keep inside the last non-empty segment

  let start = 0
  const phaseOrder = phasesStartingAt(startPhase)
  for (const phase of phaseOrder) {
    const dur = cfg[phase]
    if (dur <= 0) continue
    const end = start + dur
    if (t < end) return { phase, remaining: end - t }
    start = end
  }

  // Fallback: last non-empty phase
  const last = [...phaseOrder].reverse().find((p) => cfg[p] > 0) ?? startPhase
  return { phase: last, remaining: 0 }
}
