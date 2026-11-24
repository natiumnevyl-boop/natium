import { useState } from 'react'
import { ChevronDown, ChevronRight, ScrollText } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  Field,
  Input,
  PageHeader,
  Select,
  StatCard,
  type Column,
} from '@/shared/ui'
import { Alert } from '@/shared/ui/Alert'
import { Modal } from '@/shared/ui/Modal'
import { toAppError } from '@/lib/errors'
import { fmtDateTime } from '@/shared/utils/dates'
import { useDebounce } from '@/shared/hooks/useDebounce'
import {
  useAuditLogs,
  useAuditStats,
  type AdminAuditRow,
  type AuditCategory,
} from './api'
import {
  actionLabel,
  CATEGORY_LABELS,
  entityLabel,
  isQaCleanupAction,
  resultLabel,
  shortenId,
} from './auditLabels'

const ENTITY_OPTIONS = [
  'profiles',
  'teams',
  'athletes',
  'organizations',
  'competitions',
  'registrations',
  'export_jobs',
  'team_members',
  'auth',
  'admin',
]

const CATEGORIES: AuditCategory[] = [
  'all',
  'commercial',
  'admin',
  'security',
  'maintenance',
  'unclassified',
]

function resultTone(result: string): 'success' | 'danger' | 'neutral' {
  if (result === 'ok') return 'success'
  if (result === 'error') return 'danger'
  return 'neutral'
}

function sanitizeMeta(meta: Record<string, unknown> | null) {
  if (!meta) return null
  const blocked = /password|token|secret|authorization|apikey|service_role/i
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(meta)) {
    if (blocked.test(k)) continue
    out[k] = v
  }
  return out
}

