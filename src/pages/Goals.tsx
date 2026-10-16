import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowCounterClockwise, Check, Drop, Fire, GearSix, Minus, PersonSimpleRun, Pill, Plus, Target } from '@phosphor-icons/react'
import { useApp } from '../lib/app-context'
import { unwrap, useLoad } from '../lib/hooks'
import { errMsg, supabase } from '../lib/supabase'
import { tick } from '../lib/haptics'
import {
  DEFAULTS, activeOn, addDays, dayKey, litres, parseDay, statusOf, streak,
  type DayLog, type DayStatus, type Settings, type Supplement,
} from '../lib/goals'
import { Err, Header, PageSkeleton, Sheet } from '../components/ui'
import { Rise, ListRow } from '../components/motion'
import { SwipeRow } from '../components/swipe'
import { useToast, useUndoable } from '../components/toast'

/** Janela de histórico: 10 semanas, a última é a semana atual. */
const WEEKS = 10
/** Ideias de nomes (sem doses: essas são as que a equipa de saúde indicar). */
const SUGGESTED = ['Ácido fólico', 'Vitamina D', 'Iodo', 'Ferro', 'Ómega-3 (DHA)', 'Multivitamínico para grávidas']

interface Loaded {
  settings: Settings
  supplements: Supplement[]
  logs: Record<string, DayLog>
  /** pares "idSuplemento|dia" tomados */
  checks: Set<string>
}

const ck = (id: string, day: string) => `${id}|${day}`
const takenOn = (checks: Set<string>, supps: Supplement[], day: string) =>
  new Set(supps.filter((s) => checks.has(ck(s.id, day))).map((s) => s.id))

