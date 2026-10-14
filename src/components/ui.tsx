import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useDragControls } from 'motion/react'
import { X } from '@phosphor-icons/react'

export function Header({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <header className="head">
      <h1>{title}</h1>
      {right}
    </header>
  )
}

/** Distância a que um gesto com esta velocidade (px/s) pararia, com a desaceleração do scroll do iOS. */
const project = (v: number, rate = 0.998) => ((v / 1000) * rate) / (1 - rate)

/** Folha inferior. Segue o dedo 1:1, projeta o momentum ao largar e anima a saída antes de chamar `onClose`. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  const close = useCallback(() => setOpen(false), [])
  const controls = useDragControls()
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [close])
  return (
    <AnimatePresence onExitComplete={onClose}>
      {open && (
        <motion.div
          className="overlay"
          onClick={close}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="sheet"
            role="dialog"
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
            drag="y"
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.06, bottom: 0.7 }}
            dragTransition={{ bounceStiffness: 500, bounceDamping: 40 }}
            onDragEnd={(_, info) => {
              // O destino vem da projeção do gesto, não do ponto onde o dedo largou.
              if (info.offset.y + project(info.velocity.y) > 220) close()
            }}
          >
            <div className="grabber" onPointerDown={(e) => controls.start(e)} aria-hidden />
            <div className="head" onPointerDown={(e) => controls.start(e)}>
              <h2>{title}</h2>
              <button className="icon-btn" onClick={close} aria-label="Fechar"><X size={22} /></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function Err({ msg }: { msg: string | null }) {
  return msg ? <p className="error" role="alert">{msg}</p> : null
}

export function Skeleton({ h = 72, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w }} aria-hidden />
}

/** Esqueleto com a forma de uma página de cartões. */
export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="stack" aria-busy="true" aria-label="A carregar">
      <Skeleton h={34} w="55%" />
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} h={72} />)}
    </div>
  )
}
