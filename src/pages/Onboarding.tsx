import { useState } from 'react'
import { errMsg, supabase } from '../lib/supabase'
import DatingForm from '../components/DatingForm'

export default function Onboarding({ coupleId, onDone }: { coupleId: string; onDone: () => void }) {
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save(due: string, lmp: string) {
    setBusy(true)
    const { error } = await supabase.from('pregnancy').insert({ couple_id: coupleId, due_date: due, lmp })
    setBusy(false)
    if (error) setErr(errMsg(error))
    else onDone()
  }

  return (
    <main className="screen">
      <h1>Vamos calcular a vossa semana</h1>
      <p className="muted">
        Os médicos contam as semanas desde o 1.º dia da última menstruação. Os testes de farmácia contam desde a ovulação, cerca de 2 semanas depois. Escolhe o que tens à mão.
      </p>
      <DatingForm busy={busy} cta="Continuar" onSave={(d, l) => void save(d, l)} />
      {err && <p className="error" role="alert">{err}</p>}
    </main>
  )
}
