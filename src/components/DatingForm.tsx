import { useState } from 'react'
import {
  dueFromLmp,
  formatDate,
  lmpFromConception,
  lmpFromDue,
  lmpFromTest,
  progress,
  sinceConception,
  toDateOnly,
  type TestRange,
} from '../lib/pregnancy'

type Mode = 'lmp' | 'test' | 'conception' | 'due'

const MODES: { id: Mode; label: string }[] = [
  { id: 'lmp', label: 'Última menstruação' },
  { id: 'test', label: 'Teste de gravidez' },
  { id: 'conception', label: 'Conceção' },
  { id: 'due', label: 'Parto previsto' },
]

const RANGES: TestRange[] = ['1-2', '2-3', '3+']

/** Escolha do método de contagem e cálculo da DUM e da data prevista do parto. */
export default function DatingForm({ busy, cta, onSave }: { busy?: boolean; cta: string; onSave: (due: string, lmp: string) => void }) {
  const [mode, setMode] = useState<Mode>('lmp')
  const [value, setValue] = useState('')
  const [range, setRange] = useState<TestRange | null>(null)

  const today = toDateOnly(new Date())
  const oldest = toDateOnly(new Date(Date.now() - 294 * 86_400_000))

  let lmp: string | null = null
  if (mode === 'lmp' && value) lmp = value
  if (mode === 'conception' && value) lmp = lmpFromConception(value)
  if (mode === 'due' && value) lmp = lmpFromDue(value)
  if (mode === 'test' && range) lmp = lmpFromTest(range)
  const due = mode === 'due' ? (value || null) : lmp ? dueFromLmp(lmp) : null
  const p = due ? progress(due) : null
  const valid = p !== null && p.totalDays >= 0 && p.totalDays <= 294
  const conc = p ? sinceConception(p) : null

  return (
    <div className="stack">
      <div className="seg dating-seg" role="tablist" aria-label="Como queres contar">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={mode === m.id}
            className={mode === m.id ? 'on' : ''}
            onClick={() => {
              setMode(m.id)
              setValue('')
              setRange(null)
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'test' ? (
        <div className="stack">
          <p className="muted">Quantas semanas indicou o teste digital? Conta desde a ovulação.</p>
          <div className="chips" role="radiogroup" aria-label="Semanas indicadas pelo teste">
            {RANGES.map((r) => (
              <button key={r} role="radio" aria-checked={range === r} className={`pick ${range === r ? 'on' : ''}`} onClick={() => setRange(r)}>
                {r === '3+' ? '3 ou mais' : `${r} semanas`}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <label className="field">
          <span>
            {mode === 'lmp' && '1.º dia da última menstruação'}
            {mode === 'conception' && 'Data da conceção ou da ovulação'}
            {mode === 'due' && 'Data prevista do parto (dada pelo médico)'}
          </span>
          <input
            type="date"
            value={value}
            min={mode === 'due' ? today : oldest}
            max={mode === 'due' ? undefined : today}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
      )}

      {due && p && valid && (
        <div className="card tint dating-result" data-hue="gold">
          <p>
            <strong>{p.weeks} {p.weeks === 1 ? 'semana' : 'semanas'}{p.days ? ` e ${p.days} ${p.days === 1 ? 'dia' : 'dias'}` : ''}</strong> de gravidez
            <span className="muted"> (contagem clínica, desde a última menstruação)</span>
          </p>
          {conc && (
            <p className="muted">
              Equivale a {conc.weeks} {conc.weeks === 1 ? 'semana' : 'semanas'}{conc.days ? ` e ${conc.days} ${conc.days === 1 ? 'dia' : 'dias'}` : ''} desde a conceção, que é o que os testes de farmácia indicam.
            </p>
          )}
          <p className="muted">Parto previsto a {formatDate(due)}. Faltam {p.daysLeft} dias.</p>
          {mode === 'test' && <p className="muted">É uma estimativa. A primeira ecografia confirma a data.</p>}
        </div>
      )}
      {due && !valid && <p className="error" role="alert">Esta data não dá uma gravidez em curso. Confirma-a.</p>}

      <button className="btn" disabled={!valid || busy} onClick={() => due && lmp && onSave(due, lmp)}>
        {busy ? 'A guardar…' : cta}
      </button>
    </div>
  )
}
