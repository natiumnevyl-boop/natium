import { useMemo, useState } from 'react'
import { Download, FileSpreadsheet, FileType2 } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Select,
  StatCard,
} from '@/shared/ui'
import { toast } from '@/shared/ui/Toaster'
import { toAppError } from '@/lib/errors'
import { fmtDateTime } from '@/shared/utils/dates'
import {
  useDownloadExportJob,
  useExportJobs,
  useExportPreview,
  usePrepareAndGenerateExport,
  type ExportJob,
} from '../api'
import type { ExportFormat } from '../model'
import { validateExportSnapshot } from '../validation'

const statusLabel: Record<ExportJob['status'], string> = {
  pending: 'Pendiente de validación',
  running: 'Generando archivo',
  completed: 'Archivo disponible',
  failed: 'Error de generación',
}

const statusTone: Record<ExportJob['status'], 'neutral' | 'info' | 'success' | 'danger' | 'warning'> =
  {
    pending: 'warning',
    running: 'info',
    completed: 'success',
    failed: 'danger',
  }

export function ExportPanel({
  competitionId,
  teams,
}: {
  competitionId: string
  teams: Array<{ id: string; name: string }>
}) {
  const [teamId, setTeamId] = useState('')
  const [format, setFormat] = useState<ExportFormat>('csv_generic')
  const [phase, setPhase] = useState<
    'idle' | 'validating' | 'generating' | 'ready' | 'error'
  >('idle')

  const preview = useExportPreview(competitionId, teamId || undefined)
  const jobs = useExportJobs(competitionId)
  const generate = usePrepareAndGenerateExport(competitionId)
  const download = useDownloadExportJob()

  const issues = useMemo(
    () => (preview.data ? validateExportSnapshot(preview.data) : []),
    [preview.data],
  )
  const errors = issues.filter((i) => i.level === 'error')
  const warnings = issues.filter((i) => i.level === 'warning')
  const counts = preview.data
    ? {
        teams: preview.data.teams.length,
        athletes: preview.data.athletes.length,
        entries: preview.data.entries.length,
      }
    : { teams: 0, athletes: 0, entries: 0 }

  const canGenerate = !generate.isPending && errors.length === 0 && counts.entries > 0

  const onGenerate = async () => {
    setPhase('validating')
    try {
      if (errors.length) {
        setPhase('error')
        toast.error(errors[0]?.message ?? 'Hay errores de validación')
        return
      }
      setPhase('generating')
      await generate.mutateAsync({ format, teamId: teamId || undefined })
      setPhase('ready')
      toast.success(
        format === 'csv_generic'
          ? 'Archivo CSV generado y descargado'
          : 'Archivo MDB generado y descargado',
      )
      await Promise.all([preview.refetch(), jobs.refetch()])
    } catch (error) {
      setPhase('error')
      toast.error(toAppError(error).message)
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Exportar inscripciones"
          description="Genera el archivo a partir de inscripciones aceptadas. El CSV es el respaldo operativo; el MDB de Meet Manager requiere el servicio Jackcess."
        />
        <CardBody className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Equipos" value={counts.teams} loading={preview.isLoading} />
            <StatCard label="Atletas" value={counts.athletes} loading={preview.isLoading} />
            <StatCard label="Pruebas" value={counts.entries} loading={preview.isLoading} tone="aqua" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              aria-label="Equipo a exportar"
            >
              <option value="">Todos los equipos aceptados</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            <Select
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
              aria-label="Formato de exportación"
            >
              <option value="csv_generic">CSV operativo (respaldo)</option>
              <option value="mdb_meet_manager">MDB Meet Manager</option>
            </Select>
          </div>

          {format === 'mdb_meet_manager' && (
            <Alert tone="warning" title="Formato MDB pendiente de servicio">
              El adaptador Hy-Tek Meet Manager (JET4) ya está implementado con Jackcess y verificado
              fuera de Vercel. Para habilitar «Descargar archivo MDB» en producción hay que desplegar
              el contenedor documentado en <code>services/mdb-exporter</code> y configurar los
              secretos de la Edge Function <code>generate-mdb</code>. El CSV no sustituye ese formato.
            </Alert>
          )}

          {errors.length > 0 && (
            <Alert tone="danger" title="Pendiente de validación">
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
                {errors.slice(0, 8).map((issue, idx) => (
                  <li key={`${issue.code}-${idx}`}>{issue.message}</li>
                ))}
              </ul>
            </Alert>
          )}
          {errors.length === 0 && warnings.length > 0 && (
            <Alert tone="warning" title="Observaciones">
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
                {warnings.slice(0, 6).map((issue, idx) => (
                  <li key={`${issue.code}-${idx}`}>{issue.message}</li>
                ))}
              </ul>
            </Alert>
          )}
          {errors.length === 0 && counts.entries === 0 && !preview.isLoading && (
            <Alert tone="info">
              No hay inscripciones aceptadas en este alcance. Acepta al menos una inscripción antes
              de exportar.
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              leftIcon={
                format === 'csv_generic' ? (
                  <FileSpreadsheet className="size-4" />
                ) : (
                  <FileType2 className="size-4" />
                )
              }
              loading={generate.isPending}
              disabled={!canGenerate}
              onClick={() => void onGenerate()}
            >
              {generate.isPending
                ? phase === 'validating'
                  ? 'Validando información…'
                  : 'Generando archivo…'
                : 'Generar archivo de inscripción'}
            </Button>
            {phase === 'ready' && (
              <Badge tone="success">Archivo disponible</Badge>
            )}
            {phase === 'error' && <Badge tone="danger">Error de generación</Badge>}
            {phase === 'idle' && errors.length > 0 && (
              <Badge tone="warning">Pendiente de validación</Badge>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Exportaciones anteriores" />
        <ul className="divide-y divide-ice-200">
          {(jobs.data ?? []).map((job) => (
            <li key={job.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
              <div>
                <p className="font-semibold text-navy">
                  v{job.version} · {job.format === 'mdb_meet_manager' ? 'MDB' : 'CSV'}
                  {job.file_name ? ` · ${job.file_name}` : ''}
                </p>
                <p className="text-xs text-steel-600">
                  {fmtDateTime(job.created_at)}
                  {job.summary && typeof job.summary === 'object'
                    ? ` · ${(job.summary as { athletes?: number }).athletes ?? '—'} atletas · ${(job.summary as { entries?: number }).entries ?? '—'} pruebas`
                    : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={statusTone[job.status]}>{statusLabel[job.status]}</Badge>
                {job.status === 'completed' && job.file_path && (
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon={<Download className="size-3.5" />}
                    loading={download.isPending}
                    onClick={() =>
                      download.mutate(job, {
                        onError: (e) => toast.error(toAppError(e).message),
                        onSuccess: () =>
                          toast.success(
                            job.format === 'mdb_meet_manager'
                              ? 'Descarga MDB iniciada'
                              : 'Descarga CSV iniciada',
                          ),
                      })
                    }
                  >
                    {job.format === 'mdb_meet_manager' ? 'Descargar archivo MDB' : 'Descargar CSV'}
                  </Button>
                )}
              </div>
            </li>
          ))}
          {(jobs.data?.length ?? 0) === 0 && (
            <li className="px-5 py-6 text-center text-sm text-steel-600">
              Aún no hay exportaciones registradas.
            </li>
          )}
        </ul>
      </Card>
    </div>
  )
}
