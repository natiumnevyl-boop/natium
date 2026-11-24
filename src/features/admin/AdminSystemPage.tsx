import {
  Activity,
  AlertTriangle,
  Cloud,
  Database,
  Loader2,
  Server,
} from 'lucide-react'
import { Badge, Button, Card, CardBody, CardHeader, PageHeader, StatCard } from '@/shared/ui'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/StatusPages'
import { fmtDateTime } from '@/shared/utils/dates'
import { cn } from '@/shared/utils/cn'
import {
  useAdminSystemStatus,
  type HealthProbe,
  type HealthProbeState,
} from './api'

const STATE_LABEL: Record<HealthProbeState, string> = {
  operational: 'Operativo',
  slow: 'Respuesta lenta',
  starting: 'Iniciando servicio',
  auth_error: 'Error de autenticación',
  unavailable: 'No disponible',
  unchecked: 'Sin verificar',
  checking: 'Verificando',
}

function stateTone(state: HealthProbeState): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  switch (state) {
    case 'operational':
      return 'success'
    case 'slow':
    case 'starting':
    case 'checking':
      return 'warning'
    case 'auth_error':
    case 'unavailable':
      return 'danger'
    default:
      return 'neutral'
  }
}

function ServiceRow({ probe, loading }: { probe?: HealthProbe; loading?: boolean }) {
  if (loading || !probe) {
    return (
      <li className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm">
        <div className="flex items-center gap-2 text-steel-600">
          <Loader2 className="size-4 animate-spin" />
          <span>Verificando…</span>
        </div>
        <Badge tone="neutral">Verificando</Badge>
      </li>
    )
  }

  return (
    <li className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm">
      <div className="min-w-0">
        <p className="font-semibold text-navy">{probe.label}</p>
        <p className="tnum mt-0.5 text-xs text-steel-600">
          {probe.http_status != null ? `HTTP ${probe.http_status}` : 'Sin respuesta'}
          {' · '}
          {probe.ms} ms
          {' · '}
          {fmtDateTime(probe.checked_at)}
        </p>
        <p
          className={cn(
            'mt-0.5 truncate text-xs',
            probe.ok ? 'text-steel-600' : 'text-danger',
          )}
        >
          {probe.detail}
        </p>
      </div>
      <Badge tone={stateTone(probe.state)}>{STATE_LABEL[probe.state]}</Badge>
    </li>
  )
}

export function AdminSystemPage() {
  const status = useAdminSystemStatus()
  const exports = status.data?.exports
  const services = status.data?.services ?? []
  const byId = (id: string) => services.find((s) => s.id === id)

  return (
    <>
      <PageHeader
        title="Estado del sistema"
        description="Monitor de infraestructura y trabajos de exportación."
        actions={
          <Button
            size="sm"
            variant="secondary"
            loading={status.isFetching}
            onClick={() => status.refetch()}
          >
            Actualizar
          </Button>
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

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pendientes"
          value={exports?.pending}
          icon={<Activity className="size-4" />}
          to="/admin/exports"
          loading={status.isLoading}
        />
        <StatCard
          label="En proceso"
          value={exports?.processing}
          icon={<Server className="size-4" />}
          to="/admin/exports"
          loading={status.isLoading}
        />
        <StatCard
          label="Completadas"
          value={exports?.completed}
          icon={<Cloud className="size-4" />}
          to="/admin/exports"
          loading={status.isLoading}
        />
        <StatCard
          label="Fallidas"
          value={exports?.failed}
          icon={<AlertTriangle className="size-4" />}
          tone="warning"
          to="/admin/exports?status=failed"
          loading={status.isLoading}
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Servicios"
            description={
              status.data?.checked_at
                ? `Última verificación ${fmtDateTime(status.data.checked_at)}`
                : 'Consultando desde el servidor…'
            }
          />
          <ul className="divide-y divide-ice-200">
            <ServiceRow
              probe={
                byId('supabase_db') ??
                (status.data?.supabase_rpc
                  ? {
                      id: 'supabase_db',
                      label: 'Supabase Database',
                      state: status.data.supabase_rpc.ok ? 'operational' : 'unavailable',
                      ok: status.data.supabase_rpc.ok,
                      http_status: status.data.supabase_rpc.ok ? 200 : null,
                      ms: 0,
                      checked_at: status.data.checked_at,
                      detail: status.data.supabase_rpc.detail,
                    }
                  : undefined)
              }
              loading={status.isLoading}
            />
            <ServiceRow probe={byId('supabase_api')} loading={status.isLoading} />
            <ServiceRow probe={byId('vercel')} loading={status.isLoading} />
            <ServiceRow probe={byId('render_mdb')} loading={status.isLoading} />
            {byId('render_mdb_auth') && (
              <ServiceRow probe={byId('render_mdb_auth')} loading={status.isLoading} />
            )}
          </ul>
          <CardBody className="border-t border-ice-200 text-xs text-steel-600">
            Las comprobaciones se ejecutan en el servidor con autenticación de administrador.
            El servicio MDB en Render Free puede tardar en el primer arranque.
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Exportaciones fallidas recientes"
            description="Últimos trabajos con error reportado."
          />
          {(exports?.recent_failures.length ?? 0) === 0 && !status.isLoading ? (
            <EmptyState
              icon={<Database className="size-5" />}
              title="Sin fallos recientes"
              description="No hay exportaciones fallidas en el historial reciente."
              className="py-10"
            />
          ) : (
            <ul className="divide-y divide-ice-200">
              {exports?.recent_failures.map((j) => (
                <li key={j.id} className="px-5 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-navy">
                      {j.format === 'mdb_meet_manager'
                        ? 'MDB Meet Manager'
                        : j.format === 'csv_generic'
                          ? 'CSV'
                          : (j.format ?? 'export')}
                    </p>
                    <span className="tnum text-xs text-steel-600">
                      {fmtDateTime(j.created_at)}
                    </span>
                  </div>
                  <p className="tnum text-xs text-steel-600">
                    Competencia {j.competition_id.slice(0, 8)}…
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
