// Pure view-model for the docked rest timer. Keeps the display/overtime/alarm
// logic out of the React component so it can be unit-tested.

export type RestMode = 'fixed' | 'variable'

export type RestView = {
  display: string // mm:ss
  overtime: boolean // fixed mode, past target
  alarmDue: boolean // fixed mode, elapsed has reached target
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

export function restViewAt(mode: RestMode, target: number, elapsed: number): RestView {
  const remaining = target - elapsed
  const overtime = mode === 'fixed' && remaining < 0
  const display = mode === 'fixed' ? formatClock(Math.abs(remaining)) : formatClock(elapsed)
  const alarmDue = mode === 'fixed' && elapsed >= target
  return { display, overtime, alarmDue }
}

// Completing a set auto-starts rest for strength work, but not for cardio
// (a cardio "set" is the whole effort; there's no inter-set rest to time).
export function startsRestOnComplete(exerciseCategory: string | null): boolean {
  return exerciseCategory !== 'cardio'
}

// Pure row-format helper (checklist §17.8/§17.9, finding M3): renders a set's
// persisted rest_seconds for display in the completed summary / active rows.
// No rest recorded (null/undefined/0) → nothing to show.
export function formatRestRow(restSeconds: number | null | undefined): string | null {
  if (restSeconds == null || restSeconds <= 0) return null
  return `Rest ${formatClock(restSeconds)}`
}

// A running rest timer is sacred (Tile 6 / D5): no implicit action may reset
// or re-point it. Pure decision helper for `startRestFor` — implicit callers
// (toggleDone, handleAddSet, completeFromEdit, guided-stop) only get to start
// a rest when none is currently running; if one is already running for some
// set, the request is a no-op. The ONE deliberate exception is the explicit
// "Start rest" button, which always force-restarts (see WorkoutLogger's
// `forceRestartRestFor`) and does not consult this helper.
export function canStartRestImplicitly(restForSet: string | null): boolean {
  return restForSet === null
}

// Rest target resolve order (Tile 6 / D4): a PT prescription on the plan for
// this exercise wins; otherwise the athlete's single global stepper value
// applies. There is deliberately NO per-exercise learned memory — this
// mirrors how `tempo`/`ptTempo` resolves. `prescribed` is `routine_exercises
// .rest_seconds` for the exercise in question (or undefined/null if there is
// none / the column isn't migrated yet), never trusted over 0 vs "absent":
// only null/undefined falls back, a prescribed 0 is honored as-is.
export function resolveRestTarget(prescribed: number | null | undefined, globalTarget: number): number {
  return prescribed ?? globalTarget
}

// Should the rest bar keep `sticky` positioning? Normally it drops out of
// sticky while any field is focused so the mobile keyboard doesn't shove its
// multi-row settings layout around (commit 91d70ae). But a running countdown
// must stay visible even while the user is typing the next set's weight/reps
// (finding L2) — losing it there would scroll the timer away right when it
// matters most — so an active rest (`isResting`) always stays sticky.
export function shouldStickRestBar(fieldFocused: boolean, isResting: boolean): boolean {
  return isResting || !fieldFocused
}
