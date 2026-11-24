import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileOutput } from 'lucide-react'
import {
  Badge,
  DataTable,
  EmptyState,
  PageHeader,
  Pagination,
  Select,
  type Column,
} from '@/shared/ui'
import { ErrorState } from '@/shared/ui/StatusPages'
import { toAppError } from '@/lib/errors'
import { fmtDateTime } from '@/shared/utils/dates'
import { useAdminExports, type AdminExportRow } from './api'

const formatLabel: Record<string, string> = {
  csv_generic: 'CSV',
  mdb_meet_manager: 'MDB Meet Manager',
}

const statusLabel: Record<string, string> = {
  pending: 'Pendiente',
  processing: 'En proceso',
  completed: 'Completada',
  failed: 'Fallida',
}

function statusTone(s: string): 'neutral' | 'info' | 'success' | 'danger' | 'warning' {
  if (s === 'completed') return 'success'
  if (s === 'failed') return 'danger'
  if (s === 'processing') return 'info'
  if (s === 'pending') return 'warning'
  return 'neutral'
}

export function AdminExportsPage() {
  const [params] = useSearchParams()
  const [page, setPage] = useState(1)
  const [format, setFormat] = useState(() => {
    const f = params.get('format')
    return f === 'mdb_meet_manager' || f === 'csv_generic' ? f : ''
  })
  const statusFilter = params.get('status')
  const q = useAdminExports(page, 50, format || undefined)
  const rows = !statusFilter || !q.data?.rows
    ? q.data?.rows
    : q.data.rows.filter((r) => r.status === statusFilter)

  const columns: Column<AdminExportRow>[] = [
    {
      key: 'format',
      header: 'Formato',
      cell: (r) => (
        <span className="font-semibold">{formatLabel[r.format] ?? r.format}</span>
      ),
    },
    {
      key: 'comp',
      header: 'Competencia',
      cell: (r) => <span className="text-sm">{r.competition?.name ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'Estado',
      cell: (r) => (
        <Badge tone={statusTone(r.status)}>{statusLabel[r.status] ?? r.status}</Badge>
      ),
    },
    {
      key: 'created',
      header: 'Solicitud',
      hideOnMobile: true,
      cell: (r) => <span className="tnum text-xs">{fmtDateTime(r.created_at)}</span>,
    },
    {
      key: 'done',
      header: 'Completada',
      hideOnMobile: true,
      cell: (r) => (
        <span className="tnum text-xs">
          {r.completed_at ? fmtDateTime(r.completed_at) : '—'}
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Exportaciones"
        description="Historial operativo de exportaciones CSV y MDB."
        actions={
          <Select
            value={format}
            aria-label="Filtrar formato"
            className="w-48"
            onChange={(e) => {
              setFormat(e.target.value)
              setPage(1)
            }}
          >
            <option value="">Todos los formatos</option>
            <option value="mdb_meet_manager">MDB Meet Manager</option>
            <option value="csv_generic">CSV</option>
          </Select>
        }
      />
      {q.isError && (
        <div className="mb-4">
          <ErrorState message={toAppError(q.error).message} onRetry={() => q.refetch()} />
        </div>
      )}
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={q.isLoading}
        emptyState={
          <EmptyState
            icon={<FileOutput className="size-5" />}
            title="No hay exportaciones disponibles"
            description="Las exportaciones se generan desde el panel del organizador de cada competencia."
          />
        }
      />
      <Pagination page={page} pageSize={50} total={q.data?.total ?? 0} onChange={setPage} />
    </>
  )
}
