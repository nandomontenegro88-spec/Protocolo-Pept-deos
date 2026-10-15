import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CalendarCheck, Camera, ChatsCircle, House, ListChecks, Timer } from '@phosphor-icons/react'
import type { Session } from '@supabase/supabase-js'
import { configured, supabase } from './lib/supabase'
import { Ctx, type AppCtx, type Member } from './lib/app-context'
import AuthPage from './pages/Auth'
import CouplePage from './pages/Couple'
import Onboarding from './pages/Onboarding'
import Home from './pages/Home'
import { PageSkeleton } from './components/ui'
import { ToastProvider } from './components/toast'

// Só o Início vem no pacote inicial; as restantes páginas carregam a pedido.
const loaders = {
  appt: () => import('./pages/Appointments'),
  diary: () => import('./pages/Diary'),
  lists: () => import('./pages/Lists'),
  names: () => import('./pages/Names'),
  tools: () => import('./pages/Tools'),
}
const Appointments = lazy(loaders.appt)
const Diary = lazy(loaders.diary)
const Lists = lazy(loaders.lists)
const Names = lazy(loaders.names)
const Tools = lazy(loaders.tools)

const TABS = [
  { id: 'home', label: 'Início', icon: House, el: Home, hue: 'gold' },
  { id: 'appt', label: 'Consultas', icon: CalendarCheck, el: Appointments, hue: 'sky' },
  { id: 'diary', label: 'Diário', icon: Camera, el: Diary, hue: 'coral' },
  { id: 'lists', label: 'Listas', icon: ListChecks, el: Lists, hue: 'mint' },
  { id: 'names', label: 'Nomes', icon: ChatsCircle, el: Names, hue: 'lilac' },
  { id: 'tools', label: 'Ferramentas', icon: Timer, el: Tools, hue: 'sun' },
] as const

type TabId = (typeof TABS)[number]['id']

interface CoupleState {
  coupleId: string
  inviteCode: string
  members: Member[]
  dueDate: string | null
}

export default function App() {
  return <div className="bebe">{configured ? <Authed /> : <Setup />}</div>
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

  if (session === undefined) return <div className="screen"><PageSkeleton /></div>
  if (!session) return <AuthPage />
  return <WithSession userId={session.user.id} />
}

function WithSession({ userId }: { userId: string }) {
  const [state, setState] = useState<CoupleState | null | undefined>(undefined)
  const [tab, setTab] = useState<TabId>(() => {
    const h = window.location.hash.slice(1)
    return (TABS.find((t) => t.id === h)?.id ?? 'home') as TabId
  })
  const [dir, setDir] = useState(1)
  const go = (id: TabId) => {
    setDir(TABS.findIndex((t) => t.id === id) > TABS.findIndex((t) => t.id === tab) ? 1 : -1)
    setTab(id)
    // o separador fica no endereço: atualizar a página ou partilhar o link mantém o sítio
    history.replaceState(history.state, '', `#${id}`)
  }

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

  // Com a app já aberta, descarrega as outras páginas quando o navegador está livre.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((f: () => void) => window.setTimeout(f, 1500))
    idle(() => Object.values(loaders).forEach((l) => void l()))
  }, [])

  if (state === undefined) return <div className="screen"><PageSkeleton /></div>
  if (state === null) return <CouplePage onDone={load} />
  if (!state.dueDate) return <Onboarding coupleId={state.coupleId} onDone={load} />

  const { coupleId, members, dueDate } = state
  const ctx: AppCtx = {
    userId,
    coupleId,
    inviteCode: state.inviteCode,
    members,
    dueDate,
    setPregnancy: async (due, lmp) => {
      const { error } = await supabase.from('pregnancy').update({ due_date: due, lmp }).eq('couple_id', coupleId)
      if (error) throw new Error(error.message)
      await load()
    },
    nameOf: (id) => members.find((m) => m.user_id === id)?.display_name ?? 'Alguém',
    signOut: async () => {
      await supabase.auth.signOut()
    },
  }
  const current = TABS.find((t) => t.id === tab)!
  const Page = current.el

  return (
    <Ctx.Provider value={ctx}>
      <ToastProvider>
      <main className="page" data-hue={current.hue}>
        {/* A página entra do lado para onde a aba está na barra e sai pelo lado oposto. */}
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={tab}
            className="page-inner"
            custom={dir}
            variants={{
              enter: (d: number) => ({ opacity: 0, x: d * 28 }),
              center: { opacity: 1, x: 0, transition: { type: 'spring', bounce: 0, duration: 0.35 } },
              exit: (d: number) => ({ opacity: 0, x: -d * 28, transition: { duration: 0.12 } }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
          >
            <Suspense fallback={<PageSkeleton />}>
              <Page />
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>
      <nav className="tabbar" data-hue={current.hue} aria-label="Secções">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={t.id === tab ? 'on' : ''}
            aria-current={t.id === tab ? 'page' : undefined}
            aria-label={t.label}
            onClick={() => go(t.id)}
          >
            <t.icon size={24} weight={t.id === tab ? 'fill' : 'regular'} aria-hidden />
            <span className="lbl">{t.label}</span>
          </button>
        ))}
      </nav>
      </ToastProvider>
    </Ctx.Provider>
  )
}
