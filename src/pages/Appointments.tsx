import { useCallback, useState } from 'react'
import { useApp } from '../lib/app-context'
import { signedUrl, unwrap, uploadPrivate, useLoad } from '../lib/hooks'
import { formatDateTime } from '../lib/pregnancy'
import { errMsg, supabase } from '../lib/supabase'
import { Paperclip, Plus, X } from '@phosphor-icons/react'
import { Err, Header, PageSkeleton, Sheet } from '../components/ui'
import { Rise } from '../components/motion'
import { useToast, useUndoable } from '../components/toast'
import { SwipeRow } from '../components/swipe'

interface Appt {
  id: string
  kind: 'consulta' | 'ecografia' | 'analises' | 'outro'
  title: string
  starts_at: string
  location: string | null
  post_notes: string | null
}
interface Question { id: string; text: string; done: boolean }
interface FileRow { id: string; path: string; name: string; content_type: string | null }

const KINDS = { consulta: 'Consulta', ecografia: 'Ecografia', analises: 'Análises', outro: 'Outro' } as const

export default function Appointments() {
  const { coupleId } = useApp()
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState<Appt | null>(null)
  const [editing, setEditing] = useState<Appt | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const undoable = useUndoable()
  const toast = useToast()

  const fetchAll = useCallback(
    async () =>
      unwrap(await supabase.from('appointments').select('*').eq('couple_id', coupleId).order('starts_at')) as Appt[],
    [coupleId],
  )
  const { data, reload, error, loading } = useLoad(fetchAll, [] as Appt[])
  const now = new Date().toISOString()
  const shown = data.filter((a) => !hidden.has(a.id))
  const upcoming = shown.filter((a) => a.starts_at >= now)
  const past = shown.filter((a) => a.starts_at < now).reverse()
  const setHide = (id: string, on: boolean) =>
    setHidden((s) => {
      const n = new Set(s)
      if (on) n.add(id)
      else n.delete(id)
      return n
    })
  const removeAppt = (a: Appt) => {
    setOpen(null)
    undoable(`"${a.title}" apagada`, {
      hide: () => setHide(a.id, true),
      restore: () => setHide(a.id, false),
      commit: async () => {
        // apaga também os ficheiros do armazenamento privado
        const { data: fs } = await supabase.from('files').select('id, path').eq('appointment_id', a.id)
        if (fs?.length) {
          await supabase.storage.from('private').remove(fs.map((f) => f.path))
          await supabase.from('files').delete().in('id', fs.map((f) => f.id))
        }
        await supabase.from('appointments').delete().eq('id', a.id)
        await reload()
        setHide(a.id, false)
      },
    })
  }

  return (
    <>
      <Header title="Consultas" right={<button className="btn small" onClick={() => setAdding(true)}><Plus size={18} weight="bold" aria-hidden /> Novo</button>} />
      <Err msg={error} />
      {loading && <PageSkeleton rows={3} />}
      <h3 className="section">Próximas</h3>
      {!loading && upcoming.length === 0 && (
        <div className="card empty ghost">
          <p>Sem marcações à vista.</p>
          <p className="muted">Junta a próxima consulta, ecografia ou análises, e leva as perguntas preparadas.</p>
          <button className="btn small" onClick={() => setAdding(true)}>Adicionar marcação</button>
        </div>
      )}
      {upcoming.map((a, i) => <Rise key={a.id} i={i}><ApptRow a={a} onClick={() => setOpen(a)} onEdit={() => setEditing(a)} onDelete={() => removeAppt(a)} /></Rise>)}
      {past.length > 0 && <h3 className="section">Anteriores</h3>}
      {past.map((a, i) => <Rise key={a.id} i={i}><ApptRow a={a} onClick={() => setOpen(a)} onEdit={() => setEditing(a)} onDelete={() => removeAppt(a)} /></Rise>)}

      {editing && <AddAppt appt={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); toast('Marcação atualizada') }} />}
      {adding && <AddAppt onClose={() => setAdding(false)} onSaved={() => { setAdding(false); void reload(); toast('Marcação adicionada') }} />}
      {open && <Detail a={open} onClose={() => { setOpen(null); void reload() }} onDelete={removeAppt} />}
    </>
  )
}

function ApptRow({ a, onClick, onEdit, onDelete }: { a: Appt; onClick: () => void; onEdit: () => void; onDelete: () => void }) {
  return (
    <SwipeRow
      actions={[
        { key: 'edit', label: 'Editar', onClick: onEdit },
        { key: 'delete', label: 'Apagar', onClick: onDelete },
      ]}
    >
      <button className="card tint row left" onClick={onClick}>
        <div>
          <strong>{a.title}</strong>
          <div className="muted">{formatDateTime(a.starts_at)}{a.location ? ` · ${a.location}` : ''}</div>
        </div>
        <span className="chip">{KINDS[a.kind]}</span>
      </button>
    </SwipeRow>
  )
}

/** ISO (UTC) para o formato de <input type="datetime-local"> na hora local. */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function AddAppt({ appt, onClose, onSaved }: { appt?: Appt; onClose: () => void; onSaved: () => void }) {
  const { coupleId } = useApp()
  const [kind, setKind] = useState<Appt['kind']>(appt?.kind ?? 'consulta')
  const [title, setTitle] = useState(appt?.title ?? '')
  const [when, setWhen] = useState(appt ? toLocalInput(appt.starts_at) : '')
  const [location, setLocation] = useState(appt?.location ?? '')
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (!title.trim() || !when) return setErr('Preenche o título e a data.')
    const row = { kind, title: title.trim(), starts_at: new Date(when).toISOString(), location: location.trim() || null }
    const { error } = appt
      ? await supabase.from('appointments').update(row).eq('id', appt.id)
      : await supabase.from('appointments').insert({ couple_id: coupleId, ...row })
    if (error) setErr(errMsg(error))
    else onSaved()
  }

  return (
    <Sheet title={appt ? "Editar marcação" : "Nova marcação"} onClose={onClose}>
      <div className="stack">
        <label className="field">
          <span>Tipo</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as Appt['kind'])}>
            {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Título</span>
          <input placeholder="Ex.: Ecografia morfológica" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span>Data e hora</span>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <label className="field">
          <span>Local (opcional)</span>
          <input value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
        <Err msg={err} />
        <button className="btn" onClick={save}>Guardar</button>
      </div>
    </Sheet>
  )
}

