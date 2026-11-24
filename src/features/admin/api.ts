import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type Enums } from '@/lib/supabase'
import { unwrap } from '@/lib/errors'

export type AccountStatus = 'active' | 'suspended'

export interface AdminDashboardStats {
  totals: {
    users: number
    users_new: number
    coaches: number
    organizers: number
    admins: number
    suspended: number
    organizations: number
    teams: number
    athletes: number
    competitions: number
    registrations: number
    exports_total: number
    exports_mdb: number
    exports_csv: number
    exports_failed: number
    exports_completed: number
  }
  series: { day: string; users: number; registrations: number; exports: number }[]
  recent_audit: {
    id: number
    action: string
    entity: string
    entity_id: string | null
    created_at: string
    metadata: Record<string, unknown> | null
    actor_name: string | null
    actor_email: string | null
  }[]
  range: { from: string; to: string }
}

export interface AdminUserRow {
  id: string
  email: string
  full_name: string
  role: Enums<'app_role'>
  account_status: AccountStatus
  created_at: string
  updated_at: string
  last_sign_in_at: string | null
  email_confirmed: boolean
  teams_count: number
  organizations_count: number
}

export interface AdminUserDetail {
  profile: AdminUserRow & { email_confirmed: boolean }
  teams: { id: string; name: string; role: string; status: string }[]
  organizations: { id: string; name: string; role: string }[]
  competitions: { id: string; name: string; status: string; start_date: string }[]
  recent_actions: {
    id: number
    action: string
    entity: string
    entity_id: string | null
    created_at: string
    metadata: Record<string, unknown> | null
  }[]
}

export interface AdminSystemStatus {
  checked_at: string
  supabase: { ok: boolean; detail: string }
  exports: {
    pending: number
    processing: number
    completed: number
    failed: number
    recent_failures: {
      id: string
      competition_id: string
      format: string | null
      created_at: string
      error_report: unknown
    }[]
  }
}

export function useAdminDashboardStats(fromIso: string, toIso: string) {
  return useQuery({
    queryKey: ['admin', 'dashboard', fromIso, toIso],
    queryFn: async () =>
      unwrap(
        await supabase.rpc('admin_dashboard_stats', {
          p_from: fromIso,
          p_to: toIso,
        }),
      ) as unknown as AdminDashboardStats,
  })
}

export function useAdminUsers(opts: {
  search: string
  role: Enums<'app_role'> | ''
  status: AccountStatus | ''
  page: number
  pageSize?: number
}) {
  const pageSize = opts.pageSize ?? 50
  return useQuery({
    queryKey: ['admin', 'users', opts],
    queryFn: async () => {
      const data = unwrap(
        await supabase.rpc('admin_list_users', {
          p_search: opts.search.trim() || null,
          p_role: opts.role || null,
          p_status: opts.status || null,
          p_limit: pageSize,
          p_offset: (opts.page - 1) * pageSize,
        }),
      ) as unknown as { total: number; rows: AdminUserRow[] }
      return data
    },
  })
}

export function useAdminUserDetail(userId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'user', userId],
    enabled: !!userId,
    queryFn: async () =>
      unwrap(
        await supabase.rpc('admin_user_detail', { p_user_id: userId! }),
      ) as unknown as AdminUserDetail,
  })
}

export function useSetProfileRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, role }: { id: string; role: Enums<'app_role'> }) =>
      unwrap(
        await supabase.rpc('admin_set_profile_role', {
          p_user_id: id,
          p_role: role,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  })
}

export function useSetAccountStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      status,
      reason,
    }: {
      id: string
      status: AccountStatus
      reason?: string
    }) =>
      unwrap(
        await supabase.rpc('admin_set_account_status', {
          p_user_id: id,
          p_status: status,
          p_reason: reason ?? null,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  })
}

export function useAuditLogs(entity: string, page: number, pageSize = 50) {
  return useQuery({
    queryKey: ['admin', 'audit', entity, page],
    queryFn: async () => {
      let q = supabase
        .from('audit_logs')
        .select('*, actor:profiles(full_name, email)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)
      if (entity) q = q.eq('entity', entity)
      const res = await q
      if (res.error) throw res.error
      return { rows: res.data, total: res.count ?? 0 }
    },
  })
}

export function useAdminSystemStatus() {
  return useQuery({
    queryKey: ['admin', 'system'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const db = unwrap(await supabase.rpc('admin_system_status')) as unknown as AdminSystemStatus

      const probe = async (label: string, url: string) => {
        const t0 = performance.now()
        try {
          const res = await fetch(url, { method: 'GET', mode: 'cors' })
          return {
            label,
            ok: res.ok,
            ms: Math.round(performance.now() - t0),
            detail: `${res.status}`,
          }
        } catch (err) {
          return {
            label,
            ok: false,
            ms: Math.round(performance.now() - t0),
            detail: err instanceof Error ? err.message : 'error',
          }
        }
      }

      const [vercel, render, supabaseRest] = await Promise.all([
        probe('Vercel', 'https://natium-weld.vercel.app/'),
        probe('Render MDB', 'https://natium-mdb-exporter.onrender.com/health'),
        probe(
          'Supabase API',
          `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/health`,
        ),
      ])

      return { db, probes: [supabaseRest, vercel, render] }
    },
  })
}

