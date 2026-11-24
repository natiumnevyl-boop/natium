import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { Badge, DataTable, EmptyState, PageHeader, Pagination, type Column } from '@/shared/ui'
import { ErrorState } from '@/shared/ui/StatusPages'
import { toAppError } from '@/lib/errors'
import { fmtDateTime } from '@/shared/utils/dates'
import { publicObjectUrl } from '@/shared/media'
import { useAdminOrganizations, type AdminOrgRow } from './api'

export function AdminOrganizationsPage() {
  const [page, setPage] = useState(1)
  const q = useAdminOrganizations(page)

  const columns: Column<AdminOrgRow>[] = [
    {
      key: 'name',
      header: 'Organización',
      cell: (r) => (
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-ice-200 bg-ice">
            {r.logo_path ? (
              <img
                src={publicObjectUrl('org-assets', r.logo_path)}
                alt=""
                className="size-full object-contain p-0.5"
              />
            ) : (
              <Building2 className="size-4 text-steel-600" />
            )}
          </div>
          <div>
            <p className="font-semibold">{r.trade_name || r.name}</p>
            <p className="text-xs text-steel-600">
              {r.trade_name ? r.name + ' · ' : ''}
              {r.slug}
              {r.cover_path ? ' · portada' : ''}
            </p>
          </div>
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
          {r.is_active ? 'Activa' : 'Inactiva'}
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
        title="Organizaciones"
        description="Directorio global de organizaciones registradas en la plataforma."
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
            icon={<Building2 className="size-5" />}
            title="No hay organizaciones registradas"
            description="Cuando un organizador cree su primera organización, aparecerá aquí."
          />
        }
      />
      <Pagination page={page} pageSize={50} total={q.data?.total ?? 0} onChange={setPage} />
    </>
  )
}
