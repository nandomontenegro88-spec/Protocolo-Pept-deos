import { useState } from 'react'
import { errMsg, supabase } from '../lib/supabase'

export default function CouplePage({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    if (!name.trim()) return setErr('Indica o teu nome.')
    setBusy(true)
    setErr(null)
    const { error } = await fn()
    setBusy(false)
    if (error) setErr(error.message === 'invalid code' ? 'Código inválido.' : error.message === 'couple full' ? 'Este casal já está completo.' : errMsg(error))
    else onDone()
  }

  return (
    <main className="screen">
      <h1>Quem és tu?</h1>
      <label className="field">
        <span>O teu nome</span>
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
      </label>
      <div className="card stack">
        <h2>Sou o primeiro a entrar</h2>
        <p className="muted">Cria o espaço do casal e partilha o código com o teu par.</p>
        <button className="btn" disabled={busy} onClick={() => run(() => supabase.rpc('create_couple', { p_name: name.trim() }))}>
          Criar espaço
        </button>
      </div>
      <div className="card stack">
        <h2>O meu par já criou</h2>
        <label className="field">
          <span>Código de convite</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" autoComplete="off" />
        </label>
        <button className="btn secondary" disabled={busy || !code.trim()} onClick={() => run(() => supabase.rpc('join_couple', { p_code: code, p_name: name.trim() }))}>
          Entrar com código
        </button>
      </div>
      {err && <p className="error" role="alert">{err}</p>}
    </main>
  )
}
