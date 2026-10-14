import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { configured, supabase } from './lib/supabase'
import { Ctx, type AppCtx, type Member } from './lib/app-context'
import AuthPage from './pages/Auth'
import CouplePage from './pages/Couple'
import Onboarding from './pages/Onboarding'
import Home from './pages/Home'
import Appointments from './pages/Appointments'
import Diary from './pages/Diary'
import Lists from './pages/Lists'
import Names from './pages/Names'
import Tools from './pages/Tools'

const TABS = [
  { id: 'home', label: 'Início', icon: '🏠', el: Home },
  { id: 'appt', label: 'Consultas', icon: '📅', el: Appointments },
  { id: 'diary', label: 'Diário', icon: '📷', el: Diary },
  { id: 'lists', label: 'Listas', icon: '✅', el: Lists },
  { id: 'names', label: 'Nomes', icon: '💬', el: Names },
  { id: 'tools', label: 'Ferramentas', icon: '⏱️', el: Tools },
] as const

type TabId = (typeof TABS)[number]['id']

interface CoupleState {
  coupleId: string
  inviteCode: string
  members: Member[]
  dueDate: string | null
}

export default function App() {
  if (!configured) return <Setup />
  return <Authed />
}

function Setup() {
  return (
    <main className="screen">
      <h1>Falta configurar o Supabase</h1>
      <p className="muted">
        Copia <code>.env.example</code> para <code>.env</code>, preenche <code>VITE_SUPABASE_URL</code> e{' '}
        <code>VITE_SUPABASE_ANON_KEY</code> e aplica <code>supabase/migrations/0001_init.sql</code>.
      </p>
    </main>
  )
}

function Authed() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <div className="screen center muted">A carregar…</div>
  if (!session) return <AuthPage />
  return <WithSession userId={session.user.id} />
}

function WithSession({ userId }: { userId: string }) {
  const [state, setState] = useState<CoupleState | null | undefined>(undefined)
  const [tab, setTab] = useState<TabId>('home')

  const load = useCallback(async () => {
    const { data: mine } = await supabase
      .from('couple_members')
      .select('couple_id')
      .eq('user_id', userId)
      .maybeSingle()
    if (!mine) return setState(null)
    const [couple, members, preg] = await Promise.all([
      supabase.from('couples').select('invite_code').eq('id', mine.couple_id).single(),
      supabase.from('couple_members').select('user_id, display_name').eq('couple_id', mine.couple_id),
      supabase.from('pregnancy').select('due_date').eq('couple_id', mine.couple_id).maybeSingle(),
    ])
    setState({
      coupleId: mine.couple_id,
      inviteCode: couple.data?.invite_code ?? '',
      members: members.data ?? [],
      dueDate: preg.data?.due_date ?? null,
    })
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  if (state === undefined) return <div className="screen center muted">A carregar…</div>
  if (state === null) return <CouplePage onDone={load} />
  if (!state.dueDate) return <Onboarding coupleId={state.coupleId} onDone={load} />

  const { coupleId, members, dueDate } = state
  const ctx: AppCtx = {
    userId,
    coupleId,
    inviteCode: state.inviteCode,
    members,
    dueDate,
    setDueDate: async (d) => {
      const { error } = await supabase.from('pregnancy').update({ due_date: d }).eq('couple_id', coupleId)
      if (error) throw new Error(error.message)
      await load()
    },
    nameOf: (id) => members.find((m) => m.user_id === id)?.display_name ?? '—',
    signOut: async () => {
      await supabase.auth.signOut()
    },
  }
  const Page = TABS.find((t) => t.id === tab)!.el

  return (
    <Ctx.Provider value={ctx}>
      <main className="page">
        <Page />
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={t.id === tab ? 'on' : ''} onClick={() => setTab(t.id)}>
            <span aria-hidden>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </Ctx.Provider>
  )
}
