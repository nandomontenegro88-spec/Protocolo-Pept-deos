import { useCallback, useState } from 'react'
import { motion } from 'motion/react'
import { useApp } from '../lib/app-context'
import { useLoad, unwrap } from '../lib/hooks'
import { formatDate, formatDateTime, progress } from '../lib/pregnancy'
import { supabase } from '../lib/supabase'
import { weekInfo } from '../data/weeks'
import { Header, Skeleton } from '../components/ui'
import { Rise, ease } from '../components/motion'

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
  const { data: next, loading } = useLoad(fetchNext, [] as Appt[])

  return (
    <>
      <Header title="Início" right={<button className="link" onClick={signOut}>Sair</button>} />

      <Rise><section className="card hero">
        <div className="big-emoji">{w.emoji}</div>
        <h2>
          {p.weeks} semanas{p.days ? ` e ${p.days} ${p.days === 1 ? 'dia' : 'dias'}` : ''}
        </h2>
        <p className="muted">{p.trimester}.º trimestre · semana {p.currentWeek}</p>
        <div className="bar">
          <motion.div
            className="bar-fill"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: p.percent / 100 }}
            transition={{ duration: 0.9, delay: 0.2, ease }}
          />
        </div>
        <p>
          {p.daysLeft > 0 ? (
            <><strong>{p.daysLeft}</strong> dias para a data prevista ({formatDate(dueDate)})</>
          ) : p.daysLeft === 0 ? (
            <strong>Hoje é a data prevista!</strong>
          ) : (
            <>Passaram {-p.daysLeft} dias da data prevista</>
          )}
        </p>
      </section></Rise>

      <Rise i={1}><section className="card">
        <h2>Esta semana</h2>
        <p>
          O bebé tem o tamanho de um(a) <strong>{w.fruit}</strong> {w.emoji}
          {w.cm ? ` · ~${w.cm} cm` : ''}
          {w.grams ? ` · ~${w.grams >= 1000 ? (w.grams / 1000).toLocaleString('pt-PT') + ' kg' : w.grams + ' g'}` : ''}
        </p>
        <p>{w.text}</p>
      </section></Rise>

      <Rise i={2}><section className="card">
        <h2>Próximas consultas</h2>
        {loading && <Skeleton h={44} />}
        {!loading && next.length === 0 && <p className="muted">Nada agendado. Adiciona em Consultas.</p>}
        {next.map((a) => (
          <div key={a.id} className="row">
            <div>
              <strong>{a.title}</strong>
              <div className="muted">{formatDateTime(a.starts_at)}</div>
            </div>
            <span className="chip">{a.kind}</span>
          </div>
        ))}
      </section></Rise>

      {members.length < 2 && (
        <Rise i={3}><section className="card">
          <h2>Convida o teu par</h2>
          <p className="muted">Código para entrar no vosso espaço:</p>
          <p className="code">{inviteCode}</p>
        </section></Rise>
      )}

      <Rise i={4}><section className="card">
        <button className="link" onClick={() => setEditing(!editing)}>Corrigir data prevista</button>
        {editing && (
          <input
            type="date"
            defaultValue={dueDate}
            onChange={(e) => e.target.value && void setDueDate(e.target.value)}
          />
        )}
      </section></Rise>
    </>
  )
}
