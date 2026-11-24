import { AlertTriangle, ClipboardList, Flag, Shield, Trophy, UserRound, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, Card, CardHeader, PageHeader, StatCard } from '@/shared/ui'
import { ErrorState } from '@/shared/ui/StatusPages'
import { fmtDateTime } from '@/shared/utils/dates'
import { useAdminCounts, useRecentExportJobs } from './api'

export function AdminDashboardPage() {
  const counts = useAdminCounts()
  const exports = useRecentExportJobs()
  const d = counts.data
  return (
    <>
      <PageHeader
        title="Administración de la plataforma"
        description="Supervisión global de organizaciones, usuarios y actividad."
      />
      {counts.isError && (
        <div className="mb-5">
          <ErrorState
            message="No se pudieron cargar los conteos."
            onRetry={() => counts.refetch()}
          />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Usuarios"
          value={d?.profiles}
          icon={<Shield className="size-5" />}
          to="/admin/users"
          loading={counts.isLoading}
        />
        <StatCard
          label="Entrenadores"
          value={d?.coaches}
          icon={<UserRound className="size-5" />}
          to="/admin/users"
          loading={counts.isLoading}
        />
        <StatCard
          label="Organizadores"
          value={d?.organizers}
          icon={<Flag className="size-5" />}
          loading={counts.isLoading}
        />
        <StatCard
          label="Organizaciones"
          value={d?.organizations}
          icon={<Flag className="size-5" />}
          loading={counts.isLoading}
        />
        <StatCard
          label="Equipos"
          value={d?.teams}
          icon={<Users className="size-5" />}
          loading={counts.isLoading}
        />
        <StatCard
          label="Atletas"
          value={d?.athletes}
          icon={<UserRound className="size-5" />}
          loading={counts.isLoading}
        />
        <StatCard
          label="Competencias"
          value={d?.competitions}
          icon={<Trophy className="size-5" />}
          loading={counts.isLoading}
        />
        <StatCard
          label="Inscripciones"
          value={d?.registrations}
          icon={<ClipboardList className="size-5" />}
          loading={counts.isLoading}
        />
        <StatCard
          label="Exportaciones fallidas"
          value={d?.failed_exports}
          icon={<AlertTriangle className="size-5" />}
          tone="warning"
          loading={counts.isLoading}
        />
      </div>
      <Card className="mt-6">
        <CardHeader
          title="Actividad de exportación"
          description="Últimos trabajos MDB/CSV en la plataforma."
          action={
            <Link to="/admin/audit" className="text-xs font-semibold text-ocean hover:underline">
              Auditoría
            </Link>
          }
        />
        <ul className="divide-y divide-ice-200">
          {exports.data?.map((j) => (
            <li key={j.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-semibold text-navy">
                  {j.file_name ?? j.format} ·{' '}
                  {(j.competition as { name?: string } | null)?.name ??
                    j.competition_id.slice(0, 8)}
                </p>
                <p className="text-xs text-steel-600">{fmtDateTime(j.created_at)}</p>
              </div>
              <Badge
                tone={
                  j.status === 'completed' ? 'success' : j.status === 'failed' ? 'danger' : 'warning'
                }
              >
                {j.status}
              </Badge>
            </li>
          ))}
          {exports.data?.length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-steel-600">
              Sin trabajos de exportación recientes.
            </li>
          )}
        </ul>
      </Card>
    </>
  )
}