function dayLabel(day: string, today: string): string {
  if (day === today) return 'Hoje'
  if (day === addDays(today, -1)) return 'Ontem'
  return parseDay(day).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function Goals() {
  const { coupleId } = useApp()
  const toast = useToast()
  const undoable = useUndoable()
  // "hoje" só muda quando a data muda de verdade (app aberta de um dia para o outro)
  const [today, setToday] = useState(() => dayKey())
  const [day, setDay] = useState(today)
  const [err, setErr] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editing, setEditing] = useState<Supplement | 'new' | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  useEffect(() => {
    const check = () => {
      const t = dayKey()
      setToday((old) => {
        if (old !== t) setDay((d) => (d === old ? t : d))
        return t
      })
    }
    document.addEventListener('visibilitychange', check)
    const id = window.setInterval(check, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.clearInterval(id)
    }
  }, [])

  const from = addDays(today, -(WEEKS * 7 + 7))
  const fetchAll = useCallback(async (): Promise<Loaded> => {
    const [s, sup, logs, checks] = await Promise.all([
      supabase.from('goal_settings').select('water_ml, glass_ml, exercise_min').eq('couple_id', coupleId).maybeSingle(),
      supabase.from('supplements').select('id, name, dose, starts_on, ends_on').eq('couple_id', coupleId).order('created_at'),
      supabase.from('day_logs').select('day, water_ml, exercise_min, water_goal, exercise_goal').eq('couple_id', coupleId).gte('day', from),
      supabase.from('supplement_checks').select('supplement_id, day').eq('couple_id', coupleId).gte('day', from),
    ])
    return {
      settings: unwrap(s) ?? DEFAULTS,
      supplements: unwrap(sup) as Supplement[],
      logs: Object.fromEntries((unwrap(logs) as DayLog[]).map((l) => [l.day, l])),
      checks: new Set((unwrap(checks) as { supplement_id: string; day: string }[]).map((c) => ck(c.supplement_id, c.day))),
    }
  }, [coupleId, from])
  const { data, error, reload } = useLoad(fetchAll, null as Loaded | null)

  // Cópia local para responder logo ao toque; o servidor só a substitui quando não há escritas por enviar.
  const [local, setLocal] = useState<Loaded | null>(null)
  const pending = useRef(0)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  useEffect(() => {
    if (data && pending.current === 0) setLocal(data)
  }, [data])

  /** Escritas em fila: chegam ao servidor pela ordem dos toques, e no fim volta-se a ler o estado real. */
  const enqueue = useCallback(
    (op: () => PromiseLike<{ error: { message: string } | null }>) => {
      pending.current++
      queue.current = queue.current
        .then(op)
        .then(
          ({ error: e }) => setErr(e ? errMsg(e) : null),
          (e) => setErr(errMsg(e)),
        )
        .finally(() => {
          pending.current--
          if (pending.current === 0) void reload()
        })
    },
    [reload],
  )

  const view = useMemo(() => {
    if (!local) return null
    const { settings, supplements, logs, checks } = local
    const statusFor = (d: string): DayStatus => statusOf(d, logs[d], settings, supplements, takenOn(checks, supplements, d))
    return { ...local, statusFor }
  }, [local])

  if (error && !view) {
    return (
      <>
        <Header title="Metas do dia" icon={Target} />
        <div className="card stack">
          <p>Não foi possível carregar as metas.</p>
          <p className="muted">Se é a primeira vez, falta aplicar o ficheiro <code>supabase/migrations/0004_metas_diarias.sql</code> no Supabase.</p>
          <Err msg={error} />
          <button className="btn small" onClick={() => void reload()}>Tentar de novo</button>
        </div>
      </>
    )
  }
  if (!view) return <PageSkeleton rows={4} />

  const { settings, supplements, logs, checks, statusFor } = view
  const log = logs[day]
  const water = log?.water_ml ?? 0
  const exercise = log?.exercise_min ?? 0
  const waterGoal = log?.water_goal ?? settings.water_ml
  const exGoal = log?.exercise_goal ?? settings.exercise_min
  const st = statusFor(day)
  const due = activeOn(supplements, day).filter((s) => !hidden.has(s.id))
  const taken = takenOn(checks, supplements, day)
  const isToday = day === today

  function patchLog(patch: Partial<Pick<DayLog, 'water_ml' | 'exercise_min'>>) {
    const cur = logs[day]
    const next: DayLog = {
      day,
      water_ml: cur?.water_ml ?? 0,
      exercise_min: cur?.exercise_min ?? 0,
      // hoje segue as metas atuais; os dias passados mantêm as metas que tinham
      water_goal: isToday ? settings.water_ml : (cur?.water_goal ?? settings.water_ml),
      exercise_goal: isToday ? settings.exercise_min : (cur?.exercise_goal ?? settings.exercise_min),
      ...patch,
    }
    next.water_ml = Math.max(0, Math.min(20000, next.water_ml))
    next.exercise_min = Math.max(0, Math.min(1440, next.exercise_min))
    setLocal((l) => (l ? { ...l, logs: { ...l.logs, [day]: next } } : l))
    enqueue(() => supabase.from('day_logs').upsert({ couple_id: coupleId, ...next }, { onConflict: 'couple_id,day' }))
  }

  function addWater(delta: number) {
    tick(delta > 0 ? 12 : 8)
    const before = water >= waterGoal
    patchLog({ water_ml: water + delta })
    if (!before && water + delta >= waterGoal) toast('Meta da água cumprida')
  }
  function addExercise(delta: number) {
    tick(12)
    const before = exercise >= exGoal
    patchLog({ exercise_min: exercise + delta })
    if (!before && exercise + delta >= exGoal) toast('Meta de exercício cumprida')
  }

  function toggleSupp(s: Supplement) {
    tick(10)
    const on = taken.has(s.id)
    setLocal((l) => {
      if (!l) return l
      const c = new Set(l.checks)
      if (on) c.delete(ck(s.id, day))
      else c.add(ck(s.id, day))
      return { ...l, checks: c }
    })
    enqueue(() =>
      on
        ? supabase.from('supplement_checks').delete().eq('supplement_id', s.id).eq('day', day)
        : supabase.from('supplement_checks').insert({ supplement_id: s.id, couple_id: coupleId, day }),
    )
  }

  const addSupps = (rows: { name: string; dose?: string }[]) =>
    enqueue(() =>
      supabase.from('supplements').insert(rows.map((r) => ({ couple_id: coupleId, name: r.name, dose: r.dose?.trim() || null, starts_on: today }))),
    )
  const saveSupp = (s: Supplement, name: string, dose: string) =>
    enqueue(() => supabase.from('supplements').update({ name, dose: dose.trim() || null }).eq('id', s.id))
  const removeSupp = (s: Supplement) =>
    undoable(`"${s.name}" removido a partir de hoje`, {
      hide: () => setHidden((h) => new Set(h).add(s.id)),
      restore: () =>
        setHidden((h) => {
          const n = new Set(h)
          n.delete(s.id)
          return n
        }),
      // o histórico fica intacto: só deixa de contar a partir de hoje
      commit: () => {
        enqueue(() => supabase.from('supplements').update({ ends_on: today }).eq('id', s.id))
        setHidden((h) => {
          const n = new Set(h)
          n.delete(s.id)
          return n
        })
      },
    })

  function saveSettings(next: Settings) {
    setSettingsOpen(false)
    setLocal((l) => {
      if (!l) return l
      const t = l.logs[today]
      return {
        ...l,
        settings: next,
        logs: t ? { ...l.logs, [today]: { ...t, water_goal: next.water_ml, exercise_goal: next.exercise_min } } : l.logs,
      }
    })
    enqueue(() => supabase.from('goal_settings').upsert({ couple_id: coupleId, ...next }, { onConflict: 'couple_id' }))
    enqueue(() =>
      supabase.from('day_logs').update({ water_goal: next.water_ml, exercise_goal: next.exercise_min }).eq('couple_id', coupleId).eq('day', today),
    )
    toast('Metas atualizadas')
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))
  const isComplete = (d: string) => statusFor(d).complete
  const sequence = streak(today, isComplete, WEEKS * 7)

  return (
    <>
      <Header
        title="Metas do dia"
        icon={Target}
        sub={sequence > 0 ? `${sequence} ${sequence === 1 ? 'dia seguido' : 'dias seguidos'} com todas as metas` : 'Água, exercício e suplementos'}
        right={
          <button className="nav-icon" aria-label="Ajustar metas" onClick={() => setSettingsOpen(true)}>
            <GearSix size={24} aria-hidden />
          </button>
        }
      />

      <Rise>
        <div className="daystrip" role="group" aria-label="Últimos 7 dias">
          {weekDays.map((d) => {
            const s = statusFor(d)
            const sel = d === day
            return (
              <button
                key={d}
                className={`dbtn ${sel ? 'on' : ''}`}
                aria-pressed={sel}
                aria-label={`${dayLabel(d, today)}: ${s.done} de ${s.total} metas`}
                onClick={() => {
                  tick(6)
                  setDay(d)
                }}
              >
                <span className="dow">{parseDay(d).toLocaleDateString('pt-PT', { weekday: 'narrow' })}</span>
                <Ring ratio={s.ratio} complete={s.complete} label={String(parseDay(d).getDate())} />
              </button>
            )
          })}
        </div>
      </Rise>

      <Rise i={1}>
        <section className="goal-head" aria-live="polite">
          <div>
            <h2>{dayLabel(day, today)}</h2>
            <p className="muted">
              {st.complete ? 'Todas as metas cumpridas' : `${st.done} de ${st.total} ${st.total === 1 ? 'meta' : 'metas'} cumpridas`}
            </p>
          </div>
          {!isToday && (
            <button className="btn small secondary" onClick={() => setDay(today)}>
              <ArrowCounterClockwise size={18} aria-hidden /> Hoje
            </button>
          )}
        </section>
      </Rise>

      <Rise i={2}>
        <section className="card tint goal" data-hue="sky" aria-label="Água">
          <div className="goal-top">
            <h2><Drop size={22} weight="fill" aria-hidden /> Água</h2>
            <Done on={st.waterDone} />
          </div>
          <p className="goal-num"><strong>{litres(water)}</strong> <span className="muted">de {litres(waterGoal)} L</span></p>
          <Bar value={water} goal={waterGoal} label="Água" />
          <div className="steps">
            <button className="round" aria-label={`Tirar ${settings.glass_ml} ml`} disabled={water <= 0} onClick={() => addWater(-settings.glass_ml)}>
              <Minus size={20} weight="bold" aria-hidden />
            </button>
            <button className="btn grow" onClick={() => addWater(settings.glass_ml)}>
              <Plus size={18} weight="bold" aria-hidden /> Copo · {settings.glass_ml} ml
            </button>
          </div>
        </section>
      </Rise>

      <Rise i={3}>
        <section className="card tint goal" data-hue="coral" aria-label="Exercício">
          <div className="goal-top">
            <h2><PersonSimpleRun size={22} weight="fill" aria-hidden /> Exercício</h2>
            <Done on={st.exerciseDone} />
          </div>
          <p className="goal-num"><strong>{exercise}</strong> <span className="muted">de {exGoal} min</span></p>
          <Bar value={exercise} goal={exGoal} label="Exercício" />
          <div className="steps">
            <button className="round" aria-label="Tirar 5 minutos" disabled={exercise <= 0} onClick={() => addExercise(-5)}>
              <Minus size={20} weight="bold" aria-hidden />
            </button>
            {[10, 15, 30].map((m) => (
              <button key={m} className="pick" onClick={() => addExercise(m)}>+{m} min</button>
            ))}
          </div>
          <p className="hint left">Caminhada, ioga, natação… Combina com a tua equipa de saúde o que é adequado para ti.</p>
        </section>
      </Rise>

      <Rise i={4}>
        <div className="goal-top plain">
          <h2><Pill size={22} weight="fill" aria-hidden /> Suplementos e vitaminas</h2>
          {due.length > 0 && <Done on={st.suppDone === true} text={`${due.filter((s) => taken.has(s.id)).length}/${due.length}`} />}
        </div>
      </Rise>

      {due.length === 0 && (
        <div className="card ghost stack" data-hue="sun">
          <p className="muted">Ainda não há nada para tomar neste dia. Junta os suplementos que a vossa médica indicou, com a dose que ela recomendou.</p>
          <div className="chips" role="group" aria-label="Sugestões de nomes">
            {SUGGESTED.map((n) => (
              <button key={n} className="chip btnchip" onClick={() => addSupps([{ name: n }])}><Plus size={14} weight="bold" aria-hidden /> {n}</button>
            ))}
          </div>
        </div>
      )}

      {due.length > 0 && <p className="hint">Desliza uma linha para a esquerda para editar ou remover.</p>}
      <AnimatePresence initial={false}>
        {due.map((s) => {
          const on = taken.has(s.id)
          return (
            <ListRow key={s.id}>
              <SwipeRow
                className="card tint item"
                actions={[
                  { key: 'edit', label: 'Editar', onClick: () => setEditing(s) },
                  { key: 'delete', label: 'Remover', onClick: () => removeSupp(s) },
                ]}
              >
                <label className="hit">
                  <input type="checkbox" aria-label={`Tomado: ${s.name}`} checked={on} onChange={() => toggleSupp(s)} />
                </label>
                <span className={`grow supp ${on ? 'done' : ''}`}>
                  {s.name}
                  {s.dose && <small className="muted"> · {s.dose}</small>}
                </span>
              </SwipeRow>
            </ListRow>
          )
        })}
      </AnimatePresence>
      <button className="btn secondary small" style={{ alignSelf: 'flex-start' }} onClick={() => setEditing('new')}>
        <Plus size={18} weight="bold" aria-hidden /> Novo suplemento
      </button>
      <Err msg={err} />

      <History today={today} statusFor={statusFor} logs={logs} onPick={(d) => { setDay(d); window.scrollTo({ top: 0, behavior: 'smooth' }) }} selected={day} isComplete={isComplete} />

      {settingsOpen && <SettingsSheet settings={settings} onSave={saveSettings} onClose={() => setSettingsOpen(false)} />}
      {editing && (
        <SuppSheet
          supp={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(name, dose) => {
            if (editing === 'new') addSupps([{ name, dose }])
            else saveSupp(editing, name, dose)
            setEditing(null)
          }}
        />
      )}
    </>
  )
}

