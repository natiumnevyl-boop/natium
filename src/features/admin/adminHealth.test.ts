import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '@/lib/errors'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn() },
    rpc: vi.fn(),
  },
}))

import { invokeAdminHealth } from './api'

describe('invokeAdminHealth', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('returns services on HTTP 200', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        checked_at: '2026-11-24T00:00:00Z',
        services: [
          {
            id: 'vercel',
            label: 'Vercel',
            state: 'operational',
            ok: true,
            http_status: 200,
            ms: 40,
            checked_at: '2026-11-24T00:00:00Z',
            detail: 'Operativo',
          },
        ],
      }),
    }) as unknown as typeof fetch

    const res = await invokeAdminHealth('user-jwt')
    expect(res.services).toHaveLength(1)
    expect(res.services[0]?.state).toBe('operational')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/functions/v1/admin-health'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer user-jwt' }),
      }),
    )
  })

  it('maps 401 to AppError', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'No autenticado' }),
    }) as unknown as typeof fetch
    await expect(invokeAdminHealth('bad')).rejects.toBeInstanceOf(AppError)
    await expect(invokeAdminHealth('bad')).rejects.toThrow(/No autenticado/)
  })

  it('maps 403 to AppError', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Se requiere administrador de plataforma' }),
    }) as unknown as typeof fetch
    await expect(invokeAdminHealth('user')).rejects.toThrow(/administrador/)
  })

  it('maps 500 to AppError', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Error interno' }),
    }) as unknown as typeof fetch
    await expect(invokeAdminHealth('user')).rejects.toThrow(/Error interno/)
  })

  it('maps network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch')) as unknown as typeof fetch
    await expect(invokeAdminHealth('user')).rejects.toThrow(/conectar/)
  })

  it('maps timeout/abort', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('The operation was aborted')) as unknown as typeof fetch
    await expect(invokeAdminHealth('user')).rejects.toThrow(/Tiempo de espera/)
  })

  it('maps unexpected empty error body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({}),
    }) as unknown as typeof fetch
    await expect(invokeAdminHealth('user')).rejects.toThrow(/HTTP 502/)
  })

  it('accepts starting state for Render without failing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        checked_at: '2026-11-24T00:00:00Z',
        services: [
          {
            id: 'render_mdb',
            label: 'Render MDB',
            state: 'starting',
            ok: true,
            http_status: 200,
            ms: 9000,
            checked_at: '2026-11-24T00:00:00Z',
            detail: 'Respuesta lenta (posible arranque en frío)',
          },
          {
            id: 'vercel',
            label: 'Vercel',
            state: 'operational',
            ok: true,
            http_status: 200,
            ms: 50,
            checked_at: '2026-11-24T00:00:00Z',
            detail: 'Operativo',
          },
        ],
      }),
    }) as unknown as typeof fetch
    const res = await invokeAdminHealth('user-jwt')
    expect(res.services.find((s) => s.id === 'render_mdb')?.state).toBe('starting')
    expect(res.services.find((s) => s.id === 'vercel')?.ok).toBe(true)
  })
})
