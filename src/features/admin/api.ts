import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type Enums } from '@/lib/supabase'
import { AppError, unwrap } from '@/lib/errors'

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

export type HealthProbeState =
  | 'operational'
  | 'slow'
  | 'starting'
  | 'auth_error'
  | 'unavailable'
  | 'unchecked'
  | 'checking'

export interface HealthProbe {
  id: string
  label: string
  state: HealthProbeState
  ok: boolean
  http_status: number | null
  ms: number
  checked_at: string
  detail: string
}

export interface AdminHealthResponse {
  checked_at: string
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
  } | null
  supabase_rpc: { ok: boolean; detail: string } | null
  services: HealthProbe[]
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

async function invokeAdminHealth(): Promise<AdminHealthResponse> {
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) throw new AppError('Tu sesión expiró. Vuelve a iniciar sesión.')

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-health`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    },
  })

  const body = (await res.json().catch(() => ({}))) as AdminHealthResponse & { error?: string }
  if (!res.ok) {
    throw new AppError(body.error || 'No se pudo verificar la infraestructura.')
  }
  return body
}

export function useAdminSystemStatus() {
  return useQuery({
    queryKey: ['admin', 'system'],
    refetchInterval: 120_000,
    staleTime: 60_000,
    queryFn: invokeAdminHealth,
  })
}

export type AdminOrgRow = {
  id: string
  name: string
  slug: string
  city: string | null
  state: string | null
  is_active: boolean
  created_at: string
}

export type AdminTeamRow = {
  id: string
  name: string
  short_name: string
  city: string | null
  state: string | null
  is_active: boolean
  created_at: string
}

export type AdminAthleteRow = {
  id: string
  display_id: string
  first_name: string
  last_name: string
  birth_date: string
  sex: Enums<'athlete_sex'>
  status: Enums<'record_status'>
  created_at: string
  team: { id: string; name: string } | null
}

export type AdminCompetitionRow = {
  id: string
  name: string
  code: string
  status: Enums<'competition_status'>
  start_date: string
  end_date: string
  city: string | null
  created_at: string
  organization: { id: string; name: string } | null
}

export type AdminRegistrationRow = {
  id: string
  folio: string | null
  status: Enums<'registration_status'>
  submitted_at: string | null
  created_at: string
  competition: { id: string; name: string } | null
  team: { id: string; name: string } | null
}

export type AdminExportRow = {
  id: string
  format: string
  status: Enums<'export_status'>
  created_at: string
  completed_at: string | null
  competition: { id: string; name: string } | null
}

export function useAdminOrganizations(page: number, pageSize = 50) {
  return useQuery({
    queryKey: ['admin', 'organizations', page],
    queryFn: async () => {
      const res = await supabase
        .from('organizations')
        .select('id, name, slug, city, state, is_active, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)
      if (res.error) throw res.error
      return { rows: res.data as AdminOrgRow[], total: res.count ?? 0 }
    },
  })
}

export function useAdminTeams(page: number, pageSize = 50) {
  return useQuery({
    queryKey: ['admin', 'teams', page],
    queryFn: async () => {
      const res = await supabase
        .from('teams')
        .select('id, name, short_name, city, state, is_active, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)
      if (res.error) throw res.error
      return { rows: res.data as AdminTeamRow[], total: res.count ?? 0 }
    },
  })
}

export function useAdminAthletes(page: number, pageSize = 50) {
  return useQuery({
    queryKey: ['admin', 'athletes', page],
    queryFn: async () => {
      const res = await supabase
        .from('athletes')
        .select(
          'id, display_id, first_name, last_name, birth_date, sex, status, created_at, team:teams(id, name)',
          { count: 'exact' },
        )
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)
      if (res.error) throw res.error
      return { rows: res.data as unknown as AdminAthleteRow[], total: res.count ?? 0 }
    },
  })
}

export function useAdminCompetitions(page: number, pageSize = 50) {
  return useQuery({
    queryKey: ['admin', 'competitions', page],
    queryFn: async () => {
      const res = await supabase
        .from('competitions')
        .select(
          'id, name, code, status, start_date, end_date, city, created_at, organization:organizations(id, name)',
          { count: 'exact' },
        )
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)
      if (res.error) throw res.error
      return { rows: res.data as unknown as AdminCompetitionRow[], total: res.count ?? 0 }
    },
  })
}

export function useAdminRegistrations(page: number, pageSize = 50) {
  return useQuery({
    queryKey: ['admin', 'registrations', page],
    queryFn: async () => {
      const res = await supabase
        .from('registrations')
        .select(
          'id, folio, status, submitted_at, created_at, competition:competitions(id, name), team:teams(id, name)',
          { count: 'exact' },
        )
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)
      if (res.error) throw res.error
      return { rows: res.data as unknown as AdminRegistrationRow[], total: res.count ?? 0 }
    },
  })
}

export function useAdminExports(page: number, pageSize = 50, format?: string) {
  return useQuery({
    queryKey: ['admin', 'exports', page, format ?? ''],
    queryFn: async () => {
      let q = supabase
        .from('export_jobs')
        .select(
          'id, format, status, created_at, completed_at, competition:competitions(id, name)',
          { count: 'exact' },
        )
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)
      if (format) q = q.eq('format', format)
      const res = await q
      if (res.error) throw res.error
      return { rows: res.data as unknown as AdminExportRow[], total: res.count ?? 0 }
    },
  })
}
