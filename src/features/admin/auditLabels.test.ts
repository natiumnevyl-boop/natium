import { describe, expect, it } from 'vitest'
import {
  actionLabel,
  entityLabel,
  isQaCleanupAction,
  resultLabel,
  shortenId,
} from './auditLabels'

describe('auditLabels', () => {
  it('translates known actions', () => {
    expect(actionLabel('delete')).toBe('Eliminación')
    expect(actionLabel('insert')).toBe('Creación')
    expect(actionLabel('rpc:ops_qa_cleanup')).toBe('Limpieza de pruebas')
    expect(actionLabel('rpc:bootstrap_platform_admin_create')).toBe(
      'Creación de administrador',
    )
    expect(actionLabel('rpc:prepare_export_job')).toBe('Preparación de exportación')
    expect(actionLabel('rpc:complete_export_job')).toBe('Exportación completada')
  })

  it('translates modules and results', () => {
    expect(entityLabel('athletes')).toBe('Atletas')
    expect(entityLabel('export_jobs')).toBe('Exportaciones')
    expect(resultLabel('ok')).toBe('Exitoso')
    expect(resultLabel('error')).toBe('Fallido')
  })

  it('shortens identifiers and flags QA cleanup', () => {
    expect(shortenId('1234567890abcdef')).toBe('12345678…')
    expect(isQaCleanupAction('rpc:ops_qa_cleanup')).toBe(true)
    expect(isQaCleanupAction('insert')).toBe(false)
  })
})
