import type { TempoPhase } from './tempo'
import { cancelGuidedSpeech, speakGuided } from './guidedSpeech'
import {
  type GuidedCoachVoice,
  type GuidedCoachingMode,
  type GuidedRestCueMode,
  type GuidedVoiceSettings,
  speechOptionsForGuidedVoice,
} from './guidedVoice'

export const MAX_PACKAGED_REP = 50

export const GUIDED_COACH_VOICES: ReadonlyArray<{
  value: GuidedCoachVoice
  label: string
  description: string
  accent: 'American English' | 'British English' | 'Device language'
  presentation: 'feminine' | 'masculine' | 'device'
  packaged: boolean
  sourceVoice: string | null
}> = [
  {
    value: 'maya', label: 'Maya',
    description: 'Warm, supportive feminine voice.',
    accent: 'American English', presentation: 'feminine', packaged: true, sourceVoice: 'af_heart',
  },
  {
    value: 'alex', label: 'Alex',
    description: 'Steady, lower masculine voice.',
    accent: 'American English', presentation: 'masculine', packaged: true, sourceVoice: 'am_michael',
  },
  {
    value: 'jordan', label: 'Jordan',
    description: 'Crisp, composed feminine voice.',
    accent: 'British English', presentation: 'feminine', packaged: true, sourceVoice: 'bf_emma',
  },
  {
    value: 'kai', label: 'Kai',
    description: 'Direct, energetic masculine voice.',
    accent: 'American English', presentation: 'masculine', packaged: true, sourceVoice: 'am_fenrir',
  },
  {
    value: 'system', label: 'Device voice',
    description: 'Uses a voice installed by your phone or computer.',
    accent: 'Device language', presentation: 'device', packaged: false, sourceVoice: null,
  },
]

const PACKAGED_COACHES = new Set<GuidedCoachVoice>(
  GUIDED_COACH_VOICES.filter((coach) => coach.packaged).map((coach) => coach.value),
)
const FIXED_CUES = ['get-ready', 'lower', 'hold', 'up', 'halfway', 'last-rep', 'rest-halfway', 'rest-complete'] as const
type FixedCoachCue = typeof FIXED_CUES[number]
export type GuidedCoachCue = FixedCoachCue | `rep-${number}`

export function isPackagedCoachVoice(value: GuidedCoachVoice): boolean {
  return PACKAGED_COACHES.has(value)
}

export function isGuidedCoachCue(value: string): value is GuidedCoachCue {
  if ((FIXED_CUES as readonly string[]).includes(value)) return true
  const match = /^rep-(\d+)$/.exec(value)
  if (!match) return false
  const rep = Number(match[1])
  return Number.isInteger(rep) && rep >= 1 && rep <= MAX_PACKAGED_REP
}

export function coachCuePath(coach: GuidedCoachVoice, cue: string): string {
  if (!isPackagedCoachVoice(coach)) throw new Error(`Coach ${coach} has no packaged audio`)
  if (!isGuidedCoachCue(cue)) throw new Error(`Unsupported guided coach cue: ${cue}`)
  return `/audio/coaches/${coach}/${cue}.mp3`
}

function movementCue(phase: TempoPhase): FixedCoachCue {
  if (phase === 'down') return 'lower'
  if (phase === 'up') return 'up'
  return 'hold'
}

export function guidedPhaseCoachCues({
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
}): GuidedCoachCue[] | null {
  if (mode === 'silent') return []
  const movement = movementCue(phase)
  if (mode === 'tempo') return [movement]
  if (mode === 'reps') {
    if (!announceRep) return []
    return rep >= 1 && rep <= MAX_PACKAGED_REP ? [`rep-${Math.floor(rep)}`] : null
  }
  if (!announceRep) return [movement]
  if (rep < 1 || rep > MAX_PACKAGED_REP) return null

  const cues: GuidedCoachCue[] = [`rep-${Math.floor(rep)}`]
  if (mode === 'supportive') {
    if (rep === Math.max(1, Math.floor(goalReps))) cues.push('last-rep')
    else if (goalReps >= 4 && rep === Math.ceil(goalReps / 2)) cues.push('halfway')
  }
  cues.push(movement)
  return cues
}

