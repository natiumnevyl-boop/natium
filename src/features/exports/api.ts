import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type Json, type Tables } from '@/lib/supabase'
import { AppError, toAppError, unwrap } from '@/lib/errors'
import { buildEntriesCsv, downloadBinaryFile, downloadTextFile } from './adapters/csv'
import type { ExportFormat, ExportSnapshot } from './model'
import { countExportSnapshot, validateExportSnapshot } from './validation'

export type ExportJob = Tables<'export_jobs'>

export type ExportPhase =
  | 'idle'
  | 'validating'
  | 'preparing'
  | 'generating'
  | 'ready'
  | 'error'

export const exportKeys = {
  all: ['exports'] as const,
  jobs: (competitionId: string) => [...exportKeys.all, 'jobs', competitionId] as const,
  snapshot: (competitionId: string, teamId?: string) =>
    [...exportKeys.all, 'snapshot', competitionId, teamId ?? 'all'] as const,
}

export function useExportJobs(competitionId: string | undefined, opts?: { poll?: boolean }) {
  return useQuery({
    queryKey: exportKeys.jobs(competitionId ?? ''),
    enabled: !!competitionId,
    refetchInterval: opts?.poll ? 3000 : false,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('export_jobs')
          .select('*')
          .eq('competition_id', competitionId!)
          .order('created_at', { ascending: false }),
      ),
  })
}

export function useExportPreview(competitionId: string | undefined, teamId?: string) {
  return useQuery({
    queryKey: exportKeys.snapshot(competitionId ?? '', teamId),
    enabled: !!competitionId,
    staleTime: 15_000,
    queryFn: async () =>
      unwrap(
        await supabase.rpc('get_competition_export_snapshot', {
          p_competition_id: competitionId!,
          p_team_id: teamId || null,
        }),
      ) as unknown as ExportSnapshot,
  })
}

async function uploadExportFile(
  competitionId: string,
  jobId: string,
  fileName: string,
  body: Blob,
) {
  const path = `${competitionId}/${jobId}/${fileName}`
  const { error } = await supabase.storage.from('exports').upload(path, body, {
    upsert: true,
    contentType: body.type || 'application/octet-stream',
  })
  if (error) throw toAppError(error)
  return path
}

