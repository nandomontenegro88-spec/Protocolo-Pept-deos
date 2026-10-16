import { useCallback, useEffect, useState } from 'react'
import { Timer } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'
import { useApp } from '../lib/app-context'
import { unwrap, useLoad } from '../lib/hooks'
import { formatDateTime, formatDuration } from '../lib/pregnancy'
import { errMsg, supabase } from '../lib/supabase'
import { tick } from '../lib/haptics'
import { useToast, useUndoable } from '../components/toast'
import { SwipeRow } from '../components/swipe'
import { Err, Header } from '../components/ui'

export default function Tools() {
  const [tool, setTool] = useState<'kicks' | 'contr' | 'kegel'>('kicks')
  return (
    <>
      <Header title="Ferramentas" icon={Timer} />
      <div className="seg">
        <button className={tool === 'kicks' ? 'on' : ''} onClick={() => setTool('kicks')}>Movimentos</button>
        <button className={tool === 'contr' ? 'on' : ''} onClick={() => setTool('contr')}>Contrações</button>
        <button className={tool === 'kegel' ? 'on' : ''} onClick={() => setTool('kegel')}>Kegel</button>
      </div>
      {tool === 'kicks' ? <Kicks /> : tool === 'contr' ? <Contractions /> : <Kegel />}
    </>
  )
}

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [active])
  return now
}

interface Kick { id: string; started_at: string; ended_at: string | null; count: number }