export function guidedReadyCoachCues(): GuidedCoachCue[] {
  return ['get-ready']
}

export function guidedPreviewCoachCues(): GuidedCoachCue[] {
  return ['rep-3', 'lower', 'hold', 'up']
}

export function guidedRestCoachCues(
  restMode: GuidedRestCueMode,
  moment: 'halfway' | 'complete',
): GuidedCoachCue[] {
  if (restMode !== 'voice') return []
  return [moment === 'halfway' ? 'rest-halfway' : 'rest-complete']
}

let playbackGeneration = 0
let activeAudio: HTMLAudioElement | null = null
let playbackQueue: Promise<void> = Promise.resolve()

export function cancelGuidedCoachAudio() {
  playbackGeneration += 1
  if (activeAudio) {
    activeAudio.pause()
    activeAudio.removeAttribute('src')
    activeAudio.load()
    activeAudio = null
  }
  playbackQueue = Promise.resolve()
  cancelGuidedSpeech()
}

function packagedPlaybackRate(settings: GuidedVoiceSettings): number {
  if (settings.deliveryStyle === 'calm') return 0.96
  if (settings.deliveryStyle === 'energetic') return 1.06
  return 1
}

function playAudioToEnd(audio: HTMLAudioElement): Promise<void> {
  return new Promise((resolve, reject) => {
    audio.addEventListener('ended', () => resolve(), { once: true })
    audio.addEventListener('error', () => reject(new Error('Coach audio failed to load')), { once: true })
    audio.play().catch(reject)
  })
}

async function playPackagedSequence(
  settings: GuidedVoiceSettings,
  cues: readonly GuidedCoachCue[],
  fallbackText: string | null,
  generation: number,
) {
  try {
    for (const cue of cues) {
      if (generation !== playbackGeneration) return
      const audio = new Audio(coachCuePath(settings.coachVoice, cue))
      audio.preload = 'auto'
      audio.playbackRate = packagedPlaybackRate(settings)
      audio.volume = settings.deliveryStyle === 'calm' ? 0.9 : 1
      activeAudio = audio
      await playAudioToEnd(audio)
    }
    if (generation === playbackGeneration) activeAudio = null
  } catch {
    if (generation !== playbackGeneration || !fallbackText) return
    activeAudio = null
    speakGuided(fallbackText, false, speechOptionsForGuidedVoice(settings))
  }
}

/**
 * Starts a fixed coach cue sequence. Missing assets and unsupported rep counts
 * atomically fall back to device speech; personalized text is never encoded in
 * an asset URL or sent to an external service.
 */
export function speakGuidedCoach(
  settings: GuidedVoiceSettings,
  cues: readonly GuidedCoachCue[] | null,
  fallbackText: string | null,
  interrupt = true,
): boolean {
  if (interrupt) cancelGuidedCoachAudio()
  if (!settings.enabled || settings.coachingMode === 'silent') return false
  if (settings.coachVoice === 'system' || cues === null || typeof Audio === 'undefined') {
    return fallbackText ? speakGuided(fallbackText, false, speechOptionsForGuidedVoice(settings)) : false
  }
  if (cues.length === 0) return false
  const generation = playbackGeneration
  playbackQueue = playbackQueue.then(
    () => playPackagedSequence(settings, cues, fallbackText, generation),
    () => playPackagedSequence(settings, cues, fallbackText, generation),
  )
  return true
}

export function preloadGuidedCoachCues(coach: GuidedCoachVoice, cues: readonly GuidedCoachCue[]) {
  if (typeof Audio === 'undefined' || !isPackagedCoachVoice(coach)) return
  for (const cue of cues) {
    const audio = new Audio(coachCuePath(coach, cue))
    audio.preload = 'auto'
    audio.load()
  }
}