async function createSignedDownload(path: string) {
  const { data, error } = await supabase.storage.from('exports').createSignedUrl(path, 60 * 10)
  if (error) throw toAppError(error)
  return data.signedUrl
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function invokeGenerateMdb(jobId: string) {
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) throw new AppError('Tu sesión expiró. Vuelve a iniciar sesión.')

  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-mdb`
  const response = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    },
    body: JSON.stringify({ job_id: jobId }),
  })

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string
    ok?: boolean
    already_done?: boolean
    job?: ExportJob
    file_name?: string
    file_size_bytes?: number
  }

  if (!response.ok) {
    const message =
      payload.error ||
      'No se pudo generar el archivo MDB. Si el servicio estaba suspendido, espera unos segundos y reintenta.'
    const err = new AppError(message)
    ;(err as AppError & { retryable?: boolean }).retryable =
      response.status === 503 || message.toLowerCase().includes('cold_start')
    throw err
  }
  return payload
}

async function waitForJob(competitionId: string, jobId: string, timeoutMs = 180_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const rows = unwrap(
      await supabase
        .from('export_jobs')
        .select('*')
        .eq('competition_id', competitionId)
        .eq('id', jobId)
        .limit(1),
    )
    const job = rows[0]
    if (!job) throw new AppError('No se encontró el trabajo de exportación.')
    if (job.status === 'completed' && job.file_path) return job
    if (job.status === 'failed') {
      throw new AppError(job.last_error || 'La generación MDB falló.')
    }
    await sleep(3000)
  }
  throw new AppError(
    'La generación sigue en curso. Puedes reintentar; el trabajo persistente no se duplicará.',
  )
}

export function usePrepareAndGenerateExport(competitionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      format,
      teamId,
      onPhase,
    }: {
      format: ExportFormat
      teamId?: string
      onPhase?: (phase: ExportPhase) => void
    }) => {
      onPhase?.('validating')
      const prepared = unwrap(
        await supabase.rpc('prepare_export_job', {
          p_competition_id: competitionId,
          p_format: format,
          p_team_id: teamId || null,
        }),
      ) as unknown as { job: ExportJob; snapshot: ExportSnapshot }

      const { job, snapshot } = prepared
      const preflight = validateExportSnapshot(snapshot).filter((i) => i.level === 'error')
      if (preflight.length) {
        await supabase.rpc('fail_export_job', {
          p_job_id: job.id,
          p_errors: preflight as unknown as Json,
        })
        throw new AppError(preflight[0]?.message ?? 'La exportación no superó la validación.')
      }

      const code = snapshot.competition.code || 'COMP'
      const stamp = new Date().toISOString().slice(0, 10)
      const counts = countExportSnapshot(snapshot)

      try {
        if (format === 'csv_generic') {
          onPhase?.('generating')
          const csv = buildEntriesCsv(snapshot)
          const fileName = `${code}-inscripciones-${stamp}.csv`
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
          const path = await uploadExportFile(competitionId, job.id, fileName, blob)
          const completed = unwrap(
            await supabase.rpc('complete_export_job', {
              p_job_id: job.id,
              p_file_path: path,
              p_file_name: fileName,
              p_file_size_bytes: blob.size,
            }),
          ) as ExportJob
          downloadTextFile(fileName, csv, 'text/csv;charset=utf-8')
          onPhase?.('ready')
          return { job: completed, format, counts }
        }

        onPhase?.('preparing')
        // Durable path: Edge Function owns wake/retry/upload; client polls job rows.
        let lastError: unknown
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            onPhase?.('generating')
            const result = await invokeGenerateMdb(job.id)
            if (result.already_done && result.job) {
              onPhase?.('ready')
              return { job: result.job, format, counts }
            }
            const completed = await waitForJob(competitionId, job.id, 30_000)
            onPhase?.('ready')
            return { job: completed, format, counts }
          } catch (error) {
            lastError = error
            const retryable =
              error instanceof AppError &&
              (error as AppError & { retryable?: boolean }).retryable
            if (!retryable || attempt === 3) break
            await sleep(8000)
          }
        }

        // Final poll in case the function finished after a gateway timeout.
        try {
          const completed = await waitForJob(competitionId, job.id, 60_000)
          onPhase?.('ready')
          return { job: completed, format, counts }
        } catch {
          throw toAppError(lastError)
        }
      } catch (error) {
        if (!(error instanceof AppError)) {
          await supabase.rpc('fail_export_job', {
            p_job_id: job.id,
            p_errors: [
              {
                level: 'error',
                code: 'export_failed',
                message: toAppError(error).message,
              },
            ] as unknown as Json,
          })
        }
        onPhase?.('error')
        throw toAppError(error)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: exportKeys.jobs(competitionId) })
      qc.invalidateQueries({ queryKey: ['registrations'] })
    },
  })
}

export function useDownloadExportJob() {
  return useMutation({
    mutationFn: async (job: ExportJob) => {
      if (!job.file_path) throw new AppError('Esta exportación no tiene archivo disponible.')
      const url = await createSignedDownload(job.file_path)
      const res = await fetch(url)
      if (!res.ok) throw new AppError('No se pudo descargar el archivo.')
      const buffer = await res.arrayBuffer()
      const name = job.file_name ?? job.file_path.split('/').pop() ?? 'export.bin'
      const mime =
        job.format === 'mdb_meet_manager'
          ? 'application/vnd.ms-access'
          : 'text/csv;charset=utf-8'
      downloadBinaryFile(name, buffer, mime)
    },
  })
}

export function formatBytes(bytes: number | null | undefined) {
  if (bytes == null || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
