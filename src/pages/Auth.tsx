import { useState } from 'react'
import { Baby } from '@phosphor-icons/react'
import { errMsg, supabase } from '../lib/supabase'

export default function AuthPage() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const { data, error } =
      mode === 'in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })
    setBusy(false)
    if (error) setMsg(errMsg(error))
    else if (mode === 'up' && !data.session) setMsg('Verifica o teu email para confirmar a conta.')
  }

  return (
    <main className="screen">
      <Baby size={72} weight="duotone" className="hero-icon" aria-hidden />
      <h1>Bebé a caminho</h1>
      <p className="muted">A vossa gravidez, a dois.</p>
      <form onSubmit={submit} className="stack">
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label className="field">
          <span>Palavra-passe (mínimo 6 caracteres)</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
        </label>
        <button className="btn" disabled={busy}>{mode === 'in' ? 'Entrar' : 'Criar conta'}</button>
        {msg && <p className="error" role="alert">{msg}</p>}
      </form>
      <button className="link" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
        {mode === 'in' ? 'Ainda não tenho conta' : 'Já tenho conta'}
      </button>
    </main>
  )
}
