import type { ReactNode } from 'react'
import { motion } from 'motion/react'

export const ease = [0.16, 1, 0.3, 1] as const

/** Entrada escalonada: comunica a ordem de leitura. O atraso tem teto para listas longas. */
export function Rise({ children, i = 0, className }: { children: ReactNode; i?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: Math.min(i, 8) * 0.05, ease }}
    >
      {children}
    </motion.div>
  )
}

/** Linha de lista que entra e sai com reflow suave (estado: item adicionado/removido). */
export function ListRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      layout="position"
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ type: 'spring', stiffness: 260, damping: 28 }}
    >
      {children}
    </motion.div>
  )
}
