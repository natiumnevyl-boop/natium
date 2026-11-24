import { describe, expect, it } from 'vitest'
import { csToHyTekSeconds, poolCourseToEntryCourse, toMeetManagerPayload } from './mapping'
import type { ExportSnapshot } from './model'
import { validateExportSnapshot } from './validation'
import { buildEntriesCsv } from './adapters/csv'

const snapshot: ExportSnapshot = {
  competition: {
    id: 'c1',
    name: 'Copa Test',
    code: 'TST26',
    venue: 'Alberca Centro',
    city: 'Guadalajara',
    start_date: '2026-12-12',
    end_date: '2026-12-13',
    age_reference_date: '2026-12-12',
    pool_course: 'SCM',
    pool_length_m: 25,
    allow_no_time: false,
  },
  registrations: [
    {
      id: 'r1',
      team_id: 't1',
      status: 'accepted',
      folio: 'TST26-0001',
      submitted_at: '2026-11-01T12:00:00Z',
      updated_at: '2026-11-01T12:00:00Z',
    },
  ],
  teams: [{ id: 't1', name: 'Club Fix', short_name: 'FIX', code: 'FIX' }],
  events: [
    {
      id: 'e1',
      event_number: 1,
      external_code: '50FR-F',
      sex: 'F',
      distance_m: 50,
      stroke: 'free',
      name: '50 m libre',
    },
  ],
  athletes: [
    {
      id: 'a1',
      team_id: 't1',
      display_id: 'ATL-1',
      first_name: 'Sofia',
      last_name: 'Prueba',
      birth_date: '2014-03-15',
      sex: 'F',
      registration_id: 'r1',
      registration_athlete_id: 'ra1',
      category_id: 'cat1',
      category_name: 'Infantil',
      category_code: 'INF',
    },
  ],
  entries: [
    {
      id: 'en1',
      registration_id: 'r1',
      registration_athlete_id: 'ra1',
      competition_event_id: 'e1',
      athlete_id: 'a1',
      team_id: 't1',
      entry_time_cs: 3250,
      no_time: false,
    },
  ],
}

describe('export mapping', () => {
  it('converts centiseconds to Hy-Tek seconds', () => {
    expect(csToHyTekSeconds(3250)).toBe(32.5)
    expect(csToHyTekSeconds(7532)).toBe(75.32)
    expect(csToHyTekSeconds(12845)).toBe(128.45)
  })

  it('maps SCM to S and LCM to L', () => {
    expect(poolCourseToEntryCourse('SCM')).toBe('S')
    expect(poolCourseToEntryCourse('LCM')).toBe('L')
  })

  it('builds a Meet Manager payload with linked ids', () => {
    const payload = toMeetManagerPayload(snapshot)
    expect(payload.teams[0]?.abbr).toBe('FIX')
    expect(payload.events[0]?.stroke).toBe('A')
    expect(payload.entries[0]?.seedTimeSeconds).toBe(32.5)
    expect(payload.entries[0]?.course).toBe('S')
    expect(payload.entries[0]?.eventPtr).toBe(payload.events[0]?.eventPtr)
    expect(payload.entries[0]?.athNo).toBe(payload.athletes[0]?.athNo)
  })

  it('builds CSV with real times', () => {
    const csv = buildEntriesCsv(snapshot)
    expect(csv).toContain('Sofia')
    expect(csv).toContain('00:32.50')
    expect(csv).toContain('3250')
  })

  it('flags missing times as validation errors', () => {
    const broken = {
      ...snapshot,
      entries: [{ ...snapshot.entries[0]!, entry_time_cs: null, no_time: false }],
    }
    const issues = validateExportSnapshot(broken)
    expect(issues.some((i) => i.code === 'missing_time')).toBe(true)
  })
})
