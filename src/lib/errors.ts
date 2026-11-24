import type { PostgrestError } from '@supabase/supabase-js'

export class AppError extends Error {
  code: string
  detail?: unknown
  constructor(message: string, code = 'unknown', detail?: unknown) {
    super(message)
    this.code = code
    this.detail = detail
  }
}

/** Map Supabase/Postgres errors to user-facing Spanish messages. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error
  const e = error as Partial<PostgrestError> & { message?: string; status?: number }
  const code = e?.code ?? 'unknown'
  switch (code) {
    case '42501':
      return new AppError(
        isTechnicalMessage(e.message)
          ? 'No tienes permisos para realizar esta acción.'
          : (e.message ?? 'No tienes permisos para realizar esta acción.'),
        'forbidden',
      )
    case '23505':
      return new AppError('Ya existe un registro con estos datos.', 'duplicate', e.details)
    case '23503':
      return new AppError(
        'La operación hace referencia a datos inexistentes.',
        'reference',
        e.details,
      )
    case '23514':
    case 'check_violation':
      return new AppError(
        e.message && !isTechnicalMessage(e.message)
          ? e.message
          : 'Los datos no cumplen las reglas de validación.',
        'validation',
        e.details,
      )
    case 'P0002':
      return new AppError(e.message ?? 'Registro no encontrado.', 'not_found')
    case 'PGRST301':
      return new AppError('Tu sesión ha expirado. Inicia sesión nuevamente.', 'session_expired')
  }
  if (e?.message?.includes('Failed to fetch')) {
    return new AppError('No se pudo conectar con el servidor. Revisa tu conexión.', 'network')
  }
  if (code === 'PGRST116' || isTechnicalMessage(e?.message)) {
    return new AppError('No se pudo completar la operación. Inténtalo de nuevo.', 'unexpected')
  }
  return new AppError(e?.message ?? 'Ocurrió un error inesperado.', code, e?.details)
}

/** Postgres and PostgREST diagnostics are not shown in the interface. */
function isTechnicalMessage(message: string | undefined): boolean {
  if (!message) return false
  return /row-level security|permission denied|duplicate key|violates |JWT|coerce the result|syntax error|PGRST\d|column |relation |invalid input value for enum|PL\/pgSQL|SQLSTATE/i.test(
    message,
  )
}

/** Unwrap a Supabase response, throwing an AppError on failure. */
export function unwrap<R extends { data: unknown; error: unknown }>(
  res: R,
): NonNullable<R['data']> {
  if (res.error) throw toAppError(res.error)
  return res.data as NonNullable<R['data']>
}
