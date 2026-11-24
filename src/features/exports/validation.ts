import type { ExportSnapshot, ExportValidationIssue } from './model'

/** Client-side preflight mirroring the sports checks used before export. */
export function validateExportSnapshot(snapshot: ExportSnapshot): ExportValidationIssue[] {
  const issues: ExportValidationIssue[] = []
  if (snapshot.registrations.length === 0) {
    issues.push({
      level: 'error',
      code: 'no_registrations',
      message: 'No hay inscripciones aceptadas para exportar.',
    })
  }
  if (snapshot.events.length === 0) {
    issues.push({
      level: 'error',
      code: 'no_events',
      message: 'La competencia no tiene pruebas activas.',
    })
  }

  const eventIds = new Set(snapshot.events.map((e) => e.id))
  const athleteByRa = new Map(snapshot.athletes.map((a) => [a.registration_athlete_id, a]))
  const entriesByAthlete = new Map<string, number>()

  for (const entry of snapshot.entries) {
    const athlete = athleteByRa.get(entry.registration_athlete_id)
    if (!athlete) {
      issues.push({
        level: 'error',
        code: 'orphan_entry',
        message: 'Hay una prueba inscrita sin atleta asociado.',
        entry_id: entry.id,
        registration_id: entry.registration_id,
      })
      continue
    }
    entriesByAthlete.set(
      entry.registration_athlete_id,
      (entriesByAthlete.get(entry.registration_athlete_id) ?? 0) + 1,
    )
    if (!eventIds.has(entry.competition_event_id)) {
      issues.push({
        level: 'error',
        code: 'unknown_event',
        message: `${athlete.last_name}, ${athlete.first_name}: la prueba ya no está activa.`,
        athlete_id: athlete.id,
        entry_id: entry.id,
        registration_id: entry.registration_id,
      })
    }
    if (!entry.no_time && (entry.entry_time_cs == null || entry.entry_time_cs <= 0)) {
      issues.push({
        level: 'error',
        code: 'missing_time',
        message: `${athlete.last_name}, ${athlete.first_name}: falta el tiempo de inscripción.`,
        athlete_id: athlete.id,
        entry_id: entry.id,
        registration_id: entry.registration_id,
      })
    }
    if (entry.no_time && !snapshot.competition.allow_no_time) {
      issues.push({
        level: 'error',
        code: 'no_time_not_allowed',
        message: `${athlete.last_name}, ${athlete.first_name}: la competencia no permite NT.`,
        athlete_id: athlete.id,
        entry_id: entry.id,
        registration_id: entry.registration_id,
      })
    }
  }

  for (const athlete of snapshot.athletes) {
    if ((entriesByAthlete.get(athlete.registration_athlete_id) ?? 0) === 0) {
      issues.push({
        level: 'error',
        code: 'no_entries',
        message: `${athlete.last_name}, ${athlete.first_name}: no tiene pruebas asignadas.`,
        athlete_id: athlete.id,
        registration_id: athlete.registration_id,
      })
    }
  }

  for (const event of snapshot.events) {
    if (!event.event_number || event.event_number <= 0) {
      issues.push({
        level: 'warning',
        code: 'missing_event_number',
        message: `${event.name}: sin número de prueba; se asignará uno automático en el MDB.`,
      })
    }
  }

  return issues
}

export function countExportSnapshot(snapshot: ExportSnapshot) {
  return {
    teams: snapshot.teams.length,
    athletes: snapshot.athletes.length,
    entries: snapshot.entries.length,
    registrations: snapshot.registrations.length,
  }
}
