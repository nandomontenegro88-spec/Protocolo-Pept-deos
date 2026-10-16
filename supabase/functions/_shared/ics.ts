/**
 * Calendário iCalendar (.ics), partilhado pela app (uma consulta) e pela função `calendar` (subscrição).
 * Cada evento leva dois alarmes: na véspera e 2 horas antes.
 */
export interface IcsEvent {
  id: string
  title: string
  start: string
  location?: string | null
  notes?: string
  minutes?: number
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1')
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

function vevent(e: IcsEvent, now: Date): string[] {
  const start = new Date(e.start)
  const end = new Date(start.getTime() + (e.minutes ?? 60) * 60_000)
  return [
    'BEGIN:VEVENT',
    `UID:${e.id}@bebe-a-caminho`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(e.title)}`,
    ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
    ...(e.notes ? [`DESCRIPTION:${esc(e.notes)}`] : []),
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)} amanhã`, 'TRIGGER:-P1D', 'END:VALARM',
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)} daqui a 2 horas`, 'TRIGGER:-PT2H', 'END:VALARM',
    'END:VEVENT',
  ]
}

/** `name` dá o nome ao calendário subscrito; sem ele, é um ficheiro para importar. */
export function buildCalendar(events: IcsEvent[], name?: string): string {
  const now = new Date()
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Bebe a caminho//PT',
    ...(name ? [`X-WR-CALNAME:${esc(name)}`, 'X-WR-TIMEZONE:Europe/Lisbon', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'] : []),
    ...events.flatMap((e) => vevent(e, now)),
    'END:VCALENDAR',
  ]
  return lines.join('\r\n') + '\r\n'
}