export function AdminAuditPage() {
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [actorId, setActorId] = useState('')
  const [action, setAction] = useState('')
  const [entity, setEntity] = useState('')
  const [result, setResult] = useState('')
  const [category, setCategory] = useState<AuditCategory>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)
  const [selected, setSelected] = useState<AdminAuditRow | null>(null)
  const [expandedCleanup, setExpandedCleanup] = useState<Record<number, boolean>>({})

  const debouncedSearch = useDebounce(search, 300)
  const filters = {
    search: debouncedSearch,
    from,
    to,
    actorId,
    action,
    entity,
    result,
    category,
    page,
    pageSize,
  }
  const logs = useAuditLogs(filters)
  const stats = useAuditStats({ from, to, category })

  const clearFilters = () => {
    setSearch('')
    setFrom('')
    setTo('')
    setActorId('')
    setAction('')
    setEntity('')
    setResult('')
    setCategory('all')
    setPage(1)
  }

  const rows = logs.data?.rows ?? []
  const total = logs.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / pageSize))

  const columns: Column<AdminAuditRow>[] = [
    {
      key: 'when',
      header: 'Fecha y hora',
      cell: (r) => <span className="tnum text-xs text-steel-800">{fmtDateTime(r.created_at)}</span>,
    },
    {
      key: 'actor',
      header: 'Responsable',
      hideOnMobile: true,
      cell: (r) =>
        r.actor_name || r.actor_email ? (
          <span className="text-sm" title={r.actor_email ?? undefined}>
            {r.actor_name || r.actor_email}
          </span>
        ) : (
          <span className="text-sm text-steel-600">sistema</span>
        ),
    },
    {
      key: 'action',
      header: 'Acción',
      cell: (r) => (
        <div className="flex flex-col gap-0.5">
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
            {actionLabel(r.action)}
          </Badge>
          {isQaCleanupAction(r.action) && (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-ocean"
              onClick={(e) => {
                e.stopPropagation()
                setExpandedCleanup((m) => ({ ...m, [r.id]: !m[r.id] }))
                setSelected(r)
              }}
            >
              {expandedCleanup[r.id] ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
              Resumen de limpieza QA
            </button>
          )}
        </div>
      ),
    },
    {
      key: 'module',
      header: 'Módulo',
      hideOnMobile: true,
      cell: (r) => (
        <span className="text-xs font-semibold text-navy">{entityLabel(r.entity)}</span>
      ),
    },
    {
      key: 'record',
      header: 'Registro afectado',
      cell: (r) => (
        <span className="tnum text-xs text-steel-800" title={r.entity_id ?? undefined}>
          {entityLabel(r.entity)}
          {r.entity_id ? ` · ${shortenId(r.entity_id)}` : ''}
        </span>
      ),
    },
    {
      key: 'result',
      header: 'Resultado',
      cell: (r) => <Badge tone={resultTone(r.result)}>{resultLabel(r.result)}</Badge>,
    },
    {
      key: 'detail',
      header: 'Detalle',
      align: 'right',
      cell: (r) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation()
            setSelected(r)
          }}
        >
          Ver
        </Button>
      ),
    },
  ]

  const meta = sanitizeMeta(selected?.metadata ?? null)

  return (
    <>
      <PageHeader
        title="Auditoría"
        description="Historial de actividad y seguridad de NATIUM."
      />

      <div className="mb-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Eventos registrados"
          value={stats.data?.total}
          icon={<ScrollText className="size-4" />}
          loading={stats.isLoading}
        />
        <StatCard
          label="Operaciones exitosas"
          value={stats.data?.ok}
          loading={stats.isLoading}
        />
        <StatCard
          label="Operaciones fallidas"
          value={stats.data?.error}
          tone="warning"
          loading={stats.isLoading}
        />
        <StatCard
          label="Eventos administrativos"
          value={stats.data?.admin}
          loading={stats.isLoading}
        />
      </div>

      {(logs.isError || stats.isError) && (
        <Alert tone="danger" className="mb-3" title="Error de consulta">
          {toAppError(logs.error ?? stats.error).message}
        </Alert>
      )}

      <Card className="mb-4">
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <Field label="Buscar" className="sm:col-span-2">
            {(p) => (
              <Input
                {...p}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="Usuario, acción o identificador…"
              />
            )}
          </Field>
          <Field label="Desde">
            {(p) => (
              <Input
                {...p}
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value)
                  setPage(1)
                }}
              />
            )}
          </Field>
          <Field label="Hasta">
            {(p) => (
              <Input
                {...p}
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value)
                  setPage(1)
                }}
              />
            )}
          </Field>
          <Field label="Tipo de acción">
            {(p) => (
              <Select
                {...p}
                value={action}
                onChange={(e) => {
                  setAction(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">Todas</option>
                {Object.entries(
                  Object.fromEntries(
                    [
                      'insert',
                      'update',
                      'delete',
                      'signup',
                      'rpc:ops_qa_cleanup',
                      'rpc:bootstrap_platform_admin_create',
                      'rpc:prepare_export_job',
                      'rpc:complete_export_job',
                      'rpc:admin_set_profile_role',
                      'rpc:admin_set_account_status',
                    ].map((a) => [a, actionLabel(a)]),
                  ),
                ).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Módulo">
            {(p) => (
              <Select
                {...p}
                value={entity}
                onChange={(e) => {
                  setEntity(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">Todos</option>
                {ENTITY_OPTIONS.map((e) => (
                  <option key={e} value={e}>
                    {entityLabel(e)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Resultado">
            {(p) => (
              <Select
                {...p}
                value={result}
                onChange={(e) => {
                  setResult(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">Todos</option>
                <option value="ok">Exitoso</option>
                <option value="error">Fallido</option>
              </Select>
            )}
          </Field>
          <Field label="Responsable (UUID)" className="sm:col-span-2">
            {(p) => (
              <Input
                {...p}
                value={actorId}
                onChange={(e) => {
                  setActorId(e.target.value.trim())
                  setPage(1)
                }}
                placeholder="Opcional"
                className="tnum"
              />
            )}
          </Field>
          <div className="flex items-end sm:col-span-2 lg:col-span-2">
            <Button type="button" variant="secondary" size="sm" onClick={clearFilters}>
              Limpiar filtros
            </Button>
          </div>
        </CardBody>
      </Card>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              setCategory(c)
              setPage(1)
            }}
            className={
              category === c
                ? 'rounded-md bg-navy px-3 py-1.5 text-xs font-semibold text-white'
                : 'rounded-md border border-ice-200 bg-white px-3 py-1.5 text-xs font-semibold text-steel-800 hover:border-ocean/40'
            }
          >
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => String(r.id)}
        loading={logs.isLoading}
        dense
        onRowClick={(r) => setSelected(r)}
        emptyState={
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-semibold text-navy">Sin eventos</p>
            <p className="mt-1 text-sm text-steel-600">
              No hay registros que coincidan con los filtros.
            </p>
          </div>
        }
      />

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="tnum text-sm text-steel-600">
          {total} registros · Página {page} de {pages}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Registros por página"
            value={String(pageSize)}
            className="w-28"
            onChange={(e) => {
              setPageSize(Number(e.target.value))
              setPage(1)
            }}
          >
            <option value="15">15</option>
            <option value="25">25</option>
            <option value="50">50</option>
          </Select>
          <Button
            size="sm"
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente
          </Button>
        </div>
      </div>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Detalle del evento"
        size="lg"
      >
        {selected && (
          <div className="space-y-3 text-sm">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold tracking-wide text-steel-600 uppercase">
                  Fecha y hora
                </dt>
                <dd className="tnum font-semibold text-navy">{fmtDateTime(selected.created_at)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold tracking-wide text-steel-600 uppercase">
                  Responsable
                </dt>
                <dd className="font-semibold text-navy">
                  {selected.actor_name || selected.actor_email || 'sistema'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold tracking-wide text-steel-600 uppercase">
                  Acción
                </dt>
                <dd>
                  {actionLabel(selected.action)}
                  <span className="mt-0.5 block text-xs text-steel-600">{selected.action}</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold tracking-wide text-steel-600 uppercase">
                  Módulo
                </dt>
                <dd>{entityLabel(selected.entity)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold tracking-wide text-steel-600 uppercase">
                  Identificador
                </dt>
                <dd className="tnum break-all text-navy">{selected.entity_id || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold tracking-wide text-steel-600 uppercase">
                  Resultado
                </dt>
                <dd>
                  <Badge tone={resultTone(selected.result)}>{resultLabel(selected.result)}</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold tracking-wide text-steel-600 uppercase">
                  Categoría
                </dt>
                <dd>{CATEGORY_LABELS[selected.category] ?? selected.category}</dd>
              </div>
            </dl>
            {isQaCleanupAction(selected.action) && (
              <Card>
                <CardHeader
                  title="Operación de mantenimiento"
                  description="Limpieza de registros QA. El historial individual se conserva intacto."
                />
              </Card>
            )}
            {meta && Object.keys(meta).length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold tracking-wide text-steel-600 uppercase">
                  Información adicional
                </p>
                <pre className="max-h-64 overflow-auto rounded-md border border-ice-200 bg-ice p-3 text-xs text-navy">
                  {JSON.stringify(meta, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}
