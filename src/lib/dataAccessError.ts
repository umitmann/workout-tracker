export type DatabaseErrorLike = {
  message: string
  code?: string | null
  details?: string | null
  hint?: string | null
}

export class DataAccessError extends Error {
  readonly code: string | null
  readonly operation: string

  constructor(operation: string, error: DatabaseErrorLike) {
    const codeSuffix = error.code ? ` (${error.code})` : ''
    super(`${operation} failed${codeSuffix}: ${error.message}`, { cause: error })
    this.name = 'DataAccessError'
    this.code = error.code ?? null
    this.operation = operation
  }
}

export function requireQueryData<T>(
  result: { data: T; error: DatabaseErrorLike | null },
  operation: string,
): T {
  if (result.error) throw new DataAccessError(operation, result.error)
  return result.data
}

export function isNoRowsError(error: DatabaseErrorLike | null | undefined): boolean {
  return error?.code === 'PGRST116'
}

export function isAuthorizationDenied(error: unknown): boolean {
  return error instanceof DataAccessError && error.code === '42501'
}
