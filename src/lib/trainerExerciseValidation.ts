export const TRAINER_EXERCISE_VISIBILITIES = ['public', 'clients'] as const

export type TrainerExerciseVisibility = (typeof TRAINER_EXERCISE_VISIBILITIES)[number]

export type TrainerExerciseInput = {
  exerciseId: number | null
  name: string
  category: string
  equipment: string | null
  primaryMuscles: string[]
  secondaryMuscles: string[]
  instructions: string[]
  videoUrl: string | null
  visibility: TrainerExerciseVisibility
}

export type TrainerExerciseField =
  | 'exerciseId'
  | 'name'
  | 'category'
  | 'equipment'
  | 'primaryMuscles'
  | 'secondaryMuscles'
  | 'instructions'
  | 'videoUrl'
  | 'visibility'

export type TrainerExerciseFieldErrors = Partial<Record<TrainerExerciseField, string[]>>

export type TrainerExerciseValidationResult =
  | { success: true; data: TrainerExerciseInput }
  | { success: false; fieldErrors: TrainerExerciseFieldErrors }

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com'])
const YOUTU_BE_HOSTS = new Set(['youtu.be', 'www.youtu.be'])
const NO_COOKIE_HOSTS = new Set(['youtube-nocookie.com', 'www.youtube-nocookie.com'])

function text(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : ''
}

function addError(
  errors: TrainerExerciseFieldErrors,
  field: TrainerExerciseField,
  message: string,
) {
  errors[field] = [...(errors[field] ?? []), message]
}

function uniqueList(value: string, lowerCase = true): string[] {
  const seen = new Set<string>()
  const values: string[] = []
  for (const raw of value.split(',')) {
    const normalized = (lowerCase ? raw.toLowerCase() : raw).trim().replace(/\s+/g, ' ')
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    values.push(normalized)
  }
  return values
}

export function parseYouTubeUrl(value: string): {
  canonicalUrl: string
  videoId: string
} | null {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null

  const host = url.hostname.toLowerCase()
  let videoId: string | null = null
  if (YOUTU_BE_HOSTS.has(host)) {
    videoId = url.pathname.split('/').filter(Boolean)[0] ?? null
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (url.pathname === '/watch') videoId = url.searchParams.get('v')
    else {
      const [kind, id] = url.pathname.split('/').filter(Boolean)
      if (kind === 'shorts' || kind === 'embed') videoId = id ?? null
    }
  } else if (NO_COOKIE_HOSTS.has(host)) {
    const [kind, id] = url.pathname.split('/').filter(Boolean)
    if (kind === 'embed') videoId = id ?? null
  }

  if (!videoId || !YOUTUBE_ID.test(videoId)) return null
  return {
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    videoId,
  }
}

export function youtubeEmbedUrl(value: string | null | undefined): string | null {
  if (!value) return null
  const parsed = parseYouTubeUrl(value)
  return parsed ? `https://www.youtube-nocookie.com/embed/${parsed.videoId}` : null
}

export function parseTrainerExerciseForm(formData: FormData): TrainerExerciseValidationResult {
  const errors: TrainerExerciseFieldErrors = {}
  const rawExerciseId = text(formData.get('exerciseId'))
  const parsedExerciseId = rawExerciseId ? Number(rawExerciseId) : null
  const exerciseId = Number.isSafeInteger(parsedExerciseId) && (parsedExerciseId ?? 0) > 0
    ? parsedExerciseId
    : null
  const name = text(formData.get('name')).replace(/\s+/g, ' ')
  const category = text(formData.get('category')).toLowerCase().replace(/\s+/g, ' ')
  const equipment = text(formData.get('equipment')).replace(/\s+/g, ' ')
  const primaryMuscles = uniqueList(text(formData.get('primaryMuscles')))
  const secondaryMuscles = uniqueList(text(formData.get('secondaryMuscles')))
  const instructions = text(formData.get('instructions'))
    .split(/\r?\n/)
    .map((step) => step.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
  const rawVideoUrl = text(formData.get('videoUrl'))
  const parsedVideo = rawVideoUrl ? parseYouTubeUrl(rawVideoUrl) : null
  const visibility = text(formData.get('visibility')).toLowerCase()

  if (rawExerciseId && exerciseId === null) {
    addError(errors, 'exerciseId', 'Choose a valid exercise.')
  }
  if (name.length < 1 || name.length > 120) {
    addError(errors, 'name', 'Use between 1 and 120 characters.')
  }
  if (category.length < 1 || category.length > 80) {
    addError(errors, 'category', 'Use between 1 and 80 characters.')
  }
  if (equipment.length > 120) {
    addError(errors, 'equipment', 'Use at most 120 characters.')
  }
  for (const [field, values] of [
    ['primaryMuscles', primaryMuscles],
    ['secondaryMuscles', secondaryMuscles],
  ] as const) {
    if (values.length > 20 || values.some((value) => value.length > 60)) {
      addError(errors, field, 'Use at most 20 entries of 60 characters each.')
    }
  }
  if (
    instructions.length > 30
    || instructions.some((step) => step.length > 1000)
    || instructions.join('\n').length > 5000
  ) {
    addError(errors, 'instructions', 'Use at most 30 steps and 5,000 characters total.')
  }
  if (rawVideoUrl && !parsedVideo) {
    addError(errors, 'videoUrl', 'Use a valid HTTPS YouTube video URL.')
  }
  if (!TRAINER_EXERCISE_VISIBILITIES.includes(visibility as TrainerExerciseVisibility)) {
    addError(errors, 'visibility', 'Choose everyone or clients only.')
  }

  if (Object.keys(errors).length > 0) return { success: false, fieldErrors: errors }
  return {
    success: true,
    data: {
      exerciseId,
      name,
      category,
      equipment: equipment || null,
      primaryMuscles,
      secondaryMuscles,
      instructions,
      videoUrl: parsedVideo?.canonicalUrl ?? null,
      visibility: visibility as TrainerExerciseVisibility,
    },
  }
}
