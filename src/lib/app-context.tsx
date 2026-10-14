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
  setDueDate: (d: string) => Promise<void>
  nameOf: (userId: string | null | undefined) => string
  signOut: () => Promise<void>
}

export const Ctx = createContext<AppCtx | null>(null)

export function useApp(): AppCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useApp fora do provider')
  return c
}
