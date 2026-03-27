'use server'

import { getExerciseDetails, getExerciseHistory, getLastExercisePerformance } from '@/lib/dal'

export async function fetchExerciseDetails(id: number) {
  return getExerciseDetails(id)
}

export async function fetchExerciseHistory(id: number) {
  return getExerciseHistory(id)
}

export async function fetchLastExercisePerformance(id: number) {
  return getLastExercisePerformance(id)
}
