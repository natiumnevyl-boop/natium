import { useQuery } from '@tanstack/react-query'
import { supabase, type Enums } from '@/lib/supabase'
import { unwrap } from '@/lib/errors'

export interface PublicCompetitionPayload {
  competition: {
    id: string
    name: string
    code: string
    description: string | null
    requirements: string | null
    start_date: string
    end_date: string
    venue: string | null
    city: string | null
    registration_opens_at: string
    registration_closes_at: string
    pool_course: Enums<'pool_course'>
    pool_length_m: number
    age_reference_date: string | null
    max_entries_per_athlete: number | null
    allow_no_time: boolean
    status: Enums<'competition_status'>
    cover_image_url: string | null
    logo_path: string | null
  }
  organization: {
    name: string
    official_name?: string
    city: string | null
    slug: string
    website_url?: string | null
    logo_path?: string | null
    social_links?: Record<string, string>
  }
  categories: {
    id: string
    name: string
    code: string | null
    sex: Enums<'athlete_sex'> | null
    min_age: number
    max_age: number
    sort_order: number
  }[]
  events: {
    id: string
    event_number: number | null
    sex: Enums<'athlete_sex'> | null
    is_active: boolean
    name: string
    distance_m: number
    stroke: Enums<'stroke'>
  }[]
}

export function usePublicCompetition(competitionId: string | undefined) {
  return useQuery({
    queryKey: ['competitions', 'public', competitionId],
    enabled: !!competitionId,
    queryFn: async () => {
      const data = unwrap(
        await supabase.rpc('get_public_competition', {
          p_competition_id: competitionId!,
        }),
      )
      return (data as unknown as PublicCompetitionPayload | null) ?? null
    },
  })
}

export function publicCompetitionUrl(competitionId: string) {
  if (typeof window === 'undefined') return `/c/${competitionId}`
  return `${window.location.origin}/c/${competitionId}`
}

export function whatsappShareUrl(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

export function registrationWindowFromDates(
  opensAt: string,
  closesAt: string,
  status: Enums<'competition_status'>,
) {
  if (status === 'closed' || status === 'finished') return 'closed' as const
  const now = Date.now()
  const opens = new Date(opensAt).getTime()
  const closes = new Date(closesAt).getTime()
  if (now < opens) return 'upcoming' as const
  if (now > closes) return 'closed' as const
  return 'open' as const
}
