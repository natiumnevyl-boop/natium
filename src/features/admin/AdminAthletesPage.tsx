import { useState } from 'react'
import { UserRound } from 'lucide-react'
import { Badge, DataTable, EmptyState, PageHeader, Pagination, type Column } from '@/shared/ui'
import { ErrorState } from '@/shared/ui/StatusPages'
import { toAppError } from '@/lib/errors'
import { fmtDate } from '@/shared/utils/dates'
import { sexShort } from '@/shared/utils/labels'
import { useAdminAthletes, type AdminAthleteRow } from './api'

export function AdminAthletesPage() {
  const [page, setPage] = useState(1)
  const q = useAdminAthletes(page)

  const columns: Column<AdminAthleteRow>[] = [
    {
      key: 'name',
      header: 'Atleta',
      cell: (r) => (
        <div>
          <p className="font-semibold">
            {r.last_name}, {r.first_name}
          </p>
          <p className="tnum text-xs text-steel-600">{r.display_id}</p>
        </div>
      ),
    },
    {
      key: 'team',
      header: 'Equipo',
      hideOnMobile: true,
      cell: (r) => <span className="text-xs">{r.team?.name ?? '—'}</span>,
    },
    {
      key: 'sex',
      header: 'Sexo',
      cell: (r) => <span className="text-xs font-semibold">{sexShort[r.sex]}</span>,
    },
    {
      key: 'birth',
      header: 'Nacimiento',
      hideOnMobile: true,
      cell: (r) => <span className="tnum text-xs">{fmtDate(r.birth_date)}</span>,
    },
    {
      key: 'status',
      header: 'Estado',
      cell: (r) => (
        <Badge tone={r.status === 'active' ? 'success' : 'neutral'}>
          {r.status === 'active' ? 'Activo' : 'Archivado'}
        </Badge>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Atletas"
        description="Registro global de atletas en la plataforma."
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
            icon={<UserRound className="size-5" />}
            title="Aún no hay atletas registrados"
            description="Los atletas se crean desde los equipos de cada entrenador."
          />
        }
      />
      <Pagination page={page} pageSize={50} total={q.data?.total ?? 0} onChange={setPage} />
    </>
  )
}