/** Anel de progresso pequeno com o dia do mês no centro. */
function Ring({ ratio, complete, label }: { ratio: number; complete: boolean; label: string }) {
  const r = 16
  const c = 2 * Math.PI * r
  return (
    <span className={`gring ${complete ? 'full' : ''}`} aria-hidden>
      <svg viewBox="0 0 40 40">
        <circle cx="20" cy="20" r={r} className="track" />
        <circle cx="20" cy="20" r={r} className="arc" strokeDasharray={`${c * ratio} ${c}`} transform="rotate(-90 20 20)" />
      </svg>
      <span className="n">{complete ? <Check size={16} weight="bold" /> : label}</span>
    </span>
  )
}

function Done({ on, text }: { on: boolean; text?: string }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={String(on)}
        className={`chip ${on ? 'ok' : ''}`}
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 22 }}
      >
        {on && <Check size={14} weight="bold" aria-hidden />}
        {on ? 'Feito' : (text ?? 'Por fazer')}
      </motion.span>
    </AnimatePresence>
  )
}

function Bar({ value, goal, label }: { value: number; goal: number; label: string }) {
  const pct = Math.max(0, Math.min(100, (value / goal) * 100))
  return (
    <div className="bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <motion.div className="fill" initial={false} animate={{ width: `${pct}%` }} transition={{ type: 'spring', bounce: 0, duration: 0.5 }} />
    </div>
  )
}

