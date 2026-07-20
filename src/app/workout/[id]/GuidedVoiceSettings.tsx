'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  GUIDED_COACHING_MODES,
  GUIDED_REST_CUE_MODES,
  GUIDED_VOICE_PROFILES,
  GuidedCoachingMode,
  GuidedRestCueMode,
  GuidedVoiceProfile,
  GuidedVoiceSettings,
  speechOptionsForGuidedVoice,
} from '@/lib/guidedVoice'
import { GuidedSpeechVoice, speakGuided } from '@/lib/guidedSpeech'

function useAvailableGuidedVoices(): GuidedSpeechVoice[] {
  const [voices, setVoices] = useState<GuidedSpeechVoice[]>([])

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const update = () => {
      setVoices(window.speechSynthesis.getVoices().map((voice) => ({
        voiceURI: voice.voiceURI,
        name: voice.name,
        lang: voice.lang,
        default: voice.default,
      })))
    }
    update()
    window.speechSynthesis.addEventListener?.('voiceschanged', update)
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', update)
  }, [])

  return voices
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  inverted = false,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
  inverted?: boolean
}) {
  return (
    <label className={`flex min-h-14 items-center justify-between gap-4 rounded-xl border px-3 py-2.5 ${inverted ? 'border-white/20' : 'border-zinc-200 dark:border-zinc-700'}`}>
      <span>
        <span className={`block text-sm font-bold ${inverted ? 'text-white' : 'text-zinc-800 dark:text-zinc-200'}`}>{label}</span>
        <span className={`block text-xs leading-snug ${inverted ? 'text-white/65' : 'text-zinc-500 dark:text-zinc-400'}`}>{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-5 shrink-0 accent-orange-500"
      />
    </label>
  )
}

export default function GuidedVoiceSettingsFields({
  settings,
  onChange,
  techniqueCue = '',
  onTechniqueCueChange,
  showRestCues = false,
  appearance = 'setup',
}: {
  settings: GuidedVoiceSettings
  onChange: (settings: GuidedVoiceSettings) => void
  techniqueCue?: string
  onTechniqueCueChange?: (cue: string) => void
  showRestCues?: boolean
  appearance?: 'setup' | 'overlay'
}) {
  const voices = useAvailableGuidedVoices()
  const coachingMode = useMemo(
    () => GUIDED_COACHING_MODES.find((item) => item.value === settings.coachingMode)!,
    [settings.coachingMode],
  )
  const voiceProfile = useMemo(
    () => GUIDED_VOICE_PROFILES.find((item) => item.value === settings.voiceProfile)!,
    [settings.voiceProfile],
  )
  const restMode = useMemo(
    () => GUIDED_REST_CUE_MODES.find((item) => item.value === settings.restCues)!,
    [settings.restCues],
  )
  const surface = appearance === 'overlay'
    ? 'border-white/20 bg-black/20 text-white'
    : 'border-zinc-200 bg-zinc-50/70 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950/50 dark:text-white'
  const selectClass = appearance === 'overlay'
    ? 'border-white/25 bg-zinc-900 text-white'
    : 'border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white'
  const secondaryText = appearance === 'overlay' ? 'text-white/65' : 'text-zinc-500 dark:text-zinc-400'

  function update(patch: Partial<GuidedVoiceSettings>) {
    onChange({ ...settings, ...patch })
  }

  function previewVoice() {
    speakGuided('Rep 3. Lower. Hold. Up.', true, speechOptionsForGuidedVoice(settings))
  }

  return (
    <section aria-label="Guided voice settings" className={`flex flex-col gap-3 rounded-2xl border p-3 ${surface}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black">Voice coaching</p>
          <p className={`text-xs ${secondaryText}`}>Choose how much the guide says. Seconds are always silent.</p>
        </div>
        <label className="flex min-h-11 shrink-0 items-center gap-2 text-xs font-bold">
          <input
            aria-label="Voice coaching enabled"
            type="checkbox"
            checked={settings.enabled}
            onChange={(event) => update({ enabled: event.target.checked })}
            className="size-5 accent-orange-500"
          />
          {settings.enabled ? 'On' : 'Off'}
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold uppercase tracking-wide">Coaching style</span>
        <select
          aria-label="Coaching style"
          value={settings.coachingMode}
          onChange={(event) => update({ coachingMode: event.target.value as GuidedCoachingMode })}
          className={`min-h-11 rounded-xl border px-3 text-sm font-bold ${selectClass}`}
        >
          {GUIDED_COACHING_MODES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <span className={`text-xs ${secondaryText}`}>{coachingMode.description}</span>
      </label>

      {settings.coachingMode === 'technique' && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wide">Technique cue</span>
          <input
            aria-label="Technique cue"
            type="text"
            value={techniqueCue}
            maxLength={80}
            onChange={(event) => onTechniqueCueChange?.(event.target.value)}
            placeholder="Brace before lowering"
            className={`min-h-11 rounded-xl border px-3 text-sm ${selectClass}`}
          />
          <span className={`text-xs ${secondaryText}`}>Enter one short cue you or your PT chose. The app never invents form feedback.</span>
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold uppercase tracking-wide">Voice character</span>
        <select
          aria-label="Voice character"
          value={settings.voiceProfile}
          onChange={(event) => update({ voiceProfile: event.target.value as GuidedVoiceProfile })}
          className={`min-h-11 rounded-xl border px-3 text-sm font-bold ${selectClass}`}
        >
          {GUIDED_VOICE_PROFILES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <span className={`text-xs ${secondaryText}`}>{voiceProfile.description}</span>
      </label>

      {settings.voiceProfile === 'device' && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wide">Installed voice</span>
          <select
            aria-label="Installed voice"
            value={settings.voiceURI ?? ''}
            onChange={(event) => update({ voiceURI: event.target.value || null })}
            className={`min-h-11 rounded-xl border px-3 text-sm ${selectClass}`}
          >
            <option value="">Automatic device voice</option>
            {voices.map((voice) => (
              <option key={voice.voiceURI} value={voice.voiceURI}>
                {voice.name} ({voice.lang}){voice.default ? ' — default' : ''}
              </option>
            ))}
          </select>
          {voices.length === 0 && <span className={`text-xs ${secondaryText}`}>No installed voices reported yet; the browser default will be used.</span>}
        </label>
      )}

      <button
        type="button"
        onClick={previewVoice}
        disabled={!settings.enabled || settings.coachingMode === 'silent'}
        className="min-h-11 rounded-xl border border-orange-400/70 px-3 text-sm font-black text-orange-500 transition-colors hover:bg-orange-500/10 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Preview voice
      </button>

      <ToggleRow
        label="Rhythm cues"
        description="Play one tone and vibration when the movement phase changes. No second-by-second ticks."
        checked={settings.rhythmCues}
        onChange={(rhythmCues) => update({ rhythmCues })}
        inverted={appearance === 'overlay'}
      />

      {showRestCues && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wide">Rest alerts</span>
          <select
            aria-label="Rest alerts"
            value={settings.restCues}
            onChange={(event) => update({ restCues: event.target.value as GuidedRestCueMode })}
            className={`min-h-11 rounded-xl border px-3 text-sm font-bold ${selectClass}`}
          >
            {GUIDED_REST_CUE_MODES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <span className={`text-xs ${secondaryText}`}>{restMode.description} Never counts rest seconds aloud.</span>
        </label>
      )}
    </section>
  )
}
