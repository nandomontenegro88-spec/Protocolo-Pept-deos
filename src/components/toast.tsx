import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'

interface ToastItem {
  id: number
  message: string
  action?: { label: string; onClick: () => void }
}
interface Options {
  action?: ToastItem['action']
  duration?: number
}

const Ctx = createContext<(message: string, o?: Options) => void>(() => {})
export const useToast = () => useContext(Ctx)

/** Mensagens curtas e transitórias, anunciadas a leitores de ecrã. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)
  const timers = useRef(new Map<number, number>())

  const dismiss = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setItems((l) => l.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, o: Options = {}) => {
      const id = ++seq.current
      setItems((l) => [...l.slice(-1), { id, message, action: o.action }])
      timers.current.set(id, window.setTimeout(() => dismiss(id), o.duration ?? 4000))
    },
    [dismiss],
  )

  useEffect(() => {
    const t = timers.current
    return () => t.forEach((x) => window.clearTimeout(x))
  }, [])

  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              className="toast"
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
            >
              <span>{t.message}</span>
              {t.action && (
                <button
                  className="toast-action"
                  onClick={() => {
                    t.action!.onClick()
                    dismiss(t.id)
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}

/**
 * Apagar com rede de segurança: esconde já, e só apaga de facto passados 5 s.
 * "Anular" repõe. Se a app fechar antes, nada é apagado.
 */
export function useUndoable() {
  const toast = useToast()
  return useCallback(
    (message: string, { hide, restore, commit }: { hide: () => void; restore: () => void; commit: () => Promise<unknown> | void }) => {
      hide()
      let undone = false
      const timer = window.setTimeout(() => {
        if (!undone) void commit()
      }, 5000)
      toast(message, {
        duration: 5000,
        action: {
          label: 'Anular',
          onClick: () => {
            undone = true
            window.clearTimeout(timer)
            restore()
          },
        },
      })
    },
    [toast],
  )
}
