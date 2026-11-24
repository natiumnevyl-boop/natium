import { z } from 'zod'

const schema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(10, 'VITE_SUPABASE_ANON_KEY is required'),
})

export type ClientEnv = {
  supabaseUrl: string
  supabaseAnonKey: string
}

export function parseClientEnv(source: Record<string, unknown>):
  | { ok: true; env: ClientEnv }
  | { ok: false; issues: string[] } {
  const parsed = schema.safeParse(source)
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    }
  }
  return {
    ok: true,
    env: {
      supabaseUrl: parsed.data.VITE_SUPABASE_URL,
      supabaseAnonKey: parsed.data.VITE_SUPABASE_ANON_KEY,
    },
  }
}

const parsed = parseClientEnv(import.meta.env)

/** Present when the deployment is missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. */
export const envConfigError = parsed.ok ? null : parsed.issues.join('\n')

export const env: ClientEnv | null = parsed.ok ? parsed.env : null
