import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * Bebé 3D estilizado, construído por código (sem modelos externos).
 * É uma ilustração: as proporções variam com a semana, mas não são uma imagem médica.
 * - Semanas 4 a 8: embrião em "C", com botões de membros e saco vitelino.
 * - Semanas 9 a 40: feto enrolado, com membros, orelhas, nariz e cordão umbilical.
 */

const SKIN = 0xf2b8a1
const CORD = 0xd48aa6
const YOLK = 0xffd36b

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

function skinMaterial(color = SKIN, opacity = 1) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.52,
    metalness: 0,
    sheen: 1,
    sheenColor: new THREE.Color(0xffd9c8),
    sheenRoughness: 0.45,
    clearcoat: 0.18,
    clearcoatRoughness: 0.5,
    transparent: opacity < 1,
    opacity,
  })
}

function blob(g: THREE.Group, m: THREE.Material, r: [number, number, number], p: [number, number, number]) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), m)
  mesh.scale.set(r[0], r[1], r[2])
  mesh.position.set(...p)
  g.add(mesh)
  return mesh
}

/** Membro cónico entre dois pontos, com esferas nas pontas (articulações macias). */
function limb(g: THREE.Group, m: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number) {
  const dir = new THREE.Vector3().subVectors(b, a)
  const len = dir.length()
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 24, 1, true), m)
  cyl.position.copy(a).addScaledVector(dir, 0.5)
  cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
  g.add(cyl)
  for (const [p, r] of [[a, r0], [b, r1]] as const) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), m)
    s.position.copy(p)
    g.add(s)
  }
}

function buildEmbryo(week: number): THREE.Group {
  const g = new THREE.Group()
  const m = skinMaterial()
  const t = smooth(4, 8, week) // 0 = botão minúsculo, 1 = embrião em C
  // Muitas esferas sobrepostas dão uma superfície contínua e lisa.
  const n = 56
  const R = 0.7
  const point = (u: number) => {
    const ang = THREE.MathUtils.lerp(-0.35, 3.95, u)
    const rad = R * (1 - 0.3 * u)
    return { x: Math.cos(ang) * rad * 0.86, y: Math.sin(ang) * rad - 0.08, nx: Math.cos(ang), ny: Math.sin(ang) }
  }
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1)
    const headBlend = 1 - smooth(0.0, 0.22, u)
    const body = THREE.MathUtils.lerp(0.25, 0.045, Math.pow(Math.min(Math.max((u - 0.1) / 0.9, 0), 1), 0.85))
    const r = THREE.MathUtils.lerp(body, 0.36, headBlend) * (0.5 + 0.5 * t)
    const q = point(u)
    blob(g, m, [r, r, r * 0.95], [q.x, q.y, 0])
  }
  const h = point(0.02)
  // olho
  if (week >= 6) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), new THREE.MeshStandardMaterial({ color: 0x2a1a2e, roughness: 0.4 }))
    eye.position.set(h.x + 0.2, h.y - 0.02, 0.22)
    g.add(eye)
  }
  // botões dos membros: dois braços e duas pernas
  if (week >= 6) {
    const bud = 0.07 + 0.05 * smooth(6, 8, week)
    for (const u of [0.3, 0.36, 0.7, 0.76]) {
      const q = point(u)
      const body = THREE.MathUtils.lerp(0.25, 0.045, Math.pow((u - 0.1) / 0.9, 0.85)) * (0.5 + 0.5 * t)
      blob(g, m, [bud * 0.9, bud * 1.2, bud * 0.9], [q.x + q.nx * (body + bud * 0.4), q.y + q.ny * (body + bud * 0.4), 0.08])
    }
  }
  // saco vitelino ligado por um fio
  const yolk = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 40, 28),
    new THREE.MeshPhysicalMaterial({ color: YOLK, roughness: 0.2, transparent: true, opacity: 0.9, clearcoat: 1, clearcoatRoughness: 0.2 }),
  )
  yolk.position.set(0.82, -0.62, -0.05)
  g.add(yolk)
  const stalk = new THREE.CatmullRomCurve3([new THREE.Vector3(0.36, -0.42, 0), new THREE.Vector3(0.58, -0.5, 0), new THREE.Vector3(0.72, -0.57, -0.03)])
  g.add(new THREE.Mesh(new THREE.TubeGeometry(stalk, 16, 0.035, 8), new THREE.MeshStandardMaterial({ color: CORD, roughness: 0.5 })))
  g.scale.setScalar(0.8 + 0.2 * t)
  return g
}

