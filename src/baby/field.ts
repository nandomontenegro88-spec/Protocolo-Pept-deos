/**
 * Campo de distância (SDF) de um bebé estilizado.
 * Tudo é uniao suave de elipsoides e cones arredondados, sem juntas visíveis.
 * É uma ilustração: as proporções variam com a semana, mas não são uma imagem médica.
 * Código puro (sem three.js) para poder correr num worker.
 */

export interface Field {
  /** distância assinada ao corpo (negativa dentro) */
  sdf: (x: number, y: number, z: number) => number
  /** cor (sRGB 0..1) de um ponto à superfície */
  color: (x: number, y: number, z: number) => [number, number, number]
  /** caixa que contém o corpo */
  min: [number, number, number]
  max: [number, number, number]
}

type V = [number, number, number]

const sqrt = Math.sqrt
const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x)
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

function smin(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return (a < b ? a : b) - h * h * k * 0.25
}
const smax = (a: number, b: number, k: number) => -smin(-a, -b, k)

function ell(x: number, y: number, z: number, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number) {
  const px = (x - cx) / rx
  const py = (y - cy) / ry
  const pz = (z - cz) / rz
  const k0 = sqrt(px * px + py * py + pz * pz)
  const qx = px / rx
  const qy = py / ry
  const qz = pz / rz
  const k1 = sqrt(qx * qx + qy * qy + qz * qz)
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1
}

/** cone arredondado entre a e b, com raios r1 em a e r2 em b (Inigo Quilez) */
function cone(x: number, y: number, z: number, a: V, b: V, r1: number, r2: number) {
  const bax = b[0] - a[0]
  const bay = b[1] - a[1]
  const baz = b[2] - a[2]
  const l2 = bax * bax + bay * bay + baz * baz
  const rr = r1 - r2
  const a2 = l2 - rr * rr
  const il2 = 1 / l2
  const pax = x - a[0]
  const pay = y - a[1]
  const paz = z - a[2]
  const yy = pax * bax + pay * bay + paz * baz
  const zz = yy - l2
  const wx = pax * l2 - bax * yy
  const wy = pay * l2 - bay * yy
  const wz = paz * l2 - baz * yy
  const x2 = wx * wx + wy * wy + wz * wz
  const y2 = yy * yy * l2
  const z2 = zz * zz * l2
  const k = Math.sign(rr) * rr * rr * x2
  if (Math.sign(zz) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2
  if (Math.sign(yy) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1
  return (sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1
}

interface Group {
  cx: number
  cy: number
  cz: number
  r: number
  k: number
  f: (x: number, y: number, z: number) => number
}

function union(groups: Group[], x: number, y: number, z: number) {
  let d = 1e9
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]
    const dx = x - g.cx
    const dy = y - g.cy
    const dz = z - g.cz
    const bd = sqrt(dx * dx + dy * dy + dz * dz) - g.r
    if (bd > d + g.k) continue
    d = i === 0 ? g.f(x, y, z) : smin(d, g.f(x, y, z), g.k)
  }
  return d
}

const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a: V, s: number): V => [a[0] * s, a[1] * s, a[2] * s]
const len = (a: V) => sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2])
const norm = (a: V): V => mul(a, 1 / (len(a) || 1))
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const lerpV = (a: V, b: V, t: number): V => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]

// tons de pele (sRGB)
const SKIN: V = [0.92, 0.6, 0.5]
const BLUSH: V = [0.9, 0.36, 0.34]
const LIP: V = [0.86, 0.38, 0.4]
const LID: V = [0.82, 0.55, 0.6]
const EYE_DARK: V = [0.1, 0.06, 0.1]

interface Spot {
  p: V
  s: number
  c: V
  w: number
}