function Kicks() {
  const { coupleId } = useApp()
  const toast = useToast()
  const undoable = useUndoable()
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const setHide = (id: string, on: boolean) =>
    setHidden((s) => {
      const n = new Set(s)
      if (on) n.add(id)
      else n.delete(id)
      return n
    })
  const [err, setErr] = useState<string | null>(null)
  const fetchAll = useCallback(
    async () => unwrap(await supabase.from('kick_sessions').select('id, started_at, ended_at, count').eq('couple_id', coupleId).order('started_at', { ascending: false }).limit(20)) as Kick[],
    [coupleId],
  )
  const { data, reload } = useLoad(fetchAll, [] as Kick[])
  const active = data.find((s) => !s.ended_at)
  const now = useNow(!!active)

  async function start() {
    const { error } = await supabase.from('kick_sessions').insert({ couple_id: coupleId })
    setErr(error ? errMsg(error) : null)
    void reload()
  }
  async function tap() {
    if (!active) return
    tick()
    const { error } = await supabase.from('kick_sessions').update({ count: active.count + 1 }).eq('id', active.id)
    setErr(error ? errMsg(error) : null)
    void reload()
  }
  async function untap() {
    if (!active || active.count === 0) return
    tick(8)
    const { error } = await supabase.from('kick_sessions').update({ count: active.count - 1 }).eq('id', active.id)
    setErr(error ? errMsg(error) : null)
    void reload()
  }
  async function stop() {
    if (!active) return
    await supabase.from('kick_sessions').update({ ended_at: new Date().toISOString() }).eq('id', active.id)
    toast(`Sessão guardada: ${active.count} movimentos`)
    void reload()
  }

  return (
    <>
      <p className="muted">Conta os movimentos do bebé numa sessão. Se notares menos movimentos do que o habitual, contacta a tua equipa de saúde.</p>
      {active ? (
        <>
          <motion.div
            key={active.count}
            className="counter"
            initial={{ scale: 1.18 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          >
            {active.count}
          </motion.div>
          <p className="center muted">{formatDuration(now - new Date(active.started_at).getTime())}</p>
          <motion.button className="bigbtn" whileTap={{ scale: 0.97 }} onClick={tap}>Mexeu!</motion.button>
          <div className="inline">
            <button className="btn secondary" style={{ flex: 1 }} onClick={untap} disabled={active.count === 0}>Anular último</button>
            <button className="btn secondary" style={{ flex: 1 }} onClick={stop}>Terminar sessão</button>
          </div>
        </>
      ) : (
        <motion.button className="bigbtn" whileTap={{ scale: 0.97 }} onClick={start}>Iniciar sessão</motion.button>
      )}
      <Err msg={err} />
      {data.some((s) => s.ended_at) && <h3 className="section">Histórico</h3>}
      {data.filter((s) => s.ended_at && !hidden.has(s.id)).map((s) => (
        <SwipeRow
          key={s.id}
          actions={[
            {
              key: 'delete',
              label: 'Apagar',
              onClick: () =>
                undoable('Sessão apagada', {
                  hide: () => setHide(s.id, true),
                  restore: () => setHide(s.id, false),
                  commit: async () => {
                    await supabase.from('kick_sessions').delete().eq('id', s.id)
                    await reload()
                    setHide(s.id, false)
                  },
                }),
            },
          ]}
        >
          <div className="card row">
            <div>
              <strong>{s.count} movimentos</strong>
              <div className="muted">{formatDateTime(s.started_at)}</div>
            </div>
            <span className="chip">{formatDuration(new Date(s.ended_at!).getTime() - new Date(s.started_at).getTime())}</span>
          </div>
        </SwipeRow>
      ))}
    </>
  )
}

interface Contraction { id: string; started_at: string; ended_at: string | null }

function Contractions() {
  const { coupleId } = useApp()
  const undoable = useUndoable()
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const setHide = (id: string, on: boolean) =>
    setHidden((s) => {
      const n = new Set(s)
      if (on) n.add(id)
      else n.delete(id)
      return n
    })
  const [err, setErr] = useState<string | null>(null)
  const fetchAll = useCallback(
    async () => unwrap(await supabase.from('contractions').select('id, started_at, ended_at').eq('couple_id', coupleId).order('started_at', { ascending: false }).limit(30)) as Contraction[],
    [coupleId],
  )
  const { data, reload } = useLoad(fetchAll, [] as Contraction[])
  const active = data.find((c) => !c.ended_at)
  const now = useNow(!!active)

  async function toggle() {
    tick(active ? 25 : 12)
    const { error } = active
      ? await supabase.from('contractions').update({ ended_at: new Date().toISOString() }).eq('id', active.id)
      : await supabase.from('contractions').insert({ couple_id: coupleId, started_at: new Date().toISOString() })
    setErr(error ? errMsg(error) : null)
    void reload()
  }
  const [confirmClear, setConfirmClear] = useState(false)
  async function clear() {
    await supabase.from('contractions').delete().eq('couple_id', coupleId)
    setConfirmClear(false)
    void reload()
  }

  // data vem do mais recente para o mais antigo; o intervalo é de início a início.
  const rows = data.map((c, i) => {
    const prev = data[i + 1]
    return {
      c,
      dur: c.ended_at ? new Date(c.ended_at).getTime() - new Date(c.started_at).getTime() : null,
      gap: prev ? new Date(c.started_at).getTime() - new Date(prev.started_at).getTime() : null,
    }
  })

  return (
    <>
      <p className="muted">Toca no início de cada contração e volta a tocar quando acabar. O intervalo conta-se de início a início.</p>
      {active && <div className="counter">{formatDuration(now - new Date(active.started_at).getTime())}</div>}
      <motion.button className={`bigbtn ${active ? 'stop' : ''}`} whileTap={{ scale: 0.97 }} onClick={toggle}>{active ? 'Terminou' : 'Começou'}</motion.button>
      <Err msg={err} />
      {rows.some((r) => r.c.ended_at) && <h3 className="section">Histórico</h3>}
      {rows.filter((r) => r.c.ended_at && !hidden.has(r.c.id)).map(({ c, dur, gap }) => (
        <SwipeRow
          key={c.id}
          actions={[
            {
              key: 'delete',
              label: 'Apagar',
              onClick: () =>
                undoable('Contração apagada', {
                  hide: () => setHide(c.id, true),
                  restore: () => setHide(c.id, false),
                  commit: async () => {
                    await supabase.from('contractions').delete().eq('id', c.id)
                    await reload()
                    setHide(c.id, false)
                  },
                }),
            },
          ]}
        >
          <div className="card row">
            <div>
              <strong>Duração {formatDuration(dur!)}</strong>
              <div className="muted">{formatDateTime(c.started_at)}</div>
            </div>
            <span className="chip">{gap != null ? `intervalo ${formatDuration(gap)}` : 'primeira'}</span>
          </div>
        </SwipeRow>
      ))}
      {data.length > 0 && !confirmClear && <button className="cell danger" onClick={() => setConfirmClear(true)}>Limpar histórico</button>}
      {confirmClear && (
        <div className="card stack" role="alertdialog" aria-label="Confirmar limpeza">
          <p>Apagar todas as contrações? Isto não se pode desfazer.</p>
          <div className="inline">
            <button className="btn secondary" style={{ flex: 1 }} onClick={() => setConfirmClear(false)}>Cancelar</button>
            <button className="btn" style={{ flex: 1 }} onClick={clear}>Apagar tudo</button>
          </div>
        </div>
      )}
    </>
  )
}

// Planos próprios, progressivos: segundos a contrair, a relaxar e repetições.
const KEGEL_LEVELS = [
  { name: 'Iniciar', squeeze: 3, relax: 3, reps: 8 },
  { name: 'Base', squeeze: 5, relax: 5, reps: 10 },
  { name: 'Médio', squeeze: 7, relax: 5, reps: 10 },
  { name: 'Avançado', squeeze: 10, relax: 5, reps: 12 },
] as const

function Kegel() {
  const [lvl, setLvl] = useState(() => {
    try {
      return Math.min(Number(localStorage.getItem('kegel-level') ?? 0) || 0, KEGEL_LEVELS.length - 1)
    } catch {
      return 0
    }
  })
  const L = KEGEL_LEVELS[lvl]
  const [run, setRun] = useState<{ rep: number; phase: 'squeeze' | 'relax'; until: number } | null>(null)
  const now = useNow(!!run)
  const reduce = useReducedMotion()

  useEffect(() => {
    if (!run || now < run.until) return
    if (run.phase === 'squeeze') {
      tick(8)
      setRun({ ...run, phase: 'relax', until: Date.now() + L.relax * 1000 })
    } else if (run.rep + 1 < L.reps) {
      tick(14)
      setRun({ rep: run.rep + 1, phase: 'squeeze', until: Date.now() + L.squeeze * 1000 })
    } else {
      tick(30)
      setRun(null)
    }
  }, [now, run, L])

  function pick(i: number) {
    setLvl(i)
    try {
      localStorage.setItem('kegel-level', String(i))
    } catch {
      /* sem armazenamento: o nível só não fica guardado */
    }
  }

  const left = run ? Math.max(Math.ceil((run.until - now) / 1000), 0) : 0
  return (
    <>
      <p className="muted">Exercícios do pavimento pélvico: contrai como se quisesses travar o xixi, sem prender a respiração, e relaxa por completo. Se sentires dor, para e fala com a tua equipa de saúde.</p>
      <div className="seg" role="radiogroup" aria-label="Nível">
        {KEGEL_LEVELS.map((k, i) => (
          <button key={k.name} role="radio" aria-checked={i === lvl} className={i === lvl ? 'on' : ''} disabled={!!run} onClick={() => pick(i)}>{k.name}</button>
        ))}
      </div>
      <p className="center muted">{L.reps} repetições · {L.squeeze} s a contrair · {L.relax} s a relaxar</p>
      {run ? (
        <>
          <motion.div
            className="kegel-ring"
            animate={{ scale: run.phase === 'squeeze' && !reduce ? 0.82 : 1 }}
            transition={{ duration: run.phase === 'squeeze' ? L.squeeze * 0.6 : L.relax * 0.6, ease: 'easeInOut' }}
            aria-live="polite"
          >
            <div>
              <strong>{left}</strong>
              <div>{run.phase === 'squeeze' ? 'Contrai' : 'Relaxa'}</div>
            </div>
          </motion.div>
          <p className="center muted">Repetição {run.rep + 1} de {L.reps}</p>
          <button className="btn secondary" onClick={() => setRun(null)}>Parar</button>
        </>
      ) : (
        <motion.button className="bigbtn" whileTap={{ scale: 0.97 }} onClick={() => setRun({ rep: 0, phase: 'squeeze', until: Date.now() + L.squeeze * 1000 })}>Começar</motion.button>
      )}
    </>
  )
}
