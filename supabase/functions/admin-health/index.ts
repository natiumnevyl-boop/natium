// Server-side infrastructure probes for platform_admin only.
// Never exposes secrets. Uses anon key for Supabase API health (expected).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ProbeState =
  | 'operational'
  | 'slow'
  | 'starting'
  | 'auth_error'
  | 'unavailable'
  | 'unchecked'

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

async function probeUrl(
  id: string,
  label: string,
  url: string,
  init: RequestInit,
  opts?: { slowMs?: number; startingMs?: number },
): Promise<Probe> {
  const slowMs = opts?.slowMs ?? 3000
  const startingMs = opts?.startingMs ?? 8000
  const checked_at = new Date().toISOString()
  const t0 = performance.now()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20_000)
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
    return {
      id,
      label,
      state: ms >= 8000 ? 'starting' : 'unavailable',
      ok: false,
      http_status: null,
      ms,
      checked_at,
      detail: msg.includes('abort') ? 'Tiempo de espera agotado' : 'No disponible',
    }
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autenticado' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) return json({ error: 'No autenticado' }, 401)

    const { data: isAdmin, error: roleErr } = await userClient.rpc('is_platform_admin')
    if (roleErr) return json({ error: 'No se pudo verificar el rol' }, 500)
    if (!isAdmin) return json({ error: 'Se requiere administrador de plataforma' }, 403)

    const { data: exportStats, error: exportErr } = await userClient.rpc('admin_system_status')
    if (exportErr) return json({ error: exportErr.message }, 500)

    const exporterBase = (Deno.env.get('MDB_EXPORTER_URL') ?? '').replace(/\/$/, '')
    const siteUrl = Deno.env.get('SITE_URL') ?? 'https://natium-weld.vercel.app'

    const [supabaseApi, vercel, render] = await Promise.all([
      probeUrl(
        'supabase_api',
        'Supabase API',
        `${supabaseUrl}/auth/v1/health`,
        { method: 'GET', headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } },
        { slowMs: 1500 },
      ),
      probeUrl('vercel', 'Vercel', `${siteUrl}/`, { method: 'GET', headers: { Accept: 'text/html' } }),
      exporterBase
        ? probeUrl(
            'render_mdb',
            'Render MDB',
            `${exporterBase}/health`,
            { method: 'GET', headers: { Accept: 'application/json' } },
            { slowMs: 2500, startingMs: 6000 },
          )
        : Promise.resolve({
            id: 'render_mdb',
            label: 'Render MDB',
            state: 'unchecked' as ProbeState,
            ok: false,
            http_status: null,
            ms: 0,
            checked_at: new Date().toISOString(),
            detail: 'MDB_EXPORTER_URL no configurada',
          }),
    ])

    const dbProbe: Probe = {
      id: 'supabase_db',
      label: 'Supabase Database',
      state: 'operational',
      ok: true,
      http_status: 200,
      ms: 0,
      checked_at: new Date().toISOString(),
      detail: 'RPC administrativa respondió correctamente',
    }

    // Optional: verify exporter rejects unauthenticated generate (server-side only)
    let exporterAuth: Probe | null = null
    if (exporterBase) {
      const t0 = performance.now()
      try {
        const res = await fetch(`${exporterBase}/v1/generate-mdb`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
        const ms = Math.round(performance.now() - t0)
        const protectedOk = res.status === 401
        exporterAuth = {
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
        exporterAuth = {
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
    }

    return json({
      checked_at: new Date().toISOString(),
      exports: exportStats?.exports ?? null,
      supabase_rpc: exportStats?.supabase ?? null,
      services: [dbProbe, supabaseApi, vercel, render, ...(exporterAuth ? [exporterAuth] : [])],
    })
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      500,
    )
  }
})
