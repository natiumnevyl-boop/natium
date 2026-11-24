import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type Json, type Tables } from '@/lib/supabase'
import { AppError, toAppError, unwrap } from '@/lib/errors'
import { buildEntriesCsv, downloadBinaryFile, downloadTextFile } from './adapters/csv'
import { toMeetManagerPayload } from './mapping'
import type { ExportFormat, ExportSnapshot } from './model'
import { countExportSnapshot, validateExportSnapshot } from './validation'

export type ExportJob = Tables<'export_jobs'>

export const exportKeys = {
  all: ['exports'] as const,
  jobs: (competitionId: string) => [...exportKeys.all, 'jobs', competitionId] as const,
  snapshot: (competitionId: string, teamId?: string) =>
    [...exportKeys.all, 'snapshot', competitionId, teamId ?? 'all'] as const,
}

export function useExportJobs(competitionId: string | undefined) {
  return useQuery({
    queryKey: exportKeys.jobs(competitionId ?? ''),
    enabled: !!competitionId,
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

export function usePrepareAndGenerateExport(competitionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      format,
      teamId,
    }: {
      format: ExportFormat
      teamId?: string
    }) => {
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

      try {
        if (format === 'csv_generic') {
          const csv = buildEntriesCsv(snapshot)
          const fileName = `${code}-inscripciones-${stamp}.csv`
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
          const path = await uploadExportFile(competitionId, job.id, fileName, blob)
          const completed = unwrap(
            await supabase.rpc('complete_export_job', {
              p_job_id: job.id,
              p_file_path: path,
              p_file_name: fileName,
            }),
          ) as ExportJob
          downloadTextFile(fileName, csv, 'text/csv;charset=utf-8')
          return { job: completed, format, counts: countExportSnapshot(snapshot) }
        }

        // MDB: Edge Function proxies to Jackcess; the service token never enters the browser.
        const payload = toMeetManagerPayload(snapshot)
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
          body: JSON.stringify(payload),
        })
        if (!response.ok) {
          let message =
            'El formato MDB requiere el servicio de generación (Jackcess). Mientras tanto puedes exportar CSV.'
          try {
            const errJson = (await response.json()) as { error?: string }
            if (errJson.error) message = errJson.error
          } catch {
            /* keep default */
          }
          await supabase.rpc('fail_export_job', {
            p_job_id: job.id,
            p_errors: [
              {
                level: 'error',
                code: 'mdb_generation_failed',
                message: message.slice(0, 300),
              },
            ] as unknown as Json,
          })
          throw new AppError(message)
        }
        const buffer = await response.arrayBuffer()
        const fileName = `${code}-inscripciones-${stamp}.mdb`
        const blob = new Blob([buffer], { type: 'application/x-msaccess' })
        const path = await uploadExportFile(competitionId, job.id, fileName, blob)
        const completed = unwrap(
          await supabase.rpc('complete_export_job', {
            p_job_id: job.id,
            p_file_path: path,
            p_file_name: fileName,
          }),
        ) as ExportJob
        downloadBinaryFile(fileName, buffer, 'application/x-msaccess')
        return { job: completed, format, counts: countExportSnapshot(snapshot) }
      } catch (error) {
        if (error instanceof AppError) throw error
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
          ? 'application/x-msaccess'
          : 'text/csv;charset=utf-8'
      downloadBinaryFile(name, buffer, mime)
    },
  })
}
