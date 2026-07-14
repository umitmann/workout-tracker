'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { signOut } from '@/app/actions/auth'

export default function AccountMenu({
  userName,
  avatarUrl,
}: {
  userName?: string | null
  avatarUrl?: string | null
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const name = userName?.trim() || 'Account'

  useEffect(() => {
    if (!open) return
    function handlePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-sm transition hover:border-orange-300 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-orange-700 dark:hover:text-white"
      >
        {avatarUrl ? (
          // User-controlled HTTPS avatars are displayed as presentation only.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-full bg-orange-50 text-sm font-black text-orange-800 dark:bg-orange-950 dark:text-orange-200">
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-[calc(100%+0.6rem)] z-50 w-64 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-2 shadow-2xl shadow-zinc-950/15 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div className="border-b border-zinc-100 px-3 py-3 dark:border-zinc-800">
            <p className="truncate text-sm font-black text-zinc-950 dark:text-white">{name}</p>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Personal account</p>
          </div>
          <div className="py-1">
            <Link role="menuitem" href="/account" onClick={() => setOpen(false)} className="flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800">
              My account
            </Link>
            <Link role="menuitem" href="/trainers/apply" onClick={() => setOpen(false)} className="flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800">
              Trainer profile
            </Link>
          </div>
          <form action={signOut} className="border-t border-zinc-100 pt-1 dark:border-zinc-800">
            <button role="menuitem" type="submit" className="min-h-11 w-full rounded-xl px-3 text-left text-sm font-semibold text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40">
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
