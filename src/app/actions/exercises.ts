'use server'

import { getExerciseDetails, getExerciseHistory, getLastExercisePerformance, getBestExercisePerformance } from '@/lib/dal'

export async function fetchExerciseDetails(id: number) {
  return getExerciseDetails(id)
}

// today (optional): the client's local calendar date (localDateStr()) —
// anchors the "last N days" window to the user's day, not the server's UTC
// clock (ADR-0005). Callers should pass it; dal.ts falls back safely if omitted.
export async function fetchExerciseHistory(id: number, today?: string) {
  return getExerciseHistory(id, 90, today)
}

export async function fetchLastExercisePerformance(id: number) {
  return getLastExercisePerformance(id)
}

export async function fetchBestExercisePerformance(id: number) {
  return getBestExercisePerformance(id)
}

export async function fetchBestExercisePerformance60Days(id: number, today?: string) {
  return getBestExercisePerformance(id, 60, today)
}
