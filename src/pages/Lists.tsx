import { useCallback, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { ListChecks, Plus, X } from '@phosphor-icons/react'
import { useApp } from '../lib/app-context'
import { unwrap, useLoad } from '../lib/hooks'
import { errMsg, supabase } from '../lib/supabase'
import { LISTS, type ListKey } from '../data/suggestions'
import { Err, Header, Skeleton } from '../components/ui'
import { ListRow } from '../components/motion'
import { useUndoable } from '../components/toast'

interface Item { id: string; title: string; assignee: string | null; done: boolean }

export default function Lists() {
  const { coupleId, members } = useApp()
  const [list, setList] = useState<ListKey>('mala')
  const [title, setTitle] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [editId, setEditId] = useState<string | null>(null)
  const undoable = useUndoable()

  const fetchItems = useCallback(
    async () =>
      unwrap(
        await supabase.from('list_items').select('id, title, assignee, done').eq('couple_id', coupleId).eq('list', list).order('created_at').order('id'),
      ) as Item[],
    [coupleId, list],
  )
  const { data, reload, loading } = useLoad(fetchItems, [] as Item[])

  async function run(p: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await p
    setErr(error ? errMsg(error) : null)
    void reload()
  }
  const add = (t: string) => run(supabase.from('list_items').insert({ couple_id: coupleId, list, title: t }))
  const addSuggested = () =>
    run(supabase.from('list_items').insert(LISTS[list].suggestions.map((t) => ({ couple_id: coupleId, list, title: t }))))

  const visible = data.filter((i) => !hidden.has(i.id))
  const done = visible.filter((i) => i.done).length
  const setHide = (id: string, on: boolean) =>
    setHidden((s) => {
      const n = new Set(s)
      if (on) n.add(id)
      else n.delete(id)
      return n
    })
  const remove = (i: Item) =>
    undoable(`"${i.title}" apagado`, {
      hide: () => setHide(i.id, true),
      restore: () => setHide(i.id, false),
      commit: async () => {
        await supabase.from('list_items').delete().eq('id', i.id)
        await reload()
        setHide(i.id, false)
      },
    })
  const rename = (i: Item, t: string) => {
    setEditId(null)
    const v = t.trim()
    if (v && v !== i.title) void run(supabase.from('list_items').update({ title: v }).eq('id', i.id))
  }

  return (
    <>
      <Header title="Listas" />
      <div className="seg">
        {(Object.keys(LISTS) as ListKey[]).map((k) => (
          <button key={k} className={k === list ? 'on' : ''} onClick={() => setList(k)}>{LISTS[k].label.split(' ')[0]}</button>
        ))}
      </div>
      <p className="muted" aria-live="polite">{LISTS[list].label} · {done} de {visible.length} feitos</p>

      {loading && <Skeleton h={56} />}
      {!loading && visible.length === 0 && (
        <div className="card empty">
          <ListChecks size={40} weight="duotone" aria-hidden />
          <h2>Lista vazia</h2>
          <p className="muted">Começa com sugestões para a {LISTS[list].label.toLowerCase()}. Podes editar, apagar e juntar o que quiseres.</p>
          <button className="btn" onClick={addSuggested}>Adicionar sugestões</button>
        </div>
      )}

      <AnimatePresence initial={false}>
      {visible.map((i) => (
        <ListRow key={i.id} className="card tint item">
          <label className="hit">
            <input type="checkbox" aria-label={`Feito: ${i.title}`} checked={i.done} onChange={() => run(supabase.from('list_items').update({ done: !i.done }).eq('id', i.id))} />
          </label>
          {editId === i.id ? (
            <input
              className="edit-input"
              aria-label="Editar item"
              defaultValue={i.title}
              autoFocus
              onBlur={(e) => rename(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') setEditId(null)
              }}
            />
          ) : (
            <button className={`link grow ${i.done ? 'done' : ''}`} aria-label={`Editar: ${i.title}`} onClick={() => setEditId(i.id)}>
              {i.title}
            </button>
          )}
          <select
            value={i.assignee ?? ''}
            onChange={(e) => run(supabase.from('list_items').update({ assignee: e.target.value || null }).eq('id', i.id))}
            aria-label="Responsável"
          >
            <option value="">Ninguém</option>
            {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
          </select>
          <button className="icon-btn" aria-label={`Apagar: ${i.title}`} onClick={() => remove(i)}><X size={18} /></button>
        </ListRow>
      ))}
      </AnimatePresence>

      <form
        className="inline"
        onSubmit={(e) => {
          e.preventDefault()
          if (title.trim()) { void add(title.trim()); setTitle('') }
        }}
      >
        <input aria-label="Novo item" placeholder="Novo item" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button className="btn small" aria-label="Adicionar item"><Plus size={18} weight="bold" /></button>
      </form>
      <Err msg={err} />
    </>
  )
}
