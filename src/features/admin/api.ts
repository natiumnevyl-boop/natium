import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type Enums } from '@/lib/supabase'
import { unwrap } from '@/lib/errors'

export function useAllProfiles(search: string) {
  return useQuery({
    queryKey: ['admin', 'profiles', search],
    queryFn: async () => {
      let q = supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)
      if (search.trim()) {
        const s = search.trim().replace(/[%,]/g, '')
        q = q.or(`full_name.ilike.%${s}%,email.ilike.%${s}%`)
      }
      return unwrap(await q)
    },
  })
}

export function useSetProfileRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, role }: { id: string; role: Enums<'app_role'> }) =>
      unwrap(await supabase.from('profiles').update({ role }).eq('id', id).select().single()),
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

export function useAdminCounts() {
  return useQuery({
    queryKey: ['admin', 'counts'],
    queryFn: async () => {
      const [p, coaches, organizers, o, t, a, c, r, failedExports] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'coach'),
        supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'organizer'),
        supabase.from('organizations').select('*', { count: 'exact', head: true }),
        supabase.from('teams').select('*', { count: 'exact', head: true }),
        supabase.from('athletes').select('*', { count: 'exact', head: true }),
        supabase.from('competitions').select('*', { count: 'exact', head: true }),
        supabase.from('registrations').select('*', { count: 'exact', head: true }),
        supabase
          .from('export_jobs')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'failed'),
      ])
      return {
        profiles: p.count ?? 0,
        coaches: coaches.count ?? 0,
        organizers: organizers.count ?? 0,
        organizations: o.count ?? 0,
        teams: t.count ?? 0,
        athletes: a.count ?? 0,
        competitions: c.count ?? 0,
        registrations: r.count ?? 0,
        failed_exports: failedExports.count ?? 0,
      }
    },
  })
}

export function useRecentExportJobs() {
  return useQuery({
    queryKey: ['admin', 'export_jobs', 'recent'],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('export_jobs')
          .select('id, status, file_name, format, created_at, competition_id, competition:competitions(name)')
          .order('created_at', { ascending: false })
          .limit(12),
      ),
  })
}
