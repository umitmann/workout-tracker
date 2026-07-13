'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

// Tile 4: the clipboard carries the EXACT per-set list — every set's own
// weight/reps, in order — not a flattened `{ setCount, reps, weight }` (which
// could only represent "N identical sets" and silently averaged/collapsed
// anything else, e.g. 60x10 / 60x8 / 50x6 copying as "3 x 60x10").
export type ClipboardSet = {
  weight: number | null
  reps: number | null
}

export type ClipboardSetMode = 'uniform' | 'per_set'

export type ClipboardEntry = {
  exerciseId: number
  exerciseName: string
  // Set rows alone cannot distinguish an explicitly-authored dropset whose
  // rows currently happen to match from a uniform prescription. Keep the
  // author's mode so template -> clipboard -> template is lossless.
  setMode: ClipboardSetMode
  sets: ClipboardSet[]
}

export type WorkoutClipboardData = {
  entries: ClipboardEntry[]
  sourceDate: string
}

type WorkoutClipboardContextValue = {
  clipboard: WorkoutClipboardData | null
  copy: (data: WorkoutClipboardData) => void
  clear: () => void
}

const WorkoutClipboardContext = createContext<WorkoutClipboardContextValue | null>(null)

export function WorkoutClipboardProvider({ children }: { children: ReactNode }) {
  const [clipboard, setClipboard] = useState<WorkoutClipboardData | null>(null)

  return (
    <WorkoutClipboardContext.Provider
      value={{
        clipboard,
        copy: setClipboard,
        clear: () => setClipboard(null),
      }}
    >
      {children}
    </WorkoutClipboardContext.Provider>
  )
}

export function useWorkoutClipboard() {
  const ctx = useContext(WorkoutClipboardContext)
  if (!ctx) throw new Error('useWorkoutClipboard must be used inside WorkoutClipboardProvider')
  return ctx
}
