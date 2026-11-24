import { differenceInYears, parseISO } from 'date-fns'
import type { ExportSnapshot, MeetManagerPayload } from './model'

const STROKE_TO_HYTEK: Record<string, string> = {
  free: 'A',
  back: 'B',
  breast: 'C',
  fly: 'D',
  medley: 'E',
}

export function csToHyTekSeconds(cs: number | null | undefined): number | null {
  if (cs == null) return null
  return cs / 100
}

export function poolCourseToEntryCourse(course: string): string {
  return course === 'LCM' ? 'L' : 'S'
}

function abbreviate(team: { code: string | null; short_name: string | null; name: string }): string {
  const raw = (team.code || team.short_name || team.name || 'TEAM').replace(/\s+/g, '')
  return raw.slice(0, 5).toUpperCase()
}

function ageOn(birthDate: string, referenceDate: string): number {
  return Math.max(0, differenceInYears(parseISO(referenceDate), parseISO(birthDate)))
}

/** Build the Jackcess JSON payload from a Supabase export snapshot. */
export function toMeetManagerPayload(snapshot: ExportSnapshot): MeetManagerPayload {
  const teamNoById = new Map<string, number>()
  snapshot.teams.forEach((team, index) => {
    teamNoById.set(team.id, 1000 + index + 1)
  })

  const athNoById = new Map<string, number>()
  snapshot.athletes.forEach((athlete, index) => {
    athNoById.set(athlete.id, 5000 + index + 1)
  })

  const eventPtrById = new Map<string, number>()
  snapshot.events.forEach((event, index) => {
    const eventNo = event.event_number && event.event_number > 0 ? event.event_number : index + 1
    eventPtrById.set(event.id, 1000 + eventNo)
  })

  const course = poolCourseToEntryCourse(snapshot.competition.pool_course)
  const ageRef = snapshot.competition.age_reference_date

  return {
    competition: {
      name: snapshot.competition.name,
      venue: snapshot.competition.venue,
      city: snapshot.competition.city,
      startDate: snapshot.competition.start_date,
      endDate: snapshot.competition.end_date,
      ageReferenceDate: ageRef,
      poolCourse: snapshot.competition.pool_course,
      poolLengthM: snapshot.competition.pool_length_m,
    },
    teams: snapshot.teams.map((team) => ({
      teamNo: teamNoById.get(team.id)!,
      name: team.name,
      shortName: team.short_name,
      abbr: abbreviate(team),
      code: team.code,
    })),
    athletes: snapshot.athletes.map((athlete, index) => ({
      athNo: athNoById.get(athlete.id)!,
      teamNo: teamNoById.get(athlete.team_id)!,
      compNo: index + 1,
      firstName: athlete.first_name,
      lastName: athlete.last_name,
      sex: athlete.sex,
      birthDate: athlete.birth_date,
      age: ageOn(athlete.birth_date, ageRef),
    })),
    events: snapshot.events.map((event, index) => {
      const eventNo = event.event_number && event.event_number > 0 ? event.event_number : index + 1
      return {
        eventNo,
        eventPtr: eventPtrById.get(event.id)!,
        sex: event.sex,
        distanceM: event.distance_m,
        stroke: STROKE_TO_HYTEK[event.stroke] ?? event.stroke,
        lowAge: 0,
        highAge: 109,
        note: event.external_code ?? event.name,
      }
    }),
    entries: snapshot.entries.map((entry) => ({
      eventPtr: eventPtrById.get(entry.competition_event_id)!,
      athNo: athNoById.get(entry.athlete_id)!,
      seedTimeSeconds: entry.no_time ? null : csToHyTekSeconds(entry.entry_time_cs),
      course,
      noTime: entry.no_time || entry.entry_time_cs == null,
    })),
  }
}
