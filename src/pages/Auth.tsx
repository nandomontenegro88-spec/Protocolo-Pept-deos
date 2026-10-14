import { useState } from 'react'
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
      <div className="hero-emoji">🤰</div>
      <h1>Bebé a caminho</h1>
      <p className="muted">A vossa gravidez, a dois.</p>
      <form onSubmit={submit} className="stack">
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <input type="password" placeholder="Palavra-passe (mín. 6)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
        <button className="btn" disabled={busy}>{mode === 'in' ? 'Entrar' : 'Criar conta'}</button>
        {msg && <p className="error">{msg}</p>}
      </form>
      <button className="link" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
        {mode === 'in' ? 'Ainda não tenho conta' : 'Já tenho conta'}
      </button>
    </main>
  )
}
