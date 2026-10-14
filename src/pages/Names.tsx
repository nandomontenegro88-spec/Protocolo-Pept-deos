import { useCallback, useState } from 'react'
import { useApp } from '../lib/app-context'
import { unwrap, useLoad } from '../lib/hooks'
import { errMsg, supabase } from '../lib/supabase'
import { Err, Header } from '../components/ui'

type Vote = 'sim' | 'talvez' | 'nao'
interface NameRow { id: string; name: string }
interface VoteRow { name_id: string; vote: Vote }

const VOTES: { v: Vote; label: string }[] = [
  { v: 'sim', label: '👍 Sim' },
  { v: 'talvez', label: '🤔 Talvez' },
  { v: 'nao', label: '👎 Não' },
]

export default function Names() {
  const { coupleId, userId } = useApp()
  const [tab, setTab] = useState<'vote' | 'matches'>('vote')
  const [name, setName] = useState('')
  const [err, setErr] = useState<string | null>(null)

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
    const { error } = await supabase.from('name_votes').upsert({ name_id: id, couple_id: coupleId, user_id: userId, vote: v }, { onConflict: 'name_id,user_id' })
    if (error) setErr(errMsg(error))
    void votes.reload()
    void matches.reload()
  }
  async function remove(id: string) {
    if (!confirm('Apagar este nome?')) return
    await supabase.from('baby_names').delete().eq('id', id)
    void names.reload()
    void matches.reload()
  }

  return (
    <>
      <Header title="Nomes" />
      <div className="seg">
        <button className={tab === 'vote' ? 'on' : ''} onClick={() => setTab('vote')}>Votar</button>
        <button className={tab === 'matches' ? 'on' : ''} onClick={() => { setTab('matches'); void matches.reload() }}>Matches ({matches.data.length})</button>
      </div>

      {tab === 'vote' ? (
        <>
          <p className="muted">Os teus votos são secretos — o teu par só vê os nomes em que ambos disseram sim.</p>
          <form className="inline" onSubmit={(e) => { e.preventDefault(); void add() }}>
            <input placeholder="Adicionar nome" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn small">+</button>
          </form>
          <Err msg={err} />
          {names.data.map((n) => (
            <div key={n.id} className="card">
              <div className="row">
                <strong className="name">{n.name}</strong>
                <button className="link" aria-label="Apagar" onClick={() => remove(n.id)}>✕</button>
              </div>
              <div className="votes">
                {VOTES.map(({ v, label }) => (
                  <button key={v} className={mine.get(n.id) === v ? `on ${v}` : ''} onClick={() => vote(n.id, v)}>{label}</button>
                ))}
              </div>
            </div>
          ))}
        </>
      ) : matches.data.length === 0 ? (
        <p className="muted">Ainda sem matches. Quando os dois votarem 👍 no mesmo nome, aparece aqui.</p>
      ) : (
        matches.data.map((n) => <div key={n.id} className="card match">💞 {n.name}</div>)
      )}
    </>
  )
}
