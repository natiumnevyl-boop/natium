import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '@/lib/errors'

const getUser = vi.fn()
const getSession = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => getUser(...args),
      getSession: (...args: unknown[]) => getSession(...args),
    },
    rpc: vi.fn(),
  },
}))

import {
  buildAuditListArgs,
  compactRpcArgs,
  invokeAdminHealth,
  resolveUserAccessToken,
} from './api'

describe('compactRpcArgs', () => {
  it('omits null, undefined and empty strings', () => {
    expect(
      compactRpcArgs({
        p_search: null,
        p_actor_id: '',
        p_action: undefined,
        p_limit: 15,
        p_offset: 0,
        p_category: 'admin',
      }),
    ).toEqual({ p_limit: 15, p_offset: 0, p_category: 'admin' })
  })
})

describe('buildAuditListArgs', () => {
  it('sends only limit/offset for the default unfiltered page', () => {
    expect(
      buildAuditListArgs({
        search: '',
        from: '',
        to: '',
        actorId: '',
        action: '',
        entity: '',
        result: '',
        category: 'all',
        page: 1,
        pageSize: 15,
      }),
    ).toEqual({ p_limit: 15, p_offset: 0 })
  })

  it('includes actor id as text when provided', () => {
    const args = buildAuditListArgs({
      search: '',
      from: '',
      to: '',
      actorId: '11111111-1111-1111-1111-111111111111',
      action: '',
      entity: '',
      result: '',
      category: 'all',
      page: 2,
      pageSize: 25,
    })
    expect(args).toEqual({
      p_actor_id: '11111111-1111-1111-1111-111111111111',
      p_limit: 25,
      p_offset: 25,
    })
  })
})

describe('resolveUserAccessToken', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('refreshes via getUser then returns session access_token', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    getSession.mockResolvedValue({
      data: { session: { access_token: 'user-jwt' } },
      error: null,
    })
    await expect(resolveUserAccessToken()).resolves.toBe('user-jwt')
  })

  it('rejects when there is no authenticated user', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } })
    await expect(resolveUserAccessToken()).rejects.toBeInstanceOf(AppError)
  })
})

describe('invokeAdminHealth', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('returns services on HTTP 200 with user Bearer token (not anon)', async () => {
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
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer user-jwt' }),
      }),
    )
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const headers = (call?.[1] as { headers: Record<string, string> } | undefined)?.headers
    expect(headers?.Authorization).toBe('Bearer user-jwt')
    expect(headers?.apikey).toBeTruthy()
    expect(headers?.Authorization).not.toBe(`Bearer ${headers?.apikey}`)
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
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error('The operation was aborted')) as unknown as typeof fetch
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
