'use client'

import { useEffect, useRef, useState } from 'react'
import { TempoConfig, TempoPhase, secondsLeft } from '@/lib/tempo'
import {
  guidedRestAudioCue,
  guidedStateAt,
  stopEarlyReps,
  READY_SECONDS,
  readySecondsLeft,
} from '@/lib/guidedTimer'

export type GuideSet = { localId: string; goalReps: number; weight: number | null }
export type GuideResult = {
  localId: string
  reps: number
  difficulty?: number | null
  restSeconds?: number
}
export type GuidedRestHandoff = { localId: string; elapsedSeconds: number }

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

// Guides an entire exercise: GET READY → DRUH set → optional rest → next set.
// Every exit goes through WorkoutLogger's editable review. If the athlete exits
// during rest, the main rest dock receives the elapsed value and continues from
// that exact counter instead of restarting at zero.
export default function ExerciseGuide({
  exerciseName,
  tempo,
  sets,
  restSeconds,
  restBetweenSets = true,
  audioDefault = true,
  onDone,
}: {
  exerciseName: string
  tempo: TempoConfig
  sets: GuideSet[]
  restSeconds: number
  restBetweenSets?: boolean
  audioDefault?: boolean
  onDone: (results: GuideResult[], activeRest?: GuidedRestHandoff) => void
}) {
  const [audio, setAudio] = useState(audioDefault)
  const [mode, setMode] = useState<Mode>('ready')
  const [idx, setIdx] = useState(0)
  const [view, setView] = useState(() => guidedStateAt(tempo, sets[0]?.goalReps ?? 1, 0))
  const [restLeft, setRestLeft] = useState(restSeconds)
  const [readyLeft, setReadyLeft] = useState(READY_SECONDS)
  const [difficultyBySet, setDifficultyBySet] = useState<Record<string, number | null>>({})

  const resultsRef = useRef<GuideResult[]>([])
  const modeRef = useRef<Mode>('ready')
  const idxRef = useRef(0)
  const startRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const audioRef = useRef(audio)
  const lastPhaseRef = useRef('')
  const lastTickRef = useRef(-1)
  const readyTickRef = useRef(-1)
  const lastRestCueSecondRef = useRef(-1)
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
    // The guide is a run snapshot: changing its inputs remounts it upstream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function upsertResult(result: GuideResult) {
    const existing = resultsRef.current.findIndex((entry) => entry.localId === result.localId)
    if (existing === -1) resultsRef.current.push(result)
    else resultsRef.current[existing] = { ...resultsRef.current[existing], ...result }
  }

  function restElapsedSeconds() {
    return Math.max(0, Math.round((performance.now() - startRef.current) / 1000))
  }

  function recordRest(elapsedSeconds: number) {
    const current = sets[idxRef.current]
    if (!current) return
    upsertResult({ localId: current.localId, reps: resultsRef.current.find((r) => r.localId === current.localId)?.reps ?? 0, restSeconds: elapsedSeconds })
  }

  function loop(now: number) {
    const elapsed = (now - startRef.current) / 1000

    if (modeRef.current === 'ready') {
      const left = readySecondsLeft(elapsed)
      setReadyLeft(left)
      if (left !== readyTickRef.current) {
        readyTickRef.current = left
        if (left >= 1 && audioRef.current && ctxRef.current) tone(ctxRef.current, 500, 90, 0.2)
      }
      if (elapsed >= READY_SECONDS) { beginSet(); return }
    } else if (modeRef.current === 'set') {
      const current = sets[idxRef.current]
      const state = guidedStateAt(tempo, current.goalReps, elapsed)
      const phaseKey = `${state.rep}:${state.phase}`
      if (phaseKey !== lastPhaseRef.current) {
        lastPhaseRef.current = phaseKey
        lastTickRef.current = state.secondsLeft
        if (audioRef.current && ctxRef.current) tone(ctxRef.current, PHASE_TONE[state.phase], 140)
        if (audioRef.current && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(45)
      } else if (state.secondsLeft !== lastTickRef.current) {
        if (state.secondsLeft >= 1 && state.secondsLeft <= 3 && audioRef.current && ctxRef.current) {
          tone(ctxRef.current, 700 + (3 - state.secondsLeft) * 120, 70, 0.18)
        }
        lastTickRef.current = state.secondsLeft
      }
      setView(state)
      if (state.finished) { completeSet(current.goalReps); return }
    } else {
      const left = Math.max(0, restSeconds - elapsed)
      setRestLeft(left)
      const wholeSecondsLeft = secondsLeft(left)
      if (wholeSecondsLeft !== lastRestCueSecondRef.current) {
        lastRestCueSecondRef.current = wholeSecondsLeft
        const cue = guidedRestAudioCue(restSeconds, wholeSecondsLeft)
        if (cue && audioRef.current && ctxRef.current) {
          if (cue === 'halfway') tone(ctxRef.current, 520, 180, 0.25)
          if (cue === 'countdown') tone(ctxRef.current, 700 + (3 - wholeSecondsLeft) * 120, 90, 0.22)
          if (cue === 'complete') tone(ctxRef.current, 660, 250, 0.3)
        }
      }
      if (elapsed >= restSeconds) {
        recordRest(Math.round(restSeconds))
        toReady()
        return
      }
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
    const current = sets[idxRef.current]
    upsertResult({ localId: current.localId, reps, difficulty: difficultyBySet[current.localId] ?? null })
    if (idxRef.current >= sets.length - 1) { finish(); return }
    if (!restBetweenSets) { toReady(); return }
    modeRef.current = 'rest'
    setMode('rest')
    setRestLeft(restSeconds)
    lastRestCueSecondRef.current = -1
    startRef.current = performance.now()
    rafRef.current = requestAnimationFrame(loop)
  }

  function stopSet() {
    if (doneRef.current || modeRef.current !== 'set') return
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    const elapsed = (performance.now() - startRef.current) / 1000
    completeSet(stopEarlyReps(tempo, sets[idxRef.current].goalReps, elapsed))
  }

  function skipRest() {
    if (doneRef.current || modeRef.current !== 'rest') return
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    recordRest(restElapsedSeconds())
    toReady()
  }

  function skipReady() {
    if (doneRef.current || modeRef.current !== 'ready') return
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    beginSet()
  }

  function setCurrentDifficulty(value: number) {
    const current = sets[idxRef.current]
    if (!current) return
    const nextValue = difficultyBySet[current.localId] === value ? null : value
    setDifficultyBySet((currentValues) => ({ ...currentValues, [current.localId]: nextValue }))
    const result = resultsRef.current.find((entry) => entry.localId === current.localId)
    if (result) upsertResult({ ...result, difficulty: nextValue })
  }

  // Back/Exit never silently commits or discards. It captures an in-progress
  // set (including 0 reps), hands off an in-progress rest, and opens the
  // editable review in the logger.
  function exitForReview() {
    if (doneRef.current) return
    const current = sets[idxRef.current]
    let activeRest: GuidedRestHandoff | undefined
    if (current && modeRef.current === 'set') {
      const elapsed = (performance.now() - startRef.current) / 1000
      upsertResult({
        localId: current.localId,
        reps: stopEarlyReps(tempo, current.goalReps, elapsed),
        difficulty: difficultyBySet[current.localId] ?? null,
      })
    } else if (current && modeRef.current === 'ready' && !resultsRef.current.some((result) => result.localId === current.localId)) {
      upsertResult({ localId: current.localId, reps: 0, difficulty: difficultyBySet[current.localId] ?? null })
    } else if (current && modeRef.current === 'rest') {
      const elapsedSeconds = restElapsedSeconds()
      recordRest(elapsedSeconds)
      activeRest = { localId: current.localId, elapsedSeconds }
    }
    finish(activeRest)
  }

  function finish(activeRest?: GuidedRestHandoff) {
    if (doneRef.current) return
    doneRef.current = true
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    onDone([...resultsRef.current], activeRest)
  }

  const setNum = Math.min(idx + 1, sets.length)
  const currentDifficulty = sets[idx] ? difficultyBySet[sets[idx].localId] ?? null : null
  const bg = mode === 'set' ? PHASE_BG[view.phase] : mode === 'rest' ? 'bg-orange-600' : 'bg-zinc-800'

  return (
    <div className={`fixed inset-0 z-[80] flex flex-col ${bg} text-white transition-colors duration-150`}>
      <div className="flex items-center justify-between px-4 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6">
        <p className="truncate text-sm font-bold uppercase tracking-widest text-white/80">
          {exerciseName} · Set {setNum}/{sets.length}
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => setAudio((value) => !value)} className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold transition-colors hover:bg-white/25" aria-label={audio ? 'Turn audio off' : 'Turn audio on'}>
            {audio ? '🔊' : '🔇'}
          </button>
          <button onClick={exitForReview} className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors hover:bg-white/25">
            Review &amp; exit
          </button>
        </div>
      </div>

      {mode === 'ready' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-3xl font-black tracking-widest text-white/90">GET READY</p>
          <p className="text-lg font-semibold text-white/70">Set {setNum} · {sets[idx]?.weight ? `${sets[idx]?.weight}kg × ` : ''}{sets[idx]?.goalReps} reps</p>
          <p className="text-[clamp(6rem,28vw,9rem)] font-black leading-none tabular-nums drop-shadow">{readyLeft}</p>
        </div>
      ) : mode === 'set' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
          <p className={`text-7xl leading-none drop-shadow ${view.phase === 'down' ? 'translate-y-1' : view.phase === 'up' ? '-translate-y-1' : ''} transition-transform`}>{view.icon}</p>
          <p className="text-6xl font-black leading-none tracking-tight drop-shadow sm:text-7xl">{view.verb}</p>
          <p className="text-lg font-semibold text-white/80">{view.sub}</p>
          <p className="mt-5 text-[clamp(6rem,25vw,8rem)] font-black leading-none tabular-nums drop-shadow">{view.secondsLeft}</p>
          <p className="mt-3 text-sm font-bold uppercase tracking-[0.25em] text-white/70">Rep {view.rep} / {sets[idx]?.goalReps}</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 overflow-y-auto px-6 py-4 text-center">
          <p className="text-4xl font-black tracking-widest drop-shadow">REST</p>
          <p className="text-[clamp(5.5rem,25vw,8rem)] font-black leading-none tabular-nums drop-shadow">{secondsLeft(restLeft)}</p>
          <p className="text-sm font-semibold uppercase tracking-widest text-white/70">next: set {Math.min(idx + 2, sets.length)}</p>
          <fieldset className="mt-3">
            <legend className="mb-2 text-xs font-bold uppercase tracking-widest text-white/70">Difficulty for set {setNum}</legend>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-label={`Difficulty ${value} of 5`}
                  aria-pressed={currentDifficulty === value}
                  onClick={() => setCurrentDifficulty(value)}
                  className={`grid size-11 place-items-center rounded-full border-2 text-sm font-black transition ${currentDifficulty === value ? 'border-white bg-white text-orange-600' : 'border-white/40 bg-white/10 text-white hover:bg-white/20'}`}
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      <div className="px-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {mode === 'set' && (
          <button onClick={stopSet} className="w-full rounded-2xl bg-white py-5 text-lg font-black text-zinc-900 transition-colors hover:bg-white/90">
            Stop set{restBetweenSets ? ' & rest' : ''}
          </button>
        )}
        {mode === 'rest' && (
          <button onClick={skipRest} className="w-full rounded-2xl bg-white py-5 text-lg font-black text-zinc-900 transition-colors hover:bg-white/90">
            Skip rest
          </button>
        )}
        {mode === 'ready' && (
          <button onClick={skipReady} className="w-full rounded-2xl bg-white py-5 text-lg font-black text-zinc-900 transition-colors hover:bg-white/90">
            Start now
          </button>
        )}
      </div>
    </div>
  )
}