function History({
  today, statusFor, logs, onPick, selected, isComplete,
}: {
  today: string
  statusFor: (d: string) => DayStatus
  logs: Record<string, DayLog>
  onPick: (d: string) => void
  selected: string
  isComplete: (d: string) => boolean
}) {
  // grelha de segunda a domingo; a última linha é a semana atual
  const dow = (d: string) => (parseDay(d).getDay() + 6) % 7
  const start = addDays(addDays(today, -dow(today)), -(WEEKS - 1) * 7)
  const cells = Array.from({ length: WEEKS * 7 }, (_, i) => addDays(start, i))

  const current = streak(today, isComplete, WEEKS * 7)
  let best = 0
  let run = 0
  for (const d of cells) {
    if (d > today) break
    run = isComplete(d) ? run + 1 : 0
    best = Math.max(best, run)
  }
  const last30 = Array.from({ length: 30 }, (_, i) => addDays(today, -i))
  const completeDays = last30.filter(isComplete).length
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, -i))
  const avgWater = last7.reduce((a, d) => a + (logs[d]?.water_ml ?? 0), 0) / 7
  const exMin = last7.reduce((a, d) => a + (logs[d]?.exercise_min ?? 0), 0)

  return (
    <section className="stack" aria-label="Histórico">
      <h3 className="section">Histórico</h3>
      <div className="stats">
        <div className="card stat"><Fire size={20} weight="fill" aria-hidden /><strong>{current}</strong><span>{current === 1 ? 'dia seguido' : 'dias seguidos'}</span></div>
        <div className="card stat"><Check size={20} weight="bold" aria-hidden /><strong>{completeDays}</strong><span>completos em 30 dias</span></div>
        <div className="card stat"><Drop size={20} weight="fill" aria-hidden /><strong>{litres(avgWater)} L</strong><span>água por dia (7 dias)</span></div>
        <div className="card stat"><PersonSimpleRun size={20} weight="fill" aria-hidden /><strong>{exMin} min</strong><span>exercício (7 dias)</span></div>
      </div>
      <div className="card heat-card">
        <div className="heat head-row" aria-hidden>
          {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((l, i) => <span key={i}>{l}</span>)}
        </div>
        <div className="heat" role="grid" aria-label="Calendário de metas das últimas 10 semanas">
          {cells.map((d) => {
            if (d > today) return <span key={d} className="cell future" aria-hidden />
            const s = statusFor(d)
            return (
              <button
                key={d}
                className={`cell ${s.complete ? 'full' : ''} ${d === selected ? 'sel' : ''}`}
                style={{ ['--r' as string]: s.ratio }}
                aria-label={`${parseDay(d).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' })}: ${s.done} de ${s.total} metas`}
                onClick={() => onPick(d)}
              >
                {parseDay(d).getDate()}
              </button>
            )
          })}
        </div>
        <p className="legend muted">
          <span><i className="sw" /> nenhuma</span>
          <span><i className="sw mid" /> parte</span>
          <span><i className="sw hi" /> todas</span>
          <span className="best">Melhor sequência: {best} {best === 1 ? 'dia' : 'dias'}</span>
        </p>
      </div>
      <p className="hint left">As metas de cada dia ficam guardadas como estavam nesse dia, mesmo que as mudes depois.</p>
    </section>
  )
}

