import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Building2,
  ClipboardList,
  FileOutput,
  Flag,
  Shield,
  Trophy,
  UserRound,
  Users,
} from 'lucide-react'
import { Badge, Card, CardBody, CardHeader, Field, Input, PageHeader, StatCard } from '@/shared/ui'
import { ErrorState } from '@/shared/ui/StatusPages'
import { fmtDateTime } from '@/shared/utils/dates'
import { toAppError } from '@/lib/errors'
import { useAdminDashboardStats } from './api'

function daysAgoIso(days: number) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

function MiniBars({
  series,
  field,
}: {
  series: { day: string; users: number; registrations: number; exports: number }[]
  field: 'users' | 'registrations' | 'exports'
}) {
  const max = Math.max(1, ...series.map((s) => s[field]))
  return (
    <div className="flex h-20 items-end gap-0.5">
      {series.map((s) => {
        const h = Math.round((s[field] / max) * 100)
        return (
          <div
            key={s.day}
            title={`${s.day}: ${s[field]}`}
            className="min-w-0 flex-1 rounded-t bg-aqua/80 transition-all hover:bg-aqua"
            style={{ height: `${Math.max(h, s[field] > 0 ? 8 : 2)}%` }}
          />
        )
      })}
    </div>
  )
}

export function AdminDashboardPage() {
  const [from, setFrom] = useState(() => daysAgoIso(29).slice(0, 10))
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10))
  const fromIso = useMemo(() => new Date(`${from}T00:00:00`).toISOString(), [from])
  const toIso = useMemo(() => new Date(`${to}T23:59:59`).toISOString(), [to])
  const stats = useAdminDashboardStats(fromIso, toIso)
  const d = stats.data?.totals
  const series = stats.data?.series ?? []
  const hasSeriesSignal = series.some((s) => s.users + s.registrations + s.exports > 0)

  return (
    <>
      <PageHeader
        title="Administración"
        description="Vista global de la plataforma: usuarios, operación e infraestructura."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Desde" className="w-[9.5rem]">
              {(p) => (
                <Input {...p} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              )}
            </Field>
            <Field label="Hasta" className="w-[9.5rem]">
              {(p) => (
                <Input {...p} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              )}
            </Field>
          </div>
        }
      />
      {stats.isError && (
        <div className="mb-5">
          <ErrorState
            message={toAppError(stats.error).message}
            onRetry={() => stats.refetch()}
          />
        </div>
      )}

      <section className="mb-6">
        <h2 className="mb-2.5 text-xs font-bold tracking-wide text-steel-600 uppercase">
          Cuentas
        </h2>
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Usuarios"
            value={d?.users}
            icon={<Shield className="size-4" />}
            to="/admin/users"
            loading={stats.isLoading}
          />
          <StatCard
            label="Usuarios nuevos"
            value={d?.users_new}
            icon={<UserRound className="size-4" />}
            to="/admin/users"
            tone="aqua"
            loading={stats.isLoading}
          />
          <StatCard
            label="Entrenadores"
            value={d?.coaches}
            icon={<UserRound className="size-4" />}
            to="/admin/users?role=coach"
            loading={stats.isLoading}
          />
          <StatCard
            label="Organizadores"
            value={d?.organizers}
            icon={<Flag className="size-4" />}
            to="/admin/users?role=organizer"
            loading={stats.isLoading}
          />
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-2.5 text-xs font-bold tracking-wide text-steel-600 uppercase">
          Operación
        </h2>
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Organizaciones"
            value={d?.organizations}
            icon={<Building2 className="size-4" />}
            to="/admin/organizations"
            loading={stats.isLoading}
          />
          <StatCard
            label="Equipos"
            value={d?.teams}
            icon={<Users className="size-4" />}
            to="/admin/teams"
            loading={stats.isLoading}
          />
          <StatCard
            label="Atletas"
            value={d?.athletes}
            icon={<UserRound className="size-4" />}
            to="/admin/athletes"
            loading={stats.isLoading}
          />
          <StatCard
            label="Competencias"
            value={d?.competitions}
            icon={<Trophy className="size-4" />}
            to="/admin/competitions"
            loading={stats.isLoading}
          />
          <StatCard
            label="Inscripciones"
            value={d?.registrations}
            icon={<ClipboardList className="size-4" />}
            to="/admin/registrations"
            loading={stats.isLoading}
          />
          <StatCard
            label="Exportaciones MDB"
            value={d?.exports_mdb}
            icon={<FileOutput className="size-4" />}
            to="/admin/exports?format=mdb_meet_manager"
            loading={stats.isLoading}
          />
          <StatCard
            label="Exportaciones CSV"
            value={d?.exports_csv}
            icon={<FileOutput className="size-4" />}
            to="/admin/exports?format=csv_generic"
            loading={stats.isLoading}
          />
          <StatCard
            label="Exportaciones fallidas"
            value={d?.exports_failed}
            icon={<AlertTriangle className="size-4" />}
            tone="warning"
            to="/admin/exports?status=failed"
            loading={stats.isLoading}
          />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title="Actividad en el periodo"
            description={
              hasSeriesSignal
                ? 'Altas de usuarios, envíos de inscripción y exportaciones por día.'
                : 'Todavía no hay actividad suficiente en este periodo para graficar.'
            }
          />
          <CardBody className="space-y-4">
            {hasSeriesSignal ? (
              <>
                <div>
                  <p className="mb-1 text-xs font-semibold tracking-wide text-steel-600 uppercase">
                    Usuarios
                  </p>
                  <MiniBars series={series} field="users" />
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold tracking-wide text-steel-600 uppercase">
                    Inscripciones
                  </p>
                  <MiniBars series={series} field="registrations" />
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold tracking-wide text-steel-600 uppercase">
                    Exportaciones
                  </p>
                  <MiniBars series={series} field="exports" />
                </div>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-steel-600">
                Cuando comience la operación, aquí verás la tendencia diaria.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Actividad reciente"
            description="Últimas operaciones registradas."
            action={
              <Link to="/admin/audit" className="text-xs font-semibold text-ocean hover:underline">
                Ver todo
              </Link>
            }
          />
          <ul className="divide-y divide-ice-200">
            {stats.data?.recent_audit.map((a) => (
              <li key={a.id} className="px-5 py-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone="info">{a.action}</Badge>
                  <span className="tnum text-xs text-steel-600">{fmtDateTime(a.created_at)}</span>
                </div>
                <p className="mt-1 truncate font-semibold text-navy">
                  {a.entity}
                  {a.entity_id ? ` · ${a.entity_id.slice(0, 8)}` : ''}
                </p>
                <p className="truncate text-xs text-steel-600">
                  {a.actor_name || a.actor_email || 'sistema'}
                </p>
              </li>
            ))}
            {stats.data?.recent_audit.length === 0 && (
              <li className="px-5 py-8 text-center text-sm text-steel-600">
                Aún no hay actividad registrada.
              </li>
            )}
          </ul>
        </Card>
      </div>
    </>
  )
}
