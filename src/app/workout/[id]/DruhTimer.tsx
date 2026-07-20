'use client'

import { useEffect, useRef, useState } from 'react'
import { TempoConfig, TempoPhase, TEMPO_PHASE_CUE, repDuration, formatTempo } from '@/lib/tempo'
import {
  activeElapsedSeconds,
  guidedPhaseVoiceAnnouncement,
  guidedStateAt,
  stopEarlyReps,
  isTickSecond,
  READY_SECONDS,
  readySecondsLeft,
  resumedStartTime,
} from '@/lib/guidedTimer'
import { cancelGuidedSpeech, speakGuided } from '@/lib/guidedSpeech'

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
  tempo,
  goalReps,
  audioDefault = true,
  onAudioChange,
  onStop,
  onCancel,
}: {
  tempo: TempoConfig
  goalReps: number
  audioDefault?: boolean
  onAudioChange?: (enabled: boolean) => void
  onStop: (completedReps: number, difficulty: number | null) => void
  onCancel: () => void
}) {
  // Wake lock is now owned by WorkoutLogger at the session level (ADR-0007) —
  // no per-timer lock here.
  const initial = guidedStateAt(tempo, goalReps, 0)
  const [audio, setAudio] = useState(audioDefault)
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
  const readyTickRef = useRef(-1)
  const lastPhaseRef = useRef<string>('')
  const lastSpokenRepRef = useRef(0)
  const lastTickRef = useRef<number>(-1)
  const audioRef = useRef(audio)
  const ctxRef = useRef<AudioContext | null>(null)
  const doneRef = useRef(false)

  audioRef.current = audio
  const repDur = repDuration(tempo)

  useEffect(() => {
    if (repDur <= 0) return
    if (typeof window !== 'undefined' && 'AudioContext' in window) {
      ctxRef.current = new AudioContext()
      ctxRef.current.resume?.().catch(() => {})
    }
    startRef.current = performance.now()

    function frame(now: number) {
      if (pausedRef.current || doneRef.current) return
      const elapsed = activeElapsedSeconds(startRef.current, now)

      // GET READY lead-in before the first rep
      if (readyRef.current) {
        const left = readySecondsLeft(elapsed)
        setReady(left)
        if (left !== readyTickRef.current) {
          readyTickRef.current = left
          if (left >= 1 && audioRef.current) {
            if (ctxRef.current) tone(ctxRef.current, 500, 90, 0.2)
          }
        }
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
        lastTickRef.current = left // seed so we don't also tick this same second
        if (audioRef.current && ctxRef.current) tone(ctxRef.current, PHASE_TONE[s.phase], 140)
        if (audioRef.current) {
          const announceRep = lastSpokenRepRef.current !== s.rep
          speakGuided(guidedPhaseVoiceAnnouncement(s.phase, s.rep, announceRep), true)
          if (announceRep) lastSpokenRepRef.current = s.rep
        }
        if (audioRef.current && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(45)
      } else if (left !== lastTickRef.current) {
        // The final three seconds can still tick, but are never spoken.
        if (isTickSecond(left) && audioRef.current && ctxRef.current) {
          tone(ctxRef.current, 700 + (3 - left) * 120, 70, 0.18)
        }
        lastTickRef.current = left
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
    if (readyRef.current) readyTickRef.current = -1
    else lastPhaseRef.current = ''
    rafRef.current = requestAnimationFrame(frameRef.current)
  }

  function toggleAudio() {
    const next = !audioRef.current
    audioRef.current = next
    setAudio(next)
    onAudioChange?.(next)
    if (!next) cancelGuidedSpeech()
    else {
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
      {/* Top bar: exercise progress + audio toggle */}
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
            onClick={toggleAudio}
            aria-label={audio ? 'Turn voice off' : 'Turn voice on'}
            aria-pressed={audio}
            className="min-h-11 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors hover:bg-white/25"
          >
            {audio ? '🔊 Voice on' : '🔇 Voice off'}
          </button>
        </div>
      </div>

      {paused && !inConfirm && <p role="status" className="mx-auto mt-4 rounded-full bg-black/25 px-4 py-2 text-sm font-black tracking-[0.25em]">PAUSED</p>}

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
