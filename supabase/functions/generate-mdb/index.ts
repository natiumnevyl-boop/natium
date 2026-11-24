// Generates Meet Manager MDB via the Jackcess microservice.
// Secrets (never VITE_*): MDB_EXPORTER_URL, MDB_EXPORTER_TOKEN
// Body: { job_id: string } — snapshot is loaded from export_jobs (durable across cold starts).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Snapshot = {
  competition: {
    id: string
    name: string
    code: string
    venue: string | null
    city: string | null
    start_date: string
    end_date: string
    age_reference_date: string
    pool_course: string
    pool_length_m: number
  }
  teams: Array<{ id: string; name: string; short_name: string | null; code: string | null }>
  athletes: Array<{
    id: string
    team_id: string
    first_name: string
    last_name: string
    birth_date: string
    sex: string
  }>
  events: Array<{
    id: string
    event_number: number | null
    external_code: string | null
    sex: string | null
    distance_m: number
    stroke: string
    name: string
  }>
  entries: Array<{
    competition_event_id: string
    athlete_id: string
    entry_time_cs: number | null
    no_time: boolean
  }>
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const exporterUrl = Deno.env.get('MDB_EXPORTER_URL')
    const exporterToken = Deno.env.get('MDB_EXPORTER_TOKEN')
    if (!exporterUrl || !exporterToken) {
      return json(
        {
          error:
            'El servicio MDB no está configurado. Define MDB_EXPORTER_URL y MDB_EXPORTER_TOKEN.',
        },
        503,
      )
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autenticado' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) return json({ error: 'No autenticado' }, 401)

    const body = await req.json()
    const jobId = body?.job_id as string | undefined
    if (!jobId) return json({ error: 'job_id requerido' }, 400)

    const { data: claimed, error: claimError } = await userClient.rpc('claim_export_job', {
      p_job_id: jobId,
    })
    if (claimError) {
      return json({ error: claimError.message || 'No se pudo reclamar la exportación' }, 400)
    }

    const claim = claimed as {
      already_done?: boolean
      job?: { id: string; competition_id: string; file_path?: string; file_name?: string }
      snapshot?: Snapshot
    }

    if (claim.already_done) {
      return json({ ok: true, already_done: true, job: claim.job }, 200)
    }

    const snapshot = claim.snapshot
    if (!snapshot) return json({ error: 'Snapshot ausente' }, 500)

    const payload = toMeetManagerPayload(snapshot)
    const base = exporterUrl.replace(/\/$/, '')

    // Wake cold Render Free instances without a keep-alive ping loop.
    await wakeExporter(base)

    const bytes = await generateWithRetry(base, exporterToken, payload)
    if (!bytes || bytes.byteLength < 1024) {
      await userClient.rpc('fail_export_job', {
        p_job_id: jobId,
        p_errors: [{ level: 'error', code: 'empty_mdb', message: 'El archivo MDB generado está vacío.' }],
      })
      return json({ error: 'El archivo MDB generado está vacío.' }, 502)
    }

    const competitionId = claim.job?.competition_id
    if (!competitionId) return json({ error: 'Competencia ausente en el trabajo' }, 500)

    const stamp = new Date().toISOString().slice(0, 10)
    const code = snapshot.competition.code || 'COMP'
    const fileName = `${code}-inscripciones-${stamp}.mdb`
    const path = `${competitionId}/${jobId}/${fileName}`

    const admin = createClient(supabaseUrl, serviceKey || anonKey)
    const { error: uploadError } = await admin.storage.from('exports').upload(path, bytes, {
      upsert: true,
      contentType: 'application/vnd.ms-access',
    })
    if (uploadError) {
      await userClient.rpc('fail_export_job', {
        p_job_id: jobId,
        p_errors: [
          {
            level: 'error',
            code: 'upload_failed',
            message: 'No se pudo guardar el archivo en almacenamiento privado.',
          },
        ],
      })
      return json({ error: 'No se pudo guardar el archivo.' }, 500)
    }

    const { data: completed, error: completeError } = await userClient.rpc('complete_export_job', {
      p_job_id: jobId,
      p_file_path: path,
      p_file_name: fileName,
      p_file_size_bytes: bytes.byteLength,
    })
    if (completeError) {
      return json({ error: completeError.message || 'No se pudo completar la exportación' }, 500)
    }

    return json(
      {
        ok: true,
        job: completed,
        file_name: fileName,
        file_size_bytes: bytes.byteLength,
      },
      200,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return json({ error: message }, message.includes('cold_start') ? 503 : 500)
  }
})

