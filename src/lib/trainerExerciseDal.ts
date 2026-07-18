import 'server-only'

import { requireQueryData } from './dataAccessError'
import { isMissingColumnError } from './schemaCompatibility'
import { getServerAuthContext } from './serverAuth'
import type { TrainerExercise } from './trainerExerciseTypes'

export async function listOwnTrainerExercises(): Promise<TrainerExercise[]> {
  const { supabase, user } = await getServerAuthContext()
  if (!user) return []

  const result = await supabase
    .from('exercises')
    .select('id, name, category, equipment, muscles, muscles_secondary, muscles_detailed, muscles_secondary_detailed, instructions, video_url, visibility, archived_at, created_at, updated_at')
    .eq('creator_id', user.id)
    .order('archived_at', { ascending: true, nullsFirst: true })
    .order('updated_at', { ascending: false })

  if (
    isMissingColumnError(result.error, 'muscles_detailed')
    || isMissingColumnError(result.error, 'muscles_secondary_detailed')
  ) {
    const legacy = await supabase
      .from('exercises')
      .select('id, name, category, equipment, muscles, muscles_secondary, instructions, video_url, visibility, archived_at, created_at, updated_at')
      .eq('creator_id', user.id)
      .order('archived_at', { ascending: true, nullsFirst: true })
      .order('updated_at', { ascending: false })
    return (requireQueryData(legacy, 'list trainer exercises') ?? []).map((exercise) => ({
      ...exercise,
      muscles_detailed: null,
      muscles_secondary_detailed: null,
    })) as TrainerExercise[]
  }

  return (requireQueryData(result, 'list trainer exercises') ?? []) as TrainerExercise[]
}
