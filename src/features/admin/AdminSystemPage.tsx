import { Activity, AlertTriangle, Cloud, Database, Server } from 'lucide-react'
import { Badge, Card, CardBody, CardHeader, PageHeader, StatCard } from '@/shared/ui'
import { ErrorState } from '@/shared/ui/StatusPages'
import { fmtDateTime } from '@/shared/utils/dates'
import { useAdminSystemStatus } from './api'

export function AdminSystemPage() {
  const status = useAdminSystemStatus()
  const db = status.data?.db
  const probes = status.data?.probes ?? []

  return (
    <>
      <PageHeader
        title="Estado del sistema"
        description="Estado de servicios y trabajos de exportación."
        actions={
          <button
            type="button"
            className="text-xs font-semibold text-ocean hover:underline"
            onClick={() => status.refetch()}
          >
            Actualizar
          </button>
        }
      />
      {status.isError && (
        <div className="mb-4">
          <ErrorState
            message="No se pudo consultar el estado del sistema."
            onRetry={() => status.refetch()}
          />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Exportaciones pendientes"
          value={db?.exports.pending}
          icon={<Activity className="size-5" />}
          loading={status.isLoading}
        />
        <StatCard
          label="En proceso"
          value={db?.exports.processing}
          icon={<Server className="size-5" />}
          loading={status.isLoading}
        />
        <StatCard
          label="Completadas"
          value={db?.exports.completed}
          icon={<Cloud className="size-5" />}
          loading={status.isLoading}
        />
        <StatCard
          label="Fallidas"
          value={db?.exports.failed}
          icon={<AlertTriangle className="size-5" />}
          tone="warning"
          loading={status.isLoading}
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Servicios"
            description={
              db?.checked_at
                ? `Última verificación DB ${fmtDateTime(db.checked_at)}`
                : 'Consultando…'
            }
          />
          <ul className="divide-y divide-ice-200">
            <li className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <div className="flex items-center gap-2">
                <Database className="size-4 text-ocean" />
                <span className="font-semibold text-navy">Supabase (RPC)</span>
              </div>
              <Badge tone={db?.supabase.ok ? 'success' : 'danger'}>
                {db?.supabase.ok ? 'OK' : 'Error'}
              </Badge>
            </li>
            {probes.map((p) => (
              <li
                key={p.label}
                className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold text-navy">{p.label}</p>
                  <p className="tnum text-xs text-steel-600">
                    {p.ms} ms · {p.detail}
                  </p>
                </div>
                <Badge tone={p.ok ? 'success' : 'danger'}>{p.ok ? 'OK' : 'Error'}</Badge>
              </li>
            ))}
          </ul>
          <CardBody className="border-t border-ice-200 text-xs text-steel-600">
            Render Free puede tardar en arranque en frío. Un fallo temporal de health no implica
            corrupción de datos.
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Exportaciones fallidas recientes" />
          <ul className="divide-y divide-ice-200">
            {db?.exports.recent_failures.map((j) => (
              <li key={j.id} className="px-5 py-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-navy">{j.format ?? 'export'}</p>
                  <span className="tnum text-xs text-steel-600">{fmtDateTime(j.created_at)}</span>
                </div>
                <p className="tnum text-xs text-steel-600">
                  competencia {j.competition_id.slice(0, 8)}…
                </p>
              </li>
            ))}
            {db?.exports.recent_failures.length === 0 && (
              <li className="px-5 py-8 text-center text-sm text-steel-600">
                No hay fallos recientes.
              </li>
            )}
          </ul>
        </Card>
      </div>
    </>
  )
}
