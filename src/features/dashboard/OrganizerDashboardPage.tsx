import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ClipboardList,
  FileOutput,
  Plus,
  Share2,
  Trophy,
  UserRound,
  Users,
  Waves,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Alert, Badge, Button, Card, CardHeader, PageHeader, StatCard } from '@/shared/ui'
import { ErrorState } from '@/shared/ui/StatusPages'
import { fmtDateTime } from '@/shared/utils/dates'
import { registrationStatusLabel, registrationStatusTone } from '@/shared/utils/labels'
import { useMyOrganization, useOrgCompetitions } from '@/features/competitions/api'
import { useOrgRegistrations } from '@/features/registrations/api'
import { supabase } from '@/lib/supabase'
import { unwrap } from '@/lib/errors'
import { useOrganizerDashboard } from './api'

export function OrganizerDashboardPage() {
  const org = useMyOrganization()
  const dash = useOrganizerDashboard()
  const pending = useOrgRegistrations(undefined, 'submitted')
  const comps = useOrgCompetitions()
  const recentExports = useQuery({
    queryKey: ['dashboard', 'organizer', 'exports'],
    enabled: !!org.data,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('export_jobs')
          .select('id, status, file_name, created_at, competition_id, format')
          .order('created_at', { ascending: false })
          .limit(5),
      ),
  })
  const d = dash.data
  const upcomingClosures =
    comps.data
      ?.filter((c) => c.status === 'published')
      .slice()
      .sort(
        (a, b) =>
          new Date(a.registration_closes_at).getTime() -
          new Date(b.registration_closes_at).getTime(),
      )
      .slice(0, 5) ?? []

  return (
    <>
      <PageHeader
        title="Panel del organizador"
        description={
          org.data?.name ?? 'Competencias, equipos inscritos y revisión de inscripciones.'
        }
        actions={
          <Link to="/org/competitions/new">
            <Button leftIcon={<Plus className="size-4" />} disabled={!org.data}>
              Nueva competencia
            </Button>
          </Link>
        }
      />
      {org.data === null && (
        <Alert tone="info" title="Configura tu organización" className="mb-5">
          Registra tu organización para comenzar a crear competencias.{' '}
          <Link to="/org/organization" className="font-semibold underline">
            Ir a Organización
          </Link>
        </Alert>
      )}
      {dash.isError && (
        <div className="mb-5">
          <ErrorState
            message="No se pudieron cargar los indicadores."
            onRetry={() => dash.refetch()}
          />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Competencias activas"
          value={d?.active_competitions}
          icon={<Trophy className="size-5" />}
          to="/org/competitions"
          tone="aqua"
          loading={dash.isLoading}
        />
        <StatCard
          label="Equipos inscritos"
          value={d?.teams}
          icon={<Users className="size-5" />}
          loading={dash.isLoading}
        />
        <StatCard
          label="Atletas registrados"
          value={d?.athletes}
          icon={<UserRound className="size-5" />}
          loading={dash.isLoading}
        />
        <StatCard
          label="Inscripciones"
          value={d?.registrations}
          icon={<ClipboardList className="size-5" />}
          to="/org/registrations"
          loading={dash.isLoading}
        />
        <StatCard
          label="Pruebas registradas"
          value={d?.entries}
          icon={<Waves className="size-5" />}
          loading={dash.isLoading}
        />
        <StatCard
          label="Pendientes de revisión"
          value={d?.pending_review}
          icon={<ClipboardList className="size-5" />}
          to="/org/registrations"
          tone="warning"
          loading={dash.isLoading}
        />
        <StatCard
          label="En corrección"
          value={d?.needs_correction}
          icon={<AlertTriangle className="size-5" />}
          to="/org/registrations"
          tone="warning"
          loading={dash.isLoading}
        />
        <StatCard
          label="Exportaciones"
          value={d?.exports}
          icon={<FileOutput className="size-5" />}
          loading={dash.isLoading}
        />
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader
            title="Inscripciones por revisar"
            description="Enviadas recientemente por los equipos."
            action={
              <Link
                to="/org/registrations"
                className="text-xs font-semibold text-ocean hover:underline"
              >
                Ver todas
              </Link>
            }
          />
          <ul className="divide-y divide-ice-200">
            {pending.data?.slice(0, 8).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <Link
                    to={`/registrations/${r.id}`}
                    className="block truncate font-semibold text-navy hover:text-ocean"
                  >
                    {r.team?.name} · <span className="tnum">{r.folio}</span>
                  </Link>
                  <p className="truncate text-xs text-steel-600">
                    {r.competition?.name} · {r.athletes_count} atletas · {r.entries_count} pruebas ·{' '}
                    {fmtDateTime(r.submitted_at)}
                  </p>
                </div>
                <Badge tone={registrationStatusTone[r.status]}>
                  {registrationStatusLabel[r.status]}
                </Badge>
              </li>
            ))}
            {pending.data?.length === 0 && (
              <li className="px-5 py-8 text-center text-sm text-steel-600">
                No hay inscripciones pendientes.
              </li>
            )}
          </ul>
        </Card>
        <div className="flex flex-col gap-5">
          <Card className="h-fit">
            <CardHeader title="Próximos cierres" description="Competencias publicadas." />
            <ul className="divide-y divide-ice-200">
              {upcomingClosures.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 px-5 py-3 text-sm">
                  <Link
                    to={`/org/competitions/${c.id}`}
                    className="min-w-0 truncate font-semibold text-navy hover:text-ocean"
                  >
                    {c.name}
                  </Link>
                  <span className="tnum shrink-0 text-xs text-steel-600">
                    {fmtDateTime(c.registration_closes_at)}
                  </span>
                </li>
              ))}
              {upcomingClosures.length === 0 && (
                <li className="px-5 py-6 text-center text-sm text-steel-600">
                  No hay competencias publicadas.
                </li>
              )}
            </ul>
          </Card>
          <Card className="h-fit">
            <CardHeader
              title="Exportaciones recientes"
              description="CSV y MDB generados desde tus competencias."
            />
            <ul className="divide-y divide-ice-200">
              {recentExports.data?.map((j) => (
                <li key={j.id} className="flex items-center justify-between gap-2 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <Link
                      to={`/org/competitions/${j.competition_id}`}
                      className="block truncate font-semibold text-navy hover:text-ocean"
                    >
                      {j.file_name ?? j.format}
                    </Link>
                    <p className="text-xs text-steel-600">{fmtDateTime(j.created_at)}</p>
                  </div>
                  <Badge
                    tone={
                      j.status === 'completed'
                        ? 'success'
                        : j.status === 'failed'
                          ? 'danger'
                          : 'warning'
                    }
                  >
                    {j.status}
                  </Badge>
                </li>
              ))}
              {recentExports.data?.length === 0 && (
                <li className="px-5 py-6 text-center text-sm text-steel-600">
                  Aún no hay exportaciones. Ábrelas desde la pestaña Exportar de cada competencia.
                </li>
              )}
            </ul>
            {comps.data?.[0] && (
              <div className="border-t border-ice-200 px-5 py-3">
                <Link
                  to={`/org/competitions/${comps.data[0].id}`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-ocean hover:underline"
                >
                  <Share2 className="size-3.5" />
                  Abrir competencia y compartir convocatoria
                </Link>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
