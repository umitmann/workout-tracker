# Scenario: DRUH (down-rest-up-hold) tempo timer & guided set

## Intent
A user wants to train a set at a controlled tempo — a fixed number of seconds
for the eccentric (down), a pause (rest), the concentric (up), and a hold — and
be paced through each rep hands-free with audio/haptic cues. They set a goal rep
count; the timer loops the four phases per rep until the goal is reached, or they
stop early. Whatever reps they actually completed are logged, then the app rolls
into the rest timer.

## Contract
- given: a non-cardio exercise is selected in the logger
- when: the user taps "▶ Start" and configures tempo + goal reps + weight
- then: a full-screen timer loops the four phases (skipping any phase set to 0s),
  showing the current phase, remaining time, and rep N / goal
- invariant: audio can be toggled on/off at any time and defaults to on (required)
- invariant: a distinct tone (and a short vibration) fires on each phase change
- when: the running rep count exceeds the goal
- then: the timer stops automatically and logs `goalReps` completed reps
- when: the user taps "Stop & log" before the goal
- then: only fully-completed reps are logged (the in-progress rep is not counted)
- then: a set is added with the chosen weight and the completed reps, autosaved,
  and the rest timer starts for that set
- invariant: cancelling the timer logs nothing

## Pure logic (unit-tested — `.claude/test_tempo.mjs`)
`src/lib/tempo.ts`: `parseTempo`/`formatTempo` (round-trip "d-r-u-h"),
`repDuration`, and `phaseAt(cfg, elapsedInRep)` returning the active phase and
remaining time, skipping zero-length phases and clamping out-of-range elapsed.
