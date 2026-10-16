import { useCallback, useMemo, useState } from 'react'
import { CalendarCheck, CaretLeft, DownloadSimple, FloppyDisk, Printer } from '@phosphor-icons/react'
import { useApp } from '../lib/app-context'
import { unwrap, uploadPrivate, useLoad } from '../lib/hooks'
import { errMsg, supabase } from '../lib/supabase'
import { addDays, dayKey, type DayLog, type Supplement } from '../lib/goals'
import { buildBrief, briefToHtml, briefToText, dayOf, type BriefInput, type Kind } from '../lib/briefing'
import { downloadFile, safeName } from '../lib/ics'
import { progress, parseDate } from '../lib/pregnancy'
import { Err, PageSkeleton } from './ui'
import { useToast } from './toast'

export interface BriefAppt { id: string; title: string; kind: Kind; starts_at: string; location: string | null }

type Loaded = Omit<BriefInput, 'appt' | 'due'>

/** Consulta anterior = a última consulta ou ecografia antes desta; o período do briefing começa nela. */
async function fetchInputs(coupleId: string, appt: BriefAppt, due: string): Promise<Loaded> {
  const today = dayKey()
  const apptDay = dayOf(appt.starts_at)
  const to = apptDay < today ? apptDay : today

  const { data: prevRows } = await supabase
    .from('appointments')
    .select('title, starts_at')
    .eq('couple_id', coupleId)
    .lt('starts_at', appt.starts_at)
    .in('kind', ['consulta', 'ecografia'])
    .order('starts_at', { ascending: false })
    .limit(1)
  const prev = (prevRows?.[0] as { title: string; starts_at: string } | undefined) ?? null
  const from = prev ? dayOf(prev.starts_at) : addDays(to, -14)

  // perguntas por responder; `priority` só existe depois da migração 0005
  const qSelect = (cols: string) =>
    supabase.from('appointment_questions').select(cols).eq('couple_id', coupleId).eq('done', false).order('id')
  let qr = await qSelect('text, priority, appointment_id, appointments(starts_at)')
  if (qr.error) qr = await qSelect('text, appointment_id, appointments(starts_at)')

  const [symptoms, earlier, entries, logs, supps, checks, files] = await Promise.all([
    supabase.from('symptom_logs').select('day, symptom, intensity').eq('couple_id', coupleId).gte('day', from).lte('day', to),
    supabase.from('symptom_logs').select('symptom').eq('couple_id', coupleId).gte('day', addDays(from, -14)).lt('day', from),
    supabase.from('diary_entries').select('week, weight_kg, bp_systolic, bp_diastolic').eq('couple_id', coupleId).order('week'),
    supabase.from('day_logs').select('day, water_ml, exercise_min, water_goal, exercise_goal').eq('couple_id', coupleId).gte('day', from).lte('day', to),
    supabase.from('supplements').select('id, name, dose, starts_on, ends_on').eq('couple_id', coupleId).order('created_at'),
    supabase.from('supplement_checks').select('supplement_id, day').eq('couple_id', coupleId).gte('day', from).lte('day', to),
    supabase.from('files').select('name, created_at').eq('couple_id', coupleId).gte('created_at', new Date(parseDate(from)).toISOString()).order('created_at'),
  ])

  // o diário só conta até à semana da consulta
  const weeks = progress(due, parseDate(apptDay)).weeks
  const questions = ((unwrap(qr) as unknown as { text: string; priority?: number; appointment_id: string; appointments: { starts_at: string } | null }[]) ?? [])
    .filter((q) => (q.appointments?.starts_at ?? '') <= appt.starts_at)
    .map((q) => ({ text: q.text, priority: q.priority ?? 2, older: q.appointment_id !== appt.id }))

  return {
    prev,
    from,
    to,
    symptoms: unwrap(symptoms) as Loaded['symptoms'],
    earlier: [...new Set((unwrap(earlier) as { symptom: string }[]).map((s) => s.symptom))],
    entries: (unwrap(entries) as Loaded['entries']).filter((e) => e.week <= weeks + 1),
    logs: unwrap(logs) as DayLog[],
    supplements: unwrap(supps) as Supplement[],
    checks: unwrap(checks) as Loaded['checks'],
    files: unwrap(files) as Loaded['files'],
    questions,
  }
}

