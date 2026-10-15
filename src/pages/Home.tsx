import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { useApp } from '../lib/app-context'
import { useLoad, unwrap } from '../lib/hooks'
import { formatDate, formatDateTime, progress } from '../lib/pregnancy'
import { supabase } from '../lib/supabase'
import { weekInfo } from '../data/weeks'
import { Header, Skeleton } from '../components/ui'
import { Rise, ease } from '../components/motion'
import { useToast } from '../components/toast'

// A biblioteca 3D só é descarregada quando o cartão do bebé aparece.
const Baby3D = lazy(() => import('../components/Baby3D'))

interface Appt { id: string; title: string; kind: string; starts_at: string }

/** Parte iluminada de uma lua em crescendo: p=0 lua nova, p=1 lua cheia. */
function moonPath(p: number): string {
  if (p < 0.015) return ''
  const rx = 44 * Math.abs(1 - 2 * p)
  const bulge = p < 0.5 ? 0 : 1
  return `M50 6 A44 44 0 0 1 50 94 A${rx.toFixed(2)} 44 0 0 ${bulge} 50 6 Z`
}

/** A lua cresce ao longo das 40 semanas: é a barra de progresso da gravidez. */
function Moon({ percent }: { percent: number }) {
  const mv = useMotionValue(0)
  const d = useTransform(mv, (p) => moonPath(p))
  useEffect(() => {
    const c = animate(mv, Math.min(percent / 100, 1), { duration: 1.6, delay: 0.25, ease })
    return () => c.stop()
  }, [mv, percent])
  return (
    <svg className="moon" viewBox="0 0 100 100" role="img" aria-label={`Lua a crescer: ${Math.round(percent)}% da gravidez`}>
      <circle cx="50" cy="50" r="44" fill="var(--bg)" opacity=".7" />
      <motion.path d={d} fill="var(--gold)" />
      <g fill="rgb(13 17 48 / .14)">
        <circle cx="64" cy="34" r="7" />
        <circle cx="42" cy="58" r="10" />
        <circle cx="68" cy="66" r="5" />
        <circle cx="52" cy="26" r="3.5" />
      </g>
      <circle cx="50" cy="50" r="44" fill="none" stroke="var(--rule)" strokeWidth="1.2" />
    </svg>
  )
}

export default function Home() {
  const { userId, nameOf, dueDate, coupleId, members, inviteCode, signOut, setDueDate } = useApp()
  const p = progress(dueDate)
  const [viewWeek, setViewWeek] = useState(p.currentWeek)
  const w = weekInfo(viewWeek)
  const [no3d, setNo3d] = useState(false)
  const reduce = useReducedMotion()
  const [editing, setEditing] = useState(false)
  const toast = useToast()

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
      <Header title={`Olá, ${nameOf(userId)}`} right={<button className="link" onClick={signOut}>Sair</button>} />

      <Rise>
        <section className="hero-moon" aria-label="Semana da gravidez">
          <Moon percent={p.percent} />
          <div className="hero-copy">
            <div className="weeknum">{p.weeks}</div>
            <div className="weeklabel">
              semanas{p.days ? ` e ${p.days} ${p.days === 1 ? 'dia' : 'dias'}` : ''}
            </div>
            <p className="muted">{p.trimester}.º trimestre</p>
            <p className="countdown">
              {p.daysLeft > 0 ? (
                <><strong>{p.daysLeft}</strong> dias para {formatDate(dueDate, { day: 'numeric', month: 'long' })}</>
              ) : p.daysLeft === 0 ? (
                <strong>Hoje é a data prevista!</strong>
              ) : (
                <>Passaram {-p.daysLeft} dias da data prevista</>
              )}
            </p>
          </div>
        </section>
      </Rise>

      <Rise i={1}>
        <section className="card tint baby-card" data-hue="coral">
          {!no3d && (
            <div className="stage">
              <Suspense fallback={<div className="stage-loading" aria-hidden />}>
                <Baby3D week={Math.max(viewWeek, 4)} reducedMotion={!!reduce} onUnsupported={() => setNo3d(true)} />
              </Suspense>
              <div className="weekbar">
                <button className="round" aria-label="Semana anterior" disabled={viewWeek <= 4} onClick={() => setViewWeek((x) => Math.max(4, x - 1))}>
                  <CaretLeft size={20} weight="bold" aria-hidden />
                </button>
                <button className="weekpill" onClick={() => setViewWeek(p.currentWeek)} aria-label={viewWeek === p.currentWeek ? `Semana ${viewWeek}, a semana de hoje` : `Semana ${viewWeek}. Tocar para voltar a hoje`}>
                  <span>Semana {viewWeek}</span>
                  {viewWeek === p.currentWeek ? <em>hoje</em> : <em className="back">voltar a hoje</em>}
                </button>
                <button className="round" aria-label="Semana seguinte" disabled={viewWeek >= 40} onClick={() => setViewWeek((x) => Math.min(40, x + 1))}>
                  <CaretRight size={20} weight="bold" aria-hidden />
                </button>
              </div>
            </div>
          )}
          <div className="fruit">
            <div className="sticker" aria-hidden>{w.emoji}</div>
            <div>
              <h2 className="fruit-name">{w.fruit[0].toUpperCase() + w.fruit.slice(1)}</h2>
              <p className="muted">
                Tamanho do bebé{w.cm ? `: ~${w.cm.toLocaleString('pt-PT')} cm` : ''}
                {w.grams ? ` e ~${w.grams >= 1000 ? (w.grams / 1000).toLocaleString('pt-PT') + ' kg' : w.grams + ' g'}` : ''}
              </p>
            </div>
          </div>
          <p>{w.text}</p>
          {!no3d && <p className="disclaimer">Ilustração estilizada para dar uma ideia do tamanho e da forma. Não é uma imagem médica.</p>}
        </section>
      </Rise>

      <Rise i={2}>
        <section className="card tint" data-hue="sky">
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
        </section>
      </Rise>

      {members.length < 2 && (
        <Rise i={3}>
          <section className="card tint" data-hue="lilac">
            <h2>Convida o teu par</h2>
            <p className="muted">Código para entrar no vosso espaço:</p>
            <p className="code">{inviteCode}</p>
          </section>
        </Rise>
      )}

      <Rise i={4}>
        <section className="card">
          <button className="link" onClick={() => setEditing(!editing)}>Corrigir data prevista</button>
          {editing && (
            <input
              aria-label="Data prevista do parto"
              type="date"
              defaultValue={dueDate}
              onChange={(e) => {
                if (e.target.value) void setDueDate(e.target.value).then(() => toast('Data prevista atualizada'))
              }}
            />
          )}
        </section>
      </Rise>
    </>
  )
}
