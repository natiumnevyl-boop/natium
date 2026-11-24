import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardSkeleton,
  ConfirmDialog,
  PageHeader,
  Select,
} from '@/shared/ui'
import { toast } from '@/shared/ui/Toaster'
import { ErrorState } from '@/shared/ui/StatusPages'
import { toAppError } from '@/lib/errors'
import { fmtDateTime } from '@/shared/utils/dates'
import { roleLabel } from '@/shared/utils/labels'
import type { Enums } from '@/lib/supabase'
import { useState } from 'react'
import {
  useAdminUserDetail,
  useSetAccountStatus,
  useSetProfileRole,
  type AccountStatus,
} from './api'

export function AdminUserDetailPage() {
  const { userId = '' } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const detail = useAdminUserDetail(userId)
  const setRole = useSetProfileRole()
  const setStatus = useSetAccountStatus()
  const [pendingStatus, setPendingStatus] = useState<AccountStatus | null>(null)

  if (detail.isLoading) return <CardSkeleton lines={10} />
  if (detail.isError || !detail.data)
    return (
      <ErrorState
        message={detail.error ? toAppError(detail.error).message : undefined}
        onRetry={() => detail.refetch()}
      />
    )

  const p = detail.data.profile
  const isSelf = p.id === user?.id

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Usuarios', to: '/admin/users' }, { label: p.email }]}
        title={p.full_name || p.email}
        description="Detalle administrativo. No se muestran secretos de autenticación."
        actions={
          !isSelf && (
            <Button
              variant={p.account_status === 'suspended' ? 'secondary' : 'danger'}
              onClick={() =>
                setPendingStatus(p.account_status === 'suspended' ? 'active' : 'suspended')
              }
            >
              {p.account_status === 'suspended' ? 'Reactivar' : 'Suspender'}
            </Button>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader title="Cuenta" />
          <CardBody className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold tracking-wide text-steel-600 uppercase">Correo</p>
              <p className="text-navy">{p.email}</p>
            </div>
            <div>
              <p className="text-xs font-semibold tracking-wide text-steel-600 uppercase">Estado</p>
              <Badge tone={p.account_status === 'suspended' ? 'danger' : 'success'}>
                {p.account_status === 'suspended' ? 'Suspendida' : 'Activa'}
              </Badge>
            </div>
            <div>
              <p className="text-xs font-semibold tracking-wide text-steel-600 uppercase">Registro</p>
              <p className="tnum text-navy">{fmtDateTime(p.created_at)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold tracking-wide text-steel-600 uppercase">
                Último acceso
              </p>
              <p className="tnum text-navy">
                {p.last_sign_in_at ? fmtDateTime(p.last_sign_in_at) : 'Sin registro'}
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="mb-1 text-xs font-semibold tracking-wide text-steel-600 uppercase">
                Rol
              </p>
              {isSelf ? (
                <Badge tone="aqua">{roleLabel[p.role]} (tú)</Badge>
              ) : (
                <Select
                  value={p.role}
                  className="max-w-xs"
                  onChange={(e) =>
                    setRole.mutate(
                      { id: p.id, role: e.target.value as Enums<'app_role'> },
                      {
                        onSuccess: () => toast.success('Rol actualizado'),
                        onError: (er) => toast.error(toAppError(er).message),
                      },
                    )
                  }
                >
                  {(Object.keys(roleLabel) as Enums<'app_role'>[]).map((r) => (
                    <option key={r} value={r}>
                      {roleLabel[r]}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Equipos" />
          <ul className="divide-y divide-ice-200">
            {detail.data.teams.map((t) => (
              <li key={t.id} className="px-5 py-2.5 text-sm">
                <p className="font-semibold text-navy">{t.name}</p>
                <p className="text-xs text-steel-600">
                  {t.role} · {t.status}
                </p>
              </li>
            ))}
            {detail.data.teams.length === 0 && (
              <li className="px-5 py-6 text-center text-sm text-steel-600">Sin equipos.</li>
            )}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Organizaciones" />
          <ul className="divide-y divide-ice-200">
            {detail.data.organizations.map((o) => (
              <li key={o.id} className="px-5 py-2.5 text-sm">
                <p className="font-semibold text-navy">{o.name}</p>
                <p className="text-xs text-steel-600">{o.role}</p>
              </li>
            ))}
            {detail.data.organizations.length === 0 && (
              <li className="px-5 py-6 text-center text-sm text-steel-600">Sin organizaciones.</li>
            )}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Competencias relacionadas" />
          <ul className="divide-y divide-ice-200">
            {detail.data.competitions.map((c) => (
              <li key={c.id} className="px-5 py-2.5 text-sm">
                <p className="font-semibold text-navy">{c.name}</p>
                <p className="text-xs text-steel-600">
                  {c.status} · {c.start_date}
                </p>
              </li>
            ))}
            {detail.data.competitions.length === 0 && (
              <li className="px-5 py-6 text-center text-sm text-steel-600">Sin competencias.</li>
            )}
          </ul>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader
          title="Actividad registrada"
          action={
            <Link to="/admin/audit" className="text-xs font-semibold text-ocean hover:underline">
              Auditoría global
            </Link>
          }
        />
        <ul className="divide-y divide-ice-200">
          {detail.data.recent_actions.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-semibold text-navy">
                  {a.action} · {a.entity}
                </p>
                <p className="tnum text-xs text-steel-600">{a.entity_id?.slice(0, 8)}</p>
              </div>
              <span className="tnum shrink-0 text-xs text-steel-600">
                {fmtDateTime(a.created_at)}
              </span>
            </li>
          ))}
          {detail.data.recent_actions.length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-steel-600">
              Sin acciones auditadas para este usuario.
            </li>
          )}
        </ul>
      </Card>

      <ConfirmDialog
        open={!!pendingStatus}
        onClose={() => setPendingStatus(null)}
        title={pendingStatus === 'suspended' ? 'Suspender cuenta' : 'Reactivar cuenta'}
        confirmLabel={pendingStatus === 'suspended' ? 'Suspender' : 'Reactivar'}
        tone={pendingStatus === 'suspended' ? 'danger' : 'primary'}
        loading={setStatus.isPending}
        message={
          pendingStatus === 'suspended'
            ? `Se bloqueará el acceso de ${p.email}. Quedará registrado en auditoría.`
            : `Se restaurará el acceso de ${p.email}.`
        }
        onConfirm={() => {
          if (!pendingStatus) return
          setStatus.mutate(
            { id: p.id, status: pendingStatus },
            {
              onSuccess: () => {
                toast.success(
                  pendingStatus === 'suspended' ? 'Cuenta suspendida' : 'Cuenta reactivada',
                )
                setPendingStatus(null)
                void detail.refetch()
              },
              onError: (er) => toast.error(toAppError(er).message),
            },
          )
        }}
      />
      <div className="mt-4">
        <Button variant="ghost" onClick={() => navigate('/admin/users')}>
          Volver a usuarios
        </Button>
      </div>
    </>
  )
}