function buildFetus(week: number): THREE.Group {
  const g = new THREE.Group()
  const m = skinMaterial()
  const grow = smooth(9, 24, week) // 0 = pequeno e de cabeça grande, 1 = proporções de bebé
  const lateGrow = smooth(24, 40, week)
  const headR = THREE.MathUtils.lerp(0.43, 0.36, grow) + 0.01 * lateGrow
  const limbK = THREE.MathUtils.lerp(0.55, 1, smooth(9, 20, week)) // comprimento dos membros
  const limbR = THREE.MathUtils.lerp(0.55, 1, smooth(9, 28, week)) + 0.12 * lateGrow // espessura
  const body = 1 + 0.08 * lateGrow

  // tronco: peito e bacia
  blob(g, m, [0.36 * body, 0.44, 0.31 * body], [0, 0.12, -0.06])
  blob(g, m, [0.33 * body, 0.33, 0.31 * body], [0, -0.34, -0.02])

  // cabeça inclinada para o peito
  const headPos: [number, number, number] = [0, 0.66 - (headR - 0.36) * 0.4, 0.2]
  const head = blob(g, m, [headR, headR * 0.96, headR * 1.04], headPos)
  head.rotation.x = 0.35
  // orelhas, nariz e olhos fechados
  if (week >= 12) {
    for (const s of [-1, 1]) blob(g, m, [0.045, 0.075, 0.04], [s * (headR * 0.97), headPos[1] - 0.03, headPos[2] - 0.03])
  }
  if (week >= 14) {
    blob(g, skinMaterial(0xe9a48f), [0.05, 0.05, 0.06], [0, headPos[1] - headR * 0.16, headPos[2] + headR * 0.97])
    const lid = new THREE.MeshStandardMaterial({ color: 0x8b5a66, roughness: 0.6 })
    for (const s of [-1, 1]) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 20, Math.PI), lid)
      arc.position.set(s * headR * 0.38, headPos[1] + headR * 0.1, headPos[2] + headR * 0.88)
      arc.rotation.set(0.35, 0, Math.PI)
      g.add(arc)
    }
  }
  if (week >= 28) {
    // cabelo suave
    const hair = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.02, 32, 20, 0, Math.PI * 2, 0, 0.9), new THREE.MeshStandardMaterial({ color: 0x5b3a2e, roughness: 0.9 }))
    hair.position.set(...headPos)
    hair.rotation.x = 0.1
    g.add(hair)
  }

  // braços dobrados, mãos junto ao rosto
  for (const s of [-1, 1]) {
    const sh = new THREE.Vector3(s * 0.36 * body, 0.3, 0.02)
    const el = new THREE.Vector3(s * (0.4 + 0.05 * limbK) * body, 0.3 - 0.3 * limbK, 0.3 * limbK + 0.04)
    const ha = new THREE.Vector3(s * 0.22 * limbK, 0.3 + 0.16 * limbK, 0.42 + 0.04 * limbK)
    const r = 0.095 * limbR
    limb(g, m, sh, el, r, r * 0.82)
    limb(g, m, el, ha, r * 0.82, r * 0.7)
    blob(g, m, [0.085 * limbR, 0.075 * limbR, 0.07 * limbR], [ha.x, ha.y, ha.z])
  }
  // pernas encolhidas contra a barriga
  for (const s of [-1, 1]) {
    const hip = new THREE.Vector3(s * 0.21, -0.46, 0.08)
    const knee = new THREE.Vector3(s * (0.26 + 0.04 * limbK), -0.12 * limbK - 0.2, 0.42 + 0.1 * limbK)
    const foot = new THREE.Vector3(s * 0.15, -0.55 + 0.06 * limbK, 0.36 + 0.1 * limbK)
    const r = 0.13 * limbR
    limb(g, m, hip, knee, r, r * 0.8)
    limb(g, m, knee, foot, r * 0.8, r * 0.62)
    blob(g, m, [0.1 * limbR, 0.06 * limbR, 0.13 * limbR], [foot.x, foot.y - 0.03, foot.z + 0.06])
  }

  // cordão umbilical
  const cord = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.22, 0.3),
    new THREE.Vector3(0.2, -0.5, 0.64),
    new THREE.Vector3(0.52, -0.72, 0.52),
    new THREE.Vector3(0.6, -0.86, 0.22),
    new THREE.Vector3(0.42, -0.88, 0.02),
  ])
  g.add(new THREE.Mesh(new THREE.TubeGeometry(cord, 48, 0.05, 10), new THREE.MeshStandardMaterial({ color: CORD, roughness: 0.55 })))

  g.scale.setScalar(0.82 + 0.18 * grow)
  g.position.y = 0.05
  return g
}

// comprimento aproximado (cm) por semana, para o modelo crescer de forma visível
const LEN: Record<number, number> = { 4: 0.1, 5: 0.2, 6: 0.6, 7: 1, 8: 1.6, 9: 2.3, 10: 3.1, 11: 4.1, 12: 5.4, 13: 7.4, 14: 8.7, 15: 10.1, 16: 11.6, 17: 13, 18: 14.2, 19: 15.3, 20: 25.6, 21: 26.7, 22: 27.8, 23: 28.9, 24: 30, 25: 34.6, 26: 35.6, 27: 36.6, 28: 37.6, 29: 38.6, 30: 39.9, 31: 41.1, 32: 42.4, 33: 43.7, 34: 45, 35: 46.2, 36: 47.4, 37: 48.6, 38: 49.8, 39: 50.7, 40: 51.2 }

