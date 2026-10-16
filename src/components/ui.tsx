import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useDragControls } from 'motion/react'
import { X, type Icon as PhosphorIcon } from '@phosphor-icons/react'

/**
 * Título grande ao estilo iOS. Quando sai do ecrã, a barra de cima mostra o título pequeno
 * sobre um material translúcido; a ação da direita vive sempre nessa barra.
 */
export function Header({ title, right, icon: Icon, sub }: {
  title: string
  right?: ReactNode
  /** ícone da secção (Phosphor), num quadrado com a cor-joia da secção */
  icon?: PhosphorIcon
  /** uma linha com informação real da página (não decorativa) */
  sub?: ReactNode
}) {
  const big = useRef<HTMLHeadingElement>(null)
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const el = big.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting), { rootMargin: '-52px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <>
      <div className={`navbar${compact ? ' on' : ''}`}>
        <span className="navbar-title" aria-hidden>{title}</span>
        <div className="navbar-right">{right}</div>
      </div>
      <header className="page-head">
        {Icon && <span className="page-icon" aria-hidden><Icon size={26} weight="duotone" /></span>}
        <div className="page-head-text">
          <h1 className="large-title" ref={big}>{title}</h1>
          {sub && <p className="page-sub">{sub}</p>}
        </div>
      </header>
    </>
  )
}

/** Distância a que um gesto com esta velocidade (px/s) pararia, com a desaceleração do scroll do iOS. */
const project = (v: number, rate = 0.998) => ((v / 1000) * rate) / (1 - rate)

/** Folha inferior. Segue o dedo 1:1, projeta o momentum ao largar e anima a saída antes de chamar `onClose`. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  const close = useCallback(() => setOpen(false), [])
  const controls = useDragControls()
  const ref = useRef<HTMLDivElement>(null)

  // Teclado: Esc fecha e o Tab fica preso dentro da folha.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return close()
      if (e.key !== 'Tab' || !ref.current) return
      const f = ref.current.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')
      if (!f.length) return
      const first = f[0]
      const last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [close])

  // Foco: entra na folha ao abrir e volta ao elemento de origem ao fechar.
  useEffect(() => {
    const origin = document.activeElement as HTMLElement | null
    ref.current?.focus()
    return () => origin?.focus?.()
  }, [])

  // Voltar (gesto, botão do Android): fecha a folha em vez de sair da página.
  // A entrada de histórico só é criada depois de o React confirmar a montagem (evita
  // entradas duplicadas no StrictMode) e não se confia no history.state, que o router reescreve.
  useEffect(() => {
    let pushed = false
    let popped = false
    const id = window.setTimeout(() => {
      history.pushState(history.state, '')
      pushed = true
    }, 0)
    const onPop = () => {
      if (!pushed) return
      popped = true
      setOpen(false)
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('popstate', onPop)
      if (pushed && !popped) history.back()
    }
  }, [])

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
            ref={ref}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
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
