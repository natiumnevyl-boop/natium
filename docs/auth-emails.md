# Correos de autenticación NATIUM

Plantillas HTML versionadas para Supabase Auth. Independientes del catálogo de notificaciones de negocio (`docs/notifications.md`).

## Auditoría (estado actual)

| Ítem | Estado |
| --- | --- |
| Dominio de producción de la app | `https://natium-weld.vercel.app` |
| Dominio de correo propio (`noreply@…`) | **Pendiente** — no verificado |
| SMTP personalizado (Resend) | **Pendiente** — Auth usa el remitente por defecto de Supabase hasta configurar SMTP |
| Plantillas custom en proyecto Free | **Bloqueadas** sin SMTP propio ni upgrade: la API responde `entitlement_required` (`auth.email_templates`) |
| Confirmación de cuenta / recuperación | Flujos activos en la app (`RegisterPage`, `ResetPasswordPage` → `/update-password`) |
| Magic link / invitación / reauth | Plantillas listas; **no** se habilitan métodos nuevos solo por tener HTML |
| Logo en correos | `https://natium-weld.vercel.app/email/natium-mark.png` |

## Archivos

| Plantilla Supabase | Archivo | Asunto |
| --- | --- | --- |
| confirmation | `supabase/templates/confirm-signup.html` | Bienvenido a NATIUM \| Confirma tu cuenta |
| recovery | `supabase/templates/reset-password.html` | NATIUM \| Restablece tu contraseña |
| invite | `supabase/templates/invite-user.html` | NATIUM \| Has sido invitado |
| email_change | `supabase/templates/change-email.html` | NATIUM \| Confirma tu nuevo correo |
| magic_link | `supabase/templates/magic-link.html` | NATIUM \| Tu enlace de acceso |
| reauthentication | `supabase/templates/reauthentication.html` | NATIUM \| Código de verificación |

Asuntos también en `supabase/templates/subjects.json`.

Variables oficiales conservadas: `{{ .ConfirmationURL }}`, `{{ .SiteURL }}`, `{{ .Token }}` (reauth). No sustituir por URLs estáticas.

## Identidad

- Colores: navy `#081826`, ocean `#173D55`, aqua `#43C9E8`, ice `#EEF6FA`, steel `#6F8A9C` / `#97ADBD`
- Contenedor 600 px, tablas + CSS inline, textos en español
- Tipografía: Manrope con fallback Segoe UI / Roboto / Helvetica / Arial

## Local

`supabase/config.toml` apunta `content_path` a estos HTML. Tras `supabase start` / `supabase stop && supabase start`, los correos aparecen en Mailpit (`http://127.0.0.1:54324`).

**Subir a GitHub o desplegar Vercel no actualiza solo las plantillas de Auth en el proyecto hosted.** Hay que sincronizarlas.

## Producción — sincronizar plantillas

**Prerrequisito (proyecto Free):** configurar SMTP personalizado (Resend) **o** subir de plan. Sin eso, Dashboard y Management API rechazan el cambio:

`Email template modification is not available for free tier projects using the default email provider.`

Orden recomendado: 1) dominio + Resend SMTP → 2) sincronizar plantillas → 3) prueba real de registro.

### Opción A — Dashboard

1. Configurar SMTP (sección Resend abajo) si el proyecto es Free
2. Supabase → Authentication → Email Templates
3. Para cada plantilla, pegar el HTML del repo y el asunto de `subjects.json`
4. Authentication → URL Configuration:
   - Site URL: `https://natium-weld.vercel.app`
   - Redirect URLs: incluir `https://natium-weld.vercel.app/**` y `/update-password`
5. Guardar y enviar un correo de prueba

### Opción B — Management API

Con un access token de Supabase CLI (`supabase login`) y SMTP ya activo (o plan con entitlement), `PATCH /v1/projects/<ref>/config/auth` con:

- `mailer_subjects_confirmation` / `mailer_templates_confirmation_content`
- `mailer_subjects_recovery` / `mailer_templates_recovery_content`
- `mailer_subjects_invite` / `mailer_templates_invite_content`
- `mailer_subjects_email_change` / `mailer_templates_email_change_content`
- `mailer_subjects_magic_link` / `mailer_templates_magic_link_content`
- `mailer_subjects_reauthentication` / `mailer_templates_reauthentication_content`

Script de apoyo (no imprime secretos):

```bash
./scripts/sync-auth-email-templates.sh
```

## Resend SMTP (pendiente de dominio)

Remitente objetivo:

- Nombre: `NATIUM`
- Correo: `noreply@DOMINIO_OFICIAL_NATIUM` (solo tras verificar propiedad DNS)

En Supabase → Project Settings → Authentication → SMTP:

| Campo | Valor |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `465` (SSL) o `587` (STARTTLS) |
| Username | `resend` |
| Password | API key de Resend (secreto de servidor) |
| Sender email | `noreply@<dominio>` |
| Sender name | `NATIUM` |

DNS en el dominio oficial:

1. Verificar dominio en Resend
2. SPF / DKIM (registros que indique Resend)
3. DMARC (`v=DMARC1; p=none; …` inicialmente)
4. Desactivar click tracking de Resend en enlaces de Auth (los `{{ .ConfirmationURL }}` no deben reescribirse)

Secretos solo en Supabase / Resend. Nunca `VITE_*` ni GitHub.

### Qué debe proporcionar el propietario

1. Dominio oficial verificado (ej. `natium.mx`)
2. Acceso DNS para SPF/DKIM/DMARC
3. API key de Resend (o invitación al equipo)
4. Confirmación de `noreply@dominio` como remitente

Hasta entonces Auth seguirá con el remitente por defecto de Supabase; las plantillas HTML personalizadas sí aplican.

## Pruebas

1. Registro → correo de confirmación → botón activa cuenta → login
2. Recuperación → `/update-password` → nueva contraseña
3. Enlace expirado / reutilizado → mensaje de error de Auth, sin bypass
4. Revisar Gmail escritorio y móvil
5. Eliminar usuario de prueba de forma segura (Auth + `profiles`)
