'use client'

// Custom on-screen numpad for Stepper (D2 / Tile 10b). Opens when the value
// is tapped on a touch device (the OS keyboard is suppressed by the caller
// making the field readOnly) and gives the same digit/delete/fraction key
// set at every weight-entry site because it lives behind the one shared
// Stepper. Renders through the shared Modal primitive so focus-trap,
// Escape-to-close, and stacking semantics are the same as every other
// overlay in the app (ADR-0008).
//
// This component only edits the raw draft string — it never coerces to a
// number itself (finding L3). Digit/fraction/delete key presses call back
// into the pure helpers in numericInput.ts and hand the resulting string to
// `onDraftChange`; committing (clamp + coerce + onChange) happens in the
// caller's existing commitDraft, invoked via `onClose`.

import Modal from '@/components/Modal'
import { appendNumpadDigit, appendNumpadFraction, deleteNumpadChar } from '@/lib/numericInput'

export default function Numpad({
  label,
  draft,
  decimal,
  onDraftChange,
  onClose,
}: {
  label: string
  draft: string
  /** Fraction keys (.25/.5/.75) only render in decimal (weight) mode. */
  decimal: boolean
  onDraftChange: (next: string) => void
  /** Called on Done, backdrop click, or Escape — caller commits the draft. */
  onClose: () => void
}) {
  const key =
    'h-14 rounded-xl text-lg font-black tabular-nums select-none flex items-center justify-center ' +
    'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white ' +
    'hover:bg-orange-500 hover:text-white active:bg-orange-600 transition-colors'
  const fractionKey =
    'h-14 rounded-xl text-sm font-black tabular-nums select-none flex items-center justify-center ' +
    'bg-zinc-100 dark:bg-zinc-800 text-orange-500 ' +
    'hover:bg-orange-500 hover:text-white active:bg-orange-600 transition-colors'

  function pressDigit(d: string) {
    onDraftChange(appendNumpadDigit(draft, d))
  }
  function pressFraction(f: '25' | '5' | '75') {
    onDraftChange(appendNumpadFraction(draft, f))
  }
  function pressDelete() {
    onDraftChange(deleteNumpadChar(draft))
  }

  return (
    <Modal
      title={`Enter ${label}`}
      onClose={onClose}
      backdropClassName="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-[80] px-4 pb-4 sm:pb-0"
      panelClassName="w-full max-w-xs bg-white dark:bg-zinc-900 rounded-2xl p-4 flex flex-col gap-3 shadow-2xl outline-none"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">{label}</span>
        <span className="text-2xl font-black tabular-nums text-zinc-900 dark:text-white">
          {draft === '' ? '0' : draft}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" className={key} onClick={() => pressDigit(d)}>
            {d}
          </button>
        ))}
        {decimal ? (
          <button type="button" className={fractionKey} onClick={() => pressFraction('25')}>
            .25
          </button>
        ) : (
          <span />
        )}
        <button key="0" type="button" className={key} onClick={() => pressDigit('0')}>
          0
        </button>
        {decimal ? (
          <button type="button" className={fractionKey} onClick={() => pressFraction('5')}>
            .5
          </button>
        ) : (
          <span />
        )}
      </div>

      {decimal && (
        <div className="grid grid-cols-3 gap-2">
          <span />
          <button type="button" className={fractionKey} onClick={() => pressFraction('75')}>
            .75
          </button>
          <span />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          aria-label="Delete last digit"
          className={key}
          onClick={pressDelete}
        >
          ⌫
        </button>
        <button
          type="button"
          className="h-14 rounded-xl text-sm font-black uppercase tracking-wide select-none flex items-center justify-center bg-orange-500 hover:bg-orange-600 text-white transition-colors"
          onClick={onClose}
        >
          Done
        </button>
      </div>
    </Modal>
  )
}
