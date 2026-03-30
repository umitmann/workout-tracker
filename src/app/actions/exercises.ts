'use server'

import { getExerciseDetails, getExerciseHistory, getLastExercisePerformance, getBestExercisePerformance } from '@/lib/dal'

export async function fetchExerciseDetails(id: number) {
  return getExerciseDetails(id)
}

export async function fetchExerciseHistory(id: number) {
  return getExerciseHistory(id)
}

export async function fetchLastExercisePerformance(id: number) {
  return getLastExercisePerformance(id)
}

export async function fetchBestExercisePerformance(id: number) {
  return getBestExercisePerformance(id)
}

export async function fetchBestExercisePerformance60Days(id: number) {
  return getBestExercisePerformance(id, 60)
}
