// Pure raw-string-preservation decisions for numeric steppers (WP-18, finding
// L3). Steppers keep the raw typed string in React state and only commit to a
// clamped number on blur or a ▲/▼ bump — never on every keystroke — so typing
// a partial decimal like "2." doesn't get coerced to 0 mid-entry by something
// like `Number(e.target.value) || 0` before the second character lands.

// Should this keystroke be accepted into the raw draft string? Permissive
// enough to allow any prefix of a valid number (including "-", ".", "2.")
// but rejects characters that can never be part of one.
export function isDraftableNumericInput(raw: string): boolean {
  if (raw === '') return true
  return /^-?\d*\.?\d*$/.test(raw) && raw !== '-.'
}

// Convert a raw draft string into a clamped, rounded numeric value — used on
// blur (or on a ▲/▼ bump, which always supplies a well-formed number).
export function commitNumericDraft(
  raw: string,
  { min, max }: { min: number; max: number },
): number {
  const n = Number(raw)
  const value = Number.isFinite(n) ? n : min
  const clamped = Math.min(max, Math.max(min, value))
  return Math.round(clamped * 100) / 100
}
