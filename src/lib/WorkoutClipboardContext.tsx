'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

export type ClipboardEntry = {
  exerciseId: number
  exerciseName: string
  setCount: number
  reps: number | null
  weight: number | null
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
