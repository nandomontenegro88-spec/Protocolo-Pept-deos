const DAY = 86_400_000

export function toDateOnly(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Interpreta 'YYYY-MM-DD' como meia-noite local (evita desvios de fuso). */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function startOfToday(): Date {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY)
}

export const dueFromLmp = (lmp: string): string => {
  const d = parseDate(lmp)
  d.setDate(d.getDate() + 280)
  return toDateOnly(d)
}

export const lmpFromDue = (due: string): string => {
  const d = parseDate(due)
  d.setDate(d.getDate() - 280)
  return toDateOnly(d)
}

export interface Progress {
  /** semanas completas */
  weeks: number
  /** dias além das semanas completas */
  days: number
  /** semanas completas (o "semana N" das apps), limitado a 1..40; coincide com o que o topo mostra */
  currentWeek: number
  trimester: 1 | 2 | 3
  daysLeft: number
  totalDays: number
  percent: number
}

export function progress(due: string, today = startOfToday()): Progress {
  const lmp = parseDate(lmpFromDue(due))
  const totalDays = Math.max(diffDays(today, lmp), 0)
  const weeks = Math.floor(totalDays / 7)
  const days = totalDays % 7
  const currentWeek = Math.min(Math.max(weeks, 1), 40)
  const trimester = weeks < 14 ? 1 : weeks < 28 ? 2 : 3
  return {
    weeks,
    days,
    currentWeek,
    trimester,
    daysLeft: diffDays(parseDate(due), today),
    totalDays,
    percent: Math.min(totalDays / 280, 1) * 100,
  }
}

export function formatDate(s: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  const d = typeof s === 'string' ? (s.length === 10 ? parseDate(s) : new Date(s)) : s
  return d.toLocaleDateString('pt-PT', opts ?? { day: 'numeric', month: 'long', year: 'numeric' })
}

export function formatDateTime(s: string): string {
  return new Date(s).toLocaleString('pt-PT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDuration(ms: number): string {
  const s = Math.max(Math.round(ms / 1000), 0)
  const m = Math.floor(s / 60)
  const sec = String(s % 60).padStart(2, '0')
  return `${m}:${sec}`
}

// ---------- Como se conta a gravidez ----------
// Contagem clínica: dias desde o 1.º dia da última menstruação (DUM). É a que os médicos e as ecografias usam.
// A conceção (ovulação) acontece cerca de 14 dias depois, por isso "semanas desde a conceção" = semanas clínicas - 2.
// Os testes digitais com indicador de semanas contam desde a ovulação: "1-2 semanas" = 3-4 semanas clínicas.

export type TestRange = '1-2' | '2-3' | '3+'

/** Semanas desde a ovulação (ponto médio do intervalo do teste). */
const TEST_OVULATION_DAYS: Record<TestRange, number> = { '1-2': 10.5, '2-3': 17.5, '3+': 24.5 }

export function lmpFromConception(conception: string): string {
  const d = parseDate(conception)
  d.setDate(d.getDate() - 14)
  return toDateOnly(d)
}

/** DUM estimada a partir do intervalo indicado por um teste digital. */
export function lmpFromTest(range: TestRange, today = startOfToday()): string {
  const d = new Date(today)
  d.setDate(d.getDate() - Math.round(TEST_OVULATION_DAYS[range] + 14))
  return toDateOnly(d)
}

/** Semanas e dias desde a conceção, dado o progresso clínico. */
export function sinceConception(p: { totalDays: number }): { weeks: number; days: number } | null {
  const d = p.totalDays - 14
  if (d < 0) return null
  return { weeks: Math.floor(d / 7), days: d % 7 }
}
