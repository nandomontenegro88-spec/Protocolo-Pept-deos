/// <reference lib="webworker" />
import { buildField } from './field'
import { surfaceNets } from './surfaceNets'

// O cálculo da malha corre fora da thread principal para não travar a interface.
self.onmessage = (e: MessageEvent<{ week: number; cell: number }>) => {
  const { week, cell } = e.data
  const t0 = performance.now()
  const m = surfaceNets(buildField(week), cell)
  ;(self as unknown as Worker).postMessage({ week, mesh: m, ms: performance.now() - t0 }, [
    m.positions.buffer,
    m.normals.buffer,
    m.colors.buffer,
    m.indices.buffer,
  ])
}
