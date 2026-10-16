/** Lógica das metas do dia (sem rede nem React, para ser fácil de testar). */

export interface Settings { water_ml: number; glass_ml: number; exercise_min: number }
export interface Supplement { id: string; name: string; dose: string | null; starts_on: string; ends_on: string | null }
export interface DayLog { day: string; water_ml: number; exercise_min: number; water_goal: number; exercise_goal: number }

export const DEFAULTS: Settings = { water_ml: 2000, glass_ml: 250, exercise_min: 30 }

/** Dia local como AAAA-MM-DD (não UTC: à meia-noite de Lisboa já é o dia seguinte). */
export function dayKey(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const n = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${n}`
}

/** Soma dias a uma data AAAA-MM-DD (meio-dia local evita saltos de hora de verão). */
export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number)
  return dayKey(new Date(y, m - 1, d + n, 12))
}

export function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

/** Suplementos que contam num dia: já tinham começado e ainda não tinham sido removidos. */
export function activeOn(list: Supplement[], day: string): Supplement[] {
  return list.filter((s) => s.starts_on <= day && (!s.ends_on || day < s.ends_on))
}

export interface DayStatus {
  waterDone: boolean
  exerciseDone: boolean
  /** null quando não há suplementos nesse dia */
  suppDone: boolean | null
  /** metas concluídas e total de metas aplicáveis nesse dia */
  done: number
  total: number
  /** 0..1 */
  ratio: number
  complete: boolean
}

export function statusOf(
  day: string,
  log: DayLog | undefined,
  settings: Settings,
  supplements: Supplement[],
  taken: Set<string>,
): DayStatus {
  const waterGoal = log?.water_goal ?? settings.water_ml
  const exGoal = log?.exercise_goal ?? settings.exercise_min
  const waterDone = (log?.water_ml ?? 0) >= waterGoal
  const exerciseDone = (log?.exercise_min ?? 0) >= exGoal
  const due = activeOn(supplements, day)
  const suppDone = due.length ? due.every((s) => taken.has(s.id)) : null
  const parts = [waterDone, exerciseDone, ...(suppDone === null ? [] : [suppDone])]
  const done = parts.filter(Boolean).length
  return { waterDone, exerciseDone, suppDone, done, total: parts.length, ratio: done / parts.length, complete: done === parts.length }
}

/**
 * Dias seguidos com todas as metas feitas, a contar de hoje para trás.
 * Se hoje ainda não está completo, não quebra a sequência: conta a partir de ontem.
 */
export function streak(today: string, isComplete: (day: string) => boolean, maxDays = 365): number {
  let day = isComplete(today) ? today : addDays(today, -1)
  let n = 0
  while (n < maxDays && isComplete(day)) {
    n++
    day = addDays(day, -1)
  }
  return n
}

export function litres(ml: number): string {
  return (ml / 1000).toLocaleString('pt-PT', { maximumFractionDigits: 2 })
}
