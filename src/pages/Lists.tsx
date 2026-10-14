import { useCallback, useState } from 'react'
import { useApp } from '../lib/app-context'
import { unwrap, useLoad } from '../lib/hooks'
import { errMsg, supabase } from '../lib/supabase'
import { LISTS, type ListKey } from '../data/suggestions'
import { Err, Header } from '../components/ui'

interface Item { id: string; title: string; assignee: string | null; done: boolean }

export default function Lists() {
  const { coupleId, members } = useApp()
  const [list, setList] = useState<ListKey>('mala')
  const [title, setTitle] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const fetchItems = useCallback(
    async () =>
      unwrap(
        await supabase.from('list_items').select('id, title, assignee, done').eq('couple_id', coupleId).eq('list', list).order('created_at').order('id'),
      ) as Item[],
    [coupleId, list],
  )
  const { data, reload } = useLoad(fetchItems, [] as Item[])

  async function run(p: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await p
    setErr(error ? errMsg(error) : null)
    void reload()
  }
  const add = (t: string) => run(supabase.from('list_items').insert({ couple_id: coupleId, list, title: t }))
  const addSuggested = () =>
    run(supabase.from('list_items').insert(LISTS[list].suggestions.map((t) => ({ couple_id: coupleId, list, title: t }))))

  const done = data.filter((i) => i.done).length

  return (
    <>
      <Header title="Listas" />
      <div className="seg">
        {(Object.keys(LISTS) as ListKey[]).map((k) => (
          <button key={k} className={k === list ? 'on' : ''} onClick={() => setList(k)}>{LISTS[k].label.split(' ')[0]}</button>
        ))}
      </div>
      <p className="muted">{LISTS[list].label} · {done}/{data.length} feitos</p>

      {data.length === 0 && (
        <button className="btn secondary" onClick={addSuggested}>Adicionar itens sugeridos</button>
      )}

      {data.map((i) => (
        <div key={i.id} className="card item">
          <input type="checkbox" checked={i.done} onChange={() => run(supabase.from('list_items').update({ done: !i.done }).eq('id', i.id))} />
          <button
            className={`link grow ${i.done ? 'done' : ''}`}
            onClick={() => {
              const t = prompt('Editar item', i.title)
              if (t && t.trim()) void run(supabase.from('list_items').update({ title: t.trim() }).eq('id', i.id))
            }}
          >
            {i.title}
          </button>
          <select
            value={i.assignee ?? ''}
            onChange={(e) => run(supabase.from('list_items').update({ assignee: e.target.value || null }).eq('id', i.id))}
            aria-label="Responsável"
          >
            <option value="">—</option>
            {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
          </select>
          <button className="link" aria-label="Apagar" onClick={() => run(supabase.from('list_items').delete().eq('id', i.id))}>✕</button>
        </div>
      ))}

      <form
        className="inline"
        onSubmit={(e) => {
          e.preventDefault()
          if (title.trim()) { void add(title.trim()); setTitle('') }
        }}
      >
        <input placeholder="Novo item" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button className="btn small">+</button>
      </form>
      <Err msg={err} />
    </>
  )
}
