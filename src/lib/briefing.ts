/**
 * Briefing de consulta: junta o que a app já sabe (sintomas, peso e tensão, metas, documentos, perguntas)
 * numa página para levar à consulta. Sem rede nem React.
 * Regra: nunca diagnostica nem interpreta valores; tudo o que é preocupante vira pergunta para a equipa de saúde.
 */
import { addDays, activeOn, litres, parseDay, type DayLog, type Supplement } from './goals'
import { parseDate, progress } from './pregnancy'

export type Kind = 'consulta' | 'ecografia' | 'analises' | 'outro'

export interface BriefInput {
  appt: { title: string; kind: Kind; starts_at: string; location: string | null }
  due: string
  /** consulta anterior (o período do briefing começa nela) */
  prev: { title: string; starts_at: string } | null
  /** primeiro e último dia do período, AAAA-MM-DD */
  from: string
  to: string
  symptoms: { day: string; symptom: string; intensity: number }[]
  /** sintomas já registados antes de `from`, para marcar o que é novo */
  earlier: string[]
  entries: { week: number; weight_kg: number | null; bp_systolic: number | null; bp_diastolic: number | null }[]
  logs: DayLog[]
  supplements: Supplement[]
  checks: { supplement_id: string; day: string }[]
  files: { name: string; created_at: string }[]
  questions: { text: string; priority: number; older: boolean }[]
}

export interface BriefQuestion { text: string; auto?: boolean; older?: boolean }
export interface Brief {
  title: string
  when: string
  where: string | null
  alert: string | null
  snapshot: { week: string; reason: string; feeling: string; novelty: string }
  period: string
  symptoms: { name: string; days: number; strongest: string; isNew: boolean }[]
  trends: string[]
  exams: string[]
  questions: { must: BriefQuestion[]; want: BriefQuestion[]; later: BriefQuestion[] }
  bring: string[]
  note: string
}

export const PRIORITIES = [
  { n: 1, label: 'Tem de perguntar' },
  { n: 2, label: 'Quer perguntar' },
  { n: 3, label: 'Se houver tempo' },
] as const

const KIND_LABEL: Record<Kind, string> = { consulta: 'Consulta', ecografia: 'Ecografia', analises: 'Análises', outro: 'Outro' }
const STRENGTH = ['', 'ligeiro', 'moderado', 'forte']
const SNS24 = 'SNS 24 (808 24 24 24)'
/** Nomes dos sintomas da app (Symptoms.tsx) que merecem um aviso calmo quando registados como fortes. */
const ALERT_SYMPTOMS = ['Dor de cabeça', 'Tonturas', 'Contrações leves']

const fmtDay = (d: string) => parseDay(d).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const kg = (n: number) => n.toLocaleString('pt-PT', { maximumFractionDigits: 1 })

