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

// Should the rest bar keep `sticky` positioning? Normally it drops out of
// sticky while any field is focused so the mobile keyboard doesn't shove its
// multi-row settings layout around (commit 91d70ae). But a running countdown
// must stay visible even while the user is typing the next set's weight/reps
// (finding L2) — losing it there would scroll the timer away right when it
// matters most — so an active rest (`isResting`) always stays sticky.
export function shouldStickRestBar(fieldFocused: boolean, isResting: boolean): boolean {
  return isResting || !fieldFocused
}
