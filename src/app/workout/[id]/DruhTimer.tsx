'use client'

import { useEffect, useRef, useState } from 'react'
import { TempoConfig, TempoPhase, TEMPO_PHASE_CUE, repDuration, formatTempo } from '@/lib/tempo'
import { guidedStateAt, stopEarlyReps, isTickSecond } from '@/lib/guidedTimer'

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
  onStop,
  onCancel,
}: {
  tempo: TempoConfig
  goalReps: number
  audioDefault?: boolean
  onStop: (completedReps: number) => void
  onCancel: () => void
}) {
  const initial = guidedStateAt(tempo, goalReps, 0)
  const [audio, setAudio] = useState(audioDefault)
  const [rep, setRep] = useState(initial.rep)
  const [phase, setPhase] = useState<TempoPhase>(initial.phase)
  const [secs, setSecs] = useState(initial.secondsLeft)

  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number>(0)
  const lastPhaseRef = useRef<string>('')
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
      const elapsed = (now - startRef.current) / 1000
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
        if (audioRef.current && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(45)
      } else if (left !== lastTickRef.current) {
        // Per-second tick on the final 3 seconds of a phase ("get ready")
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
    const elapsed = (performance.now() - startRef.current) / 1000
    finish(stopEarlyReps(tempo, goalReps, elapsed))
  }

  const cue = TEMPO_PHASE_CUE[phase]

  return (
    <div className={`fixed inset-0 z-[80] flex flex-col ${PHASE_BG[phase]} transition-colors duration-150 text-white`}>
      {/* Top bar: exercise progress + audio toggle */}
      <div className="flex items-center justify-between px-6 pt-6">
        <p className="text-sm font-bold uppercase tracking-widest text-white/80">
          Rep {Math.min(rep, goalReps)} / {goalReps}
        </p>
        <button
          onClick={() => setAudio((a) => !a)}
          className="text-xs font-bold uppercase tracking-wide px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 transition-colors"
        >
          {audio ? '🔊 Audio on' : '🔇 Audio off'}
        </button>
      </div>

      {/* Center: direction symbol + giant verb + whole-second countdown */}
      <div className="flex-1 flex flex-col items-center justify-center gap-1 px-6 text-center">
        <p className={`text-7xl leading-none drop-shadow ${phase === 'down' ? 'translate-y-1' : phase === 'up' ? '-translate-y-1' : ''} transition-transform`}>{cue.icon}</p>
        <p className="text-6xl sm:text-7xl font-black tracking-tight leading-none drop-shadow">{cue.verb}</p>
        <p className="text-lg font-semibold text-white/80">{cue.sub}</p>
        <p className="mt-5 text-[8rem] leading-none font-black tabular-nums drop-shadow">{secs}</p>
        <p className="mt-3 text-sm font-bold uppercase tracking-[0.3em] text-white/70">Tempo {formatTempo(tempo)}</p>
      </div>

      {/* Bottom: actions */}
      <div className="flex gap-3 px-6 pb-8">
        <button
          onClick={onCancel}
          className="flex-1 rounded-2xl bg-white/15 hover:bg-white/25 py-4 text-base font-bold transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleStopEarly}
          className="flex-1 rounded-2xl bg-white py-4 text-base font-black text-zinc-900 transition-colors hover:bg-white/90"
        >
          Stop &amp; log
        </button>
      </div>
    </div>
  )
}
