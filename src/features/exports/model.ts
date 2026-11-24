import type { Enums } from '@/lib/supabase'

/** Normalized export snapshot returned by prepare_export_job / get_competition_export_snapshot. */
export interface ExportCompetition {
  id: string
  name: string
  code: string
  venue: string | null
  city: string | null
  start_date: string
  end_date: string
  age_reference_date: string
  pool_course: Enums<'pool_course'>
  pool_length_m: number
  allow_no_time: boolean
}

export interface ExportTeam {
  id: string
  name: string
  short_name: string | null
  code: string | null
}

export interface ExportEvent {
  id: string
  event_number: number | null
  external_code: string | null
  sex: Enums<'athlete_sex'> | null
  distance_m: number
  stroke: Enums<'stroke'>
  name: string
}

export interface ExportAthlete {
  id: string
  team_id: string
  display_id: string
  first_name: string
  last_name: string
  birth_date: string
  sex: Enums<'athlete_sex'>
  registration_id: string
  registration_athlete_id: string
  category_id: string | null
  category_name: string | null
  category_code: string | null
}

export interface ExportEntry {
  id: string
  registration_id: string
  registration_athlete_id: string
  competition_event_id: string
  athlete_id: string
  team_id: string
  entry_time_cs: number | null
  no_time: boolean
}

export interface ExportRegistration {
  id: string
  team_id: string
  status: Enums<'registration_status'>
  folio: string | null
  submitted_at: string | null
  updated_at: string
}

export interface ExportSnapshot {
  competition: ExportCompetition
  registrations: ExportRegistration[]
  teams: ExportTeam[]
  events: ExportEvent[]
  athletes: ExportAthlete[]
  entries: ExportEntry[]
}

export type ExportFormat = 'csv_generic' | 'mdb_meet_manager'

export interface ExportJobSummary {
  teams?: number
  athletes?: number
  entries?: number
  registrations?: number
}

export interface ExportValidationIssue {
  level: 'error' | 'warning'
  code: string
  message: string
  registration_id?: string
  athlete_id?: string
  entry_id?: string
}

/** Payload accepted by the Jackcess Meet Manager writer. */
export interface MeetManagerPayload {
  competition: {
    name: string
    venue: string | null
    city: string | null
    startDate: string
    endDate: string
    ageReferenceDate: string
    poolCourse: string
    poolLengthM: number
  }
  teams: Array<{
    teamNo: number
    name: string
    shortName: string | null
    abbr: string
    code: string | null
  }>
  athletes: Array<{
    athNo: number
    teamNo: number
    compNo: number
    firstName: string
    lastName: string
    sex: string
    birthDate: string
    age: number
  }>
  events: Array<{
    eventNo: number
    eventPtr: number
    sex: string | null
    distanceM: number
    stroke: string
    lowAge: number
    highAge: number
    note: string
  }>
  entries: Array<{
    eventPtr: number
    athNo: number
    seedTimeSeconds: number | null
    course: string
    noTime: boolean
  }>
}
