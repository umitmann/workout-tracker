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

// ─── Numpad (D2) — pure draft-string transforms for the custom numpad ─────
// The numpad never touches a number directly; every key press produces a new
// raw draft string that flows through the same `isDraftableNumericInput` /
// `commitNumericDraft` pipeline as hardware-keyboard typing (finding L3 —
// never coerce mid-entry). Digits build the string left-to-right; the
// fraction keys (.25/.5/.75, decimal/weight mode only) replace whatever
// fractional part is currently there rather than appending onto it, so
// "60" + [.5] => "60.5" and "60.25" + [.5] => "60.5" (not "60.25.5").

// Append a single digit (0-9) to the draft. A leading "0" is replaced rather
// than accumulated ("0" + "6" => "6", not "06").
export function appendNumpadDigit(draft: string, digit: string): string {
  if (!/^[0-9]$/.test(digit)) return draft
  const next = draft === '0' ? digit : draft + digit
  return isDraftableNumericInput(next) ? next : draft
}

// Apply a fraction shortcut key: keep the integer part typed so far (default
// "0" if nothing was typed yet) and set the fractional part to .25/.5/.75,
// discarding any fractional digits already present.
export function appendNumpadFraction(draft: string, fraction: '25' | '5' | '75'): string {
  const intPart = draft.split('.')[0]
  const whole = intPart === '' || intPart === '-' ? `${intPart}0` : intPart
  return `${whole}.${fraction}`
}

// Delete the last character of the draft (backspace key).
export function deleteNumpadChar(draft: string): string {
  return draft.slice(0, -1)
}
