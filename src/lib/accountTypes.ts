import type { AccountProfileFieldErrors } from './accountValidation'

export type AccountProfile = {
  user_id: string
  display_name: string
  avatar_url: string | null
  time_zone: string
  created_at: string
  updated_at: string
}

export type AccountActionState = {
  success: boolean
  message: string
  fieldErrors?: AccountProfileFieldErrors
}
