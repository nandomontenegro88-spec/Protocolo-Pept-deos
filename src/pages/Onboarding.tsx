import { useState } from 'react'
import { dueFromLmp, formatDate, lmpFromDue, progress, toDateOnly } from '../lib/pregnancy'
import { errMsg, supabase } from '../lib/supabase'

export default function Onboarding({ coupleId, onDone }: { coupleId: string; onDone: () => void }) {
  const [mode, setMode] = useState<'lmp' | 'due'>('lmp')
  const [value, setValue] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const today = toDateOnly(new Date())
  const due = value ? (mode === 'lmp' ? dueFromLmp(value) : value) : null
  const p = due ? progress(due) : null
  const valid = p !== null && p.totalDays >= 0 && p.totalDays <= 294

  async function save() {
    if (!due) return
    setBusy(true)
    const { error } = await supabase
      .from('pregnancy')
      .insert({ couple_id: coupleId, due_date: due, lmp: lmpFromDue(due) })
    setBusy(false)
    if (error) setErr(errMsg(error))
    else onDone()
  }

  return (
    <main className="screen">
      <h1>Vamos calcular a vossa semana</h1>
      <div className="seg">
        <button className={mode === 'lmp' ? 'on' : ''} onClick={() => { setMode('lmp'); setValue('') }}>Última menstruação</button>
        <button className={mode === 'due' ? 'on' : ''} onClick={() => { setMode('due'); setValue('') }}>Data prevista do parto</button>
      </div>
      <label className="stack">
        <span className="muted">{mode === 'lmp' ? '1.º dia da última menstruação' : 'Data prevista do parto'}</span>
        <input
          type="date"
          value={value}
          min={mode === 'lmp' ? toDateOnly(new Date(Date.now() - 294 * 86_400_000)) : today}
          max={mode === 'lmp' ? today : undefined}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      {due && p && valid && (
        <div className="card">
          <p><strong>{p.weeks} semanas e {p.days} dias</strong> · {p.trimester}.º trimestre</p>
          <p className="muted">Parto previsto a {formatDate(due)} — faltam {p.daysLeft} dias.</p>
        </div>
      )}
      {due && !valid && <p className="error">Esta data não dá uma gravidez em curso. Confirma-a.</p>}
      {err && <p className="error">{err}</p>}
      <button className="btn" disabled={!valid || busy} onClick={save}>Continuar</button>
    </main>
  )
}
