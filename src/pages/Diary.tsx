import { useCallback, useState } from 'react'
import { useApp } from '../lib/app-context'
import { unwrap, uploadPrivate, useLoad, useNearViewport, useSignedUrl } from '../lib/hooks'
import { errMsg, supabase } from '../lib/supabase'
import { progress } from '../lib/pregnancy'
import { Heart, MoonStars, Smiley, SmileyMeh, SmileyNervous, SmileySad } from '@phosphor-icons/react'
import { Err, Header, PageSkeleton, Sheet } from '../components/ui'
import { Rise } from '../components/motion'

interface Entry {
  id: string
  week: number
  photo_path: string | null
  weight_kg: number | null
  mood: string | null
  note: string | null
}

const MOODS = [
  { key: 'apaixonada', label: 'Apaixonada', Icon: Heart },
  { key: 'bem', label: 'Bem', Icon: Smiley },
  { key: 'normal', label: 'Normal', Icon: SmileyMeh },
  { key: 'cansada', label: 'Cansada', Icon: MoonStars },
  { key: 'enjoada', label: 'Enjoada', Icon: SmileyNervous },
  { key: 'em-baixo', label: 'Em baixo', Icon: SmileySad },
] as const

function MoodIcon({ mood }: { mood: string | null }) {
  const m = MOODS.find((x) => x.key === mood)
  return m ? <m.Icon size={20} weight="duotone" aria-label={m.label} /> : null
}

export default function Diary() {
  const { coupleId, dueDate } = useApp()
  const current = progress(dueDate).currentWeek
  const [editing, setEditing] = useState<{ week: number; entry?: Entry } | null>(null)

  const fetchAll = useCallback(
    async () => unwrap(await supabase.from('diary_entries').select('*').eq('couple_id', coupleId).order('week', { ascending: false })) as Entry[],
    [coupleId],
  )
  const { data, reload, error, loading } = useLoad(fetchAll, [] as Entry[])
  const byWeek = new Map(data.map((e) => [e.week, e]))
  const weeks = Array.from({ length: current }, (_, i) => current - i)

  return (
    <>
      <Header title="Diário da barriga" />
      <Err msg={error} />
      {loading && <PageSkeleton rows={3} />}
      <div className="timeline">
        {!loading && weeks.map((w, i) => {
          const e = byWeek.get(w)
          return (
            <Rise key={w} i={i}>
              <button className="card tl" onClick={() => setEditing({ week: w, entry: e })}>
                <div className="tl-week">Semana {w}</div>
                {e ? <EntryView e={e} /> : <div className="muted">{w === current ? 'Toca para adicionar a foto desta semana' : 'Sem registo. Toca para adicionar.'}</div>}
              </button>
            </Rise>
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
  // O URL assinado e a imagem só são pedidos quando o cartão se aproxima do ecrã.
  const [ref, near] = useNearViewport<HTMLDivElement>()
  const url = useSignedUrl(e.photo_path, near)
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="tl-body" ref={ref}>
      {e.photo_path && (
        <div className="img-ph">
          {url && (
            <img
              src={url}
              alt={`Foto da semana ${e.week}`}
              width={96}
              height={128}
              loading="lazy"
              decoding="async"
              className={loaded ? 'loaded' : ''}
              onLoad={() => setLoaded(true)}
            />
          )}
        </div>
      )}
      <div>
        <div className="mood-line"><MoodIcon mood={e.mood} /> {e.weight_kg != null && <span className="chip">{e.weight_kg} kg</span>}</div>
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
          {MOODS.map(({ key, label, Icon }) => (
            <button key={key} className={key === mood ? 'on' : ''} aria-label={label} aria-pressed={key === mood} onClick={() => setMood(key === mood ? '' : key)}>
              <Icon size={26} weight={key === mood ? 'fill' : 'regular'} aria-hidden />
            </button>
          ))}
        </div>
        <input aria-label="Peso em kg" inputMode="decimal" placeholder="Peso em kg (opcional)" value={weight} onChange={(e) => setWeight(e.target.value)} />
        <textarea aria-label="Notas" rows={4} placeholder="Notas" value={note} onChange={(e) => setNote(e.target.value)} />
        <Err msg={err} />
        <button className="btn" disabled={busy} onClick={save}>Guardar</button>
      </div>
    </Sheet>
  )
}