export function dayOf(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function buildBrief(i: BriefInput): Brief {
  const apptDay = dayOf(i.appt.starts_at)
  const p = progress(i.due, parseDate(apptDay))
  const week = `Semana ${p.weeks}${p.days ? ` e ${plural(p.days, 'dia', 'dias')}` : ''} · ${p.trimester}.º trimestre`

  // ---- sintomas do período
  const byName = new Map<string, { days: Set<string>; max: number }>()
  for (const s of i.symptoms) {
    const e = byName.get(s.symptom) ?? { days: new Set<string>(), max: 0 }
    e.days.add(s.day)
    e.max = Math.max(e.max, s.intensity)
    byName.set(s.symptom, e)
  }
  const earlier = new Set(i.earlier)
  const symptoms = [...byName]
    .map(([name, e]) => ({ name, days: e.days.size, strongest: STRENGTH[e.max], isNew: !earlier.has(name), max: e.max }))
    .sort((a, b) => b.days - a.days || a.name.localeCompare(b.name, 'pt'))
  const fresh = symptoms.filter((s) => s.isNew)

  // ---- aviso calmo (sem diagnosticar)
  const recent = addDays(i.to, -2)
  const flagged = [...new Set(
    i.symptoms
      .filter((s) => s.day >= recent && s.intensity === 3 && ALERT_SYMPTOMS.includes(s.symptom))
      .filter((s) => s.symptom !== 'Contrações leves' || p.weeks < 37)
      .map((s) => lower(s.symptom)),
  )]
  const alert = flagged.length
    ? `Registaram ${flagged.join(' e ')} forte nos últimos dias. Se algo vos preocupa, não esperem pela consulta: liguem hoje à equipa de saúde ou à ${SNS24}.`
    : null

  // ---- tendências: peso e tensão do diário + metas do dia
  const trends: string[] = []
  const withWeight = i.entries.filter((e) => e.weight_kg != null)
  if (withWeight.length) {
    const last = withWeight[withWeight.length - 1]
    const first = withWeight.length > 1 ? withWeight[Math.max(0, withWeight.length - 3)] : null
    const delta = first && first.week !== last.week ? last.weight_kg! - first.weight_kg! : null
    trends.push(
      `Peso: ${kg(last.weight_kg!)} kg (sem. ${last.week})` +
        (delta != null ? `; ${delta >= 0 ? '+' : '−'}${kg(Math.abs(delta))} kg desde a sem. ${first!.week}` : ''),
    )
  }
  const withBp = i.entries.filter((e) => e.bp_systolic != null && e.bp_diastolic != null)
  if (withBp.length) {
    const last = withBp[withBp.length - 1]
    trends.push(`Tensão arterial: ${last.bp_systolic}/${last.bp_diastolic} mmHg (sem. ${last.week})`)
  }
  const logs = i.logs.filter((l) => l.day >= i.from && l.day <= i.to)
  if (logs.length) {
    const water = logs.reduce((a, l) => a + l.water_ml, 0) / logs.length
    const exDays = logs.filter((l) => l.exercise_min >= l.exercise_goal).length
    trends.push(`Água: média de ${litres(water)} L por dia (${plural(logs.length, 'dia registado', 'dias registados')})`)
    trends.push(`Exercício: meta feita em ${exDays} de ${plural(logs.length, 'dia registado', 'dias registados')}`)
  }
  // só conta os dias em que registaram alguma coisa nas metas: um dia sem registo não é um dia "sem tomar"
  const tracked = new Set([...logs.map((l) => l.day), ...i.checks.filter((c) => c.day >= i.from && c.day <= i.to).map((c) => c.day)])
  const takenKeys = new Set(i.checks.map((c) => `${c.supplement_id}|${c.day}`))
  let due = 0
  let taken = 0
  for (const d of tracked) {
    for (const s of activeOn(i.supplements, d)) {
      due++
      if (takenKeys.has(`${s.id}|${d}`)) taken++
    }
  }
  if (due > 0) trends.push(`Suplementos: ${taken} de ${due} tomas, nos dias com registo`)
  if (trends.length === 0) trends.push('Sem registos de peso, tensão ou metas neste período.')

  // ---- documentos
  const exams = i.files
    .filter((f) => !f.name.startsWith('Briefing-'))
    .map((f) => `${f.name} (${fmtDay(dayOf(f.created_at))})`)

  // ---- perguntas: as do casal + até 3 sugeridas a partir dos dados
  const mine: BriefQuestion[][] = [[], [], []]
  for (const q of i.questions) mine[Math.min(Math.max(q.priority, 1), 3) - 1].push({ text: q.text, older: q.older })
  const auto: { q: BriefQuestion; bucket: number }[] = []
  for (const s of symptoms.filter((x) => x.isNew).slice(0, 2)) {
    auto.push({
      q: { text: `Tenho tido ${lower(s.name)} (${plural(s.days, 'dia', 'dias')}). O que é normal nesta fase e o que devo vigiar?`, auto: true },
      bucket: s.max === 3 ? 0 : 1,
    })
  }
  if (withWeight.length || withBp.length) {
    auto.push({ q: { text: 'Os valores de peso e de tensão arterial que fui registando estão dentro do esperado?', auto: true }, bucket: 1 })
  }
  const firstExam = i.files.find((f) => !f.name.startsWith('Briefing-'))
  if (firstExam) auto.push({ q: { text: `Pode explicar-nos o resultado de "${firstExam.name}"?`, auto: true }, bucket: 2 })
  for (const a of auto.slice(0, 3)) mine[a.bucket].push(a.q)

  // ---- o que levar
  const names = i.supplements.filter((s) => s.starts_on <= i.to && (!s.ends_on || i.to < s.ends_on))
  const bring = [
    'Cartão de Cidadão ou número de utente',
    'Cartão do seguro de saúde (se tiverem)',
    'Boletim de Saúde da Grávida',
    'Análises e ecografias anteriores',
    names.length
      ? `Lista de medicação e suplementos: ${names.map((s) => (s.dose ? `${s.name} (${s.dose})` : s.name)).join(', ')}`
      : 'Lista de medicação e suplementos',
    ...(i.appt.kind === 'ecografia' ? ['Quem vos acompanha (confirmem se pode entrar na ecografia)'] : []),
  ]

  const period = i.prev
    ? `Desde ${fmtDay(dayOf(i.prev.starts_at))} (${i.prev.title})`
    : `Desde ${fmtDay(i.from)} (sem consulta anterior registada)`
  const when = new Date(i.appt.starts_at).toLocaleString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

  return {
    title: i.appt.title,
    when,
    where: i.appt.location,
    alert,
    snapshot: {
      week,
      reason: `Motivo: ${i.appt.title} (${KIND_LABEL[i.appt.kind].toLowerCase()})`,
      feeling: symptoms.length
        ? `Como têm corrido os dias: sobretudo ${symptoms.slice(0, 3).map((s) => `${lower(s.name)} (${plural(s.days, 'dia', 'dias')})`).join(', ')}.`
        : 'Sem sintomas registados neste período.',
      novelty: fresh.length ? `Novo: ${fresh.map((s) => lower(s.name)).join(', ')}.` : 'Nada de novo registado.',
    },
    period,
    symptoms: symptoms.map(({ name, days, strongest, isNew }) => ({ name, days, strongest, isNew })),
    trends,
    exams: exams.length ? exams : ['Nenhum documento novo desde a consulta anterior.'],
    questions: { must: mine[0], want: mine[1], later: mine[2] },
    bring,
    note: `Gerado pela app a ${new Date().toLocaleDateString('pt-PT')}. É apoio para a conversa, não substitui a equipa de saúde.`,
  }
}

const SAFETY = `Hemorragia, dor abdominal forte, febre alta, perda de líquido ou menos movimentos do bebé: não esperem pela consulta, liguem à equipa de saúde ou à ${SNS24}.`

/** Texto simples (nota do evento no calendário). Cabe em 4000 caracteres. */
export function briefToText(b: Brief): string {
  const q = (title: string, list: BriefQuestion[]) =>
    list.length ? [title, ...list.map((x, n) => `${n + 1}. ${x.text}${x.older ? ' (ficou da consulta anterior)' : ''}`)] : []
  const lines = [
    `BRIEFING: ${b.title}`,
    b.snapshot.week,
    ...(b.alert ? ['', `ATENÇÃO: ${b.alert}`] : []),
    '',
    `${b.snapshot.feeling} ${b.snapshot.novelty}`,
    ...(b.symptoms.length ? [`Sintomas (${b.period.toLowerCase()}): ${b.symptoms.map((s) => `${lower(s.name)} ${s.days}d${s.isNew ? ' novo' : ''}`).join(', ')}`] : []),
    ...b.trends,
    ...(b.exams[0].startsWith('Nenhum') ? [] : [`Documentos: ${b.exams.join('; ')}`]),
    '',
    ...q('TEM DE PERGUNTAR', b.questions.must),
    ...q('QUER PERGUNTAR', b.questions.want),
    ...q('SE HOUVER TEMPO', b.questions.later),
    '',
    `LEVAR: ${b.bring.join('; ')}`,
    '',
    SAFETY,
  ]
  const text = lines.join('\n')
  return text.length > 3900 ? text.slice(0, 3890).trimEnd() + '…' : text
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Página A4 autónoma, imprimível (Guardar como PDF) e legível no telemóvel. */
export function briefToHtml(b: Brief): string {
  const ul = (items: string[]) => `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
  const qs = (title: string, list: BriefQuestion[]) =>
    list.length
      ? `<h3>${title}</h3><ol>${list.map((x) => `<li>${esc(x.text)}${x.older ? ' <em>(ficou da consulta anterior)</em>' : ''}</li>`).join('')}</ol>`
      : ''
  const sym = b.symptoms.length
    ? ul(b.symptoms.map((s) => `${s.name}: ${s.days === 1 ? '1 dia' : `${s.days} dias`}${s.strongest ? `, até ${s.strongest}` : ''}${s.isNew ? ' — NOVO' : ''}`))
    : '<p>Sem sintomas registados neste período.</p>'
  return `<!doctype html>
<html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Briefing · ${esc(b.title)}</title>
<style>
@page{size:A4;margin:14mm}
*{box-sizing:border-box}
body{margin:0;padding:18px;font:15px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#141a45;background:#fff;max-width:760px;margin-inline:auto}
h1{font-size:1.5rem;margin:0 0 2px;letter-spacing:-.02em}
h2{font-size:1rem;margin:16px 0 4px;padding-left:8px;border-left:4px solid #f0b429;text-transform:uppercase;letter-spacing:.03em}
h3{font-size:.95rem;margin:10px 0 2px}
p,ul,ol{margin:2px 0}ul,ol{padding-left:20px}li{margin:2px 0}
.meta{color:#4b5390}
.alert{margin:12px 0;padding:10px 12px;border:2px solid #f26b52;border-radius:10px;background:#fff1ee;font-weight:600}
.q3{border:1.5px solid #141a45;border-radius:10px;padding:2px 12px 8px;margin-top:6px}
footer{margin-top:16px;padding-top:8px;border-top:1px solid #b9c2ee;font-size:.8rem;color:#4b5390}
@media print{body{padding:0;font-size:10.5pt}h2{break-after:avoid}li,.alert{break-inside:avoid}}
</style></head><body>
<h1>${esc(b.title)}</h1>
<p class="meta">${esc(b.when)}${b.where ? ` · ${esc(b.where)}` : ''}</p>
${b.alert ? `<div class="alert" role="alert">${esc(b.alert)}</div>` : ''}
<h2>1. Ponto de situação</h2>
<ul><li>${esc(b.snapshot.week)}</li><li>${esc(b.snapshot.reason)}</li><li>${esc(b.snapshot.feeling)}</li><li>${esc(b.snapshot.novelty)}</li></ul>
<h2>2. Sintomas</h2>
<p class="meta">${esc(b.period)}</p>${sym}
<h2>3. Peso, tensão e metas</h2>${ul(b.trends)}
<h2>4. Análises e exames para falar</h2>${ul(b.exams)}
<h2>5. Perguntas para a equipa de saúde</h2>
<div class="q3">${qs('Tem de perguntar', b.questions.must)}${qs('Quer perguntar', b.questions.want)}${qs('Se houver tempo', b.questions.later)}${
    b.questions.must.length + b.questions.want.length + b.questions.later.length === 0 ? '<p>Ainda não há perguntas. Juntem-nas na consulta, na app.</p>' : ''
  }</div>
<h2>6. Logística: o que levar</h2>${ul(b.bring)}
<footer>${esc(SAFETY)}<br>${esc(b.note)}</footer>
</body></html>`
}
