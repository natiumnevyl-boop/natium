import { useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { Badge, DataTable, EmptyState, PageHeader, Pagination, type Column } from '@/shared/ui'
import { ErrorState } from '@/shared/ui/StatusPages'
import { toAppError } from '@/lib/errors'
import { fmtDateTime } from '@/shared/utils/dates'
import { registrationStatusLabel, registrationStatusTone } from '@/shared/utils/labels'
import { useAdminRegistrations, type AdminRegistrationRow } from './api'

export function AdminRegistrationsPage() {
  const [page, setPage] = useState(1)
  const q = useAdminRegistrations(page)

  const columns: Column<AdminRegistrationRow>[] = [
    {
      key: 'folio',
      header: 'Folio',
      cell: (r) => (
        <span className="tnum font-semibold">{r.folio ?? '—'}</span>
      ),
    },
    {
      key: 'comp',
      header: 'Competencia',
      cell: (r) => <span className="text-sm">{r.competition?.name ?? '—'}</span>,
    },
    {
      key: 'team',
      header: 'Equipo',
      hideOnMobile: true,
      cell: (r) => <span className="text-xs">{r.team?.name ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'Estado',
      cell: (r) => (
        <Badge tone={registrationStatusTone[r.status]}>{registrationStatusLabel[r.status]}</Badge>
      ),
    },
    {
      key: 'submitted',
      header: 'Envío',
      hideOnMobile: true,
      cell: (r) => (
        <span className="tnum text-xs">
          {r.submitted_at ? fmtDateTime(r.submitted_at) : '—'}
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Inscripciones"
        description="Inscripciones de equipos a competencias en toda la plataforma."
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
            icon={<ClipboardList className="size-5" />}
            title="No hay inscripciones"
            description="Las inscripciones aparecerán cuando los equipos se registren en competencias."
          />
        }
      />
      <Pagination page={page} pageSize={50} total={q.data?.total ?? 0} onChange={setPage} />
    </>
  )
}
