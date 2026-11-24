import { useState } from 'react'
import { Trophy } from 'lucide-react'
import { Badge, DataTable, EmptyState, PageHeader, Pagination, type Column } from '@/shared/ui'
import { ErrorState } from '@/shared/ui/StatusPages'
import { toAppError } from '@/lib/errors'
import { fmtDate } from '@/shared/utils/dates'
import { competitionStatusLabel, competitionStatusTone } from '@/shared/utils/labels'
import { useAdminCompetitions, type AdminCompetitionRow } from './api'

export function AdminCompetitionsPage() {
  const [page, setPage] = useState(1)
  const q = useAdminCompetitions(page)

  const columns: Column<AdminCompetitionRow>[] = [
    {
      key: 'name',
      header: 'Competencia',
      cell: (r) => (
        <div>
          <p className="font-semibold">{r.name}</p>
          <p className="tnum text-xs text-steel-600">{r.code}</p>
        </div>
      ),
    },
    {
      key: 'org',
      header: 'Organización',
      hideOnMobile: true,
      cell: (r) => <span className="text-xs">{r.organization?.name ?? '—'}</span>,
    },
    {
      key: 'dates',
      header: 'Fechas',
      hideOnMobile: true,
      cell: (r) => (
        <span className="tnum text-xs">
          {fmtDate(r.start_date)} – {fmtDate(r.end_date)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      cell: (r) => (
        <Badge tone={competitionStatusTone[r.status]}>{competitionStatusLabel[r.status]}</Badge>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Competencias"
        description="Todas las competencias creadas por organizaciones."
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
            icon={<Trophy className="size-5" />}
            title="Aún no se han creado competencias"
            description="Cuando un organizador publique su primera competencia, la verás aquí."
          />
        }
      />
      <Pagination page={page} pageSize={50} total={q.data?.total ?? 0} onChange={setPage} />
    </>
  )
}
