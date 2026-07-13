import {
  TRAINER_LISTING_STATUSES,
  TRAINER_REVIEW_STATUSES,
  TRAINER_VERIFICATION_STATUSES,
} from './trainerTypes'
import type {
  TrainerDirectoryInput,
  TrainerFieldErrors,
  TrainerProfileInput,
  TrainerReviewStatus,
  TrainerVerificationStatus,
} from './trainerTypes'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SPECIALTY_PATTERN = /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/
const DIRECTORY_PAGE_SIZE = 20
const MAX_DIRECTORY_PAGE = 501

type ValidationSuccess<T> = { success: true; data: T }
type ValidationFailure = { success: false; fieldErrors: TrainerFieldErrors }
export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : ''
}

function addError(
  errors: TrainerFieldErrors,
  field: keyof TrainerFieldErrors,
  message: string,
) {
  errors[field] = [...(errors[field] ?? []), message]
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}

export function normalizeSpecialty(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-')
}

export function parseTrainerProfileForm(
  formData: FormData,
): ValidationResult<TrainerProfileInput> {
  const errors: TrainerFieldErrors = {}
  const displayName = stringValue(formData.get('displayName')).trim()
  const avatarUrlValue = stringValue(formData.get('avatarUrl')).trim()
  const bio = stringValue(formData.get('bio')).trim()
  const locationValue = stringValue(formData.get('locationText')).trim()
  const listingStatusValue = stringValue(formData.get('listingStatus')).trim().toLowerCase()
  const rawSpecialties = stringValue(formData.get('specialties'))
  const specialties = [
    ...new Set(
      rawSpecialties
        .split(',')
        .map(normalizeSpecialty)
        .filter(Boolean),
    ),
  ].sort()

  if (displayName.length < 1 || displayName.length > 80) {
    addError(errors, 'displayName', 'Use between 1 and 80 characters.')
  }

  if (avatarUrlValue.length > 2048) {
    addError(errors, 'avatarUrl', 'Use at most 2,048 characters.')
  } else if (avatarUrlValue) {
    try {
      const parsed = new URL(avatarUrlValue)
      if (parsed.protocol !== 'https:') {
        addError(errors, 'avatarUrl', 'Use an HTTPS URL.')
      }
    } catch {
      addError(errors, 'avatarUrl', 'Enter a valid HTTPS URL.')
    }
  }

  if (bio.length > 2000) {
    addError(errors, 'bio', 'Use at most 2,000 characters.')
  }

  if (specialties.length > 20) {
    addError(errors, 'specialties', 'Add no more than 20 specialties.')
  }
  if (specialties.some((specialty) => specialty.length > 40 || !SPECIALTY_PATTERN.test(specialty))) {
    addError(
      errors,
      'specialties',
      'Use letters, numbers, spaces, hyphens, or underscores; 40 characters maximum each.',
    )
  }

  if (locationValue.length > 120) {
    addError(errors, 'locationText', 'Use at most 120 characters.')
  }

  if (!TRAINER_LISTING_STATUSES.includes(listingStatusValue as never)) {
    addError(errors, 'listingStatus', 'Choose draft, ready to publish, or paused.')
  }

  if (Object.keys(errors).length > 0) return { success: false, fieldErrors: errors }

  return {
    success: true,
    data: {
      displayName,
      avatarUrl: avatarUrlValue || null,
      bio,
      specialties,
      remoteAvailable: formData.get('remoteAvailable') === 'on',
      locationText: locationValue || null,
      acceptingClients: formData.get('acceptingClients') === 'on',
      listingStatus: listingStatusValue as TrainerProfileInput['listingStatus'],
    },
  }
}

export function parseTrainerReviewForm(
  formData: FormData,
): ValidationResult<{ profileId: string; verificationStatus: TrainerReviewStatus }> {
  const errors: TrainerFieldErrors = {}
  const profileId = stringValue(formData.get('profileId')).trim()
  const status = stringValue(formData.get('verificationStatus')).trim().toLowerCase()

  if (!isUuid(profileId)) addError(errors, 'profileId', 'Invalid trainer profile.')
  if (!TRAINER_REVIEW_STATUSES.includes(status as never)) {
    addError(errors, 'verificationStatus', 'Invalid review decision.')
  }

  if (Object.keys(errors).length > 0) return { success: false, fieldErrors: errors }

  return {
    success: true,
    data: { profileId, verificationStatus: status as TrainerReviewStatus },
  }
}

export function parseDirectorySearchParams(params: {
  q?: string | string[]
  specialty?: string | string[]
  remote?: string | string[]
  page?: string | string[]
}): ValidationResult<TrainerDirectoryInput> {
  const errors: TrainerFieldErrors = {}
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
  const query = first(params.q).trim()
  const specialtyValue = normalizeSpecialty(first(params.specialty))
  const remoteValue = first(params.remote)
  const rawPage = first(params.page)
  const page = rawPage === '' ? 1 : Number(rawPage)

  if (query.length > 100) addError(errors, 'displayName', 'Search text is too long.')
  if (
    specialtyValue &&
    (specialtyValue.length > 40 || !SPECIALTY_PATTERN.test(specialtyValue))
  ) {
    addError(errors, 'specialties', 'Enter a valid specialty.')
  }
  if (remoteValue && !['true', 'false'].includes(remoteValue)) {
    addError(errors, 'locationText', 'Choose a valid availability filter.')
  }
  if (!Number.isInteger(page) || page < 1 || page > MAX_DIRECTORY_PAGE) {
    addError(errors, 'displayName', 'Choose a valid results page.')
  }

  if (Object.keys(errors).length > 0) return { success: false, fieldErrors: errors }

  return {
    success: true,
    data: {
      query: query || null,
      specialty: specialtyValue || null,
      remote: remoteValue === '' ? null : remoteValue === 'true',
      page,
      pageSize: DIRECTORY_PAGE_SIZE,
      offset: (page - 1) * DIRECTORY_PAGE_SIZE,
    },
  }
}

export function parseAdminStatus(value: string | string[] | undefined): TrainerVerificationStatus | null {
  const status = (Array.isArray(value) ? value[0] : value)?.trim().toLowerCase() ?? ''
  return TRAINER_VERIFICATION_STATUSES.includes(status as never)
    ? (status as TrainerVerificationStatus)
    : status === 'all' || status === ''
      ? null
      : 'pending'
}
