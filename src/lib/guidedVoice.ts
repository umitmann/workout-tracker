import type { TempoPhase } from './tempo'
import type { GuidedSpeechOptions } from './guidedSpeech'

export type GuidedCoachingMode = 'minimal' | 'reps' | 'tempo' | 'supportive' | 'technique' | 'silent'
export type GuidedVoiceProfile = 'clear' | 'calm' | 'energetic' | 'device'
export type GuidedRestCueMode = 'chimes' | 'voice' | 'off'

export type GuidedVoiceSettings = {
  enabled: boolean
  coachingMode: GuidedCoachingMode
  voiceProfile: GuidedVoiceProfile
  voiceURI: string | null
  rhythmCues: boolean
  restCues: GuidedRestCueMode
}

export const DEFAULT_GUIDED_VOICE_SETTINGS: GuidedVoiceSettings = {
  enabled: true,
  coachingMode: 'minimal',
  voiceProfile: 'clear',
  voiceURI: null,
  rhythmCues: true,
  restCues: 'chimes',
}

export const GUIDED_COACHING_MODES: ReadonlyArray<{
  value: GuidedCoachingMode
  label: string
  description: string
}> = [
  { value: 'minimal', label: 'Rep + tempo', description: 'Rep number, then Lower, Hold, and Up.' },
  { value: 'reps', label: 'Reps only', description: 'Only announces each new rep.' },
  { value: 'tempo', label: 'Tempo only', description: 'Only Lower, Hold, and Up.' },
  { value: 'supportive', label: 'Supportive', description: 'Rep and tempo cues, plus halfway and last rep.' },
  { value: 'technique', label: 'PT technique', description: 'Rep and tempo cues, plus your saved technique cue before each set.' },
  { value: 'silent', label: 'Silent', description: 'No speech; optional tones and vibration remain available.' },
]

export const GUIDED_VOICE_PROFILES: ReadonlyArray<{
  value: GuidedVoiceProfile
  label: string
  description: string
}> = [
  { value: 'clear', label: 'Clear', description: 'Neutral and concise.' },
  { value: 'calm', label: 'Calm', description: 'Slower and softer.' },
  { value: 'energetic', label: 'Energetic', description: 'Quicker and brighter.' },
  { value: 'device', label: 'Device voice', description: 'Choose an installed system voice.' },
]

export const GUIDED_REST_CUE_MODES: ReadonlyArray<{
  value: GuidedRestCueMode
  label: string
  description: string
}> = [
  { value: 'chimes', label: 'Chimes', description: 'A tone halfway and at completion.' },
  { value: 'voice', label: 'Voice', description: 'Says “Rest halfway” and “Rest complete”.' },
  { value: 'off', label: 'Off', description: 'Visual rest timer only.' },
]

const COACHING_MODE_VALUES = new Set<GuidedCoachingMode>(GUIDED_COACHING_MODES.map((item) => item.value))
const VOICE_PROFILE_VALUES = new Set<GuidedVoiceProfile>(GUIDED_VOICE_PROFILES.map((item) => item.value))
const REST_CUE_VALUES = new Set<GuidedRestCueMode>(GUIDED_REST_CUE_MODES.map((item) => item.value))

