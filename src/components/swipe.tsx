import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { animate, motion, useDragControls, useMotionValue, useReducedMotion, type PanInfo } from 'motion/react'
import { PencilSimple, Trash, type Icon } from '@phosphor-icons/react'
import { tick } from '../lib/haptics'

export interface SwipeAction {
  key: 'edit' | 'delete'
  label: string
  onClick: () => void
}

const ICON: Record<SwipeAction['key'], Icon> = { edit: PencilSimple, delete: Trash }
const BTN = 84 // largura de cada ação (px)
const OPEN_EVENT = 'bebe-swipe-open'

/** Distância a que um gesto com esta velocidade (px/s) pararia (desaceleração do scroll do iOS). */
const project = (v: number, rate = 0.99) => ((v / 1000) * rate) / (1 - rate)

/**
 * Linha que se arrasta para a esquerda e revela ações, como no iOS.
 * - Solta a meio: abre ou fecha conforme a projeção do gesto (momentum).
 * - Arrasto longo (60% da largura): executa a ação de apagar.
 * - Só uma linha aberta de cada vez; tocar numa linha aberta fecha-a.
 * - Teclado e leitores de ecrã: as ações são botões reais; ao receberem foco a linha abre.
 */
export function SwipeRow({ children, actions, className = '' }: { children: ReactNode; actions: SwipeAction[]; className?: string }) {
  const W = actions.length * BTN
  const id = useId()
  const x = useMotionValue(0)
  const controls = useDragControls()
  const wrap = useRef<HTMLDivElement>(null)
  const dragged = useRef(false)
  const [open, setOpen] = useState(false)
  const reduce = useReducedMotion()

  const snap = useCallback(
    (to: number, velocity = 0) => animate(x, to, reduce ? { duration: 0 } : { type: 'spring', bounce: 0, duration: 0.38, velocity }),
    [x, reduce],
  )
  const close = useCallback(() => {
    setOpen(false)
    snap(0)
  }, [snap])
  const openRow = useCallback(
    (velocity = 0) => {
      setOpen(true)
      snap(-W, velocity)
      window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }))
    },
    [snap, W, id],
  )

  // Só uma linha aberta de cada vez.
  useEffect(() => {
    const h = (e: Event) => {
      if ((e as CustomEvent).detail !== id) close()
    }
    window.addEventListener(OPEN_EVENT, h)
    return () => window.removeEventListener(OPEN_EVENT, h)
  }, [id, close])

  function onDragEnd(_: unknown, info: PanInfo) {
    window.setTimeout(() => (dragged.current = false), 60)
    const width = wrap.current?.offsetWidth ?? 360
    const pos = x.get()
    const del = actions.find((a) => a.key === 'delete')
    if (del && pos < -width * 0.6) {
      tick(20)
      snap(-width, info.velocity.x)
      window.setTimeout(del.onClick, 140)
      return
    }
    // O destino sai da projeção do gesto, não do ponto onde o dedo largou.
    const projected = pos + project(info.velocity.x)
    if (projected < -W / 2) {
      tick(8)
      openRow(info.velocity.x)
    } else {
      close()
    }
  }

  return (
    <div className="swipe" ref={wrap}>
      <div className="swipe-actions" style={{ width: W }}>
        {actions.map((a) => {
          const I = ICON[a.key]
          return (
            <button
              key={a.key}
              className={`swipe-btn ${a.key}`}
              style={{ width: BTN }}
              tabIndex={open ? 0 : -1}
              onFocus={() => !open && openRow()}
              onClick={(e) => {
                // tira o foco do botão: se o foco regressasse a ele (ex.: ao fechar uma folha), reabria a linha
                e.currentTarget.blur()
                close()
                a.onClick()
              }}
            >
              <I size={22} weight="bold" aria-hidden />
              {a.label}
            </button>
          )
        })}
      </div>
      <motion.div
        className={`swipe-row ${className}`}
        style={{ x }}
        drag="x"
        dragControls={controls}
        // o arrasto arranca em qualquer ponto da linha, incluindo caixas e seletores
        dragListener={false}
        onPointerDown={(e) => controls.start(e)}
        dragDirectionLock
        dragConstraints={{ left: -(wrap.current?.offsetWidth ?? 360), right: 0 }}
        dragElastic={{ left: 0, right: 0.12 }}
        dragMomentum={false}
        onDragStart={() => (dragged.current = true)}
        onDragEnd={onDragEnd}
        onClickCapture={(e) => {
          // um arrasto não é um toque; tocar numa linha aberta só a fecha
          if (dragged.current || open) {
            e.stopPropagation()
            e.preventDefault()
            if (open) close()
          }
        }}
      >
        {children}
      </motion.div>
    </div>
  )
}
