export interface Point { week: number; weight: number | null; sys: number | null; dia: number | null }

/** Gráfico de linhas em SVG simples: semana no eixo x, uma ou duas séries no y. */
function Chart({ label, unit, series }: { label: string; unit: string; series: { name: string; color: string; pts: [number, number][] }[] }) {
  const all = series.flatMap((s) => s.pts)
  if (all.length === 0) return null
  const W = 320
  const H = 160
  const P = 28
  const xs = all.map((p) => p[0])
  const ys = all.map((p) => p[1])
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs, x0 + 1)
  const pad = (Math.max(...ys) - Math.min(...ys)) * 0.15 || 2
  const y0 = Math.min(...ys) - pad
  const y1 = Math.max(...ys) + pad
  const X = (w: number) => P + ((w - x0) / (x1 - x0)) * (W - P * 1.5)
  const Y = (v: number) => H - P + -((v - y0) / (y1 - y0)) * (H - P * 1.6)
  const fmt = (v: number) => Math.round(v).toLocaleString('pt-PT')
  const last = series.map((s) => s.pts.at(-1)).filter(Boolean) as [number, number][]
  return (
    <figure className="card chart">
      <figcaption className="row">
        <strong>{label}</strong>
        <span className="chip">{last.map((p) => `${p[1].toLocaleString('pt-PT')}`).join('/')} {unit}</span>
      </figcaption>
      {series.length > 1 && (
        <div className="legend">
          {series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} por semana`}>
        <line x1={P} x2={W - P / 2} y1={H - P} y2={H - P} className="axis" />
        <text x={P - 4} y={Y(y1 - pad) + 4} className="tick" textAnchor="end">{fmt(y1 - pad)}</text>
        <text x={P - 4} y={Y(y0 + pad) + 4} className="tick" textAnchor="end">{fmt(y0 + pad)}</text>
        <text x={X(x0)} y={H - 8} className="tick" textAnchor="middle">sem. {x0}</text>
        <text x={X(x1)} y={H - 8} className="tick" textAnchor="middle">{x1}</text>
        {series.map((s) => (
          <g key={s.name} style={{ color: s.color }}>
            <polyline fill="none" stroke="currentColor" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" points={s.pts.map(([w, v]) => `${X(w)},${Y(v)}`).join(' ')} />
            {s.pts.map(([w, v]) => <circle key={w} cx={X(w)} cy={Y(v)} r={4} fill="currentColor" />)}
          </g>
        ))}
      </svg>
    </figure>
  )
}

export default function Evolution({ points }: { points: Point[] }) {
  const sorted = [...points].sort((a, b) => a.week - b.week)
  const weight = sorted.filter((p) => p.weight != null).map((p) => [p.week, Number(p.weight)] as [number, number])
  const sys = sorted.filter((p) => p.sys != null).map((p) => [p.week, p.sys!] as [number, number])
  const dia = sorted.filter((p) => p.dia != null).map((p) => [p.week, p.dia!] as [number, number])
  if (!weight.length && !sys.length)
    return <p className="muted">Ainda não há medições. Junta o peso ou a tensão arterial no registo de cada semana.</p>
  const first = weight[0]?.[1]
  const gain = weight.length > 1 ? weight.at(-1)![1] - first : null
  return (
    <div className="stack">
      {gain != null && (
        <p className="muted">
          Desde a semana {weight[0][0]}: {gain >= 0 ? '+' : ''}{gain.toLocaleString('pt-PT', { maximumFractionDigits: 1 })} kg.
          O aumento recomendado depende do peso antes da gravidez; confirma com a equipa de saúde.
        </p>
      )}
      <Chart label="Peso" unit="kg" series={[{ name: 'peso', color: 'var(--coral)', pts: weight }]} />
      <Chart
        label="Tensão arterial"
        unit="mmHg"
        series={[
          { name: 'máxima', color: 'var(--sky)', pts: sys },
          { name: 'mínima', color: 'var(--lilac)', pts: dia },
        ]}
      />
      {sys.some(([, v]) => v >= 140) || dia.some(([, v]) => v >= 90) ? (
        <p className="card tint" role="note">Há valores de tensão iguais ou acima de 140/90. Fala com a tua equipa de saúde.</p>
      ) : null}
    </div>
  )
}
