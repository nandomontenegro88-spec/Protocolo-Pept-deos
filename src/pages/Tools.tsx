import { useCallback, useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { useApp } from '../lib/app-context'
import { unwrap, useLoad } from '../lib/hooks'
import { formatDateTime, formatDuration } from '../lib/pregnancy'
import { errMsg, supabase } from '../lib/supabase'
import { tick } from '../lib/haptics'
import { Err, Header } from '../components/ui'

export default function Tools() {
  const [tool, setTool] = useState<'kicks' | 'contr'>('kicks')
  return (
    <>
      <Header title="Ferramentas" />
      <div className="seg">
        <button className={tool === 'kicks' ? 'on' : ''} onClick={() => setTool('kicks')}>Movimentos</button>
        <button className={tool === 'contr' ? 'on' : ''} onClick={() => setTool('contr')}>Contrações</button>
      </div>
      {tool === 'kicks' ? <Kicks /> : <Contractions />}
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
  async function stop() {
    if (!active) return
    await supabase.from('kick_sessions').update({ ended_at: new Date().toISOString() }).eq('id', active.id)
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
          <button className="btn secondary" onClick={stop}>Terminar sessão</button>
        </>
      ) : (
        <motion.button className="bigbtn" whileTap={{ scale: 0.97 }} onClick={start}>Iniciar sessão</motion.button>
      )}
      <Err msg={err} />
      <h3 className="section">Histórico</h3>
      {data.filter((s) => s.ended_at).map((s) => (
        <div key={s.id} className="card row">
          <div>
            <strong>{s.count} movimentos</strong>
            <div className="muted">{formatDateTime(s.started_at)}</div>
          </div>
          <span className="chip">{formatDuration(new Date(s.ended_at!).getTime() - new Date(s.started_at).getTime())}</span>
        </div>
      ))}
    </>
  )
}

interface Contraction { id: string; started_at: string; ended_at: string | null }

function Contractions() {
  const { coupleId } = useApp()
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
  async function clear() {
    if (!confirm('Apagar todo o histórico de contrações?')) return
    await supabase.from('contractions').delete().eq('couple_id', coupleId)
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
      <h3 className="section">Histórico</h3>
      {rows.filter((r) => r.c.ended_at).map(({ c, dur, gap }) => (
        <div key={c.id} className="card row">
          <div>
            <strong>Duração {formatDuration(dur!)}</strong>
            <div className="muted">{formatDateTime(c.started_at)}</div>
          </div>
          <span className="chip">{gap != null ? `intervalo ${formatDuration(gap)}` : 'primeira'}</span>
        </div>
      ))}
      {data.length > 0 && <button className="link danger" onClick={clear}>Limpar histórico</button>}
    </>
  )
}