function Detail({ a, onClose, onDelete }: { a: Appt; onClose: () => void; onDelete: (a: Appt) => void }) {
  const { coupleId } = useApp()
  const toast = useToast()
  const undoable = useUndoable()
  const [hiddenQ, setHiddenQ] = useState<Set<string>>(new Set())
  const [hiddenF, setHiddenF] = useState<Set<string>>(new Set())
  const [notes, setNotes] = useState(a.post_notes ?? '')
  const [q, setQ] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const fetchQ = useCallback(
    async () => unwrap(await supabase.from('appointment_questions').select('id, text, done').eq('appointment_id', a.id).order('id')) as Question[],
    [a.id],
  )
  const fetchF = useCallback(
    async () => unwrap(await supabase.from('files').select('id, path, name, content_type').eq('appointment_id', a.id).order('created_at')) as FileRow[],
    [a.id],
  )
  const questions = useLoad(fetchQ, [] as Question[])
  const files = useLoad(fetchF, [] as FileRow[])

  async function addQ() {
    if (!q.trim()) return
    const { error } = await supabase.from('appointment_questions').insert({ couple_id: coupleId, appointment_id: a.id, text: q.trim() })
    if (error) return setErr(errMsg(error))
    setQ('')
    void questions.reload()
  }
  async function toggleQ(x: Question) {
    await supabase.from('appointment_questions').update({ done: !x.done }).eq('id', x.id)
    void questions.reload()
  }
  const toggleSet = (set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string, on: boolean) =>
    set((s) => {
      const n = new Set(s)
      if (on) n.add(id)
      else n.delete(id)
      return n
    })
  const delQ = (x: Question) =>
    undoable('Pergunta apagada', {
      hide: () => toggleSet(setHiddenQ, x.id, true),
      restore: () => toggleSet(setHiddenQ, x.id, false),
      commit: async () => {
        await supabase.from('appointment_questions').delete().eq('id', x.id)
        await questions.reload()
        toggleSet(setHiddenQ, x.id, false)
      },
    })
  async function saveNotes() {
    const { error } = await supabase.from('appointments').update({ post_notes: notes.trim() || null }).eq('id', a.id)
    setErr(error ? errMsg(error) : null)
    if (!error) toast('Notas guardadas')
  }
  async function upload(f: File | undefined) {
    if (!f) return
    try {
      const path = await uploadPrivate(coupleId, f)
      const { error } = await supabase.from('files').insert({ couple_id: coupleId, appointment_id: a.id, path, name: f.name, content_type: f.type })
      if (error) throw error
      void files.reload()
      toast('Ficheiro guardado')
    } catch (e) {
      setErr(errMsg(e))
    }
  }
  async function openFile(f: FileRow) {
    const url = await signedUrl(f.path)
    if (url) window.open(url, '_blank', 'noopener')
  }
  const delFile = (f: FileRow) =>
    undoable(`"${f.name}" apagado`, {
      hide: () => toggleSet(setHiddenF, f.id, true),
      restore: () => toggleSet(setHiddenF, f.id, false),
      commit: async () => {
        await supabase.storage.from('private').remove([f.path])
        await supabase.from('files').delete().eq('id', f.id)
        await files.reload()
        toggleSet(setHiddenF, f.id, false)
      },
    })

  return (
    <Sheet title={a.title} onClose={onClose}>
      <p className="muted">{formatDateTime(a.starts_at)}{a.location ? ` · ${a.location}` : ''}</p>

      <h3 className="section">Perguntas para levar</h3>
      {questions.data.filter((x) => !hiddenQ.has(x.id)).map((x) => (
        <div key={x.id} className="row">
          <label className="check"><input type="checkbox" checked={x.done} onChange={() => toggleQ(x)} /> <span className={x.done ? 'done' : ''}>{x.text}</span></label>
          <button className="icon-btn" onClick={() => delQ(x)} aria-label={`Apagar pergunta: ${x.text}`}><X size={18} /></button>
        </div>
      ))}
      <div className="inline">
        <input aria-label="Nova pergunta" placeholder="Nova pergunta" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addQ()} />
        <button className="btn small" onClick={addQ} aria-label="Adicionar pergunta"><Plus size={18} weight="bold" /></button>
      </div>

      <h3 className="section">Notas pós-consulta</h3>
      <textarea aria-label="Notas pós-consulta" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} placeholder="O que foi dito, valores, próximos passos…" />

      <h3 className="section">Ecografias e documentos</h3>
      {files.data.filter((f) => !hiddenF.has(f.id)).map((f) => (
        <div key={f.id} className="row">
          <button className="link" onClick={() => openFile(f)}><Paperclip size={16} aria-hidden /> {f.name}</button>
          <button className="icon-btn" onClick={() => delFile(f)} aria-label={`Apagar ficheiro: ${f.name}`}><X size={18} /></button>
        </div>
      ))}
      <label className="btn secondary small">
        Carregar ficheiro
        <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = '' }} />
      </label>
      <Err msg={err} />
      <button className="link danger" onClick={() => onDelete(a)}>Apagar marcação</button>
    </Sheet>
  )
}
