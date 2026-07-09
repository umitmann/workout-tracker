'use server'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getExerciseNotes } from '@/lib/dal'

// Save (or clear) the user's note for an exercise.
export async function saveExerciseNote(
  exerciseId: number,
  note: string,
): Promise<{ error?: string; success?: true }> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const trimmed = note.trim()

  if (trimmed === '') {
    const { error } = await supabase
      .from('exercise_notes')
      .delete()
      .eq('user_id', user.id)
      .eq('exercise_id', exerciseId)
    if (error) return { error: error.message }
    return { success: true }
  }

  const { error } = await supabase
    .from('exercise_notes')
    .upsert(
      { user_id: user.id, exercise_id: exerciseId, note: trimmed, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,exercise_id' },
    )
  if (error) return { error: error.message }
  return { success: true }
}

export async function fetchExerciseNotes(exerciseIds: number[]): Promise<Record<number, string>> {
  return getExerciseNotes(exerciseIds)
}
