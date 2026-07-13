// Pure LocalSet[] operations extracted from WorkoutLogger (finding H4): add,
// delete, inline edit/revert, exercise reorder, and rest recording. No React,
// no DB — the component calls these and persists the result.

export type LocalSet = {
  localId: string
  exerciseId: number
  exerciseName: string
  exerciseCategory: string | null
  weight: number | null
  reps: number | null
  duration_minutes: number | null
  distance: number | null
  rest_seconds: number | null
  // Tile 10c: 1-5 subjective-effort rating, non-cardio sets only. Nullable/
  // optional everywhere — never required to add/complete a set or the workout.
  difficulty: number | null
  done: boolean
}

export type SetEdit = Partial<
  Pick<LocalSet, 'weight' | 'reps' | 'duration_minutes' | 'distance' | 'difficulty' | 'done'>
>

// §4.9/§4.10: exercises stay in insertion order — appending is enough.
export function addSet(sets: LocalSet[], newSet: LocalSet): LocalSet[] {
  return [...sets, newSet]
}

export function deleteSet(sets: LocalSet[], localId: string): LocalSet[] {
  return sets.filter((s) => s.localId !== localId)
}

// §4.3/§4.4: commits an in-progress edit onto the target set only.
export function applyEdit(sets: LocalSet[], localId: string, edit: SetEdit): LocalSet[] {
  return sets.map((s) => (s.localId === localId ? { ...s, ...edit } : s))
}

// §4.5: reverts the target set to a prior snapshot (e.g. its value before
// editing began) — the caller supplies that snapshot since this module holds
// no history of its own.
export function cancelEdit(sets: LocalSet[], localId: string, priorValue: LocalSet): LocalSet[] {
  return sets.map((s) => (s.localId === localId ? priorValue : s))
}

// §4.11–4.13: moves an exercise's contiguous set block up/down one position,
// preserving each block's internal set order. No-ops at the list edges.
export function reorderExercise(
  sets: LocalSet[],
  exerciseId: number,
  direction: 'up' | 'down',
): LocalSet[] {
  const order: number[] = []
  for (const s of sets) {
    if (!order.includes(s.exerciseId)) order.push(s.exerciseId)
  }
  const idx = order.indexOf(exerciseId)
  const newIdx = direction === 'up' ? idx - 1 : idx + 1
  if (idx === -1 || newIdx < 0 || newIdx >= order.length) return sets

  const reordered = [...order]
  ;[reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]]
  return reordered.flatMap((id) => sets.filter((s) => s.exerciseId === id))
}

// §17.3/§17.5: attaches the *actual* elapsed rest time to the set that was
// just completed — never the configured target.
export function recordRestForSet(sets: LocalSet[], localId: string, elapsedSeconds: number): LocalSet[] {
  return sets.map((s) => (s.localId === localId ? { ...s, rest_seconds: elapsedSeconds } : s))
}

// Tile 10c: sets (or clears, on re-tap of the already-selected value) the
// difficulty chip for one set. Always optional — a null/undefined value (or
// tapping the currently-set value again) blanks the rating rather than
// requiring one, and never touches `done` — tappable any time, before or
// after a set is completed.
export function setDifficulty(sets: LocalSet[], localId: string, value: number | null): LocalSet[] {
  return sets.map((s) =>
    s.localId === localId ? { ...s, difficulty: s.difficulty === value ? null : value } : s,
  )
}

// ─── Tile 9: auto-commit typed-but-uncommitted values ──────────────────────
// The field note this kills: "if I don't hit complete, the value is removed
// when tapping elsewhere." Both the add-set form and the inline set editor
// funnel their typed strings through these two pure helpers so the
// commit-on-blur / commit-on-navigate logic can be unit tested without React.

export type PendingFields = {
  weight: string
  reps: string
  duration_minutes: string
  distance: string
}