export function normalizeGuidedVoiceSettings(value: unknown): GuidedVoiceSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_GUIDED_VOICE_SETTINGS }
  const candidate = value as Partial<GuidedVoiceSettings>
  return {
    enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : DEFAULT_GUIDED_VOICE_SETTINGS.enabled,
    coachingMode: COACHING_MODE_VALUES.has(candidate.coachingMode as GuidedCoachingMode)
      ? candidate.coachingMode as GuidedCoachingMode
      : DEFAULT_GUIDED_VOICE_SETTINGS.coachingMode,
    voiceProfile: VOICE_PROFILE_VALUES.has(candidate.voiceProfile as GuidedVoiceProfile)
      ? candidate.voiceProfile as GuidedVoiceProfile
      : DEFAULT_GUIDED_VOICE_SETTINGS.voiceProfile,
    voiceURI: typeof candidate.voiceURI === 'string' && candidate.voiceURI.trim()
      ? candidate.voiceURI
      : null,
    rhythmCues: typeof candidate.rhythmCues === 'boolean'
      ? candidate.rhythmCues
      : DEFAULT_GUIDED_VOICE_SETTINGS.rhythmCues,
    restCues: REST_CUE_VALUES.has(candidate.restCues as GuidedRestCueMode)
      ? candidate.restCues as GuidedRestCueMode
      : DEFAULT_GUIDED_VOICE_SETTINGS.restCues,
  }
}

export function speechOptionsForGuidedVoice(settings: GuidedVoiceSettings): GuidedSpeechOptions {
  if (settings.voiceProfile === 'calm') return { rate: 0.92, pitch: 0.96, volume: 0.85 }
  if (settings.voiceProfile === 'energetic') return { rate: 1.14, pitch: 1.04, volume: 1 }
  if (settings.voiceProfile === 'device') {
    return settings.voiceURI
      ? { rate: 1, pitch: 1, volume: 1, voiceURI: settings.voiceURI }
      : { rate: 1, pitch: 1, volume: 1 }
  }
  return { rate: 1.05, pitch: 1, volume: 1 }
}

function movementCue(phase: TempoPhase): string {
  if (phase === 'down') return 'Lower'
  if (phase === 'up') return 'Up'
  return 'Hold'
}

export function guidedPhaseAnnouncement({
  mode,
  phase,
  rep,
  goalReps,
  announceRep,
}: {
  mode: GuidedCoachingMode
  phase: TempoPhase
  rep: number
  goalReps: number
  announceRep: boolean
}): string | null {
  if (mode === 'silent') return null
  const movement = movementCue(phase)
  if (mode === 'tempo') return movement
  if (mode === 'reps') return announceRep ? `Rep ${Math.max(1, Math.floor(rep))}` : null
  if (!announceRep) return movement

  const repLabel = `Rep ${Math.max(1, Math.floor(rep))}`
  if (mode === 'supportive') {
    if (rep === Math.max(1, Math.floor(goalReps))) return `${repLabel}. Last rep. ${movement}`
    if (goalReps >= 4 && rep === Math.ceil(goalReps / 2)) return `${repLabel}. Halfway. ${movement}`
  }
  return `${repLabel}. ${movement}`
}

function cleanSpeechFragment(value: string, maxLength = 80): string {
  return value.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/g, '').slice(0, maxLength).trim()
}

export function guidedReadyAnnouncement({
  enabled,
  mode,
  exerciseName,
  setNumber,
  goalReps,
  weight,
  techniqueCue,
}: {
  enabled: boolean
  mode: GuidedCoachingMode
  exerciseName: string
  setNumber: number
  goalReps: number
  weight?: number | null
  techniqueCue?: string | null
}): string | null {
  if (!enabled || mode === 'silent') return null
  const exercise = cleanSpeechFragment(exerciseName, 100) || 'Exercise'
  const parts = [exercise, `Set ${Math.max(1, Math.floor(setNumber))}`, `${Math.max(1, Math.floor(goalReps))} reps`]
  if (typeof weight === 'number' && Number.isFinite(weight) && weight > 0) {
    parts.push(`${Number(weight.toFixed(2))} kilograms`)
  }
  const cue = cleanSpeechFragment(techniqueCue ?? '')
  if (mode === 'technique' && cue) parts.push('Cue', cue)
  return `${parts.join('. ')}.`
}

export function guidedRestAnnouncement(
  restMode: GuidedRestCueMode,
  moment: 'halfway' | 'complete',
): string | null {
  if (restMode !== 'voice') return null
  return moment === 'halfway' ? 'Rest halfway' : 'Rest complete'
}
