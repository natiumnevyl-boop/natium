import { useState } from 'react'
import { Badge, DataTable, PageHeader, Pagination, Select, type Column } from '@/shared/ui'
import { ErrorState } from '@/shared/ui/StatusPages'
import { toAppError } from '@/lib/errors'
import { fmtDateTime } from '@/shared/utils/dates'
import { useAuditLogs } from './api'

type Row = NonNullable<ReturnType<typeof useAuditLogs>['data']>['rows'][number]

const ENTITIES = [
  'profiles',
  'teams',
  'athletes',
  'organizations',
  'competitions',
  'registrations',
  'export_jobs',
  'team_members',
]

function metaResult(meta: unknown) {
  if (!meta || typeof meta !== 'object') return '—'
  const m = meta as Record<string, unknown>
  return typeof m.result === 'string' ? m.result : 'ok'
}

function metaModule(meta: unknown, entity: string) {
  if (!meta || typeof meta !== 'object') return entity
  const m = meta as Record<string, unknown>
  return typeof m.module === 'string' ? m.module : entity
}

export function AdminAuditPage() {
  const [entity, setEntity] = useState('')
  const [page, setPage] = useState(1)
  const logs = useAuditLogs(entity, page)
  const columns: Column<Row>[] = [
    {
      key: 'when',
      header: 'Fecha',
      cell: (r) => <span className="tnum text-xs">{fmtDateTime(r.created_at)}</span>,
    },
    {
      key: 'actor',
      header: 'Actor',
      hideOnMobile: true,
      cell: (r) => {
        const a = r.actor as { full_name: string; email: string } | null
        return a ? (
          <span title={a.email}>{a.full_name || a.email}</span>
        ) : (
          <span className="text-steel-600">sistema</span>
        )
      },
    },
    {
      key: 'action',
      header: 'Acción',
      cell: (r) => (
        <Badge
          tone={
            r.action.includes('suspend') || r.action === 'delete'
              ? 'danger'
              : r.action.startsWith('rpc')
                ? 'aqua'
                : r.action === 'update'
                  ? 'info'
                  : 'success'
          }
        >
          {r.action}
        </Badge>
      ),
    },
    {
      key: 'module',
      header: 'Módulo',
      hideOnMobile: true,
      cell: (r) => (
        <span className="text-xs font-semibold text-navy">
          {metaModule(r.metadata, r.entity)}
        </span>
      ),
    },
    {
      key: 'entity',
      header: 'Registro',
      cell: (r) => (
        <span className="tnum text-xs">
          {r.entity}
          {r.entity_id ? ` · ${r.entity_id.slice(0, 8)}` : ''}
        </span>
      ),
    },
    {
      key: 'result',
      header: 'Resultado',
      align: 'right',
      cell: (r) => <span className="text-xs text-steel-600">{metaResult(r.metadata)}</span>,
    },
  ]

  return (
    <>
      <PageHeader
        title="Auditoría"
        description="Historial de operaciones administrativas y operativas de la plataforma."
      />
      {logs.isError && (
        <div className="mb-4">
          <ErrorState message={toAppError(logs.error).message} onRetry={() => logs.refetch()} />
        </div>
      )}
      <Select
        value={entity}
        onChange={(e) => {
          setEntity(e.target.value)
          setPage(1)
        }}
        aria-label="Entidad"
        className="mb-4 max-w-xs"
      >
        <option value="">Todas las entidades</option>
        {ENTITIES.map((e) => (
          <option key={e} value={e}>
            {e}
          </option>
        ))}
      </Select>
      <DataTable
        columns={columns}
        rows={logs.data?.rows}
        rowKey={(r) => String(r.id)}
        loading={logs.isLoading}
        dense
      />
      <Pagination page={page} pageSize={50} total={logs.data?.total ?? 0} onChange={setPage} />
    </>
  )
}
