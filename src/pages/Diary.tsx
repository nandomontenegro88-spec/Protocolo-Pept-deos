import { useCallback, useState } from 'react'
import { useApp } from '../lib/app-context'
import { unwrap, uploadPrivate, useLoad, useSignedUrl } from '../lib/hooks'
import { errMsg, supabase } from '../lib/supabase'
import { progress } from '../lib/pregnancy'
import { Err, Header, Sheet } from '../components/ui'

interface Entry {
  id: string
  week: number
  photo_path: string | null
  weight_kg: number | null
  mood: string | null
  note: string | null
}

const MOODS = ['😍', '😊', '😐', '😴', '🤢', '😢']

export default function Diary() {
  const { coupleId, dueDate } = useApp()
  const current = progress(dueDate).currentWeek
  const [editing, setEditing] = useState<{ week: number; entry?: Entry } | null>(null)

  const fetchAll = useCallback(
    async () => unwrap(await supabase.from('diary_entries').select('*').eq('couple_id', coupleId).order('week', { ascending: false })) as Entry[],
    [coupleId],
  )
  const { data, reload, error } = useLoad(fetchAll, [] as Entry[])
  const byWeek = new Map(data.map((e) => [e.week, e]))
  const weeks = Array.from({ length: current }, (_, i) => current - i)

  return (
    <>
      <Header title="Diário da barriga" />
      <Err msg={error} />
      <div className="timeline">
        {weeks.map((w) => {
          const e = byWeek.get(w)
          return (
            <button key={w} className="card tl" onClick={() => setEditing({ week: w, entry: e })}>
              <div className="tl-week">Semana {w}</div>
              {e ? <EntryView e={e} /> : <div className="muted">{w === current ? 'Toca para adicionar a foto desta semana' : 'Sem registo — toca para adicionar'}</div>}
            </button>
          )
        })}
      </div>
      {editing && (
        <EditEntry
          week={editing.week}
          entry={editing.entry}
          coupleId={coupleId}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void reload() }}
        />
      )}
    </>
  )
}

function EntryView({ e }: { e: Entry }) {
  const url = useSignedUrl(e.photo_path)
  return (
    <div className="tl-body">
      {e.photo_path && (url ? <img src={url} alt={`Semana ${e.week}`} /> : <div className="img-ph" />)}
      <div>
        <div>{e.mood} {e.weight_kg != null && <span className="chip">{e.weight_kg} kg</span>}</div>
        {e.note && <p>{e.note}</p>}
      </div>
    </div>
  )
}

function EditEntry({ week, entry, coupleId, onClose, onSaved }: { week: number; entry?: Entry; coupleId: string; onClose: () => void; onSaved: () => void }) {
  const [weight, setWeight] = useState(entry?.weight_kg?.toString() ?? '')
  const [mood, setMood] = useState(entry?.mood ?? '')
  const [note, setNote] = useState(entry?.note ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    try {
      const photo_path = file ? await uploadPrivate(coupleId, file) : entry?.photo_path ?? null
      const w = weight.trim() ? Number(weight.replace(',', '.')) : null
      if (w !== null && !(w > 0 && w < 400)) throw new Error('Peso inválido.')
      const { error } = await supabase.from('diary_entries').upsert(
        { couple_id: coupleId, week, photo_path, weight_kg: w, mood: mood || null, note: note.trim() || null },
        { onConflict: 'couple_id,week' },
      )
      if (error) throw error
      if (file && entry?.photo_path) await supabase.storage.from('private').remove([entry.photo_path])
      onSaved()
    } catch (e) {
      setErr(errMsg(e))
      setBusy(false)
    }
  }

  return (
    <Sheet title={`Semana ${week}`} onClose={onClose}>
      <div className="stack">
        <label className="btn secondary small">
          {file ? file.name : entry?.photo_path ? 'Trocar foto' : 'Escolher foto'}
          <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <div className="moods">
          {MOODS.map((m) => <button key={m} className={m === mood ? 'on' : ''} onClick={() => setMood(m === mood ? '' : m)}>{m}</button>)}
        </div>
        <input inputMode="decimal" placeholder="Peso em kg (opcional)" value={weight} onChange={(e) => setWeight(e.target.value)} />
        <textarea rows={4} placeholder="Notas" value={note} onChange={(e) => setNote(e.target.value)} />
        <Err msg={err} />
        <button className="btn" disabled={busy} onClick={save}>Guardar</button>
      </div>
    </Sheet>
  )
}
