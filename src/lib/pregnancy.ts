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
  /** semana em curso (1-based), limitada a 1..40 */
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
  const currentWeek = Math.min(Math.max(weeks + 1, 1), 40)
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
