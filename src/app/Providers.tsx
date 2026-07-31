'use client'

import { WorkoutClipboardProvider } from '@/lib/WorkoutClipboardContext'
import { ReactNode } from 'react'
import PWARegister from '@/components/PWARegister'
import ActiveWorkoutDock from '@/components/ActiveWorkoutDock'

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <WorkoutClipboardProvider>
      {children}
      <ActiveWorkoutDock />
      <PWARegister />
    </WorkoutClipboardProvider>
  )
}