// Builds a brand-new NOT-DONE LocalSet from the add-set form's typed values,
// or returns null when the form is effectively empty — the caller (add-form
// blur / exercise-switch) must not commit a phantom empty set. `base` supplies
// the identity fields (localId/exerciseId/exerciseName/exerciseCategory); this
// never sets `done: true` and never touches rest — only ✓/Complete does that.
export function commitPending(
  fields: PendingFields,
  base: Pick<LocalSet, 'localId' | 'exerciseId' | 'exerciseName' | 'exerciseCategory'>,
  isCardio: boolean,
): LocalSet | null {
  const hasValue = isCardio
    ? !!(fields.duration_minutes || fields.distance)
    : !!(fields.weight || fields.reps)
  if (!hasValue) return null
  return {
    ...base,
    weight: !isCardio && fields.weight ? Number(fields.weight) : null,
    reps: !isCardio && fields.reps ? Number(fields.reps) : null,
    duration_minutes: isCardio && fields.duration_minutes ? Number(fields.duration_minutes) : null,
    distance: isCardio && fields.distance ? Number(fields.distance) : null,
    rest_seconds: null,
    difficulty: null,
    done: false,
  }
}

// Resolves the inline set editor's typed values against the set's PRIOR
// values (never null) — an emptied field falls back to what was already
// saved instead of wiping it, mirroring `completeFromEdit`'s fallback. Does
// not touch `done`, so editing an already-done set and blurring away keeps
// it done; editing a not-done set keeps it not-done. Pure — no rest, no
// commit-vs-empty decision (the set already exists, so there is nothing to
// "not commit").
export function resolveEditFields(
  fields: PendingFields,
  prior: Pick<LocalSet, 'weight' | 'reps' | 'duration_minutes' | 'distance'>,
  isCardio: boolean,
): SetEdit {
  return {
    weight: !isCardio && fields.weight ? Number(fields.weight) : prior.weight,
    reps: !isCardio && fields.reps ? Number(fields.reps) : prior.reps,
    duration_minutes: isCardio && fields.duration_minutes ? Number(fields.duration_minutes) : prior.duration_minutes,
    distance: isCardio && fields.distance ? Number(fields.distance) : prior.distance,
  }
}

// ─── Tile 4/13: paste + import share one merge rule ────────────────────────
// Empty workout -> callers apply `incoming` directly without ever calling
// this (there's nothing to prompt about). Non-empty -> Overwrite replaces
// everything; Append keeps the existing sets and adds `incoming` after them,
// preserving each list's own internal order. Never mutates in place.
export type MergeMode = 'overwrite' | 'append'

export function mergeIncomingSets(
  existing: LocalSet[],
  incoming: LocalSet[],
  mode: MergeMode,
): LocalSet[] {
  return mode === 'append' ? [...existing, ...incoming] : incoming
}

// ─── Tile 12b: whole-exercise guide results merge ──────────────────────────
// Pure write-back for the guide-all end-of-guide review: merges confirmed
// per-set rep counts onto the CURRENT set list. Extracted so the caller can
// always apply it against the latest state (e.g. a functional `setLocalSets`
// update or a fresh render's `localSets`) rather than a snapshot captured
// when the guide/timer first mounted — that mount-time-snapshot pattern was
// the root cause of the "Exit loses the first exercise" bug (a stale
// `localSets` closure clobbering every OTHER exercise's newer state). Only
// sets whose localId is present AND whose confirmed reps are > 0 are
// written; everything else (including other exercises entirely) passes
// through untouched, mirroring Tile 11's "adjusting to 0 logs nothing" rule.
export function mergeGuideResults(
  sets: LocalSet[],
  results: { localId: string; reps: number }[],
): LocalSet[] {
  const byId = new Map(results.filter((r) => r.reps > 0).map((r) => [r.localId, r.reps]))
  if (byId.size === 0) return sets
  return sets.map((s) => (byId.has(s.localId) ? { ...s, reps: byId.get(s.localId)!, done: true } : s))
}

export type SetDeleteRequest = { pendingId: string | null; confirmed: boolean }

// ADR-0008 (WP-09): two-tap confirm transition for the set-delete ✕, mirroring
// the calendar's confirmDeleteId pattern (§3.15-3.17). Tapping ✕ on a set with
// nothing armed (or with a *different* set armed) arms confirmation on that
// set; tapping ✕ again on the *same* armed set disarms and reports confirmed
// so the caller can run deleteSet. Pure state transition — the component owns
// the `pendingId` useState and calls deleteSet itself on `confirmed`.
export function requestSetDelete(pendingId: string | null, localId: string): SetDeleteRequest {
  if (pendingId === localId) return { pendingId: null, confirmed: true }
  return { pendingId: localId, confirmed: false }
}

// Cancel always clears whatever is armed, regardless of target — mirrors the
// calendar's Cancel button (§3.17).
requestSetDelete.cancel = (): null => null
