import { Link, useParams } from 'react-router-dom'
import { CalendarDays, ClipboardList, MapPin, Share2 } from 'lucide-react'
import { brand } from '@/config/brand'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardSkeleton,
} from '@/shared/ui'
import { toast } from '@/shared/ui/Toaster'
import { ErrorState } from '@/shared/ui/StatusPages'
import { toAppError } from '@/lib/errors'
import { fmtDate, fmtDateTime } from '@/shared/utils/dates'
import {
  competitionStatusLabel,
  competitionStatusTone,
  poolCourseLabel,
  sexLabel,
} from '@/shared/utils/labels'
import {
  publicCompetitionUrl,
  registrationWindowFromDates,
  usePublicCompetition,
  whatsappShareUrl,
} from '../publicApi'

export function PublicCompetitionSharePage() {
  const { competitionId = '' } = useParams()
  const q = usePublicCompetition(competitionId)

  if (q.isLoading) return <CardSkeleton lines={10} />
  if (q.isError)
    return (
      <ErrorState message={toAppError(q.error).message} onRetry={() => q.refetch()} />
    )
  if (!q.data) {
    return (
      <ErrorState
        title="Competencia no disponible"
        message="Esta convocatoria no está publicada o el enlace no es válido."
      />
    )
  }

  const { competition: c, organization: org, categories, events } = q.data
  const win = registrationWindowFromDates(
    c.registration_opens_at,
    c.registration_closes_at,
    c.status,
  )
  const shareUrl = publicCompetitionUrl(c.id)
  const shareText = `${c.name} — ${org.name}\n${shareUrl}`
  const loginTo = `/login?from=${encodeURIComponent(`/competitions/${c.id}`)}`
  const registerTo = `/register?from=${encodeURIComponent(`/competitions/${c.id}`)}`

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      toast.success('Enlace copiado')
    } catch {
      toast.error('No se pudo copiar el enlace')
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {c.cover_image_url ? (
        <div className="overflow-hidden rounded-xl border border-ice-200 bg-navy shadow-card">
          <img
            src={c.cover_image_url}
            alt=""
            className="h-44 w-full object-cover sm:h-56"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="rounded-xl bg-gradient-to-br from-navy via-ocean to-navy-700 px-5 py-8 text-white shadow-card sm:px-8">
          <p className="text-xs font-semibold tracking-[0.18em] text-aqua uppercase">
            {org.name}
          </p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">{c.name}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-steel">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5" />
              {fmtDate(c.start_date)}
              {c.end_date !== c.start_date ? ` – ${fmtDate(c.end_date)}` : ''}
            </span>
            {(c.venue || c.city) && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {[c.venue, c.city].filter(Boolean).join(', ')}
              </span>
            )}
          </p>
        </div>
      )}

      {c.cover_image_url && (
        <div>
          <p className="text-xs font-semibold tracking-wide text-ocean uppercase">{org.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">
              {c.name}
            </h1>
            <Badge tone={competitionStatusTone[c.status]}>
              {competitionStatusLabel[c.status]}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-steel-800">
            {fmtDate(c.start_date)}
            {c.end_date !== c.start_date ? ` – ${fmtDate(c.end_date)}` : ''}
            {c.venue || c.city ? ` · ${[c.venue, c.city].filter(Boolean).join(', ')}` : ''}
          </p>
        </div>
      )}

      {!c.cover_image_url && (
        <div className="-mt-2">
          <Badge tone={competitionStatusTone[c.status]}>
            {competitionStatusLabel[c.status]}
          </Badge>
        </div>
      )}

      {win === 'upcoming' && (
        <Alert tone="info">Las inscripciones abren el {fmtDateTime(c.registration_opens_at)}.</Alert>
      )}
      {win === 'closed' && (
        <Alert tone="warning">El periodo de inscripción está cerrado.</Alert>
      )}
      {win === 'open' && (
        <Alert tone="success">
          Inscripciones abiertas hasta el {fmtDateTime(c.registration_closes_at)}.
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {win === 'open' ? (
          <>
            <Link to={loginTo}>
              <Button leftIcon={<ClipboardList className="size-4" />}>Inscribirme</Button>
            </Link>
            <Link to={registerTo}>
              <Button variant="secondary">Crear cuenta</Button>
            </Link>
          </>
        ) : (
          <Link to={loginTo}>
            <Button variant="secondary">Entrar a {brand.name}</Button>
          </Link>
        )}
        <Button variant="secondary" leftIcon={<Share2 className="size-4" />} onClick={copyLink}>
          Copiar enlace
        </Button>
        <a href={whatsappShareUrl(shareText)} target="_blank" rel="noreferrer">
          <Button variant="ghost">WhatsApp</Button>
        </a>
      </div>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Convocatoria" />
            <CardBody className="text-sm whitespace-pre-wrap text-steel-800">
              {c.description || 'Sin descripción publicada.'}
              {c.requirements && (
                <>
                  <h4 className="mt-4 mb-1 font-bold text-navy">Requisitos</h4>
                  {c.requirements}
                </>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="Pruebas disponibles"
              description={`${events.length} pruebas habilitadas`}
            />
            <ul className="divide-y divide-ice-200">
              {events.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span>
                    <span className="tnum mr-2 text-xs text-steel-600">
                      #{e.event_number ?? '—'}
                    </span>
                    {e.name}
                  </span>
                  <span className="shrink-0 text-xs text-steel-600">
                    {e.sex ? sexLabel[e.sex as keyof typeof sexLabel] : 'Mixto'}
                  </span>
                </li>
              ))}
              {events.length === 0 && (
                <li className="px-5 py-6 text-center text-sm text-steel-600">
                  Aún no hay pruebas publicadas.
                </li>
              )}
            </ul>
          </Card>
        </div>
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Datos generales" />
            <CardBody>
              <dl className="flex flex-col gap-3 text-sm">
                {[
                  ['Organización', org.name],
                  ['Apertura', fmtDateTime(c.registration_opens_at)],
                  ['Cierre', fmtDateTime(c.registration_closes_at)],
                  ['Alberca', `${poolCourseLabel[c.pool_course]} · ${c.pool_length_m} m`],
                  ['Edad de referencia', fmtDate(c.age_reference_date ?? c.start_date)],
                  [
                    'Máx. pruebas / atleta',
                    c.max_entries_per_athlete ?? 'Sin límite',
                  ],
                  ['Sin tiempo (NT)', c.allow_no_time ? 'Permitido' : 'No permitido'],
                ].map(([k, v]) => (
                  <div key={String(k)}>
                    <dt className="text-xs font-semibold tracking-wide text-steel-600 uppercase">
                      {k}
                    </dt>
                    <dd className="text-navy">{v}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Categorías" />
            <ul className="divide-y divide-ice-200">
              {categories.map((cat) => (
                <li
                  key={cat.id}
                  className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm"
                >
                  <span className="font-semibold text-navy">{cat.name}</span>
                  <span className="tnum text-xs text-steel-600">
                    {cat.sex ? sexLabel[cat.sex as keyof typeof sexLabel] : 'Mixta'} ·{' '}
                    {cat.min_age}–{cat.max_age}
                  </span>
                </li>
              ))}
              {categories.length === 0 && (
                <li className="px-5 py-4 text-sm text-steel-600">
                  Sin categorías por edad: todos los atletas son elegibles.
                </li>
              )}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}
