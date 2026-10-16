import { createContext, useContext } from 'react'

export interface Member {
  user_id: string
  display_name: string
}

export interface AppCtx {
  userId: string
  coupleId: string
  inviteCode: string
  members: Member[]
  dueDate: string
  setPregnancy: (due: string, lmp: string) => Promise<void>
  nameOf: (userId: string | null | undefined) => string
  signOut: () => Promise<void>
  /** volta a carregar casal, membros e datas (ex.: depois de mudar o nome) */
  refresh: () => Promise<void>
}

export const Ctx = createContext<AppCtx | null>(null)

export function useApp(): AppCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useApp fora do provider')
  return c
}
