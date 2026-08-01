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
