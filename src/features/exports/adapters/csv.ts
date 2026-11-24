import { formatCs } from '@/shared/utils/time'
import type { ExportSnapshot } from '../model'

function csvEscape(value: string | number | null | undefined): string {
  const raw = value == null ? '' : String(value)
  if (/[",\n\r]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`
  return raw
}

/** Operational CSV backup — not a Meet Manager substitute. */
export function buildEntriesCsv(snapshot: ExportSnapshot): string {
  const teamById = new Map(snapshot.teams.map((t) => [t.id, t]))
  const athleteByRa = new Map(snapshot.athletes.map((a) => [a.registration_athlete_id, a]))
  const eventById = new Map(snapshot.events.map((e) => [e.id, e]))
  const regById = new Map(snapshot.registrations.map((r) => [r.id, r]))

  const header = [
    'folio',
    'equipo',
    'codigo_equipo',
    'atleta_id',
    'apellido',
    'nombre',
    'sexo',
    'fecha_nacimiento',
    'categoria',
    'prueba',
    'distancia_m',
    'estilo',
    'sexo_prueba',
    'numero_prueba',
    'tiempo',
    'tiempo_cs',
    'sin_tiempo',
  ]

  const lines = [header.join(',')]
  for (const entry of snapshot.entries) {
    const athlete = athleteByRa.get(entry.registration_athlete_id)
    const event = eventById.get(entry.competition_event_id)
    const team = athlete ? teamById.get(athlete.team_id) : undefined
    const reg = regById.get(entry.registration_id)
    lines.push(
      [
        csvEscape(reg?.folio),
        csvEscape(team?.name),
        csvEscape(team?.code),
        csvEscape(athlete?.display_id),
        csvEscape(athlete?.last_name),
        csvEscape(athlete?.first_name),
        csvEscape(athlete?.sex),
        csvEscape(athlete?.birth_date),
        csvEscape(athlete?.category_name),
        csvEscape(event?.name),
        csvEscape(event?.distance_m),
        csvEscape(event?.stroke),
        csvEscape(event?.sex),
        csvEscape(event?.event_number),
        csvEscape(entry.no_time ? 'NT' : formatCs(entry.entry_time_cs)),
        csvEscape(entry.entry_time_cs),
        csvEscape(entry.no_time ? '1' : '0'),
      ].join(','),
    )
  }
  return lines.join('\n') + '\n'
}

export function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadBinaryFile(filename: string, data: BlobPart, mime: string) {
  const blob = new Blob([data], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
