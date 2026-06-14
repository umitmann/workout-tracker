# Scenario: Exercise technique modes (drop set, AMRAP, rest-pause, and others)

## Intent
A user who trains with advanced techniques — drop sets, AMRAP (to failure), rest-pause, myo-reps, cluster sets — cannot express those techniques in the logger today. Every set is treated identically: a weight and a rep count, logged one at a time. A drop set (e.g. 10 kg → failure, 9 kg → failure, … 1 kg → failure, no rest between drops) looks identical in the log to three independent normal sets. The user loses context about how they trained, cannot compare drop-set sessions in history, and has to mentally reconstruct the technique from raw numbers. The logger should let the user declare the technique for an exercise so that the log and history reflect how it was actually performed.

## Techniques in scope (discovered via research)

| Technique | Description |
|-----------|-------------|
| **Normal** | Default. Fixed weight and reps per set, rest between sets. |
| **Drop Set** | Perform to failure, immediately reduce weight (no rest), repeat to failure, continue reducing. User described as "exhausting": 10 kg → 9 kg → … → 1 kg, all to failure. |
| **AMRAP** | As Many Reps As Possible — a single set performed to (or near) failure; rep count is not predetermined. |
| **Rest-Pause** | Perform to failure, rest 10–20 seconds, continue with the same weight to failure, repeat 2–3 times. |
| **Myo-Reps** | One activation set (12–20 reps, 2 reps in reserve), then multiple short rest-pause mini-sets (3–5 reps each) with ~20 seconds rest. |
| **Cluster Set** | Fixed weight; perform a mini-set (e.g., 4 reps), rest 10 seconds intra-set, another mini-set, repeat — same weight throughout. |

## Contract
- given: the user is logging an active workout with at least one exercise
- when: the user opens the technique selector for an exercise
- then: the techniques listed above are available as options; "Normal" is the default
- when: the user selects a technique other than Normal
- then: the exercise card is visually labelled with the chosen technique (e.g., "DROP SET" badge on the header)
- when: the user logs sets under a Drop Set technique
- then: each sub-set in the chain is displayed in descending weight order and visually grouped as a single drop-set sequence (e.g., "10 kg × failure → 9 kg × failure → 8 kg × failure")
- when: the user logs a set under AMRAP technique
- then: the reps field accepts a rep count logged after the set completes (the user enters how many they actually did); the set row is labelled "AMRAP" to distinguish it from a normal set
- when: the workout is completed
- then: the technique used is visible in the completed-workout summary per exercise
- invariant: technique selection is per exercise within a session, not global — two exercises in the same workout can use different techniques
- invariant: Normal sets are not affected; all existing set-logging behaviour is unchanged
- invariant: exercise history (chart and modals) continues to show weight and reps; technique is shown as a label alongside each historical session entry

## Steps
1. Start an in-progress workout, add bench press
2. Tap the technique selector on bench press — verify the six options are shown (Normal, Drop Set, AMRAP, Rest-Pause, Myo-Reps, Cluster Set)
3. Select "Drop Set" — bench press card shows "DROP SET" badge; the add-set form reflects drop-set mode
4. Enter 10 kg, tap "To failure" (rep count recorded post-set), enter reps logged, confirm
5. Immediately enter 9 kg (no rest), repeat; continue down to 1 kg
6. The exercise card shows the full drop chain in descending weight order, visually grouped
7. Add a second exercise (squat), leave it on Normal — squat logs identically to current behaviour
8. Complete the workout — completed-workout summary shows bench press labelled "Drop Set" with the full chain; squat shows normal sets
9. Open exercise history for bench press — the drop-set session is shown with technique label; the weight trend reflects the first (highest) weight in the chain
