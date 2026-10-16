import { useState } from 'react'
import { ArrowsClockwise, CalendarBlank, CalendarPlus, CaretRight, Copy, Heart, Info, SignOut, UserCircle } from '@phosphor-icons/react'
import { useApp } from '../lib/app-context'
import { formatDate } from '../lib/pregnancy'
import { errMsg, supabase } from '../lib/supabase'
import { calendarFeedUrl } from '../lib/ics'
import { useTheme, type ThemeChoice } from '../lib/theme'
import { useToast } from './toast'
import { Err, Sheet } from './ui'

const THEMES: [ThemeChoice, string][] = [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']]

/** Ajustes ao estilo iOS: listas agrupadas com aspeto, gravidez, casal, calendário e sobre. */
export default function Settings({ onClose, onEditDates }: { onClose: () => void; onEditDates: () => void }) {
  const { userId, coupleId, members, inviteCode, dueDate, nameOf, signOut, refresh } = useApp()
  const toast = useToast()
  const [theme, setTheme] = useTheme()
  const [name, setName] = useState(nameOf(userId))
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const partner = members.find((m) => m.user_id !== userId)

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast(`${what} copiado`)
    } catch {
      setErr('Não foi possível copiar. Seleciona e copia à mão: ' + text)
    }
  }

  async function saveName() {
    const n = name.trim()
    if (!n || n === nameOf(userId)) return setName(nameOf(userId))
    const { error } = await supabase.from('couple_members').update({ display_name: n }).eq('user_id', userId)
    if (error) return setErr(errMsg(error))
    await refresh()
    toast('Nome atualizado')
  }

  async function feedToken(): Promise<string | null> {
    const { data, error } = await supabase.from('couples').select('calendar_token').eq('id', coupleId).single()
    if (error || !data?.calendar_token) {
      setErr(error ? errMsg(error) : 'O calendário ainda não está ativo.')
      return null
    }
    return data.calendar_token as string
  }

  async function subscribe() {
    setBusy(true)
    const t = await feedToken()
    setBusy(false)
    // webcal:// abre "Subscrever calendário" no iPhone e no Mac
    if (t) window.location.href = calendarFeedUrl(t)
  }

  async function renew() {
    setBusy(true)
    const { error } = await supabase.rpc('new_calendar_token', { p_couple: coupleId })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    toast('Endereço renovado. Subscreve de novo nos dois telemóveis.')
  }

  return (
    <Sheet title="Ajustes" onClose={onClose}>
      <h3 className="section">Aspeto</h3>
      <div className="seg" role="radiogroup" aria-label="Aspeto">
        {THEMES.map(([k, label]) => (
          <button key={k} role="radio" aria-checked={theme === k} className={theme === k ? 'on' : ''} onClick={() => setTheme(k)}>{label}</button>
        ))}
      </div>
      <p className="footnote">Automático segue o modo claro ou escuro do telemóvel.</p>

      <h3 className="section">Gravidez</h3>
      <div className="group">
        <div className="cell static">
          <CalendarBlank size={22} weight="duotone" aria-hidden />
          <span className="cell-label">Data prevista</span>
          <span className="cell-value">{formatDate(dueDate, { day: 'numeric', month: 'long' })}</span>
        </div>
        <button className="cell" onClick={onEditDates}>
          <ArrowsClockwise size={22} weight="duotone" aria-hidden />
          <span className="cell-label">Rever as datas</span>
          <CaretRight size={16} weight="bold" className="cell-chevron" aria-hidden />
        </button>
      </div>

      <h3 className="section">Casal</h3>
      <div className="group">
        <label className="cell static">
          <UserCircle size={22} weight="duotone" aria-hidden />
          <span className="cell-label">O meu nome</span>
          <input
            className="cell-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void saveName()}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            maxLength={40}
            enterKeyHint="done"
          />
        </label>
        <div className="cell static">
          <Heart size={22} weight="duotone" aria-hidden />
          <span className="cell-label">Par</span>
          <span className="cell-value">{partner?.display_name ?? 'Ainda não entrou'}</span>
        </div>
        {!partner && (
          <button className="cell" onClick={() => void copy(inviteCode, 'Código')}>
            <Copy size={22} weight="duotone" aria-hidden />
            <span className="cell-label">Código de convite<small>{inviteCode}</small></span>
            <span className="cell-value tinted">Copiar</span>
          </button>
        )}
      </div>

      <h3 className="section">Calendário</h3>
      <div className="group">
        <button className="cell" onClick={() => void subscribe()} disabled={busy}>
          <CalendarPlus size={22} weight="duotone" aria-hidden />
          <span className="cell-label">Subscrever no Calendário<small>As consultas aparecem e atualizam-se sozinhas</small></span>
          <CaretRight size={16} weight="bold" className="cell-chevron" aria-hidden />
        </button>
        <button className="cell" onClick={() => void feedToken().then((t) => { if (t) void copy(calendarFeedUrl(t, 'https'), 'Endereço') })} disabled={busy}>
          <Copy size={22} weight="duotone" aria-hidden />
          <span className="cell-label">Copiar endereço<small>Para Google Calendar ou Outlook</small></span>
        </button>
        <button className="cell" onClick={() => void renew()} disabled={busy}>
          <ArrowsClockwise size={22} weight="duotone" aria-hidden />
          <span className="cell-label">Renovar endereço<small>Se o partilharam por engano</small></span>
        </button>
      </div>
      <p className="footnote">Cada um subscreve no seu telemóvel. O iPhone procura alterações a cada hora; quem tiver o endereço vê as consultas.</p>

      <h3 className="section">Sobre</h3>
      <div className="group">
        <div className="cell static about">
          <Info size={22} weight="duotone" aria-hidden />
          <span className="cell-label">
            Bebé a caminho
            <small>Os dados ficam no vosso espaço privado: só vocês os veem. Os textos e tamanhos são uma referência geral e não substituem a vossa equipa de saúde.</small>
          </span>
        </div>
      </div>

      <Err msg={err} />
      <div className="group">
        <button className="cell danger" onClick={() => void signOut()}>
          <SignOut size={20} aria-hidden /> Terminar sessão
        </button>
      </div>
    </Sheet>
  )
}