function colorFrom(spots: Spot[]) {
  return (x: number, y: number, z: number): V => {
    let r = SKIN[0]
    let g = SKIN[1]
    let b = SKIN[2]
    for (let i = 0; i < spots.length; i++) {
      const sp = spots[i]
      const dx = x - sp.p[0]
      const dy = y - sp.p[1]
      const dz = z - sp.p[2]
      const t = Math.exp(-(dx * dx + dy * dy + dz * dz) / (sp.s * sp.s)) * sp.w
      r = mix(r, sp.c[0], t)
      g = mix(g, sp.c[1], t)
      b = mix(b, sp.c[2], t)
    }
    // manchas suaves de tom, de baixa frequência
    const n = Math.sin(x * 7.1 + y * 3.3) * Math.sin(y * 6.2 - z * 4.1) * Math.sin(z * 5.3 + x * 2.2)
    const v = 1 + 0.045 * n
    return [r * v, g * (1 + 0.03 * n), b * (1 + 0.02 * n)]
  }
}

// ---------------------------------------------------------------------------------------------
// Feto (semanas 9 a 40)
// ---------------------------------------------------------------------------------------------

function fetus(week: number): Field {
  const w = week
  const grow = smoothstep(9, 24, w)
  const late = smoothstep(26, 40, w)
  const fat = 0.82 + 0.42 * smoothstep(14, 40, w) // gordura: membros e bochechas mais cheios
  const limbK = mix(0.62, 1, smoothstep(9, 22, w)) // comprimento dos membros
  const hr = mix(0.42, 0.335, grow) * (1 + 0.02 * late) // raio da cabeça
  const groups: Group[] = []
  const spots: Spot[] = []

  // ---- tronco ----
  const torso = (x: number, y: number, z: number) => {
    // peito mais largo em cima (ombros) e a estreitar para a cintura
    let d = ell(x, y, z, 0, 0.3, -0.1, 0.4 * fat ** 0.2, 0.25, 0.29)
    d = smin(d, cone(x, y, z, [0, 0.22, -0.1], [0, -0.1, -0.1], 0.29, 0.31 * fat ** 0.2), 0.1)
    // barriga redonda e cheia
    d = smin(d, ell(x, y, z, 0, -0.27, 0.0, 0.34 * fat ** 0.4, 0.3, 0.37 * fat ** 0.4), 0.12)
    d = smin(d, ell(x, y, z, 0, -0.55, -0.13, 0.31 * fat ** 0.3, 0.25, 0.28), 0.1)
    // nádegas
    d = smin(d, ell(x, y, z, 0.14, -0.6, -0.27, 0.16, 0.17, 0.16), 0.08)
    d = smin(d, ell(x, y, z, -0.14, -0.6, -0.27, 0.16, 0.17, 0.16), 0.08)
    // umbigo
    d = smax(d, -ell(x, y, z, 0, -0.26, 0.37, 0.035, 0.035, 0.05), 0.03)
    return d
  }
  groups.push({ cx: 0, cy: -0.1, cz: -0.1, r: 0.9, k: 0.1, f: torso })

  // ---- cabeça (sistema local, inclinada para o peito e ligeiramente virada) ----
  const Hc: V = [0.02, 0.84 - (hr - 0.34) * 0.4, 0.14]
  const tilt = 0.42
  const yaw = -0.16
  const ct = Math.cos(tilt)
  const st = Math.sin(tilt)
  const cy2 = Math.cos(yaw)
  const sy2 = Math.sin(yaw)
  const toLocal = (x: number, y: number, z: number): V => {
    const px = x - Hc[0]
    const py = y - Hc[1]
    const pz = z - Hc[2]
    // yaw (em y) e tilt (em x) inversos
    const x1 = cy2 * px - sy2 * pz
    const z1 = sy2 * px + cy2 * pz
    const y2 = ct * py + st * z1
    const z2 = -st * py + ct * z1
    return [x1, y2, z2]
  }
  const fromLocal = (l: V): V => {
    const y1 = ct * l[1] - st * l[2]
    const z1 = st * l[1] + ct * l[2]
    return [cy2 * l[0] + sy2 * z1 + Hc[0], y1 + Hc[1], -sy2 * l[0] + cy2 * z1 + Hc[2]]
  }
  const chub = 0.85 + 0.35 * smoothstep(14, 36, w)
  const head = (x: number, y: number, z: number) => {
    const [a, b, c] = toLocal(x, y, z)
    const H = hr
    let d = ell(a, b, c, 0, 0.02 * H, -0.02 * H, 0.97 * H, 1.0 * H, 1.04 * H) // crânio
    d = smin(d, ell(a, b, c, 0, -0.3 * H, 0.3 * H, 0.78 * H, 0.72 * H, 0.72 * H), 0.3 * H) // face
    d = smin(d, ell(a, b, c, 0.5 * H, -0.32 * H, 0.66 * H, 0.3 * H * chub, 0.28 * H * chub, 0.3 * H * chub), 0.2 * H) // bochechas
    d = smin(d, ell(a, b, c, -0.5 * H, -0.32 * H, 0.66 * H, 0.3 * H * chub, 0.28 * H * chub, 0.3 * H * chub), 0.2 * H)
    d = smin(d, ell(a, b, c, 0, -0.68 * H, 0.52 * H, 0.3 * H, 0.2 * H, 0.26 * H), 0.16 * H) // queixo
    d = smin(d, ell(a, b, c, 0, 0.32 * H, 0.86 * H, 0.62 * H, 0.14 * H, 0.16 * H), 0.2 * H) // testa e sobrancelhas
    if (c < 0.55 * H && Math.abs(a) < 0.8 * H) return d // detalhes do rosto só na frente
    if (w >= 11) {
      d = smin(d, ell(a, b, c, 0.97 * H, -0.04 * H, -0.04 * H, 0.07 * H, 0.2 * H, 0.14 * H), 0.04 * H) // orelhas
      d = smin(d, ell(a, b, c, -0.97 * H, -0.04 * H, -0.04 * H, 0.07 * H, 0.2 * H, 0.14 * H), 0.04 * H)
    }
    if (w >= 12) d = smin(d, ell(a, b, c, 0, -0.14 * H, 1.0 * H, 0.1 * H, 0.14 * H, 0.14 * H), 0.07 * H) // nariz
    if (w >= 14) {
      d = smin(d, ell(a, b, c, 0, -0.43 * H, 0.9 * H, 0.2 * H, 0.07 * H, 0.08 * H), 0.05 * H) // lábios
      d = smax(d, -ell(a, b, c, 0, -0.43 * H, 0.99 * H, 0.17 * H, 0.012 * H, 0.05 * H), 0.03 * H) // boca
    }
    if (w >= 10) {
      // pálpebras fechadas: elevação suave e uma linha
      for (const s of [-1, 1]) {
        d = smin(d, ell(a, b, c, s * 0.36 * H, 0.1 * H, 0.84 * H, 0.17 * H, 0.085 * H, 0.09 * H), 0.04 * H)
        if (w >= 14) d = smax(d, -ell(a, b, c, s * 0.36 * H, 0.085 * H, 0.9 * H, 0.15 * H, 0.012 * H, 0.04 * H), 0.025 * H)
      }
    }
    return d
  }
  groups.push({ cx: Hc[0], cy: Hc[1], cz: Hc[2], r: hr * 1.7, k: 0.09, f: head })
  // pescoço
  const neckA: V = [0, 0.5, -0.04]
  const neckB: V = [0.01, 0.7, 0.08]
  groups.push({ cx: 0, cy: 0.6, cz: 0.02, r: 0.3, k: 0.09, f: (x, y, z) => cone(x, y, z, neckA, neckB, 0.17, 0.15) })

  // ---- braços: mãos junto ao rosto (uma à bochecha, a outra à boca) ----
  const handSpots: V[] = []
  for (const s of [-1, 1] as const) {
    const sh: V = [s * 0.3, 0.42, -0.03]
    const el: V = [s * (0.4 + 0.05 * limbK), 0.4 - 0.26 * limbK, 0.16 + 0.06 * limbK]
    const target = fromLocal([s * 0.7 * hr, -0.5 * hr, 0.72 * hr]) // ao lado da bochecha, sem tapar o rosto
    const wr: V = lerpV(el, target, 1 - 0.28 * (1 - limbK))
    const rAr = 0.108 * fat
    const rFa = 0.084 * fat
    // mão: punho fechado (palma + nós dos dedos) com polegar por cima
    const dir = norm(sub(wr, el))
    const side = norm(cross(dir, [0, 1, 0]))
    const up = norm(cross(side, dir))
    const handR = 0.07 * fat
    const palm = add(wr, mul(dir, handR * 0.8))
    handSpots.push(palm)
    const knuckle = add(palm, add(mul(up, handR * 0.55), mul(dir, handR * 0.55)))
    const thumbA = add(palm, add(mul(side, -s * handR * 0.9), mul(up, handR * 0.1)))
    const thumbB = add(thumbA, add(mul(dir, handR * 0.9), mul(up, handR * 0.4)))
    const arm = (x: number, y: number, z: number) => {
      let d = cone(x, y, z, sh, el, rAr, rAr * 0.84)
      d = smin(d, cone(x, y, z, el, wr, rAr * 0.84, rFa), 0.05)
      const hx = x - palm[0]
      const hy = y - palm[1]
      const hz = z - palm[2]
      if (hx * hx + hy * hy + hz * hz > 0.22 * 0.22) return d // longe da mão
      d = smin(d, ell(x, y, z, palm[0], palm[1], palm[2], handR * 1.0, handR * 1.0, handR * 1.15), 0.035)
      d = smin(d, ell(x, y, z, knuckle[0], knuckle[1], knuckle[2], handR * 1.0, handR * 0.62, handR * 0.8), 0.03)
      d = smin(d, cone(x, y, z, thumbA, thumbB, handR * 0.42, handR * 0.34), 0.03)
      // sulcos entre os dedos (4 linhas finas no punho)
      for (let i = 1; i < 4; i++) {
        const c = add(add(knuckle, mul(side, (i - 2) * handR * 0.5 * s)), mul(up, handR * 0.3))
        d = smax(d, -ell(x, y, z, c[0], c[1], c[2], handR * 0.035, handR * 0.5, handR * 0.5), 0.012)
      }
      return d
    }
    const mid: V = lerpV(sh, palm, 0.5)
    groups.push({ cx: mid[0], cy: mid[1], cz: mid[2], r: len(sub(sh, palm)) * 0.6 + 0.18, k: 0.06, f: arm })
  }

  // ---- pernas encolhidas contra a barriga, pés com dedos ----
  const footSpots: V[] = []
  for (const s of [-1, 1] as const) {
    const hip: V = [s * 0.2, -0.48, -0.02]
    const knee: V = [s * (0.28 + 0.04 * limbK), -0.14 - 0.1 * limbK, 0.36 + 0.14 * limbK]
    const ankle: V = [s * 0.14, -0.66 + 0.1 * limbK, 0.34 + 0.12 * limbK]
    const rTh = 0.16 * fat
    const rSh = 0.11 * fat
    const foot: V = add(ankle, [s * 0.0, -0.02, 0.1 * limbK + 0.05])
    footSpots.push(foot)
    const leg = (x: number, y: number, z: number) => {
      let d = cone(x, y, z, hip, knee, rTh, rTh * 0.8)
      d = smin(d, cone(x, y, z, knee, ankle, rTh * 0.8, rSh * 0.66), 0.06)
      const fx = x - foot[0]
      const fy = y - foot[1]
      const fz = z - foot[2]
      if (fx * fx + fy * fy + fz * fz > 0.24 * 0.24) return d
      d = smin(d, ell(x, y, z, foot[0], foot[1], foot[2], 0.07 * fat, 0.05 * fat, 0.1 * fat), 0.035)
      // fiada de dedos: um elipsoide por dedo, o maior à frente
      for (let i = 0; i < 5; i++) {
        const tx = foot[0] + s * (-0.045 + i * 0.024) * fat
        const tz = foot[2] + 0.1 * fat - Math.abs(i - 0.5) * 0.006
        d = smin(d, ell(x, y, z, tx, foot[1] - 0.005, tz, 0.019 * fat, 0.019 * fat, 0.024 * fat), 0.014)
      }
      return d
    }
    const mid: V = lerpV(hip, ankle, 0.5)
    groups.push({ cx: mid[0], cy: mid[1], cz: mid[2], r: 0.55, k: 0.07, f: leg })
  }

  // ---- cor: rubor nas extremidades, rosto e articulações ----
  for (const p of handSpots) spots.push({ p, s: 0.11, c: BLUSH, w: 0.55 })
  for (const p of footSpots) spots.push({ p, s: 0.13, c: BLUSH, w: 0.55 })
  const face = (a: number, b: number, c: number, s: number, col: V, wt: number) => spots.push({ p: fromLocal([a * hr, b * hr, c * hr]), s: s * hr, c: col, w: wt })
  face(0.5, -0.3, 0.7, 0.36, BLUSH, 0.4)
  face(-0.5, -0.3, 0.7, 0.36, BLUSH, 0.4)
  face(0, -0.43, 0.95, 0.2, LIP, 0.85)
  face(0, -0.14, 1.08, 0.16, BLUSH, 0.45)
  face(0.97, -0.04, -0.04, 0.2, BLUSH, 0.55)
  face(-0.97, -0.04, -0.04, 0.2, BLUSH, 0.55)
  face(0.36, 0.1, 0.9, 0.2, LID, 0.7)
  face(-0.36, 0.1, 0.9, 0.2, LID, 0.7)
  // cabelo a partir da semana 28 (sombra escura no couro cabeludo)
  const hairW = smoothstep(26, 36, w) * 0.85
  if (hairW > 0) spots.push({ p: fromLocal([0, 0.75 * hr, -0.15 * hr]), s: 0.5 * hr, c: [0.32, 0.2, 0.17], w: hairW })

  const sdf = (x: number, y: number, z: number) => union(groups, x, y, z)
  return { sdf, color: colorFrom(spots), min: [-0.95, -1.0, -0.8], max: [0.95, 1.2, 0.95] }
}

