import { useEffect, useState } from 'react'

/**
 * Manifesto dos modelos 3D profissionais do bebé (public/models/baby/manifest.json).
 * Se não existir, a app usa o bebé gerado por código. Ver docs/baby-models.md.
 */
export interface Stage {
  /** semana a que o modelo corresponde */
  week: number
  /** nome do ficheiro GLB dentro de public/models/baby */
  file: string
  lengthCm?: number
  /** rotação em graus para pôr o modelo de pé e virado para a câmara */
  rotation?: [number, number, number]
}

export interface Manifest {
  /** texto de crédito/licença mostrado por baixo do bebé */
  credit?: string
  /** distância máxima (em semanas) a que um modelo ainda serve uma semana sem modelo próprio */
  maxGap?: number
  stages: Stage[]
}

let cached: Promise<Manifest | null> | null = null

export function loadManifest(): Promise<Manifest | null> {
  cached ??= fetch('/models/baby/manifest.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
    .then((m) => (m && Array.isArray(m.stages) && m.stages.length ? m : null))
    .catch(() => null)
  return cached
}

/** O modelo mais próximo da semana pedida, se estiver dentro do intervalo aceitável. */
export function pickStage(m: Manifest, week: number): Stage | null {
  let best: Stage | null = null
  for (const s of m.stages) if (!best || Math.abs(s.week - week) < Math.abs(best.week - week)) best = s
  return best && Math.abs(best.week - week) <= (m.maxGap ?? 7) ? best : null
}

export function useBabyCredit(): string {
  const [credit, setCredit] = useState('')
  useEffect(() => {
    let alive = true
    void loadManifest().then((m) => alive && setCredit(m?.credit ?? ''))
    return () => {
      alive = false
    }
  }, [])
  return credit
}