function SettingsSheet({ settings, onSave, onClose }: { settings: Settings; onSave: (s: Settings) => void; onClose: () => void }) {
  const [water, setWater] = useState(String(settings.water_ml))
  const [glass, setGlass] = useState(String(settings.glass_ml))
  const [ex, setEx] = useState(String(settings.exercise_min))
  const num = (v: string, min: number, max: number) => {
    const n = Math.round(Number(v))
    return Number.isFinite(n) && n >= min && n <= max ? n : null
  }
  const w = num(water, 250, 6000)
  const g = num(glass, 50, 1000)
  const e = num(ex, 5, 240)
  const ok = w !== null && g !== null && e !== null
  return (
    <Sheet title="Ajustar metas" onClose={onClose}>
      <div className="stack">
        <p className="muted">São valores para vos organizarem, não uma prescrição. Ajustem ao que a vossa equipa de saúde recomendar.</p>
        <label className="field">
          <span>Água por dia (ml)</span>
          <input inputMode="numeric" value={water} onChange={(x) => setWater(x.target.value)} aria-invalid={w === null} />
        </label>
        <label className="field">
          <span>Tamanho de um copo (ml)</span>
          <input inputMode="numeric" value={glass} onChange={(x) => setGlass(x.target.value)} aria-invalid={g === null} />
        </label>
        <label className="field">
          <span>Exercício por dia (min)</span>
          <input inputMode="numeric" value={ex} onChange={(x) => setEx(x.target.value)} aria-invalid={e === null} />
        </label>
        {!ok && <p className="error" role="alert">Água entre 250 e 6000 ml, copo entre 50 e 1000 ml, exercício entre 5 e 240 min.</p>}
        <button className="btn" disabled={!ok} onClick={() => ok && onSave({ water_ml: w, glass_ml: g, exercise_min: e })}>Guardar</button>
      </div>
    </Sheet>
  )
}

function SuppSheet({ supp, onSave, onClose }: { supp: Supplement | null; onSave: (name: string, dose: string) => void; onClose: () => void }) {
  const [name, setName] = useState(supp?.name ?? '')
  const [dose, setDose] = useState(supp?.dose ?? '')
  const ok = name.trim().length > 0
  return (
    <Sheet title={supp ? 'Editar suplemento' : 'Novo suplemento'} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (ok) onSave(name.trim(), dose)
        }}
      >
        <label className="field">
          <span>Nome</span>
          <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Vitamina D" autoFocus />
        </label>
        <label className="field">
          <span>Dose e horário (opcional)</span>
          <input value={dose} maxLength={80} onChange={(e) => setDose(e.target.value)} placeholder="Como a médica indicou" />
        </label>
        <button className="btn" disabled={!ok}>Guardar</button>
      </form>
    </Sheet>
  )
}
