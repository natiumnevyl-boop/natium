// Proxies Meet Manager MDB generation to the optional Jackcess service.
// Secrets: MDB_EXPORTER_URL, MDB_EXPORTER_TOKEN (never exposed to the browser).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
            'El servicio MDB no está configurado. Define MDB_EXPORTER_URL y MDB_EXPORTER_TOKEN en los secretos de la función.',
        },
        503,
      )
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autenticado' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) return json({ error: 'No autenticado' }, 401)

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .maybeSingle()
    if (!profile || (profile.role !== 'organizer' && profile.role !== 'platform_admin')) {
      return json({ error: 'Sin permiso para generar exportaciones' }, 403)
    }

    const payload = await req.json()
    const response = await fetch(`${exporterUrl.replace(/\/$/, '')}/v1/generate-mdb`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${exporterToken}`,
      },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      const detail = await response.text()
      return json({ error: 'Error del generador MDB', detail: detail.slice(0, 500) }, 502)
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    return new Response(bytes, {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'application/x-msaccess',
        'Content-Disposition': 'attachment; filename="inscripciones.mdb"',
      },
    })
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      500,
    )
  }
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
