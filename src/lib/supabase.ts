import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string | undefined

export const configured = Boolean(url && key)
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing')

/** Mensagem de erro legível a partir de um erro do Supabase. */
const PT: [RegExp, string][] = [
  [/invalid login credentials/i, 'Email ou palavra-passe incorretos.'],
  [/already registered|already been registered/i, 'Este email já tem conta. Entra em vez de criar.'],
  [/email not confirmed/i, 'Confirma primeiro o email que te enviámos.'],
  [/password should be at least/i, 'A palavra-passe precisa de pelo menos 6 caracteres.'],
  [/rate limit|too many/i, 'Demasiadas tentativas. Espera um minuto e tenta de novo.'],
  [/failed to fetch|network/i, 'Sem ligação. Verifica a internet e tenta de novo.'],
  [/row-level security/i, 'Sem permissão para esta ação.'],
]

/** Mensagem de erro legível, em português, a partir de um erro do Supabase. */
export function errMsg(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const m = String((e as { message: unknown }).message)
    return PT.find(([re]) => re.test(m))?.[1] ?? m
  }
  return 'Algo correu mal. Tenta de novo.'
}
