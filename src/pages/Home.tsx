import { useCallback, useState } from 'react'
import { useApp } from '../lib/app-context'
import { useLoad, unwrap } from '../lib/hooks'
import { formatDate, formatDateTime, progress } from '../lib/pregnancy'
import { supabase } from '../lib/supabase'
import { weekInfo } from '../data/weeks'
import { Header } from '../components/ui'

interface Appt { id: string; title: string; kind: string; starts_at: string }

export default function Home() {
  const { dueDate, coupleId, members, inviteCode, signOut, setDueDate } = useApp()
  const p = progress(dueDate)
  const w = weekInfo(p.currentWeek)
  const [editing, setEditing] = useState(false)

  const fetchNext = useCallback(
    async () =>
      unwrap(
        await supabase
          .from('appointments')
          .select('id, title, kind, starts_at')
          .eq('couple_id', coupleId)
          .gte('starts_at', new Date().toISOString())
          .order('starts_at')
          .limit(3),
      ) as Appt[],
    [coupleId],
  )
  const { data: next } = useLoad(fetchNext, [] as Appt[])

  return (
    <>
      <Header title="Início" right={<button className="link" onClick={signOut}>Sair</button>} />

      <section className="card hero">
        <div className="big-emoji">{w.emoji}</div>
        <h2>
          {p.weeks} semanas{p.days ? ` e ${p.days} ${p.days === 1 ? 'dia' : 'dias'}` : ''}
        </h2>
        <p className="muted">{p.trimester}.º trimestre · semana {p.currentWeek}</p>
        <div className="bar"><div style={{ width: `${p.percent}%` }} /></div>
        <p>
          {p.daysLeft > 0 ? (
            <><strong>{p.daysLeft}</strong> dias para a data prevista ({formatDate(dueDate)})</>
          ) : p.daysLeft === 0 ? (
            <strong>Hoje é a data prevista!</strong>
          ) : (
            <>Passaram {-p.daysLeft} dias da data prevista</>
          )}
        </p>
      </section>

      <section className="card">
        <h2>Esta semana</h2>
        <p>
          O bebé tem o tamanho de um(a) <strong>{w.fruit}</strong> {w.emoji}
          {w.cm ? ` · ~${w.cm} cm` : ''}
          {w.grams ? ` · ~${w.grams >= 1000 ? (w.grams / 1000).toLocaleString('pt-PT') + ' kg' : w.grams + ' g'}` : ''}
        </p>
        <p>{w.text}</p>
      </section>

      <section className="card">
        <h2>Próximas consultas</h2>
        {next.length === 0 && <p className="muted">Nada agendado. Adiciona em Consultas.</p>}
        {next.map((a) => (
          <div key={a.id} className="row">
            <div>
              <strong>{a.title}</strong>
              <div className="muted">{formatDateTime(a.starts_at)}</div>
            </div>
            <span className="chip">{a.kind}</span>
          </div>
        ))}
      </section>

      {members.length < 2 && (
        <section className="card">
          <h2>Convida o teu par</h2>
          <p className="muted">Código para entrar no vosso espaço:</p>
          <p className="code">{inviteCode}</p>
        </section>
      )}

      <section className="card">
        <button className="link" onClick={() => setEditing(!editing)}>Corrigir data prevista</button>
        {editing && (
          <input
            type="date"
            defaultValue={dueDate}
            onChange={(e) => e.target.value && void setDueDate(e.target.value)}
          />
        )}
      </section>
    </>
  )
}
