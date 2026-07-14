'use client'

import Link from 'next/link'
import { useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from 'react'
import { deleteTemplate } from '@/app/actions/templates'
import { startWorkoutFromTemplate } from '@/app/actions/workouts'
import Modal from '@/components/Modal'
import { localDateStr } from '@/lib/localDate'
import { resolveTemplateSwipe } from '@/lib/templateSwipe'

type TemplateListItem = {
  id: string
  name: string
  routine_exercises: unknown[]
}

type GestureStart = {
  pointerId: number
  x: number
  y: number
}

const MAX_DRAG_OFFSET = 104

function TemplateSwipeCard({
  template,
  disabled,
  onDeleteRequest,
  onStart,
}: {
  template: TemplateListItem
  disabled: boolean
  onDeleteRequest: (template: TemplateListItem) => void
  onStart: (template: TemplateListItem) => void
}) {
  const gestureStart = useRef<GestureStart | null>(null)
  const suppressClicksUntil = useRef(0)
  const [dragOffset, setDragOffset] = useState(0)
  const [actionsOpen, setActionsOpen] = useState(false)

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (disabled || (event.pointerType === 'mouse' && event.button !== 0)) return
    gestureStart.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = gestureStart.current
    if (!start || start.pointerId !== event.pointerId) return

    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y
    if (Math.abs(deltaY) >= Math.abs(deltaX)) {
      setDragOffset(0)
      return
    }

    event.preventDefault()
    if (Math.abs(deltaX) > 4 && !event.currentTarget.hasPointerCapture(event.pointerId)) {
      // Capture only after a drag starts. Capturing on pointer-down would
      // retarget an ordinary tap away from the nested link/button.
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    setDragOffset(Math.max(-MAX_DRAG_OFFSET, Math.min(MAX_DRAG_OFFSET, deltaX)))
  }

  function finishGesture(event: ReactPointerEvent<HTMLDivElement>, cancelled = false) {
    const start = gestureStart.current
    if (!start || start.pointerId !== event.pointerId) return

    gestureStart.current = null
    setDragOffset(0)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (cancelled) return

    const action = resolveTemplateSwipe({
      deltaX: event.clientX - start.x,
      deltaY: event.clientY - start.y,
    })
    if (!action) return

    // Suppress the compatibility click some touch browsers emit after a
    // swipe; otherwise the underlying edit link could open after the action.
    suppressClicksUntil.current = Date.now() + 500
    setActionsOpen(false)
    if (action === 'delete') onDeleteRequest(template)
    else onStart(template)
  }

  return (
    <li
      data-testid={`template-card-${template.id}`}
      className="relative min-w-0 overflow-hidden rounded-[1.4rem] border border-zinc-200 bg-zinc-100 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div aria-hidden="true" className="absolute inset-0 flex items-center justify-between text-xs font-black uppercase tracking-[0.14em]">
        <span className="flex h-full w-28 items-center bg-red-600 pl-5 text-white">Delete</span>
        <span className="flex h-full w-28 items-center justify-end bg-orange-600 pr-5 text-white">Start now</span>
      </div>

      <div
        data-template-swipe-surface
        className={`relative bg-white dark:bg-zinc-900 ${dragOffset === 0 ? 'transition-transform duration-200' : ''}`}
        style={{ transform: `translateX(${dragOffset}px)`, touchAction: 'pan-y' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishGesture(event)}
        onPointerCancel={(event) => finishGesture(event, true)}
        onClickCapture={(event) => {
          if (Date.now() > suppressClicksUntil.current) return
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        <div className="flex min-h-24 items-stretch gap-2 p-2">
          <Link
            href={`/workouts/${template.id}`}
            className="flex min-w-0 flex-1 flex-col justify-center rounded-xl px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          >
            <span className="truncate text-base font-black text-zinc-950 dark:text-white">{template.name}</span>
            <span className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {template.routine_exercises.length} exercise{template.routine_exercises.length === 1 ? '' : 's'}
            </span>
          </Link>

          <div className="flex items-center">
            <button
              type="button"
              aria-label={`Actions for ${template.name}`}
              aria-expanded={actionsOpen}
              aria-controls={`template-actions-${template.id}`}
              onClick={() => setActionsOpen((open) => !open)}
              disabled={disabled}
              className="grid min-h-11 min-w-11 place-items-center rounded-xl text-xl font-bold text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-white"
            >
              <span aria-hidden="true">•••</span>
            </button>
          </div>
        </div>
        {actionsOpen && (
          <div
            id={`template-actions-${template.id}`}
            aria-label={`Actions for ${template.name}`}
            className="grid grid-cols-2 gap-2 border-t border-zinc-100 p-2 dark:border-zinc-800"
          >
            <button
              type="button"
              onClick={() => {
                setActionsOpen(false)
                onStart(template)
              }}
              className="min-h-11 rounded-lg px-3 text-sm font-bold text-zinc-800 hover:bg-orange-50 hover:text-orange-700 dark:text-zinc-100 dark:hover:bg-orange-950"
            >
              Start now
            </button>
            <button
              type="button"
              onClick={() => {
                setActionsOpen(false)
                onDeleteRequest(template)
              }}
              className="min-h-11 rounded-lg px-3 text-sm font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
            >
              Delete…
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

export default function TemplateSwipeList({ templates }: { templates: TemplateListItem[] }) {
  const [pendingDelete, setPendingDelete] = useState<TemplateListItem | null>(null)
  const [isPending, startTransition] = useTransition()

  function startTemplate(template: TemplateListItem) {
    if (isPending) return
    startTransition(async () => {
      await startWorkoutFromTemplate(template.id, localDateStr())
    })
  }

  function confirmDelete() {
    if (!pendingDelete || isPending) return
    startTransition(async () => {
      await deleteTemplate(pendingDelete.id)
    })
  }

  return (
    <>
      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400" aria-label="Template swipe instructions">
        <span><span aria-hidden="true">→</span> Swipe right to delete</span>
        <span><span aria-hidden="true">←</span> Swipe left to start</span>
      </div>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {templates.map((template) => (
          <TemplateSwipeCard
            key={template.id}
            template={template}
            disabled={isPending}
            onDeleteRequest={setPendingDelete}
            onStart={startTemplate}
          />
        ))}
      </ul>

      {pendingDelete && (
        <Modal
          title={`Delete ${pendingDelete.name}`}
          destructive
          initialFocusIndex={0}
          onClose={() => {
            if (!isPending) setPendingDelete(null)
          }}
          backdropClassName="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4"
          panelClassName="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-red-600">Confirm deletion</p>
          <h3 className="mt-2 text-lg font-black text-zinc-950 dark:text-white">Delete {pendingDelete.name}?</h3>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            This permanently removes the template. Existing workout history is kept. This cannot be undone.
          </p>
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              disabled={isPending}
              className="min-h-12 flex-1 rounded-xl border border-zinc-300 px-4 text-sm font-bold text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={isPending}
              className="min-h-12 flex-1 rounded-xl bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isPending ? 'Deleting…' : 'Delete template permanently'}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
