import type {
  TrainerExerciseFieldErrors,
  TrainerExerciseVisibility,
} from './trainerExerciseValidation'

export type TrainerExercise = {
  id: number
  name: string
  category: string | null
  equipment: string | null
  muscles: string[] | null
  muscles_secondary: string[] | null
  muscles_detailed: string[] | null
  muscles_secondary_detailed: string[] | null
  instructions: string[] | null
  video_url: string | null
  visibility: TrainerExerciseVisibility
  archived_at: string | null
  created_at: string
  updated_at: string
}

export type TrainerExerciseActionState = {
  success: boolean
  message: string
  exerciseId?: number
  fieldErrors?: TrainerExerciseFieldErrors
}
