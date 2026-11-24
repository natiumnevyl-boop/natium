import { useState } from 'react'
import { Users } from 'lucide-react'
import { Badge, DataTable, EmptyState, PageHeader, Pagination, type Column } from '@/shared/ui'
import { ErrorState } from '@/shared/ui/StatusPages'
import { toAppError } from '@/lib/errors'
import { fmtDateTime } from '@/shared/utils/dates'
import { useAdminTeams, type AdminTeamRow } from './api'

export function AdminTeamsPage() {
  const [page, setPage] = useState(1)
  const q = useAdminTeams(page)

  const columns: Column<AdminTeamRow>[] = [
    {
      key: 'name',
      header: 'Equipo',
      cell: (r) => (
        <div>
          <p className="font-semibold">{r.name}</p>
          <p className="text-xs text-steel-600">{r.short_name}</p>
        </div>
      ),
    },
    {
      key: 'loc',
      header: 'Ubicación',
      hideOnMobile: true,
      cell: (r) => (
        <span className="text-xs text-steel-600">
          {[r.city, r.state].filter(Boolean).join(', ') || '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      cell: (r) => (
        <Badge tone={r.is_active ? 'success' : 'neutral'}>
          {r.is_active ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
    {
      key: 'created',
      header: 'Alta',
      hideOnMobile: true,
      cell: (r) => <span className="tnum text-xs">{fmtDateTime(r.created_at)}</span>,
    },
  ]

  return (
    <>
      <PageHeader
        title="Equipos"
        description="Todos los equipos creados por entrenadores en la plataforma."
      />
      {q.isError && (
        <div className="mb-4">
          <ErrorState message={toAppError(q.error).message} onRetry={() => q.refetch()} />
        </div>
      )}
      <DataTable
        columns={columns}
        rows={q.data?.rows}
        rowKey={(r) => r.id}
        loading={q.isLoading}
        emptyState={
          <EmptyState
            icon={<Users className="size-5" />}
            title="Todavía no hay equipos"
            description="Los equipos aparecerán cuando los entrenadores comiencen a registrarse."
          />
        }
      />
      <Pagination page={page} pageSize={50} total={q.data?.total ?? 0} onChange={setPage} />
    </>
  )
}