async function wakeExporter(base: string) {
  try {
    await fetchWithTimeout(`${base}/health`, { method: 'GET' }, 45_000)
  } catch {
    // First wake often fails while Render boots; generation retry handles it.
  }
}

async function generateWithRetry(
  base: string,
  token: string,
  payload: unknown,
): Promise<Uint8Array> {
  let lastError = 'generation_failed'
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (attempt > 1) await sleep(Math.min(15_000, attempt * 5_000))
      const response = await fetchWithTimeout(
        `${base}/v1/generate-mdb`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        },
        90_000,
      )
      if (response.status === 401) throw new Error('Token del generador MDB inválido')
      if (response.status === 429) {
        lastError = 'cold_start_or_busy'
        continue
      }
      if (!response.ok) {
        lastError = `generator_http_${response.status}`
        continue
      }
      const buffer = new Uint8Array(await response.arrayBuffer())
      if (buffer.byteLength >= 1024) return buffer
      lastError = 'empty_mdb'
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'cold_start'
    }
  }
  throw new Error(
    lastError.includes('cold_start') || lastError.includes('fetch')
      ? 'cold_start: el generador aún está despertando. Reintenta en unos segundos.'
      : 'No se pudo generar el archivo MDB.',
  )
}

function toMeetManagerPayload(snapshot: Snapshot) {
  const strokeMap: Record<string, string> = {
    free: 'A',
    back: 'B',
    breast: 'C',
    fly: 'D',
    medley: 'E',
  }
  const teamNoById = new Map<string, number>()
  snapshot.teams.forEach((team, index) => teamNoById.set(team.id, 1000 + index + 1))
  const athNoById = new Map<string, number>()
  snapshot.athletes.forEach((athlete, index) => athNoById.set(athlete.id, 5000 + index + 1))
  const eventPtrById = new Map<string, number>()
  snapshot.events.forEach((event, index) => {
    const eventNo = event.event_number && event.event_number > 0 ? event.event_number : index + 1
    eventPtrById.set(event.id, 1000 + eventNo)
  })
  const course = snapshot.competition.pool_course === 'LCM' ? 'L' : 'S'
  const ageRef = snapshot.competition.age_reference_date

  return {
    competition: {
      name: snapshot.competition.name,
      venue: snapshot.competition.venue,
      city: snapshot.competition.city,
      startDate: snapshot.competition.start_date,
      endDate: snapshot.competition.end_date,
      ageReferenceDate: ageRef,
      poolCourse: snapshot.competition.pool_course,
      poolLengthM: snapshot.competition.pool_length_m,
    },
    teams: snapshot.teams.map((team) => ({
      teamNo: teamNoById.get(team.id),
      name: team.name,
      shortName: team.short_name,
      abbr: (team.code || team.short_name || team.name || 'TEAM').replace(/\s+/g, '').slice(0, 5).toUpperCase(),
      code: team.code,
    })),
    athletes: snapshot.athletes.map((athlete, index) => ({
      athNo: athNoById.get(athlete.id),
      teamNo: teamNoById.get(athlete.team_id),
      compNo: index + 1,
      firstName: athlete.first_name,
      lastName: athlete.last_name,
      sex: athlete.sex,
      birthDate: athlete.birth_date,
      age: ageOn(athlete.birth_date, ageRef),
    })),
    events: snapshot.events.map((event, index) => {
      const eventNo = event.event_number && event.event_number > 0 ? event.event_number : index + 1
      return {
        eventNo,
        eventPtr: eventPtrById.get(event.id),
        sex: event.sex,
        distanceM: event.distance_m,
        stroke: strokeMap[event.stroke] ?? event.stroke,
        lowAge: 0,
        highAge: 109,
        note: event.external_code ?? event.name,
      }
    }),
    entries: snapshot.entries.map((entry) => ({
      eventPtr: eventPtrById.get(entry.competition_event_id),
      athNo: athNoById.get(entry.athlete_id),
      seedTimeSeconds: entry.no_time || entry.entry_time_cs == null ? null : entry.entry_time_cs / 100,
      course,
      noTime: entry.no_time || entry.entry_time_cs == null,
    })),
  }
}

function ageOn(birthDate: string, referenceDate: string) {
  const birth = new Date(birthDate.slice(0, 10) + 'T00:00:00Z')
  const ref = new Date(referenceDate.slice(0, 10) + 'T00:00:00Z')
  let age = ref.getUTCFullYear() - birth.getUTCFullYear()
  const m = ref.getUTCMonth() - birth.getUTCMonth()
  if (m < 0 || (m === 0 && ref.getUTCDate() < birth.getUTCDate())) age--
  return Math.max(0, age)
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
