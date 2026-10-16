import { buildCalendar, type IcsEvent } from '../../supabase/functions/_shared/ics.ts'

/** Uma consulta como ficheiro .ics: o telemóvel trata do lembrete, mesmo com a app fechada. */
export const buildIcs = (e: IcsEvent) => buildCalendar([e])

export function downloadIcs(name: string, ics: string) {
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'consulta'}.ics`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Endereço de subscrição do calendário do casal (webcal:// abre "Subscrever" no iPhone). */
export function calendarFeedUrl(token: string, scheme: 'webcal' | 'https' = 'webcal'): string {
  const base = new URL(import.meta.env.VITE_SUPABASE_URL as string)
  return `${scheme}://${base.host}/functions/v1/calendar?t=${encodeURIComponent(token)}`
}
