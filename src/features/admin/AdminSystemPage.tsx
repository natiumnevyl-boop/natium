import {
  Activity,
  AlertTriangle,
  Cloud,
  Database,
  Loader2,
  Server,
} from 'lucide-react'
import { useAuth } from '@/features/auth/AuthProvider'
import { Alert, Badge, Button, Card, CardBody, CardHeader, PageHeader, StatCard } from '@/shared/ui'
import { EmptyState } from '@/shared/ui/EmptyState'
import { toAppError } from '@/lib/errors'
import { fmtDateTime } from '@/shared/utils/dates'
import { cn } from '@/shared/utils/cn'
import {
  useAdminExportMetrics,
  useAdminInfrastructure,
  type HealthProbe,
  type HealthProbeState,
} from './api'

const SERVICE_ORDER = [
  { id: 'supabase_db', label: 'Supabase Database' },
  { id: 'supabase_api', label: 'Supabase API' },
  { id: 'vercel', label: 'Vercel' },
  { id: 'render_mdb', label: 'Render MDB' },
] as const

const STATE_LABEL: Record<HealthProbeState, string> = {
  operational: 'Operativo',
  slow: 'Respuesta lenta',
  starting: 'Iniciando servicio',
  auth_error: 'Error de autenticación',
  unavailable: 'No disponible',
  unchecked: 'Sin verificar',
  checking: 'Verificando',
  verify_error: 'Error de verificación',
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
    case 'verify_error':
      return 'danger'
    default:
      return 'neutral'
  }
}

function resolveProbe(
  id: string,
  label: string,
  services: HealthProbe[] | undefined,
  loading: boolean,
  failed: boolean,
): HealthProbe {
  const found = services?.find((s) => s.id === id)
  if (found) return { ...found, label: found.label || label }
  if (loading) {
    return {
      id,
      label,
      state: 'checking',
      ok: false,
      http_status: null,
      ms: 0,
      checked_at: new Date().toISOString(),
      detail: 'Comprobación en curso',
    }
  }
  if (failed) {
    return {
      id,
      label,
      state: 'verify_error',
      ok: false,
      http_status: null,
      ms: 0,
      checked_at: new Date().toISOString(),
      detail: 'No se pudo completar la verificación',
    }
  }
  return {
    id,
    label,
    state: 'unchecked',
    ok: false,
    http_status: null,
    ms: 0,
    checked_at: new Date().toISOString(),
    detail: 'Sin verificar',
  }
}

function ServiceRow({ probe }: { probe: HealthProbe }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <div className="min-w-0">
        <p className="font-semibold text-navy">{probe.label}</p>
        <p className="tnum mt-0.5 text-xs text-steel-600">
          {probe.state === 'checking' ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" /> Verificando…
            </span>
          ) : (
            <>
              {probe.http_status != null ? `HTTP ${probe.http_status}` : 'Sin respuesta'}
              {' · '}
              {probe.ms} ms
              {' · '}
              {fmtDateTime(probe.checked_at)}
            </>
          )}
        </p>
        {probe.state !== 'checking' && (
          <p
            className={cn(
              'mt-0.5 truncate text-xs',
              probe.ok ? 'text-steel-600' : 'text-danger',
            )}
          >
            {probe.detail}
          </p>
        )}
      </div>
      <Badge tone={stateTone(probe.state)}>{STATE_LABEL[probe.state]}</Badge>
    </li>
  )
}

export function AdminSystemPage() {
  const { session } = useAuth()
  const ready = !!session
  const metrics = useAdminExportMetrics(ready)
  const infra = useAdminInfrastructure(ready)
  const exports = metrics.data?.exports
  const services = infra.data?.services

  const refresh = () => {
    void metrics.refetch()
    void infra.refetch()
  }

  return (
    <>
      <PageHeader
        title="Estado del sistema"
        description={
          infra.data?.checked_at || metrics.data?.checked_at
            ? `Última actualización ${fmtDateTime(infra.data?.checked_at ?? metrics.data?.checked_at)}`
            : 'Monitor de infraestructura y exportaciones'
        }
        actions={
          <Button
            size="sm"
            variant="secondary"
            loading={metrics.isFetching || infra.isFetching}
            onClick={refresh}
          >
            Actualizar
          </Button>
        }
      />

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pendientes"
          value={metrics.isError ? undefined : exports?.pending}
          icon={<Activity className="size-4" />}
          to="/admin/exports"
          loading={metrics.isLoading}
        />
        <StatCard
          label="En proceso"
          value={metrics.isError ? undefined : exports?.processing}
          icon={<Server className="size-4" />}
          to="/admin/exports"
          loading={metrics.isLoading}
        />
        <StatCard
          label="Completadas"
          value={metrics.isError ? undefined : exports?.completed}
          icon={<Cloud className="size-4" />}
          to="/admin/exports"
          loading={metrics.isLoading}
        />
        <StatCard
          label="Fallidas"
          value={metrics.isError ? undefined : exports?.failed}
          icon={<AlertTriangle className="size-4" />}
          tone="warning"
          to="/admin/exports?status=failed"
          loading={metrics.isLoading}
        />
      </div>
      {metrics.isError && (
        <Alert tone="danger" className="mt-3" title="Métricas de exportación">
          {toAppError(metrics.error).message}{' '}
          <button type="button" className="font-semibold underline" onClick={() => metrics.refetch()}>
            Reintentar
          </button>
        </Alert>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Infraestructura"
            description="Comprobaciones autorizadas desde el servidor"
          />
          {infra.isError && (
            <div className="border-b border-ice-200 px-4 py-2">
              <Alert tone="danger" title="Monitor de servicios">
                {toAppError(infra.error).message}{' '}
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() => infra.refetch()}
                >
                  Reintentar
                </button>
              </Alert>
            </div>
          )}
          <ul className="divide-y divide-ice-200">
            {SERVICE_ORDER.map((s) => (
              <ServiceRow
                key={s.id}
                probe={resolveProbe(
                  s.id,
                  s.label,
                  services,
                  infra.isLoading || infra.isFetching,
                  infra.isError,
                )}
              />
            ))}
            {services
              ?.filter((s) => s.id === 'render_mdb_auth')
              .map((s) => <ServiceRow key={s.id} probe={s} />)}
          </ul>
          <CardBody className="border-t border-ice-200 text-xs text-steel-600">
            Render Free puede tardar en el primer arranque. Un servicio lento no implica corrupción
            de datos.
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Exportaciones fallidas recientes" />
          {metrics.isError ? (
            <div className="px-4 py-3">
              <Alert tone="warning" title="Consulta incompleta">
                No se pudieron cargar los fallos recientes.
              </Alert>
            </div>
          ) : metrics.isLoading ? (
            <div className="flex items-center gap-2 px-4 py-8 text-sm text-steel-600">
              <Loader2 className="size-4 animate-spin" /> Cargando…
            </div>
          ) : (exports?.recent_failures.length ?? 0) === 0 ? (
            <EmptyState
              icon={<Database className="size-5" />}
              title="Sin fallos recientes"
              description="La consulta fue exitosa y no hay exportaciones fallidas."
              className="py-8"
            />
          ) : (
            <ul className="divide-y divide-ice-200">
              {exports?.recent_failures.map((j) => (
                <li key={j.id} className="px-4 py-2.5 text-sm">
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