export function buildBaby(week: number): THREE.Group {
  const inner = week <= 8 ? buildEmbryo(week) : buildFetus(week)
  const cm = LEN[Math.min(Math.max(week, 4), 40)]
  // o tamanho percebido cresce com a raiz do comprimento: bebés pequenos ficam visivelmente pequenos
  const size = 0.5 + 0.5 * Math.pow(cm / 51.2, 0.42)
  const g = new THREE.Group()
  g.add(inner)
  g.scale.setScalar(size)
  return g
}

function disposeGroup(g: THREE.Object3D) {
  g.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
    else mat?.dispose()
  })
}

interface Props {
  week: number
  /** Chamado se o dispositivo não suportar WebGL. */
  onUnsupported?: () => void
  reducedMotion?: boolean
}

export default function Baby3D({ week, onUnsupported, reducedMotion }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const api = useRef<{ show: (w: number) => void } | null>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
    } catch {
      onUnsupported?.()
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab'
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50)
    camera.position.set(0, 0.05, 4.1)

    // luz: céu quente, brilho dourado de cima, contra-luz azul (paleta da app)
    scene.add(new THREE.HemisphereLight(0xfff1e0, 0x6a74d9, 0.95))
    const key = new THREE.DirectionalLight(0xffe2b8, 2.4)
    key.position.set(2.5, 3.5, 4)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x8fa4ff, 1.6)
    rim.position.set(-3.5, 1, -3)
    scene.add(rim)
    const fill = new THREE.PointLight(0xffb48a, 14, 12)
    fill.position.set(-1.5, -1.2, 3)
    scene.add(fill)

    const pivot = new THREE.Group()
    scene.add(pivot)

    let current: THREE.Group | null = null
    let born = 0 // instante em que o modelo atual apareceu (para a animação de entrada)
    let yaw = 0.6
    let vel = 0
    let dragging = false
    let lastX = 0
    let lastT = 0
    let visible = true
    let raf = 0
    let dirty = true

    function show(w: number) {
      if (current) {
        pivot.remove(current)
        disposeGroup(current)
      }
      current = buildBaby(w)
      pivot.add(current)
      born = performance.now()
      dirty = true
    }
    api.current = { show }
    show(week)

    function resize() {
      const w = el!.clientWidth
      const h = el!.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      dirty = true
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()

    // rodar com o dedo: segue 1:1 e continua com o momentum ao largar
    const dom = renderer.domElement
    const down = (e: PointerEvent) => {
      dragging = true
      lastX = e.clientX
      lastT = performance.now()
      vel = 0
      dom.setPointerCapture(e.pointerId)
      dom.style.cursor = 'grabbing'
    }
    const move = (e: PointerEvent) => {
      if (!dragging) return
      const now = performance.now()
      const dx = e.clientX - lastX
      yaw += dx * 0.011
      vel = (dx * 0.011) / Math.max((now - lastT) / 1000, 0.008)
      lastX = e.clientX
      lastT = now
      dirty = true
    }
    const up = () => {
      dragging = false
      dom.style.cursor = 'grab'
    }
    dom.addEventListener('pointerdown', down)
    dom.addEventListener('pointermove', move)
    dom.addEventListener('pointerup', up)
    dom.addEventListener('pointercancel', up)

    const io = new IntersectionObserver(([en]) => {
      visible = en.isIntersecting
      if (visible) dirty = true
    })
    io.observe(el)

    let prev = performance.now()
    const tickFrame = (now: number) => {
      raf = requestAnimationFrame(tickFrame)
      const dt = Math.min((now - prev) / 1000, 0.05)
      prev = now
      if (!visible || document.hidden) return
      if (!dragging) {
        if (Math.abs(vel) > 0.02) {
          yaw += vel * dt
          vel *= Math.pow(0.04, dt) // atrito
          dirty = true
        } else if (!reducedMotion) {
          yaw += 0.28 * dt // rotação lenta em repouso
          dirty = true
        }
      }
      // entrada: o modelo "pousa" com uma mola suave
      const age = (now - born) / 1000
      if (current && age < 1.2) {
        const s = 1 - Math.exp(-age * 7) * Math.cos(age * 11)
        pivot.scale.setScalar(reducedMotion ? 1 : Math.max(s, 0.05))
        dirty = true
      } else if (pivot.scale.x !== 1) {
        pivot.scale.setScalar(1)
        dirty = true
      }
      if (!reducedMotion) {
        pivot.position.y = Math.sin(now / 1300) * 0.035 // flutua
        dirty = true
      }
      pivot.rotation.y = yaw
      if (dirty) {
        renderer.render(scene, camera)
        dirty = false
      }
    }
    raf = requestAnimationFrame(tickFrame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      dom.removeEventListener('pointerdown', down)
      dom.removeEventListener('pointermove', move)
      dom.removeEventListener('pointerup', up)
      dom.removeEventListener('pointercancel', up)
      if (current) disposeGroup(current)
      renderer.dispose()
      renderer.domElement.remove()
      api.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // mudar de semana reconstrói o modelo
  useEffect(() => {
    api.current?.show(week)
  }, [week])

  return <div ref={host} className="baby3d-host" role="img" aria-label={`Ilustração 3D do bebé na semana ${week}. Arrasta para rodar.`} />
}
