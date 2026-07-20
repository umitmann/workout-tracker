// Tiny browser adapter around Web Speech. Timing and wording remain in pure
// models; this module only selects a device voice and performs the side effect.

export type GuidedSpeechVoice = {
  voiceURI: string
  name: string
  lang: string
  default?: boolean
}

export type GuidedSpeechOptions = {
  lang?: string
  rate?: number
  pitch?: number
  volume?: number
  voiceURI?: string
}

export function selectGuidedSpeechVoice<T extends GuidedSpeechVoice>(
  voices: readonly T[],
  requestedURI?: string | null,
  lang?: string | null,
): T | null {
  if (voices.length === 0) return null
  if (requestedURI) {
    const exact = voices.find((voice) => voice.voiceURI === requestedURI)
    if (exact) return exact
  }
  const baseLanguage = lang?.split('-')[0]?.toLowerCase()
  if (baseLanguage) {
    const languageMatch = voices.find((voice) => voice.lang.toLowerCase().split('-')[0] === baseLanguage)
    if (languageMatch) return languageMatch
  }
  return voices.find((voice) => voice.default) ?? voices[0]
}

export function speakGuided(
  text: string,
  interrupt = false,
  options: GuidedSpeechOptions = {},
): boolean {
  if (
    typeof window === 'undefined'
    || !('speechSynthesis' in window)
    || !('SpeechSynthesisUtterance' in window)
  ) return false

  if (interrupt) window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  const lang = options.lang || document.documentElement.lang || navigator.language || 'en-US'
  utterance.lang = lang
  utterance.rate = options.rate ?? 1.05
  utterance.pitch = options.pitch ?? 1
  utterance.volume = options.volume ?? 1
  const voice = selectGuidedSpeechVoice(window.speechSynthesis.getVoices(), options.voiceURI, lang)
  if (voice) utterance.voice = voice
  window.speechSynthesis.speak(utterance)
  return true
}

export function cancelGuidedSpeech() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}
