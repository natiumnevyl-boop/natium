// Server-side infrastructure probes for platform_admin only.
// Returns partial results: probe failures never wipe the whole payload.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

type ProbeState =
  | 'operational'
  | 'slow'
  | 'starting'
  | 'auth_error'
  | 'unavailable'
  | 'unchecked'
  | 'verify_error'

type Probe = {
  id: string
  label: string
  state: ProbeState
  ok: boolean
  http_status: number | null
  ms: number
  checked_at: string
  detail: string
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

async function probeUrl(
  id: string,
  label: string,
  url: string,
  init: RequestInit,
  opts?: { slowMs?: number; startingMs?: number; timeoutMs?: number },
): Promise<Probe> {
  const slowMs = opts?.slowMs ?? 3000
  const startingMs = opts?.startingMs ?? 8000
  const timeoutMs = opts?.timeoutMs ?? 12_000
  const checked_at = new Date().toISOString()
  const t0 = performance.now()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, { ...init, signal: controller.signal })
    clearTimeout(timer)
    const ms = Math.round(performance.now() - t0)
    let state: ProbeState = 'operational'
    if (!res.ok) {
      state = res.status === 401 || res.status === 403 ? 'auth_error' : 'unavailable'
    } else if (ms >= startingMs) {
      state = 'starting'
    } else if (ms >= slowMs) {
      state = 'slow'
    }
    return {
      id,
      label,
      state,
      ok: res.ok,
      http_status: res.status,
      ms,
      checked_at,
      detail: res.ok
        ? state === 'starting'
          ? 'Respuesta lenta (posible arranque en frío)'
          : state === 'slow'
            ? 'Operativo con latencia elevada'
            : 'Operativo'
        : `HTTP ${res.status}`,
    }
  } catch (err) {
    const ms = Math.round(performance.now() - t0)
    const msg = err instanceof Error ? err.message : 'error'
    const timedOut = /abort|timed out|TimeoutError/i.test(msg) || ms >= timeoutMs - 50
    return {
      id,
      label,
      state: timedOut && ms >= 5000 ? 'starting' : 'unavailable',
      ok: false,
      http_status: null,
      ms,
      checked_at,
      detail: timedOut ? 'Tiempo de espera agotado' : 'No disponible',
    }
  }
}

function extractJwt(authHeader: string | null): string | null {
  if (!authHeader) return null
  const m = authHeader.match(/^Bearer\s+(.+)$/i)
  return m?.[1]?.trim() || null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  const checked_at = new Date().toISOString()
  try {
    const authHeader = req.headers.get('Authorization')
    const jwt = extractJwt(authHeader)
    if (!jwt) return json({ error: 'No autenticado' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    if (!supabaseUrl || !anonKey) {
      return json({ error: 'Configuración incompleta del servidor' }, 500)
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Explicit JWT avoids edge-runtime getUser() session ambiguity.
    const { data: userData, error: userError } = await userClient.auth.getUser(jwt)
    if (userError || !userData.user) {
      return json(
        {
          error: 'No autenticado',
          detail: userError?.message ?? 'JWT inválido',
        },
        401,
      )
    }

    const { data: isAdmin, error: roleErr } = await userClient.rpc('is_platform_admin')
    if (roleErr) {
      return json({ error: 'No se pudo verificar el rol', detail: roleErr.message }, 500)
    }
    if (!isAdmin) {
      return json({ error: 'Se requiere administrador de plataforma' }, 403)
    }

    const exporterBase = (Deno.env.get('MDB_EXPORTER_URL') ?? '').replace(/\/$/, '')
    const siteUrl = Deno.env.get('SITE_URL') ?? 'https://natium-weld.vercel.app'

    const probePromise = Promise.all([
      probeUrl(
        'supabase_api',
        'Supabase API',
        `${supabaseUrl}/auth/v1/health`,
        { method: 'GET', headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } },
        { slowMs: 1500, timeoutMs: 8000 },
      ),
      probeUrl(
        'vercel',
        'Vercel',
        `${siteUrl}/`,
        { method: 'GET', headers: { Accept: 'text/html' } },
        { timeoutMs: 8000 },
      ),
      exporterBase
        ? probeUrl(
            'render_mdb',
            'Render MDB',
            `${exporterBase}/health`,
            { method: 'GET', headers: { Accept: 'application/json' } },
            { slowMs: 2500, startingMs: 6000, timeoutMs: 12_000 },
          )
        : Promise.resolve({
            id: 'render_mdb',
            label: 'Render MDB',
            state: 'unchecked' as ProbeState,
            ok: false,
            http_status: null,
            ms: 0,
            checked_at,
            detail: 'MDB_EXPORTER_URL no configurada',
          }),
    ])

    const authProbePromise = (async (): Promise<Probe | null> => {
      if (!exporterBase) return null
      const t0 = performance.now()
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 10_000)
        const res = await fetch(`${exporterBase}/v1/generate-mdb`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
          signal: controller.signal,
        })
        clearTimeout(timer)
        const ms = Math.round(performance.now() - t0)
        const protectedOk = res.status === 401
        return {
          id: 'render_mdb_auth',
          label: 'Render MDB (protección)',
          state: protectedOk ? 'operational' : 'auth_error',
          ok: protectedOk,
          http_status: res.status,
          ms,
          checked_at: new Date().toISOString(),
          detail: protectedOk
            ? 'Endpoint de generación protegido (401 sin token)'
            : `Se esperaba 401, se recibió ${res.status}`,
        }
      } catch (err) {
        return {
          id: 'render_mdb_auth',
          label: 'Render MDB (protección)',
          state: 'unavailable',
          ok: false,
          http_status: null,
          ms: Math.round(performance.now() - t0),
          checked_at: new Date().toISOString(),
          detail: err instanceof Error ? err.message : 'No disponible',
        }
      }
    })()

    const [probes, exporterAuth] = await Promise.all([probePromise, authProbePromise])
    const [supabaseApi, vercel, render] = probes

    const dbProbe: Probe = {
      id: 'supabase_db',
      label: 'Supabase Database',
      state: 'operational',
      ok: true,
      http_status: 200,
      ms: 0,
      checked_at,
      detail: 'Sesión administrativa verificada',
    }

    return json({
      checked_at: new Date().toISOString(),
      services: [dbProbe, supabaseApi, vercel, render, ...(exporterAuth ? [exporterAuth] : [])],
    })
  } catch (err) {
    return json(
      {
        error: err instanceof Error ? err.message : 'Error interno',
        checked_at,
        services: [],
      },
      500,
    )
  }
})
