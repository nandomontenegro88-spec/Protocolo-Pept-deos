import { useEffect, type ReactNode } from 'react'

export function Header({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <header className="head">
      <h1>{title}</h1>
      {right}
    </header>
  )
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <h2>{title}</h2>
          <button className="link" onClick={onClose}>Fechar</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Err({ msg }: { msg: string | null }) {
  return msg ? <p className="error">{msg}</p> : null
}
