import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { signedUrl } from '../lib/hooks'
import { Sheet } from './ui'

/** Passa as fotos da barriga semana a semana, como um time-lapse. */
export default function BumpFilm({ photos, onClose }: { photos: { week: number; path: string }[]; onClose: () => void }) {
  const [urls, setUrls] = useState<(string | null)[]>([])
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(true)
  const reduce = useReducedMotion()

  useEffect(() => {
    let alive = true
    void Promise.all(photos.map((p) => signedUrl(p.path))).then((u) => alive && setUrls(u))
    return () => {
      alive = false
    }
  }, [photos])

  useEffect(() => {
    if (!playing || urls.length < 2) return
    const t = window.setTimeout(() => setI((n) => (n + 1) % photos.length), 1100)
    return () => window.clearTimeout(t)
  }, [playing, i, urls.length, photos.length])

  // pré-carrega a próxima para não piscar
  useEffect(() => {
    const next = urls[(i + 1) % urls.length]
    if (next) new Image().src = next
  }, [i, urls])

  const p = photos[i]
  return (
    <Sheet title="A barriga a crescer" onClose={onClose}>
      <div className="stack">
        <div className="film" aria-live="polite">
          <AnimatePresence initial={false}>
            {urls[i] && (
              <motion.img
                key={i}
                src={urls[i]!}
                alt={`Barriga na semana ${p.week}`}
                initial={{ opacity: reduce ? 1 : 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: reduce ? 1 : 0 }}
                transition={{ duration: reduce ? 0 : 0.45 }}
              />
            )}
          </AnimatePresence>
          <span className="film-week">semana {p.week}</span>
        </div>
        <input
          type="range"
          min={0}
          max={photos.length - 1}
          value={i}
          aria-label="Semana"
          onChange={(e) => {
            setPlaying(false)
            setI(Number(e.target.value))
          }}
        />
        <button className="btn" onClick={() => setPlaying((v) => !v)}>{playing ? 'Pausar' : 'Reproduzir'}</button>
      </div>
    </Sheet>
  )
}
