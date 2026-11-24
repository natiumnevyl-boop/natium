import { describe, expect, it } from 'vitest'
import { AppError, toAppError } from './errors'

describe('toAppError', () => {
  it('hides the row-level security diagnostic', () => {
    const error = toAppError({
      code: '42501',
      message: 'new row violates row-level security policy for table "teams"',
    })
    expect(error).toBeInstanceOf(AppError)
    expect(error.message).toBe('No tienes permisos para realizar esta acción.')
    expect(error.message).not.toContain('row-level security')
  })

  it('keeps a Spanish permission message raised by the database', () => {
    const error = toAppError({ code: '42501', message: 'No perteneces a este equipo' })
    expect(error.message).toBe('No perteneces a este equipo')
  })

  it('hides PostgREST single-row diagnostics', () => {
    const error = toAppError({
      code: 'PGRST116',
      message: 'Cannot coerce the result to a single JSON object',
    })
    expect(error.message).toBe('No se pudo completar la operación. Inténtalo de nuevo.')
  })
})
