'use client'

import { useEffect, useRef, useState } from 'react'
import { TempoConfig, TempoPhase, TEMPO_PHASE_CUE, repDuration, formatTempo } from '@/lib/tempo'
import {
  activeElapsedSeconds,
  guidedStateAt,
  stopEarlyReps,
  READY_SECONDS,
  readySecondsLeft,
  resumedStartTime,
} from '@/lib/guidedTimer'
import { cancelGuidedSpeech, speakGuided } from '@/lib/guidedSpeech'
import {
  GuidedVoiceSettings,
  guidedPhaseAnnouncement,
  guidedReadyAnnouncement,
  speechOptionsForGuidedVoice,
} from '@/lib/guidedVoice'
import GuidedVoiceSettingsFields from './GuidedVoiceSettings'
import Modal from '@/components/Modal'

// Full-bleed background colour per phase so the phase is readable peripherally,
// across the room, and through sweat/glare. Paired with the verb (never colour
// alone) for colourblind safety.
const PHASE_BG: Record<TempoPhase, string> = {
  down: 'bg-sky-600',
  rest: 'bg-amber-500',
  up: 'bg-emerald-600',
  hold: 'bg-amber-500',
}

// Distinct transition tone per phase so it's identifiable by ear alone.
const PHASE_TONE: Record<TempoPhase, number> = {
  down: 392, // G4
  rest: 330, // E4
  up: 523, // C5
  hold: 440, // A4
}

function tone(ctx: AudioContext, freq: number, ms: number, volume = 0.25) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.value = freq
  osc.type = 'sine'
  gain.gain.setValueAtTime(0.0001, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + ms / 1000)
}

