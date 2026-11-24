/**
 * Product notification events prepared for Resend (or another provider).
 * Delivery is intentionally inactive until a verified sending domain exists.
 * Do not mark these as "sent" without a real provider response.
 */

export const NOTIFICATIONS_ENABLED = false

export type NotificationEvent =
  | 'welcome'
  | 'registration_submitted'
  | 'registration_accepted'
  | 'registration_rejected'
  | 'registration_needs_correction'
  | 'registration_deadline_reminder'
  | 'organizer_new_submission'

export interface NotificationTemplate {
  event: NotificationEvent
  subject: string
  /** Short description of body content; HTML templates live with the Edge Function later. */
  purpose: string
  audience: 'coach' | 'organizer' | 'user'
}

export const NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
  {
    event: 'welcome',
    subject: 'Bienvenido a {{brand}}',
    purpose: 'Confirmación de cuenta creada y siguiente paso según rol.',
    audience: 'user',
  },
  {
    event: 'registration_submitted',
    subject: 'Inscripción enviada · {{folio}}',
    purpose: 'Acuse de recibo al entrenador con folio y competencia.',
    audience: 'coach',
  },
  {
    event: 'registration_accepted',
    subject: 'Inscripción aceptada · {{folio}}',
    purpose: 'Aviso de aceptación al entrenador.',
    audience: 'coach',
  },
  {
    event: 'registration_rejected',
    subject: 'Inscripción rechazada · {{folio}}',
    purpose: 'Aviso de rechazo con motivo al entrenador.',
    audience: 'coach',
  },
  {
    event: 'registration_needs_correction',
    subject: 'Corrección solicitada · {{folio}}',
    purpose: 'Observaciones del organizador y enlace al wizard.',
    audience: 'coach',
  },
  {
    event: 'registration_deadline_reminder',
    subject: 'Cierra pronto · {{competition}}',
    purpose: 'Recordatorio de cierre de inscripción a equipos con borrador.',
    audience: 'coach',
  },
  {
    event: 'organizer_new_submission',
    subject: 'Nueva inscripción · {{folio}}',
    purpose: 'Aviso al organizador de envío pendiente de revisión.',
    audience: 'organizer',
  },
]

/** No-op until Resend + domain are configured. Never pretends success. */
export async function enqueueNotification(
  _event: NotificationEvent,
  _payload: Record<string, unknown>,
): Promise<{ queued: false; reason: 'provider_inactive' }> {
  return { queued: false, reason: 'provider_inactive' }
}
