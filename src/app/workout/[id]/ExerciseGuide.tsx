'use client'

import { useEffect, useRef, useState } from 'react'
import { TempoConfig, TempoPhase, secondsLeft } from '@/lib/tempo'
import { guidedStateAt, stopEarlyReps } from '@/lib/guidedTimer'
import { useWakeLock } from './useWakeLock'

export type GuideSet = { localId: string; goalReps: number; weight: number | null }

const READY_SECONDS = 3

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

type Mode = 'ready' | 'set' | 'rest'

// Guides an entire exercise: GET READY → DRUH set → rest → next set …, staying
// full-screen. Stopping is a deliberate button press (not a stray screen tap),
// and the screen is kept awake throughout.
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
  useWakeLock(true)

  const [audio, setAudio] = useState(audioDefault)
  const [mode, setMode] = useState<Mode>('ready')
  const [idx, setIdx] = useState(0)
  const [view, setView] = useState(() => guidedStateAt(tempo, sets[0]?.goalReps ?? 1, 0))
  const [restLeft, setRestLeft] = useState(restSeconds)
  const [readyLeft, setReadyLeft] = useState(READY_SECONDS)

  const resultsRef = useRef<{ localId: string; reps: number }[]>([])
  const modeRef = useRef<Mode>('ready')
  const idxRef = useRef(0)
  const startRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const audioRef = useRef(audio)
  const lastPhaseRef = useRef('')
  const lastTickRef = useRef(-1)
  const readyTickRef = useRef(-1)
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

    if (modeRef.current === 'ready') {
      const left = Math.max(0, Math.ceil(READY_SECONDS - elapsed - 1e-6))
      setReadyLeft(left)
      if (left !== readyTickRef.current) {
        readyTickRef.current = left
        if (left >= 1 && audioRef.current && ctxRef.current) tone(ctxRef.current, 500, 90, 0.2)
      }
      if (elapsed >= READY_SECONDS) { beginSet(); return }
    } else if (modeRef.current === 'set') {
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
      if (elapsed >= restSeconds) { toReady(); return }
    }
    rafRef.current = requestAnimationFrame(loop)
  }

  function beginSet() {
    modeRef.current = 'set'
    setMode('set')
    lastPhaseRef.current = ''
    lastTickRef.current = -1
    startRef.current = performance.now()
    rafRef.current = requestAnimationFrame(loop)
  }

  function toReady() {
    idxRef.current += 1
    setIdx(idxRef.current)
    modeRef.current = 'ready'
    setMode('ready')
    readyTickRef.current = -1
    setReadyLeft(READY_SECONDS)
    startRef.current = performance.now()
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

  // Deliberate button presses (not full-screen taps).
  function stopSet() {
    if (doneRef.current || modeRef.current !== 'set') return
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    const elapsed = (performance.now() - startRef.current) / 1000
    completeSet(stopEarlyReps(tempo, sets[idxRef.current].goalReps, elapsed))
  }
  function skipRest() {
    if (doneRef.current || modeRef.current !== 'rest') return
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    toReady()
  }
  function skipReady() {
    if (doneRef.current || modeRef.current !== 'ready') return
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    beginSet()
  }

  function finish() {
    if (doneRef.current) return
    doneRef.current = true
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    onDone(resultsRef.current)
  }

  const setNum = Math.min(idx + 1, sets.length)
  const bg = mode === 'set' ? PHASE_BG[view.phase] : mode === 'rest' ? 'bg-orange-600' : 'bg-zinc-800'

  return (
    <div className={`fixed inset-0 z-[80] flex flex-col ${bg} transition-colors duration-150 text-white`}>
      <div className="flex items-center justify-between px-6 pt-6">
        <p className="text-sm font-bold uppercase tracking-widest text-white/80 truncate">
          {exerciseName} · Set {setNum}/{sets.length}
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => setAudio((a) => !a)} className="text-xs font-bold px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 transition-colors">
            {audio ? '🔊' : '🔇'}
          </button>
          <button onClick={finish} className="text-xs font-bold uppercase tracking-wide px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 transition-colors">
            Exit
          </button>
        </div>
      </div>

      {mode === 'ready' ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-3xl font-black tracking-widest text-white/90">GET READY</p>
          <p className="text-lg font-semibold text-white/70">Set {setNum} · {sets[idx]?.goalReps} reps{sets[idx]?.weight ? ` @ ${sets[idx]?.weight}kg` : ''}</p>
          <p className="text-[9rem] leading-none font-black tabular-nums drop-shadow">{readyLeft}</p>
        </div>
      ) : mode === 'set' ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-1 px-6 text-center">
          <p className={`text-7xl leading-none drop-shadow ${view.phase === 'down' ? 'translate-y-1' : view.phase === 'up' ? '-translate-y-1' : ''} transition-transform`}>{view.icon}</p>
          <p className="text-6xl sm:text-7xl font-black tracking-tight leading-none drop-shadow">{view.verb}</p>
          <p className="text-lg font-semibold text-white/80">{view.sub}</p>
          <p className="mt-5 text-[8rem] leading-none font-black tabular-nums drop-shadow">{view.secondsLeft}</p>
          <p className="mt-3 text-sm font-bold uppercase tracking-[0.25em] text-white/70">Rep {view.rep} / {sets[idx]?.goalReps}</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-4xl font-black tracking-widest drop-shadow">REST</p>
          <p className="text-[8rem] leading-none font-black tabular-nums drop-shadow">{secondsLeft(restLeft)}</p>
          <p className="text-sm font-semibold uppercase tracking-widest text-white/70">next: set {Math.min(idx + 2, sets.length)}</p>
        </div>
      )}

      {/* Explicit action button so a stray touch can't end the set */}
      <div className="px-6 pb-8">
        {mode === 'set' && (
          <button onClick={stopSet} className="w-full rounded-2xl bg-white py-5 text-lg font-black text-zinc-900 hover:bg-white/90 transition-colors">
            Stop set &amp; rest
          </button>
        )}
        {mode === 'rest' && (
          <button onClick={skipRest} className="w-full rounded-2xl bg-white py-5 text-lg font-black text-zinc-900 hover:bg-white/90 transition-colors">
            Skip rest
          </button>
        )}
        {mode === 'ready' && (
          <button onClick={skipReady} className="w-full rounded-2xl bg-white py-5 text-lg font-black text-zinc-900 hover:bg-white/90 transition-colors">
            Start now
          </button>
        )}
      </div>
    </div>
  )
}
