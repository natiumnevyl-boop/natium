import type { AuditCategory } from './api'

export const ACTION_LABELS: Record<string, string> = {
  delete: 'Eliminación',
  insert: 'Creación',
  update: 'Actualización',
  signup: 'Registro de usuario',
  'rpc:signup': 'Registro de usuario',
  'rpc:ops_qa_cleanup': 'Limpieza de pruebas',
  'rpc:bootstrap_platform_admin_create': 'Creación de administrador',
  'rpc:bootstrap_platform_admin_promote': 'Promoción de administrador',
  'rpc:prepare_export_job': 'Preparación de exportación',
  'rpc:complete_export_job': 'Exportación completada',
  'rpc:claim_export_job': 'Reclamo de exportación',
  'rpc:fail_export_job': 'Exportación fallida',
  'rpc:admin_set_profile_role': 'Cambio de rol',
  'rpc:admin_set_account_status': 'Cambio de estado de cuenta',
  'rpc:admin_suspend_account': 'Suspensión de cuenta',
  'rpc:admin_reactivate_account': 'Reactivación de cuenta',
  'rpc:request_team_access': 'Solicitud de acceso a equipo',
  'rpc:decide_team_access': 'Decisión de acceso a equipo',
  'rpc:revoke_team_access': 'Revocación de acceso a equipo',
}

export const ENTITY_LABELS: Record<string, string> = {
  athletes: 'Atletas',
  teams: 'Equipos',
  organizations: 'Organizaciones',
  competitions: 'Competencias',
  registrations: 'Inscripciones',
  registration_athletes: 'Atletas inscritos',
  registration_entries: 'Pruebas inscritas',
  export_jobs: 'Exportaciones',
  profiles: 'Usuarios',
  auth: 'Autenticación',
  admin: 'Administración',
  team_members: 'Miembros de equipo',
  organization_members: 'Miembros de organización',
  event_catalog: 'Catálogo de pruebas',
}

export const RESULT_LABELS: Record<string, string> = {
  ok: 'Exitoso',
  error: 'Fallido',
}

export const CATEGORY_LABELS: Record<AuditCategory, string> = {
  all: 'Todos los eventos',
  commercial: 'Operación comercial',
  admin: 'Administración',
  security: 'Seguridad',
  maintenance: 'Mantenimiento y pruebas',
  unclassified: 'Sin clasificar',
}

export function actionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action]
  if (action.startsWith('rpc:')) {
    const key = action.slice(4).replace(/_/g, ' ')
    return key.charAt(0).toUpperCase() + key.slice(1)
  }
  return action
}

export function entityLabel(entity: string): string {
  return ENTITY_LABELS[entity] ?? entity
}

export function resultLabel(result: string): string {
  return RESULT_LABELS[result] ?? result
}

export function shortenId(id: string | null | undefined, size = 8): string {
  if (!id) return '—'
  return id.length <= size ? id : `${id.slice(0, size)}…`
}

/** Known maintenance ops that can be summarized without inventing date-based groups. */
export function isQaCleanupAction(action: string): boolean {
  return action === 'rpc:ops_qa_cleanup'
}
