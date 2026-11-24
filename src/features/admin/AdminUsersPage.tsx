import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  type Column,
} from '@/shared/ui'
import { toast } from '@/shared/ui/Toaster'
import { ErrorState } from '@/shared/ui/StatusPages'
import { toAppError } from '@/lib/errors'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { fmtDateTime } from '@/shared/utils/dates'
import { roleLabel } from '@/shared/utils/labels'
import type { Enums } from '@/lib/supabase'
import {
  useAdminUsers,
  useSetAccountStatus,
  useSetProfileRole,
  type AccountStatus,
  type AdminUserRow,
} from './api'

export function AdminUsersPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<Enums<'app_role'> | ''>('')
  const [status, setStatus] = useState<AccountStatus | ''>('')
  const [page, setPage] = useState(1)
  const [pendingStatus, setPendingStatus] = useState<{
    id: string
    status: AccountStatus
    email: string
  } | null>(null)

  const users = useAdminUsers({
    search: useDebounce(search),
    role,
    status,
    page,
  })
  const setProfileRole = useSetProfileRole()
  const setAccountStatus = useSetAccountStatus()

  const columns: Column<AdminUserRow>[] = [
    {
      key: 'name',
      header: 'Usuario',
      cell: (p) => (
        <div>
          <p className="font-semibold">{p.full_name || '—'}</p>
          <p className="text-xs text-steel-600">{p.email}</p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Rol',
      hideOnMobile: true,
      cell: (p) =>
        p.id === user?.id ? (
          <Badge tone="aqua">{roleLabel[p.role]} (tú)</Badge>
        ) : (
          <Select
            value={p.role}
            aria-label="Rol"
            className="h-8 w-40 text-xs"
            onChange={(e) =>
              setProfileRole.mutate(
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
        ),
    },
    {
      key: 'status',
      header: 'Estado',
      cell: (p) => (
        <Badge tone={p.account_status === 'suspended' ? 'danger' : 'success'}>
          {p.account_status === 'suspended' ? 'Suspendida' : 'Activa'}
        </Badge>
      ),
    },
    {
      key: 'created',
      header: 'Registro',
      hideOnMobile: true,
      cell: (p) => <span className="tnum text-xs">{fmtDateTime(p.created_at)}</span>,
    },
    {
      key: 'last',
      header: 'Último acceso',
      hideOnMobile: true,
      cell: (p) => (
        <span className="tnum text-xs">
          {p.last_sign_in_at ? fmtDateTime(p.last_sign_in_at) : '—'}
        </span>
      ),
    },
    {
      key: 'links',
      header: 'Vínculos',
      hideOnMobile: true,
      cell: (p) => (
        <span className="tnum text-xs text-steel-600">
          {p.teams_count} eq · {p.organizations_count} org
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (p) =>
        p.id === user?.id ? null : (
          <Button
            size="sm"
            variant={p.account_status === 'suspended' ? 'secondary' : 'danger'}
            onClick={(e) => {
              e.stopPropagation()
              setPendingStatus({
                id: p.id,
                email: p.email,
                status: p.account_status === 'suspended' ? 'active' : 'suspended',
              })
            }}
          >
            {p.account_status === 'suspended' ? 'Reactivar' : 'Suspender'}
          </Button>
        ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Directorio global de cuentas: roles, estado y vínculos con equipos u organizaciones."
      />
      {users.isError && (
        <div className="mb-4">
          <ErrorState message={toAppError(users.error).message} onRetry={() => users.refetch()} />
        </div>
      )}
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_160px_160px]">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v)
            setPage(1)
          }}
          placeholder="Buscar por nombre o correo…"
        />
        <Select
          value={role}
          aria-label="Filtrar rol"
          onChange={(e) => {
            setRole(e.target.value as Enums<'app_role'> | '')
            setPage(1)
          }}
        >
          <option value="">Todos los roles</option>
          {(Object.keys(roleLabel) as Enums<'app_role'>[]).map((r) => (
            <option key={r} value={r}>
              {roleLabel[r]}
            </option>
          ))}
        </Select>
        <Select
          value={status}
          aria-label="Filtrar estado"
          onChange={(e) => {
            setStatus(e.target.value as AccountStatus | '')
            setPage(1)
          }}
        >
          <option value="">Todos los estados</option>
          <option value="active">Activas</option>
          <option value="suspended">Suspendidas</option>
        </Select>
      </div>
      <DataTable
        columns={columns}
        rows={users.data?.rows}
        rowKey={(p) => p.id}
        loading={users.isLoading}
        onRowClick={(p) => navigate(`/admin/users/${p.id}`)}
        emptyState={
          <div className="px-5 py-10 text-center text-sm text-steel-600">
            No hay usuarios que coincidan con los filtros.
          </div>
        }
      />
      <Pagination
        page={page}
        pageSize={50}
        total={users.data?.total ?? 0}
        onChange={setPage}
      />
      <ConfirmDialog
        open={!!pendingStatus}
        onClose={() => setPendingStatus(null)}
        title={
          pendingStatus?.status === 'suspended' ? 'Suspender cuenta' : 'Reactivar cuenta'
        }
        confirmLabel={pendingStatus?.status === 'suspended' ? 'Suspender' : 'Reactivar'}
        tone={pendingStatus?.status === 'suspended' ? 'danger' : 'primary'}
        loading={setAccountStatus.isPending}
        message={
          pendingStatus?.status === 'suspended'
            ? `Se bloqueará el acceso de ${pendingStatus.email}. La acción queda auditada.`
            : `Se restaurará el acceso de ${pendingStatus?.email}.`
        }
        onConfirm={() => {
          if (!pendingStatus) return
          setAccountStatus.mutate(
            { id: pendingStatus.id, status: pendingStatus.status },
            {
              onSuccess: () => {
                toast.success(
                  pendingStatus.status === 'suspended'
                    ? 'Cuenta suspendida'
                    : 'Cuenta reactivada',
                )
                setPendingStatus(null)
              },
              onError: (er) => toast.error(toAppError(er).message),
            },
          )
        }}
      />
    </>
  )
}
