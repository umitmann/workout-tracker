'use client'

import { useEffect, useRef, useState } from 'react'
import {
  TempoConfig,
  TempoPhase,
  TEMPO_PHASE_LABEL,
  phaseAt,
  repDuration,
  formatTempo,
} from '@/lib/tempo'

// Distinct tones per phase so the athlete can keep tempo without looking.
const PHASE_TONE: Record<TempoPhase, number> = {
  down: 392, // G4
  rest: 330, // E4
  up: 523, // C5
  hold: 440, // A4
}

function beep(ctx: AudioContext, freq: number, ms = 120) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.value = freq
  osc.type = 'sine'
  gain.gain.setValueAtTime(0.001, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ms / 1000)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + ms / 1000)
}

export default function DruhTimer({
  tempo,
  goalReps,
  audioDefault = true,
  onStop,
  onCancel,
}: {
  tempo: TempoConfig
  goalReps: number
  audioDefault?: boolean
  onStop: (completedReps: number) => void
  onCancel: () => void
}) {
  const [audio, setAudio] = useState(audioDefault)
  const [rep, setRep] = useState(1)
  const [phase, setPhase] = useState<TempoPhase>('down')
  const [remaining, setRemaining] = useState(0)

  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number>(0)
  const lastPhaseRef = useRef<string>('')
  const audioRef = useRef(audio)
  const ctxRef = useRef<AudioContext | null>(null)
  const doneRef = useRef(false)

  audioRef.current = audio

  const repDur = repDuration(tempo)

  useEffect(() => {
    if (repDur <= 0) return
    // Lazily create the audio context on mount (inside a user-gesture-opened modal).
    if (typeof window !== 'undefined' && 'AudioContext' in window) {
      ctxRef.current = new AudioContext()
      // Autoplay policies can start the context suspended; resume it.
      ctxRef.current.resume?.().catch(() => {})
    }
    startRef.current = performance.now()

    function frame(now: number) {
      const elapsed = (now - startRef.current) / 1000
      const completed = Math.floor(elapsed / repDur)
      const inRep = elapsed - completed * repDur
      const currentRep = completed + 1

      // Reached the goal — stop automatically.
      if (currentRep > goalReps) {
        finish(goalReps)
        return
      }

      const state = phaseAt(tempo, inRep)
      const key = `${currentRep}:${state.phase}`
      if (key !== lastPhaseRef.current) {
        lastPhaseRef.current = key
        if (audioRef.current && ctxRef.current) beep(ctxRef.current, PHASE_TONE[state.phase])
        if (audioRef.current && typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(40)
        }
      }

      setRep(currentRep)
      setPhase(state.phase)
      setRemaining(state.remaining)
      rafRef.current = requestAnimationFrame(frame)
    }

    rafRef.current = requestAnimationFrame(frame)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      ctxRef.current?.close().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function finish(completedReps: number) {
    if (doneRef.current) return
    doneRef.current = true
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    onStop(completedReps)
  }

  function handleStopEarly() {
    // Record fully completed reps only (current rep is in progress).
    const elapsed = (performance.now() - startRef.current) / 1000
    const completed = Math.min(goalReps, Math.floor(elapsed / repDur))
    finish(completed)
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[80] px-4">
      <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-6 flex flex-col items-center gap-5 shadow-2xl">
        <div className="w-full flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Tempo {formatTempo(tempo)}
          </p>
          <button
            onClick={() => setAudio((a) => !a)}
            className={`text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border transition-colors ${
              audio
                ? 'border-orange-400 text-orange-500'
                : 'border-zinc-300 dark:border-zinc-700 text-zinc-400'
            }`}
          >
            {audio ? '🔊 Audio on' : '🔇 Audio off'}
          </button>
        </div>

        <div className="flex flex-col items-center gap-1">
          <p className="text-6xl font-black text-orange-500 tabular-nums leading-none">
            {TEMPO_PHASE_LABEL[phase]}
          </p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-white tabular-nums">
            {remaining.toFixed(1)}s
          </p>
        </div>

        <p className="text-sm font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          Rep {Math.min(rep, goalReps)} / {goalReps}
        </p>

        <div className="flex gap-2 w-full">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 py-3 text-sm font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStopEarly}
            className="flex-1 rounded-xl bg-orange-500 hover:bg-orange-600 py-3 text-sm font-bold text-white transition-colors"
          >
            Stop &amp; log
          </button>
        </div>
      </div>
    </div>
  )
}
