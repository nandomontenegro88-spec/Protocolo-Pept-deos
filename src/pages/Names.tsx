import { useCallback, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Heart, Plus, Question, ThumbsDown, ThumbsUp, X } from '@phosphor-icons/react'
import { useApp } from '../lib/app-context'
import { unwrap, useLoad } from '../lib/hooks'
import { errMsg, supabase } from '../lib/supabase'
import { Err, Header } from '../components/ui'
import { useUndoable } from '../components/toast'
import { tick } from '../lib/haptics'
import { ListRow } from '../components/motion'

type Vote = 'sim' | 'talvez' | 'nao'
interface NameRow { id: string; name: string }
interface VoteRow { name_id: string; vote: Vote }

const VOTES = [
  { v: 'sim', label: 'Sim', Icon: ThumbsUp },
  { v: 'talvez', label: 'Talvez', Icon: Question },
  { v: 'nao', label: 'Não', Icon: ThumbsDown },
] as const

export default function Names() {
  const { coupleId, userId } = useApp()
  const [tab, setTab] = useState<'vote' | 'matches'>('vote')
  const [name, setName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const undoable = useUndoable()

  const fetchNames = useCallback(
    async () => unwrap(await supabase.from('baby_names').select('id, name').eq('couple_id', coupleId).order('name')) as NameRow[],
    [coupleId],
  )
  const fetchVotes = useCallback(
    async () => unwrap(await supabase.from('name_votes').select('name_id, vote').eq('user_id', userId)) as VoteRow[],
    [userId],
  )
  const fetchMatches = useCallback(
    async () => unwrap(await supabase.rpc('name_matches', { p_couple: coupleId })) as NameRow[],
    [coupleId],
  )
  const names = useLoad(fetchNames, [] as NameRow[])
  const votes = useLoad(fetchVotes, [] as VoteRow[])
  const matches = useLoad(fetchMatches, [] as NameRow[])
  const mine = new Map(votes.data.map((v) => [v.name_id, v.vote]))

  async function add() {
    const n = name.trim()
    if (!n) return
    const { error } = await supabase.from('baby_names').insert({ couple_id: coupleId, name: n })
    if (error) return setErr(error.code === '23505' ? 'Esse nome já está na lista.' : errMsg(error))
    setErr(null)
    setName('')
    void names.reload()
  }
  async function vote(id: string, v: Vote) {
    tick(8)
    const { error } = await supabase.from('name_votes').upsert({ name_id: id, couple_id: coupleId, user_id: userId, vote: v }, { onConflict: 'name_id,user_id' })
    if (error) setErr(errMsg(error))
    void votes.reload()
    void matches.reload()
  }
  const setHide = (id: string, on: boolean) =>
    setHidden((s) => {
      const n = new Set(s)
      if (on) n.add(id)
      else n.delete(id)
      return n
    })
  const remove = (n: NameRow) =>
    undoable(`"${n.name}" apagado`, {
      hide: () => setHide(n.id, true),
      restore: () => setHide(n.id, false),
      commit: async () => {
        await supabase.from('baby_names').delete().eq('id', n.id)
        await Promise.all([names.reload(), matches.reload()])
        setHide(n.id, false)
      },
    })
  const shown = names.data.filter((n) => !hidden.has(n.id))

  return (
    <>
      <Header title="Nomes" />
      <div className="seg">
        <button className={tab === 'vote' ? 'on' : ''} onClick={() => setTab('vote')}>Votar</button>
        <button className={tab === 'matches' ? 'on' : ''} onClick={() => { setTab('matches'); void matches.reload() }}>Matches ({matches.data.length})</button>
      </div>

      {tab === 'vote' ? (
        <>
          <p className="muted">Os teus votos são secretos. O teu par só vê os nomes em que ambos disseram sim.</p>
          <form className="inline" onSubmit={(e) => { e.preventDefault(); void add() }}>
            <input aria-label="Adicionar nome" placeholder="Adicionar nome" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn small" aria-label="Adicionar nome"><Plus size={18} weight="bold" /></button>
          </form>
          <Err msg={err} />
          <AnimatePresence initial={false}>
          {!names.loading && shown.length === 0 && (
            <div className="card empty">
              <Heart size={40} weight="duotone" aria-hidden />
              <h2>Ainda sem nomes</h2>
              <p className="muted">Escreve o primeiro acima. Cada um adiciona os seus e vota em segredo.</p>
            </div>
          )}
          {shown.map((n) => (
            <ListRow key={n.id} className="card">
              <div className="row">
                <strong className="name">{n.name}</strong>
                <button className="icon-btn" aria-label={`Apagar: ${n.name}`} onClick={() => remove(n)}><X size={18} /></button>
              </div>
              <div className="votes">
                {VOTES.map(({ v, label, Icon }) => (
                  <button
                    key={v}
                    className={mine.get(n.id) === v ? `on ${v}` : ''}
                    aria-pressed={mine.get(n.id) === v}
                    onClick={() => vote(n.id, v)}
                  >
                    <Icon size={18} weight={mine.get(n.id) === v ? 'fill' : 'regular'} aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
            </ListRow>
          ))}
          </AnimatePresence>
        </>
      ) : matches.data.length === 0 ? (
        <p className="muted">Ainda sem matches. Quando os dois votarem 👍 no mesmo nome, aparece aqui.</p>
      ) : (
        matches.data.map((n, i) => (
          <motion.div
            key={n.id}
            className="card match"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 18, delay: i * 0.06 }}
          >
            <Heart size={24} weight="fill" aria-hidden /> {n.name}
          </motion.div>
        ))
      )}
    </>
  )
}
