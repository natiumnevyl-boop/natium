import { describe, expect, it } from 'vitest'
import { parseClientEnv } from './env'

describe('parseClientEnv', () => {
  it('accepts a real URL and a public anon key', () => {
    const result = parseClientEnv({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'public-anon-key',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.env.supabaseUrl).toBe('https://example.supabase.co')
    }
  })

  it('reports missing production variables instead of inventing them', () => {
    const result = parseClientEnv({})
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.join('\n')).toContain('VITE_SUPABASE_URL')
      expect(result.issues.join('\n')).toContain('VITE_SUPABASE_ANON_KEY')
    }
  })
})