/** Imprime (ou guarda em PDF) sem sair da app: o HTML vai para um iframe invisível. */
function printHtml(html: string) {
  const f = document.createElement('iframe')
  f.setAttribute('aria-hidden', 'true')
  f.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0'
  f.onload = () => {
    f.contentWindow?.focus()
    f.contentWindow?.print()
    setTimeout(() => f.remove(), 60_000)
  }
  f.srcdoc = html
  document.body.appendChild(f)
}

export default function Briefing({
  appt, onBack, onSaved,
}: {
  appt: BriefAppt
  onBack: () => void
  /** texto do briefing gravado na consulta (vai para o calendário) */
  onSaved: (text: string) => void
}) {
  const { coupleId, dueDate } = useApp()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(() => fetchInputs(coupleId, appt, dueDate), [coupleId, appt, dueDate])
  const { data, loading, error } = useLoad(load, null as Loaded | null)

  const brief = useMemo(() => (data ? buildBrief({ ...data, appt, due: dueDate }) : null), [data, appt, dueDate])
  const html = useMemo(() => (brief ? briefToHtml(brief) : ''), [brief])
  const fileName = `Briefing-${safeName(appt.title)}-${dayOf(appt.starts_at)}.html`

  async function save() {
    if (!brief) return
    setBusy(true)
    setErr(null)
    try {
      const text = briefToText(brief)
      // texto para o calendário; sem a migração 0005 a coluna não existe
      const up = await supabase.from('appointments').update({ briefing: text }).eq('id', appt.id)
      if (up.error) throw up.error
      // ficheiro na consulta: substitui o briefing anterior
      const { data: old } = await supabase.from('files').select('id, path').eq('appointment_id', appt.id).like('name', 'Briefing-%')
      const path = await uploadPrivate(coupleId, new File([html], fileName, { type: 'text/html' }))
      const ins = await supabase.from('files').insert({ couple_id: coupleId, appointment_id: appt.id, path, name: fileName, content_type: 'text/html' })
      if (ins.error) throw ins.error
      if (old?.length) {
        await supabase.storage.from('private').remove(old.map((f) => f.path))
        await supabase.from('files').delete().in('id', old.map((f) => f.id))
      }
      onSaved(text)
      toast('Briefing guardado na consulta e no calendário')
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <button className="link" onClick={onBack}><CaretLeft size={16} aria-hidden /> Voltar à consulta</button>
      <p className="muted">
        Resumo para levarem à consulta, feito com o que registaram na app. Não interpreta valores: o que preocupa fica como pergunta.
      </p>
      {loading && <PageSkeleton rows={2} />}
      <Err msg={error} />
      {brief && (
        <>
          <iframe className="brief-frame" title={`Briefing: ${appt.title}`} sandbox="" srcDoc={html} />
          <button className="btn" disabled={busy} onClick={() => void save()}>
            <FloppyDisk size={18} aria-hidden /> {busy ? 'A guardar…' : 'Guardar na consulta e no calendário'}
          </button>
          <p className="hint left">
            Fica nos documentos desta consulta e na nota do evento do calendário subscrito (atualiza-se em cerca de uma hora).
          </p>
          <div className="inline">
            <button className="btn secondary small" style={{ flex: 1 }} onClick={() => downloadFile(fileName, html, 'text/html;charset=utf-8')}>
              <DownloadSimple size={18} aria-hidden /> Descarregar
            </button>
            <button className="btn secondary small" style={{ flex: 1 }} onClick={() => printHtml(html)}>
              <Printer size={18} aria-hidden /> Imprimir / PDF
            </button>
          </div>
          <p className="hint left"><CalendarCheck size={14} aria-hidden /> Para o telemóvel, o botão "Lembrete no calendário" na consulta também leva este resumo.</p>
        </>
      )}
      <Err msg={err} />
    </div>
  )
}
