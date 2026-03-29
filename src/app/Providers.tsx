'use client'

import { WorkoutClipboardProvider } from '@/lib/WorkoutClipboardContext'
import { ReactNode } from 'react'

export default function Providers({ children }: { children: ReactNode }) {
  return <WorkoutClipboardProvider>{children}</WorkoutClipboardProvider>
}
