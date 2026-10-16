import { createClient } from 'npm:@supabase/supabase-js@2'

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
const enc = new TextEncoder()
/** Linhas com mais de 75 bytes são dobradas (RFC 5545), sem partir caracteres UTF-8. */
function fold(line: string): string {
  if (enc.encode(line).length <= 75) return line
  const out: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of line) {
    const n = enc.encode(ch).length
    if (bytes + n > 75) {
      out.push(cur)
      cur = ' '
      bytes = 1
    }
    cur += ch
    bytes += n
  }
  out.push(cur)
  return out.join('\r\n')
}
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
  return lines.map(fold).join('\r\n') + '\r\n'
}

// ---- função ----
// Calendário subscrito do casal: GET /functions/v1/calendar?t=<calendar_token> devolve as consultas em .ics.
// O Calendário da Apple não envia sessão, por isso esta função não exige JWT (verify_jwt = false);
// o acesso é o próprio token secreto, que os membros podem renovar nos Ajustes.

const KINDS: Record<string, string> = { consulta: 'Consulta', ecografia: 'Ecografia', analises: 'Análises', outro: 'Outro' }

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('t') ?? ''
  if (!/^[0-9a-f]{36}$/.test(token)) return new Response('Not found', { status: 404 })

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  const { data: couple } = await db.from('couples').select('id').eq('calendar_token', token).maybeSingle()
  if (!couple) return new Response('Not found', { status: 404 })

  // consultas dos últimos 60 dias em diante: o histórico antigo não interessa no calendário
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString()
  // `briefing` só existe depois da migração 0005; sem ela, o calendário continua a funcionar
  const query = (cols: string) =>
    db.from('appointments').select(cols).eq('couple_id', couple.id).gte('starts_at', since).order('starts_at')
  let r = await query('id, kind, title, starts_at, location, briefing')
  if (r.error) r = await query('id, kind, title, starts_at, location')
  if (r.error) return new Response('Error', { status: 500 })
  const appts = (r.data ?? []) as unknown as { id: string; kind: string; title: string; starts_at: string; location: string | null; briefing?: string | null }[]

  const ics = buildCalendar(
    appts.map((a) => ({ id: a.id, title: a.title, start: a.starts_at, location: a.location, notes: a.briefing || (KINDS[a.kind] ?? a.kind) })),
    'Bebé a caminho',
  )
  return new Response(ics, {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, max-age=300' },
  })
})
