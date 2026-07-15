'use client'

import { WorkoutClipboardProvider } from '@/lib/WorkoutClipboardContext'
import { ReactNode } from 'react'
import PWARegister from '@/components/PWARegister'

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <WorkoutClipboardProvider>
      {children}
      <PWARegister />
    </WorkoutClipboardProvider>
  )
}
