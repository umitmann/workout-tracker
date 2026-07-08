// Pure view-model for the guided DRUH set timer. The React component only owns
// the animation frame + audio; all displayed state is derived here so the UX
// contract (rep count, phase verb, whole-second countdown, completion) is
// unit-testable without a browser.

import {
  TempoConfig,
  TempoPhase,
  TEMPO_PHASE_CUE,
  phaseAt,
  repDuration,
  secondsLeft,
} from './tempo'

export type GuidedState = {
  rep: number // 1-based, capped at goalReps
  phase: TempoPhase
  verb: string
  sub: string
  icon: string // directional symbol (↓ ↑ ⏸)
  secondsLeft: number // whole seconds, counting down
  completedReps: number // fully finished reps so far (capped at goal)
  finished: boolean // goal reached (or degenerate zero-length tempo)
}

// Fully completed reps at a given elapsed time (a rep completes each repDuration).
export function completedRepsAt(tempo: TempoConfig, elapsed: number): number {
  const dur = repDuration(tempo)
  if (dur <= 0) return 0
  return Math.max(0, Math.floor(elapsed / dur))
}

// Reps to LOG when the user stops early — only fully completed reps count,
// never more than the goal.
export function stopEarlyReps(tempo: TempoConfig, goalReps: number, elapsed: number): number {
  return Math.min(goalReps, completedRepsAt(tempo, elapsed))
}

// A "get ready" tick fires on each of the final 3 whole seconds of a phase.
export function isTickSecond(sec: number): boolean {
  return sec >= 1 && sec <= 3
}

export function guidedStateAt(tempo: TempoConfig, goalReps: number, elapsed: number): GuidedState {
  const dur = repDuration(tempo)
  const completed = completedRepsAt(tempo, elapsed)

  if (dur <= 0 || completed >= goalReps) {
    const cue = TEMPO_PHASE_CUE.hold
    return {
      rep: goalReps,
      phase: 'hold',
      verb: cue.verb,
      sub: cue.sub,
      icon: cue.icon,
      secondsLeft: 0,
      completedReps: Math.min(goalReps, completed),
      finished: true,
    }
  }

  const inRep = elapsed - completed * dur
  const state = phaseAt(tempo, inRep)
  const cue = TEMPO_PHASE_CUE[state.phase]
  return {
    rep: completed + 1,
    phase: state.phase,
    verb: cue.verb,
    sub: cue.sub,
    icon: cue.icon,
    secondsLeft: secondsLeft(state.remaining),
    completedReps: completed,
    finished: false,
  }
}
