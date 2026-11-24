# Notificaciones (Resend — pendiente de dominio)

Estado: **infraestructura preparada, envíos desactivados**.

- Catálogo de eventos y plantillas: `src/features/notifications/events.ts`
- `NOTIFICATIONS_ENABLED = false`
- `enqueueNotification` no simula éxito; responde `provider_inactive`

## Eventos listos

| Evento | Destinatario |
| --- | --- |
| `welcome` | Usuario nuevo |
| `registration_submitted` | Entrenador |
| `registration_accepted` | Entrenador |
| `registration_rejected` | Entrenador |
| `registration_needs_correction` | Entrenador |
| `registration_deadline_reminder` | Entrenador |
| `organizer_new_submission` | Organizador |

## Activación (cuando haya dominio)

1. Verificar dominio en Resend.
2. Edge Function `send-notification` con secretos `RESEND_API_KEY` + `EMAIL_FROM`.
3. Disparar desde triggers/RPC o tras mutaciones de estado (servidor).
4. Poner `NOTIFICATIONS_ENABLED = true` solo tras smoke real.

Los correos de Auth (confirmación / recuperación) siguen en Supabase Auth SMTP y son independientes de este catálogo.
Ver plantillas e integración Resend Auth en `docs/auth-emails.md`.
