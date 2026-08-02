import {
  LocalSet,
  SetValueMode,
  addSet,
  applyEdit,
  applySetValueEdit,
  commitPending,
  resolveEditFields,
  updateSetNote,
} from './setListOps'

type NavigationEdit = {
  localId: string
  fields: {
    weight: string
    reps: string
    duration_minutes: string
    distance: string
  }
  note: string
  valueMode: SetValueMode
}

type NavigationPendingSet = {
  fields: {
    weight: string
    reps: string
    duration_minutes: string
    distance: string
  }
  exercise: {
    id: number
    name: string
    category: string | null
  }
  wasEdited: boolean
  localId: string
}

export type WorkoutNavigationDraft = {
  edit?: NavigationEdit | null
  pending?: NavigationPendingSet | null
}

/**
 * Compares the complete persisted shape without relying on object identity.
 * Navigation snapshots intentionally create fresh objects while committing an
 * open editor, so referential equality would turn every Minimize into a
 * redundant network save even when none of the values changed.
 */
export function workoutNavigationSnapshotsEqual(
  left: LocalSet[],
  right: LocalSet[],
): boolean {
  if (left === right) return true
  if (left.length !== right.length) return false

  return left.every((set, index) => {
    const other = right[index]
    return other != null
      && set.localId === other.localId
      && set.exerciseId === other.exerciseId
      && set.exerciseName === other.exerciseName
      && set.exerciseCategory === other.exerciseCategory
      && set.weight === other.weight
      && set.reps === other.reps
      && set.duration_minutes === other.duration_minutes
      && set.distance === other.distance
      && set.rest_seconds === other.rest_seconds
      && set.difficulty === other.difficulty
      && set.note === other.note
      && set.done === other.done
  })
}

/**
 * A snapshot is safe to skip only when the same values have actually entered
 * the serialized save queue. `null` represents template-derived sets that are
 * visible in a brand-new workout but do not exist in the database yet.
 */
export function shouldSaveWorkoutNavigationSnapshot(
  snapshot: LocalSet[],
  lastQueuedSnapshot: LocalSet[] | null,
  queueDirty: boolean,
): boolean {
  return queueDirty
    || lastQueuedSnapshot == null
    || !workoutNavigationSnapshotsEqual(snapshot, lastQueuedSnapshot)
}

/**
 * Produces the one snapshot used by every action that can leave the logger.
 * It commits visible inputs but deliberately never marks a set completed.
 */
export function buildWorkoutNavigationSnapshot(
  sets: LocalSet[],
  draft: WorkoutNavigationDraft,
): LocalSet[] {
  let snapshot = sets
  const edit = draft.edit
  if (edit) {
    const target = snapshot.find((set) => set.localId === edit.localId)
    if (target) {
      const isCardio = target.exerciseCategory === 'cardio'
      const fields = resolveEditFields(edit.fields, target, isCardio)
      snapshot = applyEdit(snapshot, target.localId, fields)
      if (!isCardio) {
        snapshot = applySetValueEdit(
          snapshot,
          target.localId,
          { weight: fields.weight, reps: fields.reps },
          edit.valueMode,
        )
      }
      snapshot = updateSetNote(snapshot, target.localId, edit.note)
    }
  }

  const pending = draft.pending
  if (pending) {
    const newSet = commitPending(
      pending.fields,
      {
        localId: pending.localId,
        exerciseId: pending.exercise.id,
        exerciseName: pending.exercise.name,
        exerciseCategory: pending.exercise.category,
      },
      pending.exercise.category === 'cardio',
      pending.wasEdited,
    )
    if (newSet) snapshot = addSet(snapshot, newSet)
  }

  return snapshot
}
