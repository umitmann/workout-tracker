'use client'

// ADR-0008 (WP-09): a shared 44×44 minimum hit-area wrapper for small icon
// buttons (info/last/best/best60, reorder arrows, quick-add, set-delete ✕).
// The visual icon stays whatever size it already is — only the tappable
// area grows, via padding rather than forcing icon dimensions to change.
// One seam so later packets adding new icon buttons inherit the same
// minimum without re-deriving it.
export default function IconHitTarget({
  onClick,
  title,
  disabled,
  className = '',
  children,
}: {
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  title?: string
  disabled?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`shrink-0 min-w-11 min-h-11 flex items-center justify-center disabled:opacity-20 transition-colors ${className}`}
    >
      {children}
    </button>
  )
}
