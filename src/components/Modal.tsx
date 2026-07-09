'use client'

// Shared overlay primitive (ADR-0008 / WP-08). Every dialog, sheet, and
// confirm prompt in the app renders through this component so dialog
// semantics, focus management, and dismissal rules are decided exactly once.
// The key-cycling/escape/backdrop *decisions* live in modalFocus.ts (pure,
// unit-tested); this component only wires DOM events to those decisions.
//
// Callers keep their own visual markup (backdrop/panel classNames) — this is
// a semantics/focus wrapper, not a redesign. `children` is the panel content
// only; Modal supplies the fixed/backdrop positioning via `backdropClassName`
// and `panelClassName` so every overlay's existing look is preserved as-is.

import { useEffect, useRef, ReactNode } from 'react'
import { isEscapeKey, shouldCloseOnBackdropClick, resolveOpenFocusIndex, computeTabTarget } from '@/lib/modalFocus'
import { pushModal, popModal, isTopmost } from '@/lib/modalStack'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function Modal({
  title,
  onClose,
  children,
  destructive = false,
  backdropClassName,
  panelClassName,
}: {
  /** Accessible name for the dialog (rendered off-screen if not otherwise visible). */
  title: string
  onClose: () => void
  children: ReactNode
  /** ADR-0008: destructive confirms don't close on backdrop click — explicit button only. */
  destructive?: boolean
  backdropClassName?: string
  panelClassName?: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<Element | null>(null)
  // Stacking token (see modalStack.ts): when a dialog opens another dialog on
  // top of it (e.g. exercise info from within the picker sheet), only the
  // topmost one should react to Escape/Tab — otherwise the sheet underneath
  // closes first and swallows the keystroke before the dialog on top sees it.
  const stackTokenRef = useRef<symbol | null>(null)

  function focusables(): HTMLElement[] {
    if (!panelRef.current) return []
    return Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  }

  useEffect(() => {
    const token = pushModal()
    stackTokenRef.current = token
    return () => popModal(token)
  }, [])

  // Focus-in on open + focus restore to trigger on close.
  useEffect(() => {
    triggerRef.current = document.activeElement
    const nodes = focusables()
    const target = resolveOpenFocusIndex({ count: nodes.length, initialIndex: null })
    if (target != null) nodes[target]?.focus()
    else panelRef.current?.focus()

    return () => {
      const trigger = triggerRef.current
      if (trigger instanceof HTMLElement) trigger.focus()
    }
  }, [])

  // Escape closes; Tab/Shift+Tab is trapped inside the panel. Only the
  // topmost dialog acts — a stacked dialog underneath stays silent so it
  // doesn't close itself out from under the one on top of it.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const token = stackTokenRef.current
      if (!token || !isTopmost(token)) return
      if (isEscapeKey(e.key)) {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const nodes = focusables()
      const currentIndex = nodes.indexOf(document.activeElement as HTMLElement)
      const target = computeTabTarget({ count: nodes.length, currentIndex, shiftKey: e.shiftKey })
      if (target == null) return
      e.preventDefault()
      nodes[target]?.focus()
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose])

  function handleBackdropClick() {
    if (shouldCloseOnBackdropClick({ destructive })) onClose()
  }

  return (
    <div className={backdropClassName} onClick={handleBackdropClick}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={panelClassName}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
