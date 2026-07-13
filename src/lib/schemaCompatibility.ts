// Pure compatibility classifiers shared by the server DAL and action cores.
// Keeping them outside the server-only DAL lets the failure matrix run in the
// Node unit harness without weakening the DAL's client-import guard.
// Postgres undefined_column = 42703. When a message is present it must name
// the requested column, so independently optional fields cannot mask each
// other's migration state.
export function isMissingColumnError(error: unknown, column: string): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: string; message?: string }
  const message = (candidate.message ?? '').toLowerCase()
  if (message) {
    return message.includes(column.toLowerCase()) && message.includes('does not exist')
  }
  return candidate.code === '42703'
}

// Only missing-function errors permit the legacy compatibility path. A real
// constraint or authorization error inside an existing RPC must fail closed.
export function isMissingFunctionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: string; message?: string }
  if (candidate.code === 'PGRST202' || candidate.code === '42883') return true
  const message = (candidate.message ?? '').toLowerCase()
  return message.includes('function') && message.includes('does not exist')
}
