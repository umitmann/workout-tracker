'use server'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getExerciseNotes } from '@/lib/dal'
import { saveExerciseNoteCore } from './cores'

// Save (or clear) the user's note for an exercise.
export async function saveExerciseNote(
  exerciseId: number,
  note: string,
): Promise<{ error?: string; success?: true }> {
  return saveExerciseNoteCore(await createServerSupabaseClient(), exerciseId, note)
}

export async function fetchExerciseNotes(exerciseIds: number[]): Promise<Record<number, string>> {
  return getExerciseNotes(exerciseIds)
}