export default function DruhTimer({
  exerciseName,
  tempo,
  goalReps,
  weight = null,
  setNumber = 1,
  voiceSettingsDefault,
  onVoiceSettingsChange,
  techniqueCue = '',
  onTechniqueCueChange,
  onStop,
  onCancel,
}: {
  exerciseName: string
  tempo: TempoConfig
  goalReps: number
  weight?: number | null
  setNumber?: number
  voiceSettingsDefault: GuidedVoiceSettings
  onVoiceSettingsChange?: (settings: GuidedVoiceSettings) => void
  techniqueCue?: string
  onTechniqueCueChange?: (cue: string) => void
  onStop: (completedReps: number, difficulty: number | null) => void
  onCancel: () => void
}) {
  // Wake lock is now owned by WorkoutLogger at the session level (ADR-0007) —
  // no per-timer lock here.
  const initial = guidedStateAt(tempo, goalReps, 0)
  const [voiceSettings, setVoiceSettings] = useState(voiceSettingsDefault)
  const [showVoiceSettings, setShowVoiceSettings] = useState(false)
  const [ready, setReady] = useState(READY_SECONDS) // >0 = GET READY lead-in
  const [rep, setRep] = useState(initial.rep)
  const [phase, setPhase] = useState<TempoPhase>(initial.phase)
  const [secs, setSecs] = useState(initial.secondsLeft)
  const [paused, setPaused] = useState(false)
  // Tile 11: an early Stop & log surfaces the computed rep count for
  // confirm/adjust rather than saving it silently (the count over-counts if
  // the lifter paused mid-set). null = not confirming (still running).
  // Natural goal-completion skips this and calls finish() directly.
  const [confirmReps, setConfirmReps] = useState<number | null>(null)
  const [confirmDifficulty, setConfirmDifficulty] = useState<number | null>(null)

  const rafRef = useRef<number | null>(null)
  const frameRef = useRef<(now: number) => void>(() => {})
  const startRef = useRef<number>(0)
  const pausedRef = useRef(false)
  const pausedElapsedRef = useRef(0)
  const readyRef = useRef(true)
  const lastPhaseRef = useRef<string>('')
  const lastSpokenRepRef = useRef(0)
  const voiceSettingsRef = useRef(voiceSettings)
  const ctxRef = useRef<AudioContext | null>(null)
  const doneRef = useRef(false)

  voiceSettingsRef.current = voiceSettings
  const repDur = repDuration(tempo)

  useEffect(() => {
    if (repDur <= 0) return
    if (typeof window !== 'undefined' && 'AudioContext' in window) {
      ctxRef.current = new AudioContext()
      ctxRef.current.resume?.().catch(() => {})
    }
    startRef.current = performance.now()
    const readyAnnouncement = guidedReadyAnnouncement({
      enabled: voiceSettingsRef.current.enabled,
      mode: voiceSettingsRef.current.coachingMode,
      exerciseName,
      setNumber,
      goalReps,
      weight,
      techniqueCue,
    })
    if (readyAnnouncement) {
      speakGuided(readyAnnouncement, true, speechOptionsForGuidedVoice(voiceSettingsRef.current))
    }

    function frame(now: number) {
      if (pausedRef.current || doneRef.current) return
      const elapsed = activeElapsedSeconds(startRef.current, now)

      // GET READY lead-in before the first rep
      if (readyRef.current) {
        const left = readySecondsLeft(elapsed)
        setReady(left)
        if (elapsed >= READY_SECONDS) {
          readyRef.current = false
          startRef.current = performance.now()
        }
        rafRef.current = requestAnimationFrame(frame)
        return
      }

      const s = guidedStateAt(tempo, goalReps, elapsed)

      if (s.finished) {
        finish(goalReps)
        return
      }

      const left = s.secondsLeft
      const phaseKey = `${s.rep}:${s.phase}`

      // Transition tone + haptic on phase change
      if (phaseKey !== lastPhaseRef.current) {
        lastPhaseRef.current = phaseKey
        const currentSettings = voiceSettingsRef.current
        if (currentSettings.rhythmCues && ctxRef.current) tone(ctxRef.current, PHASE_TONE[s.phase], 140)
        if (currentSettings.enabled) {
          const announceRep = lastSpokenRepRef.current !== s.rep
          const announcement = guidedPhaseAnnouncement({
            mode: currentSettings.coachingMode,
            phase: s.phase,
            rep: s.rep,
            goalReps,
            announceRep,
          })
          if (announcement) speakGuided(announcement, true, speechOptionsForGuidedVoice(currentSettings))
          if (announceRep && announcement) lastSpokenRepRef.current = s.rep
        }
        if (currentSettings.rhythmCues && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(45)
      }

      setRep(s.rep)
      setPhase(s.phase)
      setSecs(left)
      rafRef.current = requestAnimationFrame(frame)
    }

    frameRef.current = frame
    rafRef.current = requestAnimationFrame(frame)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      ctxRef.current?.close().catch(() => {})
      cancelGuidedSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function finish(completedReps: number) {
    if (doneRef.current) return
    doneRef.current = true
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    cancelGuidedSpeech()
    onStop(completedReps, confirmDifficulty)
  }

  function elapsedNow() {
    return pausedRef.current
      ? pausedElapsedRef.current
      : activeElapsedSeconds(startRef.current, performance.now())
  }

  function togglePause() {
    if (doneRef.current || confirmReps != null) return
    if (!pausedRef.current) {
      pausedElapsedRef.current = activeElapsedSeconds(startRef.current, performance.now())
      pausedRef.current = true
      setPaused(true)
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      cancelGuidedSpeech()
      return
    }

    startRef.current = resumedStartTime(performance.now(), pausedElapsedRef.current)
    pausedRef.current = false
    setPaused(false)
    if (!readyRef.current) lastPhaseRef.current = ''
    rafRef.current = requestAnimationFrame(frameRef.current)
  }

  function changeVoiceSettings(next: GuidedVoiceSettings) {
    voiceSettingsRef.current = next
    setVoiceSettings(next)
    onVoiceSettingsChange?.(next)
    cancelGuidedSpeech()
    lastPhaseRef.current = ''
    lastSpokenRepRef.current = 0
  }

  function toggleVoice() {
    const next = { ...voiceSettingsRef.current, enabled: !voiceSettingsRef.current.enabled }
    changeVoiceSettings(next)
    if (next.enabled && readyRef.current) {
      const announcement = guidedReadyAnnouncement({
        enabled: next.enabled,
        mode: next.coachingMode,
        exerciseName,
        setNumber,
        goalReps,
        weight,
        techniqueCue,
      })
      if (announcement) speakGuided(announcement, true, speechOptionsForGuidedVoice(next))
    }
  }

  function openVoiceSettings() {
    if (!pausedRef.current && confirmReps == null) togglePause()
    setShowVoiceSettings(true)
  }

  function closeVoiceSettings() {
    setShowVoiceSettings(false)
    if (voiceSettingsRef.current.enabled) {
      lastPhaseRef.current = ''
      lastSpokenRepRef.current = 0
    }
  }

  // Tile 11: pause the run and surface the computed count for confirm/adjust
  // instead of logging it silently — the lifter adjusts ± and saves.
  function handleStopEarly() {
    if (doneRef.current || confirmReps != null) return
    pauseForConfirmation(stopEarlyReps(tempo, goalReps, elapsedNow()))
  }

  function pauseForConfirmation(repsCompleted: number) {
    if (doneRef.current || confirmReps != null) return
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    cancelGuidedSpeech()
    setConfirmReps(repsCompleted)
  }

  function adjustConfirmReps(delta: number) {
    setConfirmReps((r) => (r == null ? r : Math.max(0, Math.min(goalReps, r + delta))))
  }

  // Adjusting to 0 and saving logs nothing — the existing ≤0 rule in the
  // caller (handleGuidedStop) already refuses to create/fill a set at 0.
  function confirmStopEarly() {
    if (confirmReps == null) return
    finish(confirmReps)
  }

  function skipReady() {
    const wasPaused = pausedRef.current
    pausedRef.current = false
    setPaused(false)
    readyRef.current = false
    setReady(0)
    startRef.current = performance.now()
    lastPhaseRef.current = ''
    if (wasPaused) rafRef.current = requestAnimationFrame(frameRef.current)
  }

  const inReady = ready > 0
  const inConfirm = confirmReps != null
  const cue = TEMPO_PHASE_CUE[phase]
  const bg = inConfirm ? 'bg-zinc-800' : inReady ? 'bg-zinc-800' : PHASE_BG[phase]

  return (
    <div className={`fixed inset-0 z-[80] flex flex-col ${bg} transition-colors duration-150 text-white`}>
      {/* Top bar: exercise progress + live guidance controls */}
      <div className="flex items-center justify-between px-6 pt-6">
        <p className="text-sm font-bold uppercase tracking-widest text-white/80">
          Rep {Math.min(rep, goalReps)} / {goalReps}
        </p>
        <div className="flex items-center gap-2">
          {!inConfirm && (
            <button
              type="button"
              onClick={togglePause}
              aria-label={paused ? 'Resume guidance' : 'Pause guidance'}
              aria-pressed={paused}
              className="min-h-11 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors hover:bg-white/25"
            >
              {paused ? '▶ Play' : '⏸ Pause'}
            </button>
          )}
          <button
            type="button"
            onClick={toggleVoice}
            aria-label={voiceSettings.enabled ? 'Turn voice off' : 'Turn voice on'}
            aria-pressed={voiceSettings.enabled}
            className="grid min-h-11 min-w-11 place-items-center rounded-full bg-white/15 px-3 text-xs font-bold transition-colors hover:bg-white/25"
          >
            {voiceSettings.enabled ? '🔊' : '🔇'}
          </button>
          <button
            type="button"
            onClick={openVoiceSettings}
            aria-label="Voice settings"
            aria-expanded={showVoiceSettings}
            className="grid min-h-11 min-w-11 place-items-center rounded-full bg-white/15 px-3 text-base transition-colors hover:bg-white/25"
          >
            ⚙
          </button>
        </div>
      </div>

      {paused && !inConfirm && <p role="status" className="mx-auto mt-4 rounded-full bg-black/25 px-4 py-2 text-sm font-black tracking-[0.25em]">PAUSED</p>}

      {showVoiceSettings && (
        <Modal
          title="Voice settings"
          onClose={closeVoiceSettings}
          backdropClassName="fixed inset-0 z-[90] flex items-start justify-center bg-black/60 px-3 pt-[max(5rem,env(safe-area-inset-top))]"
          panelClassName="max-h-[calc(100dvh-6rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-white/20 bg-zinc-900/95 p-3 text-white shadow-2xl outline-none backdrop-blur"
        >
          <>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-sm font-black">Guidance settings</p>
              <button type="button" onClick={closeVoiceSettings} className="min-h-11 rounded-xl bg-white/10 px-4 text-sm font-bold hover:bg-white/20">Done</button>
            </div>
            <GuidedVoiceSettingsFields
              settings={voiceSettings}
              onChange={changeVoiceSettings}
              techniqueCue={techniqueCue}
              onTechniqueCueChange={onTechniqueCueChange}
              appearance="overlay"
            />
          </>
        </Modal>
      )}

      {inConfirm ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-lg font-semibold text-white/70">How many reps did you actually complete?</p>
          <div className="flex items-center gap-6">
            <button
              onClick={() => adjustConfirmReps(-1)}
              disabled={confirmReps <= 0}
              aria-label="Decrease reps"
              className="w-14 h-14 rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-30 text-3xl font-black transition-colors"
            >
              −
            </button>
            <p className="text-[7rem] leading-none font-black tabular-nums drop-shadow min-w-[3ch]">{confirmReps}</p>
            <button
              onClick={() => adjustConfirmReps(1)}
              disabled={confirmReps >= goalReps}
              aria-label="Increase reps"
              className="w-14 h-14 rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-30 text-3xl font-black transition-colors"
            >
              +
            </button>
          </div>
          <p className="text-sm font-semibold uppercase tracking-widest text-white/50">goal was {goalReps}</p>
          <fieldset className="mt-3">
            <legend className="mb-2 text-xs font-bold uppercase tracking-widest text-white/60">Difficulty (optional)</legend>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-label={`Difficulty ${value} of 5`}
                  aria-pressed={confirmDifficulty === value}
                  onClick={() => setConfirmDifficulty((current) => current === value ? null : value)}
                  className={`grid size-11 place-items-center rounded-full border-2 text-sm font-black transition ${confirmDifficulty === value ? 'border-white bg-white text-zinc-900' : 'border-white/30 bg-white/10 text-white hover:bg-white/20'}`}
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      ) : inReady ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-3xl font-black tracking-widest text-white/90">GET READY</p>
          <p className="text-lg font-semibold text-white/70">{goalReps} reps · tempo {formatTempo(tempo)}</p>
          <p className="text-[9rem] leading-none font-black tabular-nums drop-shadow">{ready}</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-1 px-6 text-center">
          <p className={`text-7xl leading-none drop-shadow ${phase === 'down' ? 'translate-y-1' : phase === 'up' ? '-translate-y-1' : ''} transition-transform`}>{cue.icon}</p>
          <p className="text-6xl sm:text-7xl font-black tracking-tight leading-none drop-shadow">{cue.verb}</p>
          <p className="text-lg font-semibold text-white/80">{cue.sub}</p>
          <p data-testid="guided-countdown" className="mt-5 text-[8rem] leading-none font-black tabular-nums drop-shadow">{secs}</p>
          <p className="mt-3 text-sm font-bold uppercase tracking-[0.3em] text-white/70">Tempo {formatTempo(tempo)}</p>
        </div>
      )}

      {/* Bottom: actions */}
      <div className="flex gap-3 px-6 pb-8">
        <button
          onClick={inConfirm ? onCancel : handleStopEarly}
          className="flex-1 rounded-2xl bg-white/15 hover:bg-white/25 py-4 text-base font-bold transition-colors"
        >
          {inConfirm ? 'Discard set' : 'Review & exit'}
        </button>
        {inConfirm ? (
          <button
            onClick={confirmStopEarly}
            className="flex-1 rounded-2xl bg-white py-4 text-base font-black text-zinc-900 transition-colors hover:bg-white/90"
          >
            {confirmReps <= 0 ? 'Log nothing' : `Log ${confirmReps} rep${confirmReps === 1 ? '' : 's'}`}
          </button>
        ) : inReady ? (
          <button
            onClick={skipReady}
            className="flex-1 rounded-2xl bg-white py-4 text-base font-black text-zinc-900 transition-colors hover:bg-white/90"
          >
            Start now
          </button>
        ) : (
          <button
            onClick={handleStopEarly}
            className="flex-1 rounded-2xl bg-white py-4 text-base font-black text-zinc-900 transition-colors hover:bg-white/90"
          >
            Stop &amp; log
          </button>
        )}
      </div>
    </div>
  )
}
