// Pure formatting for the Error object Next.js forwards into error.tsx /
// global-error.tsx (WP-13, finding M6). One seam shared by both boundaries
// so neither guesses at what's safe to show.
//
// Next 16 forwards the *original* message for Client Component errors but a
// generic message + `digest` identifier for Server Component errors, to
// avoid leaking implementation details to the client (see
// node_modules/next/dist/docs/.../file-conventions/error.md, "error.message").
// This helper therefore never surfaces the raw `error.message` — it always
// shows one stable, friendly sentence, plus the `digest` (when present) as a
// short reference code a user can quote when reporting the problem.
const FALLBACK = 'Something went wrong loading this page.'

export function formatBoundaryMessage(
  error: (Error & { digest?: string }) | null | undefined,
): string {
  const digest = error && typeof error === 'object' ? error.digest?.trim() : undefined
  return digest ? `${FALLBACK} Reference: ${digest}` : FALLBACK
}
