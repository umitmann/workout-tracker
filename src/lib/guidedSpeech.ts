// Tiny browser adapter around Web Speech. Timing and wording remain in the
// pure guidedTimer model; this module only performs the optional side effect.

export function speakGuided(text: string, interrupt = false): boolean {
  if (
    typeof window === 'undefined'
    || !('speechSynthesis' in window)
    || !('SpeechSynthesisUtterance' in window)
  ) return false

  if (interrupt) window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = document.documentElement.lang || navigator.language || 'en-US'
  utterance.rate = 1.15
  utterance.pitch = 1
  window.speechSynthesis.speak(utterance)
  return true
}

export function cancelGuidedSpeech() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}
