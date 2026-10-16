// Calendário subscrito do casal: GET /functions/v1/calendar?t=<calendar_token> devolve as consultas em .ics.
// O Calendário da Apple não envia sessão, por isso esta função não exige JWT (verify_jwt = false);
// o acesso é o próprio token secreto, que os membros podem renovar nos Ajustes.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildCalendar } from '../_shared/ics.ts'

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
