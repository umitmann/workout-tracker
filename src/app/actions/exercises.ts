'use server'

import { getExerciseDetails } from '@/lib/dal'

export async function fetchExerciseDetails(id: number) {
  return getExerciseDetails(id)
}
