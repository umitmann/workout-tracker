export const TRAINER_LISTING_STATUSES = ['draft', 'published', 'paused'] as const
export const TRAINER_VERIFICATION_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'suspended',
] as const
export const TRAINER_REVIEW_STATUSES = ['approved', 'rejected', 'suspended'] as const

export type TrainerListingStatus = (typeof TRAINER_LISTING_STATUSES)[number]
export type TrainerVerificationStatus = (typeof TRAINER_VERIFICATION_STATUSES)[number]
export type TrainerReviewStatus = (typeof TRAINER_REVIEW_STATUSES)[number]

export type TrainerDirectoryListing = {
  id: string
  display_name: string
  avatar_url: string | null
  bio: string
  specialties: string[]
  remote_available: boolean
  location_text: string | null
  accepting_clients: boolean
}

export type OwnTrainerProfile = TrainerDirectoryListing & {
  listing_status: TrainerListingStatus
  verification_status: TrainerVerificationStatus
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export type AdminTrainerProfile = OwnTrainerProfile

export type TrainerProfileInput = {
  displayName: string
  avatarUrl: string | null
  bio: string
  specialties: string[]
  remoteAvailable: boolean
  locationText: string | null
  acceptingClients: boolean
  listingStatus: TrainerListingStatus
}

export type TrainerDirectoryInput = {
  query: string | null
  specialty: string | null
  remote: boolean | null
  page: number
  pageSize: number
  offset: number
}

export type TrainerFieldErrors = Partial<
  Record<
    | 'displayName'
    | 'avatarUrl'
    | 'bio'
    | 'specialties'
    | 'locationText'
    | 'listingStatus'
    | 'profileId'
    | 'verificationStatus',
    string[]
  >
>

export type TrainerActionState = {
  success: boolean
  message: string
  fieldErrors?: TrainerFieldErrors
}
