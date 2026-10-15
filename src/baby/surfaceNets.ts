import type { Field } from './field'

export interface MeshData {
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
  indices: Uint32Array
}

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))

/**
 * Malha lisa a partir de um campo de distância (naive surface nets).
 * Só se calcula o campo perto da superfície (blocos), por isso é rápido.
 * As normais vêm do gradiente do campo, o que dá detalhe mais fino do que a grelha.
 */
export function surfaceNets(field: Field, cell: number): MeshData {
  const { min, max, sdf } = field
  const nx = Math.ceil((max[0] - min[0]) / cell) + 1
  const ny = Math.ceil((max[1] - min[1]) / cell) + 1
  const nz = Math.ceil((max[2] - min[2]) / cell) + 1
  const idx = (i: number, j: number, k: number) => i + nx * (j + ny * k)

  // ---- 1. campo perto da superfície ----
  const S = 6 // lado do bloco, em células
  const vals = new Float32Array(nx * ny * nz).fill(NaN)
  const nbx = Math.ceil((nx - 1) / S)
  const nby = Math.ceil((ny - 1) / S)
  const nbz = Math.ceil((nz - 1) / S)
  const blockSign = new Int8Array(nbx * nby * nbz)
  const half = cell * S * 0.866
  for (let bk = 0; bk < nbz; bk++) {
    for (let bj = 0; bj < nby; bj++) {
      for (let bi = 0; bi < nbx; bi++) {
        const cx = min[0] + (bi * S + S / 2) * cell
        const cy = min[1] + (bj * S + S / 2) * cell
        const cz = min[2] + (bk * S + S / 2) * cell
        const dc = sdf(cx, cy, cz)
        if (Math.abs(dc) < half * 1.2) {
          const i1 = Math.min(bi * S + S, nx - 1)
          const j1 = Math.min(bj * S + S, ny - 1)
          const k1 = Math.min(bk * S + S, nz - 1)
          for (let k = bk * S; k <= k1; k++) {
            for (let j = bj * S; j <= j1; j++) {
              for (let i = bi * S; i <= i1; i++) {
                const p = idx(i, j, k)
                if (vals[p] !== vals[p]) vals[p] = sdf(min[0] + i * cell, min[1] + j * cell, min[2] + k * cell)
              }
            }
          }
        } else {
          blockSign[bi + nbx * (bj + nby * bk)] = dc < 0 ? -1 : 1
        }
      }
    }
  }
  // blocos longe da superfície: só o sinal importa
  for (let k = 0; k < nz; k++) {
    const bk = Math.min(Math.floor(k / S), nbz - 1)
    for (let j = 0; j < ny; j++) {
      const bj = Math.min(Math.floor(j / S), nby - 1)
      for (let i = 0; i < nx; i++) {
        const p = idx(i, j, k)
        if (vals[p] !== vals[p]) {
          const bi = Math.min(Math.floor(i / S), nbx - 1)
          const s = blockSign[bi + nbx * (bj + nby * bk)]
          vals[p] = (s === 0 ? 1 : s) * 0.5
        }
      }
    }
  }

  // ---- 2. um vértice por célula que a superfície atravessa ----
  const cx = nx - 1
  const cy = ny - 1
  const cz = nz - 1
  const cellVert = new Int32Array(cx * cy * cz).fill(-1)
  const px: number[] = []
  const py: number[] = []
  const pz: number[] = []
  const cellOf = (i: number, j: number, k: number) => i + cx * (j + cy * k)
  const surfaceCells: number[] = []
  const c8 = new Float32Array(8)
  const OFF = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
    [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ]
  const EDGES = [
    [0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7],
  ]
  for (let k = 0; k < cz; k++) {
    for (let j = 0; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        let neg = 0
        for (let n = 0; n < 8; n++) {
          const o = OFF[n]
          const v = vals[idx(i + o[0], j + o[1], k + o[2])]
          c8[n] = v
          if (v < 0) neg++
        }
        if (neg === 0 || neg === 8) continue
        let sx = 0
        let sy = 0
        let sz = 0
        let cnt = 0
        for (let e = 0; e < 12; e++) {
          const a = EDGES[e][0]
          const b = EDGES[e][1]
          const va = c8[a]
          const vb = c8[b]
          if (va < 0 === vb < 0) continue
          const t = va / (va - vb)
          sx += OFF[a][0] + (OFF[b][0] - OFF[a][0]) * t
          sy += OFF[a][1] + (OFF[b][1] - OFF[a][1]) * t
          sz += OFF[a][2] + (OFF[b][2] - OFF[a][2]) * t
          cnt++
        }
        cellVert[cellOf(i, j, k)] = px.length
        px.push(min[0] + (i + sx / cnt) * cell)
        py.push(min[1] + (j + sy / cnt) * cell)
        pz.push(min[2] + (k + sz / cnt) * cell)
        surfaceCells.push(i, j, k)
      }
    }
  }

  // ---- 3. quads à volta de cada aresta que muda de sinal ----
  const tri: number[] = []
  const quad = (a: number, b: number, c: number, d: number, outX: number, outY: number, outZ: number) => {
    // orienta pelo sentido "para fora" (do negativo para o positivo ao longo da aresta)
    const ux = px[b] - px[a]
    const uy = py[b] - py[a]
    const uz = pz[b] - pz[a]
    const vx = px[c] - px[a]
    const vy = py[c] - py[a]
    const vz = pz[c] - pz[a]
    const nxv = uy * vz - uz * vy
    const nyv = uz * vx - ux * vz
    const nzv = ux * vy - uy * vx
    if (nxv * outX + nyv * outY + nzv * outZ >= 0) tri.push(a, b, c, a, c, d)
    else tri.push(a, c, b, a, d, c)
  }
  for (let s = 0; s < surfaceCells.length; s += 3) {
    const i = surfaceCells[s]
    const j = surfaceCells[s + 1]
    const k = surfaceCells[s + 2]
    const v0 = vals[idx(i, j, k)]
    // aresta em x
    if (j > 0 && k > 0 && v0 < 0 !== vals[idx(i + 1, j, k)] < 0) {
      const sg = v0 < 0 ? 1 : -1
      quad(cellVert[cellOf(i, j - 1, k - 1)], cellVert[cellOf(i, j, k - 1)], cellVert[cellOf(i, j, k)], cellVert[cellOf(i, j - 1, k)], sg, 0, 0)
    }
    // aresta em y
    if (i > 0 && k > 0 && v0 < 0 !== vals[idx(i, j + 1, k)] < 0) {
      const sg = v0 < 0 ? 1 : -1
      quad(cellVert[cellOf(i - 1, j, k - 1)], cellVert[cellOf(i, j, k - 1)], cellVert[cellOf(i, j, k)], cellVert[cellOf(i - 1, j, k)], 0, sg, 0)
    }
    // aresta em z
    if (i > 0 && j > 0 && v0 < 0 !== vals[idx(i, j, k + 1)] < 0) {
      const sg = v0 < 0 ? 1 : -1
      quad(cellVert[cellOf(i - 1, j - 1, k)], cellVert[cellOf(i, j - 1, k)], cellVert[cellOf(i, j, k)], cellVert[cellOf(i - 1, j, k)], 0, 0, sg)
    }
  }

  // ---- 4. normais do gradiente, projeção à superfície, cor e oclusão ----
  const nv = px.length
  const positions = new Float32Array(nv * 3)
  const normals = new Float32Array(nv * 3)
  const colors = new Float32Array(nv * 3)
  const h = cell * 0.45
  for (let v = 0; v < nv; v++) {
    let x = px[v]
    let y = py[v]
    let z = pz[v]
    // gradiente por diferenças progressivas: d + 3 avaliações
    const d0 = sdf(x, y, z)
    let gx = sdf(x + h, y, z) - d0
    let gy = sdf(x, y + h, z) - d0
    let gz = sdf(x, y, z + h) - d0
    const gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1
    gx /= gl
    gy /= gl
    gz /= gl
    // um passo de Newton para pousar na superfície
    const step = Math.max(-cell, Math.min(cell, d0))
    x -= gx * step
    y -= gy * step
    z -= gz * step
    positions[v * 3] = x
    positions[v * 3 + 1] = y
    positions[v * 3 + 2] = z
    normals[v * 3] = gx
    normals[v * 3 + 1] = gy
    normals[v * 3 + 2] = gz
    const c = field.color(x, y, z)
    // oclusão ambiente barata: quanto mais perto de outra parte, mais escuro
    const o = sdf(x + gx * 0.07, y + gy * 0.07, z + gz * 0.07)
    const ao = 0.5 + 0.5 * Math.max(0, Math.min(1, o / 0.07))
    colors[v * 3] = srgbToLinear(c[0]) * ao
    colors[v * 3 + 1] = srgbToLinear(c[1]) * ao
    colors[v * 3 + 2] = srgbToLinear(c[2]) * ao
  }

  // orientação final: cada triângulo tem de apontar para onde apontam as normais dos vértices
  const indices = Uint32Array.from(tri)
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t]
    const b = indices[t + 1]
    const c = indices[t + 2]
    const ux = positions[b * 3] - positions[a * 3]
    const uy = positions[b * 3 + 1] - positions[a * 3 + 1]
    const uz = positions[b * 3 + 2] - positions[a * 3 + 2]
    const vx = positions[c * 3] - positions[a * 3]
    const vy = positions[c * 3 + 1] - positions[a * 3 + 1]
    const vz = positions[c * 3 + 2] - positions[a * 3 + 2]
    const fx = uy * vz - uz * vy
    const fy = uz * vx - ux * vz
    const fz = ux * vy - uy * vx
    const nxs = normals[a * 3] + normals[b * 3] + normals[c * 3]
    const nys = normals[a * 3 + 1] + normals[b * 3 + 1] + normals[c * 3 + 1]
    const nzs = normals[a * 3 + 2] + normals[b * 3 + 2] + normals[c * 3 + 2]
    if (fx * nxs + fy * nys + fz * nzs < 0) {
      indices[t + 1] = c
      indices[t + 2] = b
    }
  }

  return { positions, normals, colors, indices }
}
