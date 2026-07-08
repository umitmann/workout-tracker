'use client'

import { useEffect, useRef, useState } from 'react'
import { TempoConfig, TempoPhase, secondsLeft } from '@/lib/tempo'
import { guidedStateAt, stopEarlyReps } from '@/lib/guidedTimer'

export type GuideSet = { localId: string; goalReps: number; weight: number | null }

const PHASE_BG: Record<TempoPhase, string> = {
  down: 'bg-sky-600',
  rest: 'bg-amber-500',
  up: 'bg-emerald-600',
  hold: 'bg-amber-500',
}
const PHASE_TONE: Record<TempoPhase, number> = { down: 392, rest: 330, up: 523, hold: 440 }

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

// Guides an entire exercise: DRUH set → rest → next set → … staying full-screen.
// Tap the screen to stop the current set early (→ rest) or to skip a rest. We
// never return to the list mid-exercise; onDone fires with per-set actual reps
// when all sets are done or the user exits.
export default function ExerciseGuide({
  exerciseName,
  tempo,
  sets,
  restSeconds,
  audioDefault = true,
  onDone,
}: {
  exerciseName: string
  tempo: TempoConfig
  sets: GuideSet[]
  restSeconds: number
  audioDefault?: boolean
  onDone: (results: { localId: string; reps: number }[]) => void
}) {
  const [audio, setAudio] = useState(audioDefault)
  const [mode, setMode] = useState<'set' | 'rest'>('set')
  const [idx, setIdx] = useState(0)
  const [view, setView] = useState(() => guidedStateAt(tempo, sets[0]?.goalReps ?? 1, 0))
  const [restLeft, setRestLeft] = useState(restSeconds)

  const resultsRef = useRef<{ localId: string; reps: number }[]>([])
  const modeRef = useRef<'set' | 'rest'>('set')
  const idxRef = useRef(0)
  const startRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const audioRef = useRef(audio)
  const lastPhaseRef = useRef('')
  const lastTickRef = useRef(-1)
  const restBeepedRef = useRef(false)
  const doneRef = useRef(false)
  audioRef.current = audio

  useEffect(() => {
    if (sets.length === 0) { onDone([]); return }
    if (typeof window !== 'undefined' && 'AudioContext' in window) {
      ctxRef.current = new AudioContext()
      ctxRef.current.resume?.().catch(() => {})
    }
    startRef.current = performance.now()
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      ctxRef.current?.close().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function loop(now: number) {
    const elapsed = (now - startRef.current) / 1000

    if (modeRef.current === 'set') {
      const cur = sets[idxRef.current]
      const s = guidedStateAt(tempo, cur.goalReps, elapsed)
      const phaseKey = `${s.rep}:${s.phase}`
      if (phaseKey !== lastPhaseRef.current) {
        lastPhaseRef.current = phaseKey
        lastTickRef.current = s.secondsLeft
        if (audioRef.current && ctxRef.current) tone(ctxRef.current, PHASE_TONE[s.phase], 140)
        if (audioRef.current && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(45)
      } else if (s.secondsLeft !== lastTickRef.current) {
        if (s.secondsLeft >= 1 && s.secondsLeft <= 3 && audioRef.current && ctxRef.current) {
          tone(ctxRef.current, 700 + (3 - s.secondsLeft) * 120, 70, 0.18)
        }
        lastTickRef.current = s.secondsLeft
      }
      setView(s)
      if (s.finished) { completeSet(cur.goalReps); return }
    } else {
      const left = Math.max(0, restSeconds - elapsed)
      setRestLeft(left)
      if (!restBeepedRef.current && left <= 0) {
        restBeepedRef.current = true
        if (audioRef.current && ctxRef.current) tone(ctxRef.current, 660, 250, 0.3)
      }
      if (elapsed >= restSeconds) { advanceAfterRest(); return }
    }
    rafRef.current = requestAnimationFrame(loop)
  }

  function completeSet(reps: number) {
    const cur = sets[idxRef.current]
    resultsRef.current.push({ localId: cur.localId, reps })
    if (idxRef.current >= sets.length - 1) { finish(); return }
    modeRef.current = 'rest'
    setMode('rest')
    restBeepedRef.current = false
    startRef.current = performance.now()
    rafRef.current = requestAnimationFrame(loop)
  }

  function advanceAfterRest() {
    idxRef.current += 1
    setIdx(idxRef.current)
    modeRef.current = 'set'
    setMode('set')
    lastPhaseRef.current = ''
    lastTickRef.current = -1
    startRef.current = performance.now()
    rafRef.current = requestAnimationFrame(loop)
  }

  function handleTap() {
    if (doneRef.current) return
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    if (modeRef.current === 'set') {
      const elapsed = (performance.now() - startRef.current) / 1000
      completeSet(stopEarlyReps(tempo, sets[idxRef.current].goalReps, elapsed))
    } else {
      advanceAfterRest()
    }
  }

  function finish() {
    if (doneRef.current) return
    doneRef.current = true
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    onDone(resultsRef.current)
  }

  const setNum = Math.min(idx + 1, sets.length)
  const bg = mode === 'set' ? PHASE_BG[view.phase] : 'bg-orange-600'

  return (
    <div
      className={`fixed inset-0 z-[80] flex flex-col ${bg} transition-colors duration-150 text-white`}
      onClick={handleTap}
    >
      <div className="flex items-center justify-between px-6 pt-6">
        <p className="text-sm font-bold uppercase tracking-widest text-white/80 truncate">
          {exerciseName} · Set {setNum}/{sets.length}
        </p>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setAudio((a) => !a)}
            className="text-xs font-bold uppercase tracking-wide px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 transition-colors"
          >
            {audio ? '🔊' : '🔇'}
          </button>
          <button
            onClick={finish}
            className="text-xs font-bold uppercase tracking-wide px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 transition-colors"
          >
            Exit
          </button>
        </div>
      </div>

      {mode === 'set' ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-1 px-6 text-center">
          <p className={`text-7xl leading-none drop-shadow ${view.phase === 'down' ? 'translate-y-1' : view.phase === 'up' ? '-translate-y-1' : ''} transition-transform`}>{view.icon}</p>
          <p className="text-6xl sm:text-7xl font-black tracking-tight leading-none drop-shadow">{view.verb}</p>
          <p className="text-lg font-semibold text-white/80">{view.sub}</p>
          <p className="mt-5 text-[8rem] leading-none font-black tabular-nums drop-shadow">{view.secondsLeft}</p>
          <p className="mt-3 text-sm font-bold uppercase tracking-[0.25em] text-white/70">Rep {view.rep} / {sets[idx]?.goalReps}</p>
          <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-white/60">tap anywhere to stop &amp; rest</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-4xl font-black tracking-widest drop-shadow">REST</p>
          <p className="text-[8rem] leading-none font-black tabular-nums drop-shadow">{secondsLeft(restLeft)}</p>
          <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-white/70">next: set {Math.min(idx + 2, sets.length)} · tap to skip</p>
        </div>
      )}
    </div>
  )
}
