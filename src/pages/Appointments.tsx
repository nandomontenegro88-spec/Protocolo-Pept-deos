import { useCallback, useState } from 'react'
import { useApp } from '../lib/app-context'
import { signedUrl, unwrap, uploadPrivate, useLoad } from '../lib/hooks'
import { formatDateTime } from '../lib/pregnancy'
import { errMsg, supabase } from '../lib/supabase'
import { Paperclip, Plus, X } from '@phosphor-icons/react'
import { Err, Header, PageSkeleton, Sheet } from '../components/ui'
import { Rise } from '../components/motion'

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

  const fetchAll = useCallback(
    async () =>
      unwrap(await supabase.from('appointments').select('*').eq('couple_id', coupleId).order('starts_at')) as Appt[],
    [coupleId],
  )
  const { data, reload, error, loading } = useLoad(fetchAll, [] as Appt[])
  const now = new Date().toISOString()
  const upcoming = data.filter((a) => a.starts_at >= now)
  const past = data.filter((a) => a.starts_at < now).reverse()

  return (
    <>
      <Header title="Consultas e exames" right={<button className="btn small" onClick={() => setAdding(true)}><Plus size={18} weight="bold" aria-hidden /> Novo</button>} />
      <Err msg={error} />
      {loading && <PageSkeleton rows={3} />}
      <h3 className="section">Próximas</h3>
      {!loading && upcoming.length === 0 && <p className="muted">Sem marcações. Toca em Novo para adicionar a próxima consulta ou ecografia.</p>}
      {upcoming.map((a, i) => <Rise key={a.id} i={i}><ApptRow a={a} onClick={() => setOpen(a)} /></Rise>)}
      {past.length > 0 && <h3 className="section">Anteriores</h3>}
      {past.map((a, i) => <Rise key={a.id} i={i}><ApptRow a={a} onClick={() => setOpen(a)} /></Rise>)}

      {adding && <AddAppt onClose={() => setAdding(false)} onSaved={() => { setAdding(false); void reload() }} />}
      {open && <Detail a={open} onClose={() => { setOpen(null); void reload() }} />}
    </>
  )
}

function ApptRow({ a, onClick }: { a: Appt; onClick: () => void }) {
  return (
    <button className="card row left" onClick={onClick}>
      <div>
        <strong>{a.title}</strong>
        <div className="muted">{formatDateTime(a.starts_at)}{a.location ? ` · ${a.location}` : ''}</div>
      </div>
      <span className="chip">{KINDS[a.kind]}</span>
    </button>
  )
}

function AddAppt({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { coupleId } = useApp()
  const [kind, setKind] = useState<Appt['kind']>('consulta')
  const [title, setTitle] = useState('')
  const [when, setWhen] = useState('')
  const [location, setLocation] = useState('')
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (!title.trim() || !when) return setErr('Preenche o título e a data.')
    const { error } = await supabase.from('appointments').insert({
      couple_id: coupleId,
      kind,
      title: title.trim(),
      starts_at: new Date(when).toISOString(),
      location: location.trim() || null,
    })
    if (error) setErr(errMsg(error))
    else onSaved()
  }

  return (
    <Sheet title="Nova marcação" onClose={onClose}>
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

function Detail({ a, onClose }: { a: Appt; onClose: () => void }) {
  const { coupleId } = useApp()
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
  async function delQ(x: Question) {
    await supabase.from('appointment_questions').delete().eq('id', x.id)
    void questions.reload()
  }
  async function saveNotes() {
    const { error } = await supabase.from('appointments').update({ post_notes: notes.trim() || null }).eq('id', a.id)
    setErr(error ? errMsg(error) : null)
  }
  async function upload(f: File | undefined) {
    if (!f) return
    try {
      const path = await uploadPrivate(coupleId, f)
      const { error } = await supabase.from('files').insert({ couple_id: coupleId, appointment_id: a.id, path, name: f.name, content_type: f.type })
      if (error) throw error
      void files.reload()
    } catch (e) {
      setErr(errMsg(e))
    }
  }
  async function openFile(f: FileRow) {
    const url = await signedUrl(f.path)
    if (url) window.open(url, '_blank', 'noopener')
  }
  async function delFile(f: FileRow) {
    await supabase.storage.from('private').remove([f.path])
    await supabase.from('files').delete().eq('id', f.id)
    void files.reload()
  }
  async function delAppt() {
    if (!confirm('Apagar esta marcação?')) return
    await supabase.from('appointments').delete().eq('id', a.id)
    onClose()
  }

  return (
    <Sheet title={a.title} onClose={onClose}>
      <p className="muted">{formatDateTime(a.starts_at)}{a.location ? ` · ${a.location}` : ''}</p>

      <h3 className="section">Perguntas para levar</h3>
      {questions.data.map((x) => (
        <div key={x.id} className="row">
          <label className="check"><input type="checkbox" checked={x.done} onChange={() => toggleQ(x)} /> <span className={x.done ? 'done' : ''}>{x.text}</span></label>
          <button className="icon-btn" onClick={() => delQ(x)} aria-label="Apagar"><X size={18} /></button>
        </div>
      ))}
      <div className="inline">
        <input aria-label="Nova pergunta" placeholder="Nova pergunta" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addQ()} />
        <button className="btn small" onClick={addQ} aria-label="Adicionar pergunta"><Plus size={18} weight="bold" /></button>
      </div>

      <h3 className="section">Notas pós-consulta</h3>
      <textarea aria-label="Notas pós-consulta" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} placeholder="O que foi dito, valores, próximos passos…" />

      <h3 className="section">Ecografias e documentos</h3>
      {files.data.map((f) => (
        <div key={f.id} className="row">
          <button className="link" onClick={() => openFile(f)}><Paperclip size={16} aria-hidden /> {f.name}</button>
          <button className="icon-btn" onClick={() => delFile(f)} aria-label="Apagar"><X size={18} /></button>
        </div>
      ))}
      <label className="btn secondary small">
        Carregar ficheiro
        <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = '' }} />
      </label>
      <Err msg={err} />
      <button className="link danger" onClick={delAppt}>Apagar marcação</button>
    </Sheet>
  )
}