// ---------------------------------------------------------------------------------------------
// Embrião (semanas 4 a 8): arco em C, cabeça grande, botões de membros, olho escuro
// ---------------------------------------------------------------------------------------------

function embryo(week: number): Field {
  const t = smoothstep(4, 8, week)
  const spots: Spot[] = []
  const pts: V[] = []
  const radii: number[] = []
  const n = 12
  const R = 0.7
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1)
    const ang = mix(-0.4, 3.9, u)
    const rad = R * (1 - 0.3 * u)
    pts.push([Math.cos(ang) * rad * 0.86, Math.sin(ang) * rad - 0.08, 0])
    const head = 1 - smoothstep(0, 0.2, u)
    const body = mix(0.26, 0.04, Math.pow(clamp((u - 0.1) / 0.9), 0.85))
    radii.push(mix(body, 0.36, head) * (0.55 + 0.45 * t))
  }
  const buds: { p: V; q: V; r: number }[] = []
  if (week >= 6) {
    const b = 0.075 + 0.05 * smoothstep(6, 8, week)
    for (const i of [3, 4, 7, 8]) {
      const p = pts[i]
      const out = norm([p[0], p[1] + 0.1, 0])
      const r0 = radii[i]
      buds.push({ p: [p[0] + out[0] * r0 * 0.5, p[1] + out[1] * r0 * 0.5, 0.05], q: [p[0] + out[0] * (r0 + b * 1.6), p[1] + out[1] * (r0 + b * 1.6), 0.09], r: b })
    }
  }
  const eye: V = [pts[0][0] + 0.2, pts[0][1] + 0.02, 0.18 * (0.55 + 0.45 * t) + 0.12]
  if (week >= 6) spots.push({ p: eye, s: 0.045, c: EYE_DARK, w: 1 })
  spots.push({ p: pts[0], s: 0.5, c: BLUSH, w: 0.25 })

  const body = (x: number, y: number, z: number) => {
    let d = 1e9
    for (let i = 0; i < n - 1; i++) d = smin(d, cone(x, y, z, pts[i], pts[i + 1], radii[i], radii[i + 1]), 0.05)
    for (const b of buds) d = smin(d, cone(x, y, z, b.p, b.q, b.r, b.r * 0.85), 0.05)
    return d
  }
  const sdf = (x: number, y: number, z: number) => body(x, y, z)
  return { sdf, color: colorFrom(spots), min: [-1.0, -1.0, -0.5], max: [1.0, 1.0, 0.5] }
}

export function buildField(week: number): Field {
  return week <= 8 ? embryo(week) : fetus(week)
}
