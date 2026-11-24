# Super Admin (platform_admin)

## Acceso

- URL panel: https://natium-weld.vercel.app/admin
- Login: https://natium-weld.vercel.app/login
- Recuperación: https://natium-weld.vercel.app/reset-password

El rol `platform_admin` **no** se puede elegir en el registro público (`handle_new_user` solo permite `coach` | `organizer`).

## Crear / promover cuenta (producción)

Requiere service role **solo en tu máquina**, nunca en el repo ni en el frontend:

```bash
SUPABASE_URL="https://ecfglnjybxyubzvfxgqu.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service_role>" \
ADMIN_EMAIL="tu@correo.com" \
ADMIN_FULL_NAME="Tu Nombre" \
node scripts/create-platform-admin.mjs
```

- Si el usuario no existe: crea la cuenta confirmada y muestra una contraseña de un solo uso.
- Si ya existe: solo asigna `platform_admin` + `account_status=active`.
- Después: inicia sesión y cambia la contraseña con recuperación si lo prefieres.

## Seguridad

- Rutas `/admin/*` con `RequireRole(['platform_admin'])` + RLS/`is_platform_admin()` en RPC.
- Suspensión y cambio de rol vía RPC auditados; no puedes suspenderte a ti mismo ni dejar la plataforma sin admin activo.
- `audit_logs` es append-only para clientes.
- Sin `service_role` en el cliente.
