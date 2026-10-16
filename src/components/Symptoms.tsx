import { useCallback, useState } from 'react'
import { useApp } from '../lib/app-context'
import { unwrap, useLoad } from '../lib/hooks'
import { formatDate, parseDate, startOfToday, toDateOnly } from '../lib/pregnancy'
import { errMsg, supabase } from '../lib/supabase'
import { tick } from '../lib/haptics'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { Err } from './ui'

export const SYMPTOMS = [
  'Enjoo', 'Cansaço', 'Azia', 'Dor de costas', 'Dor de cabeça', 'Inchaço',
  'Cãibras', 'Prisão de ventre', 'Insónia', 'Tonturas', 'Contrações leves', 'Ansiedade',
] as const

const LEVELS = ['', 'ligeiro', 'moderado', 'forte']

interface Log { id: string; day: string; symptom: string; intensity: number }

/** Registo rápido: tocar num sintoma passa de nada → ligeiro → moderado → forte → nada. */
export default function Symptoms() {
  const { coupleId } = useApp()
  const [day, setDay] = useState(() => toDateOnly(startOfToday()))
  const [err, setErr] = useState<string | null>(null)
  const since = toDateOnly(new Date(startOfToday().getTime() - 13 * 86_400_000))
  const fetchAll = useCallback(
    async () => unwrap(await supabase.from('symptom_logs').select('id, day, symptom, intensity').eq('couple_id', coupleId).gte('day', since).order('day', { ascending: false })) as Log[],
    [coupleId, since],
  )
  const { data, reload } = useLoad(fetchAll, [] as Log[])
  const today = data.filter((l) => l.day === day)
  const level = (s: string) => today.find((l) => l.symptom === s)?.intensity ?? 0

  async function cycle(s: string) {
    const cur = today.find((l) => l.symptom === s)
    const next = ((cur?.intensity ?? 0) + 1) % 4
    tick(next ? 10 : 20)
    const { error } = next === 0
      ? await supabase.from('symptom_logs').delete().eq('id', cur!.id)
      : await supabase.from('symptom_logs').upsert({ couple_id: coupleId, day, symptom: s, intensity: next }, { onConflict: 'couple_id,day,symptom' })
    setErr(error ? errMsg(error) : null)
    void reload()
  }

  const shift = (d: number) => {
    const n = parseDate(day)
    n.setDate(n.getDate() + d)
    if (n <= startOfToday()) setDay(toDateOnly(n))
  }

  // resumo das últimas 2 semanas: quantos dias teve cada sintoma
  const counts = new Map<string, number>()
  for (const l of data) counts.set(l.symptom, (counts.get(l.symptom) ?? 0) + 1)
  const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5)

  return (
    <div className="stack">
      <div className="row">
        <button className="round" onClick={() => shift(-1)} aria-label="Dia anterior"><CaretLeft size={20} weight="bold" aria-hidden /></button>
        <strong>{day === toDateOnly(startOfToday()) ? 'Hoje' : formatDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}</strong>
        <button className="round" onClick={() => shift(1)} aria-label="Dia seguinte" disabled={day === toDateOnly(startOfToday())}><CaretRight size={20} weight="bold" aria-hidden /></button>
      </div>
      <p className="muted">Toca para registar. Cada toque aumenta a intensidade; o quarto toque apaga.</p>
      <div className="symptoms">
        {SYMPTOMS.map((s) => {
          const l = level(s)
          return (
            <button key={s} className={l ? `on l${l}` : ''} aria-pressed={l > 0} onClick={() => void cycle(s)}>
              {s}
              {l > 0 && <small>{LEVELS[l]}</small>}
            </button>
          )
        })}
      </div>
      <Err msg={err} />
      <p className="muted">Se um sintoma for forte, novo ou te preocupar, fala com a tua equipa de saúde.</p>
      {top.length > 0 && (
        <>
          <h3 className="section">Últimas 2 semanas</h3>
          <div className="card stack">
            {top.map(([s, n]) => (
              <div key={s} className="row"><span>{s}</span><span className="chip">{n} {n === 1 ? 'dia' : 'dias'}</span></div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
