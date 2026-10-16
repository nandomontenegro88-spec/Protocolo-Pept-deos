import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { loadManifest, pickStage, type Stage } from '../baby/manifest'
import type { MeshData } from '../baby/surfaceNets'

/**
 * Bebé 3D estilizado, esculpido por código (sem modelos externos).
 * A malha lisa é calculada num worker a partir de um campo de distância (ver baby/field.ts).
 * É uma ilustração: as proporções variam com a semana, mas não são uma imagem médica.
 */

const CELL = 0.015 // tamanho da célula da malha: mais pequeno = mais detalhe e mais tempo de cálculo

// ---------- cálculo da malha (worker + cache) ----------
const cache = new Map<number, MeshData>()
const pending = new Map<number, Promise<MeshData>>()
let worker: Worker | null = null
let workerFailed = false
const waiters = new Map<number, ((m: MeshData) => void)[]>()

function getWorker(): Worker | null {
  if (worker || workerFailed) return worker
  try {
    worker = new Worker(new URL('../baby/baby.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ week: number; mesh: MeshData }>) => {
      cache.set(e.data.week, e.data.mesh)
      pending.delete(e.data.week)
      waiters.get(e.data.week)?.forEach((r) => r(e.data.mesh))
      waiters.delete(e.data.week)
    }
    worker.onerror = () => {
      workerFailed = true
      worker = null
    }
  } catch {
    workerFailed = true
  }
  return worker
}

function meshFor(week: number): Promise<MeshData> {
  const hit = cache.get(week)
  if (hit) return Promise.resolve(hit)
  const inflight = pending.get(week)
  if (inflight) return inflight
  const w = getWorker()
  const p = w
    ? new Promise<MeshData>((resolve) => {
        waiters.set(week, [...(waiters.get(week) ?? []), resolve])
        w.postMessage({ week, cell: CELL })
      })
    : // sem worker: calcula na thread principal (mais lento, mas funciona)
      Promise.all([import('../baby/field'), import('../baby/surfaceNets')]).then(([f, s]) => {
        const m = s.surfaceNets(f.buildField(week), CELL)
        cache.set(week, m)
        pending.delete(week)
        return m
      })
  pending.set(week, p)
  return p
}

// ---------- materiais e modelos ----------
/** pele translúcida: brilho quente nos contornos (dispersão sub-superficial barata) */
function withSkinGlow(m: THREE.MeshPhysicalMaterial) {
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
       float fres = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 2.0);
       totalEmissiveRadiance += vec3(1.0, 0.36, 0.24) * fres * 0.3;`,
    )
  }
  return m
}

function skinMaterial() {
  return withSkinGlow(
    new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.46,
      metalness: 0,
      sheen: 1,
      sheenColor: new THREE.Color(0xffc2ae),
      sheenRoughness: 0.4,
      clearcoat: 0.14,
      clearcoatRoughness: 0.55,
    }),
  )
}

// ---------- modelos profissionais (GLB) ----------
const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
const stageCache = new Map<string, Promise<THREE.Group>>()

/** Descarrega um GLB uma vez, converte os materiais para pele translúcida e guarda em cache. */
function loadStage(stage: Stage): Promise<THREE.Group> {
  let p = stageCache.get(stage.file)
  if (!p) {
    p = gltfLoader.loadAsync(`/models/baby/${stage.file}`).then((gltf) => {
      const scene = gltf.scene
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.userData.shared = true
        const old = mesh.material as THREE.MeshStandardMaterial
        const m = new THREE.MeshPhysicalMaterial({
          color: old.color ?? new THREE.Color(0xffffff),
          map: old.map ?? null,
          normalMap: old.normalMap ?? null,
          normalScale: old.normalScale ?? new THREE.Vector2(1, 1),
          roughnessMap: old.roughnessMap ?? null,
          aoMap: old.aoMap ?? null,
          vertexColors: !!mesh.geometry.attributes.color,
          roughness: old.roughnessMap ? 1 : Math.min(old.roughness ?? 0.5, 0.55),
          metalness: 0,
          sheen: 0.8,
          sheenColor: new THREE.Color(0xffc2ae),
          sheenRoughness: 0.45,
          clearcoat: 0.1,
          clearcoatRoughness: 0.6,
          side: old.side,
        })
        mesh.material = withSkinGlow(m)
      })
      return scene
    })
    stageCache.set(stage.file, p)
    p.catch(() => stageCache.delete(stage.file))
  }
  return p
}

/** Centra e dimensiona o modelo para caber no mesmo enquadramento do bebé gerado por código. */
function buildPro(stage: Stage, scene: THREE.Group, week: number): THREE.Group {
  const model = scene.clone(true)
  const rot = stage.rotation ?? [0, 0, 0]
  model.rotation.set(THREE.MathUtils.degToRad(rot[0]), THREE.MathUtils.degToRad(rot[1]), THREE.MathUtils.degToRad(rot[2]))
  model.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const k = 2.0 / Math.max(size.x, size.y, size.z)
  const norm = new THREE.Group()
  norm.add(model)
  model.position.sub(center)
  norm.scale.setScalar(k)
  const root = new THREE.Group()
  const holder = new THREE.Group()
  holder.add(norm)
  root.add(holder)
  root.scale.setScalar(sizeFor(week))
  return root
}

const LEN: Record<number, number> = { 4: 0.1, 5: 0.2, 6: 0.6, 7: 1, 8: 1.6, 9: 2.3, 10: 3.1, 11: 4.1, 12: 5.4, 13: 7.4, 14: 8.7, 15: 10.1, 16: 11.6, 17: 13, 18: 14.2, 19: 15.3, 20: 25.6, 21: 26.7, 22: 27.8, 23: 28.9, 24: 30, 25: 34.6, 26: 35.6, 27: 36.6, 28: 37.6, 29: 38.6, 30: 39.9, 31: 41.1, 32: 42.4, 33: 43.7, 34: 45, 35: 46.2, 36: 47.4, 37: 48.6, 38: 49.8, 39: 50.7, 40: 51.2 }

function sizeFor(week: number) {
  const cm = LEN[Math.min(Math.max(week, 4), 40)]
  return 0.5 + 0.5 * Math.pow(cm / 51.2, 0.42) // bebés pequenos ficam visivelmente pequenos
}

function geometryFrom(m: MeshData) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3))
  g.setAttribute('color', new THREE.BufferAttribute(m.colors, 3))
  g.setIndex(new THREE.BufferAttribute(m.indices, 1))
  g.computeBoundingSphere()
  return g
}

const cordMaterial = () =>
  new THREE.MeshPhysicalMaterial({ color: 0xcf8ba6, roughness: 0.4, sheen: 1, sheenColor: new THREE.Color(0xffc6d6), clearcoat: 0.3 })

function buildBaby(week: number, mesh: MeshData | null): THREE.Group {
  const root = new THREE.Group()
  const inner = new THREE.Group()
  root.add(inner)
  if (week <= 3 || !mesh) {
    // semanas 1 a 3: ainda não há embrião. Mostra o óvulo fecundado / blastocisto.
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 48, 36),
      new THREE.MeshPhysicalMaterial({ color: 0xffe0cf, roughness: 0.25, transmission: 0.0, transparent: true, opacity: 0.55, clearcoat: 1, sheen: 1, sheenColor: new THREE.Color(0xffd2bf) }),
    )
    inner.add(shell)
    const cells = new THREE.MeshPhysicalMaterial({ color: 0xf0a68f, roughness: 0.45, sheen: 1, sheenColor: new THREE.Color(0xffc2ae) })
    const pts = [[0.12, 0.08, 0], [-0.1, 0.1, 0.05], [0.02, -0.1, 0.06], [-0.08, -0.04, -0.09], [0.1, -0.05, -0.07], [0, 0.0, 0.12], [-0.02, 0.14, -0.08]]
    for (const [x, y, z] of pts) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 18), cells)
      c.position.set(x, y, z)
      inner.add(c)
    }
    root.scale.setScalar(0.62)
    return root
  }
  inner.add(new THREE.Mesh(geometryFrom(mesh), skinMaterial()))
  if (week <= 8) {
    // saco vitelino com um fio
    const yolk = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 40, 28),
      new THREE.MeshPhysicalMaterial({ color: 0xffd36b, roughness: 0.2, transparent: true, opacity: 0.92, clearcoat: 1, clearcoatRoughness: 0.2 }),
    )
    yolk.position.set(0.82, -0.62, -0.02)
    inner.add(yolk)
    const stalk = new THREE.CatmullRomCurve3([new THREE.Vector3(0.36, -0.42, 0), new THREE.Vector3(0.58, -0.5, 0), new THREE.Vector3(0.72, -0.57, -0.02)])
    inner.add(new THREE.Mesh(new THREE.TubeGeometry(stalk, 16, 0.035, 8), cordMaterial()))
    inner.scale.setScalar(0.8 + 0.2 * Math.min(Math.max((week - 4) / 4, 0), 1))
  } else {
    // cordão umbilical a partir do umbigo
    const cord = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.27, 0.34),
      new THREE.Vector3(0.08, -0.4, 0.62),
      new THREE.Vector3(0.34, -0.62, 0.66),
      new THREE.Vector3(0.56, -0.8, 0.4),
      new THREE.Vector3(0.52, -0.92, 0.1),
      new THREE.Vector3(0.3, -0.96, -0.12),
    ])
    inner.add(new THREE.Mesh(new THREE.TubeGeometry(cord, 60, 0.05, 12), cordMaterial()))
    inner.position.y = -0.04
  }
  root.scale.setScalar(sizeFor(week))
  return root
}

function disposeGroup(g: THREE.Object3D) {
  g.traverse((o) => {
    if (o.userData.shared) return // geometria e materiais do GLB são partilhados pela cache
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
  const api = useRef<{ show: (w: number) => Promise<void> | void } | null>(null)

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
    renderer.toneMappingExposure = 0.92
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab'
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50)
    camera.position.set(0, 0.05, 4.3)

    // luz de estúdio suave + reflexos de ambiente discretos
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = envTex
    scene.environmentIntensity = 0.35
    scene.add(new THREE.HemisphereLight(0xfff0e0, 0x6a70d0, 0.45))
    const key = new THREE.DirectionalLight(0xffdcb0, 2.9)
    key.position.set(2.6, 3.4, 3.4)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x9db0ff, 1.7)
    rim.position.set(-3.5, 1.2, -3)
    scene.add(rim)
    const fill = new THREE.PointLight(0xffb48a, 10, 12)
    fill.position.set(-1.6, -1, 3)
    scene.add(fill)

    const pivot = new THREE.Group()
    scene.add(pivot)

    let current: THREE.Group | null = null
    let shownWeek = -1
    let wanted = week
    let born = 0
    let yaw = -0.45
    let vel = 0
    let dragging = false
    let lastX = 0
    let lastT = 0
    let visible = true
    let raf = 0
    let dirty = true
    let alive = true

    function place(w: number, group: THREE.Group, source: 'pro' | 'procedural') {
      if (!alive) return
      if (current) {
        pivot.remove(current)
        disposeGroup(current)
      }
      current = group
      pivot.add(current)
      shownWeek = w
      born = performance.now()
      el!.dataset.busy = 'false'
      el!.dataset.source = source
      dirty = true
    }

    async function show(w: number) {
      wanted = w
      if (w <= 3) return place(w, buildBaby(w, null), 'procedural')
      // 1. modelo profissional (GLB), se existir um perto desta semana
      const manifest = await loadManifest()
      const stage = manifest ? pickStage(manifest, w) : null
      if (stage) {
        if (!stageCache.has(stage.file)) el!.dataset.busy = 'true'
        try {
          const scene = await loadStage(stage)
          if (wanted === w && alive) place(w, buildPro(stage, scene, w), 'pro')
          return
        } catch (e) {
          console.warn('Modelo 3D profissional indisponível, a usar o gerado por código', e)
        }
      }
      // 2. bebé gerado por código (worker + cache)
      if (!cache.has(w)) el!.dataset.busy = 'true'
      const m = await meshFor(w)
      if (wanted === w && alive) {
        place(w, buildBaby(w, m), 'procedural')
        // aquece as semanas vizinhas para a navegação ser instantânea
        for (const n of [w + 1, w - 1]) if (n > 3 && n <= 40 && !cache.has(n)) window.setTimeout(() => alive && void meshFor(n), 600)
      }
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
          yaw += 0.26 * dt // rotação lenta em repouso
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
        pivot.position.y = Math.sin(now / 1300) * 0.03 // flutua
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
      alive = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      dom.removeEventListener('pointerdown', down)
      dom.removeEventListener('pointermove', move)
      dom.removeEventListener('pointerup', up)
      dom.removeEventListener('pointercancel', up)
      if (current) disposeGroup(current)
      envTex.dispose()
      pmrem.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      api.current = null
      void shownWeek
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // mudar de semana pede a malha da nova semana (e mantém a anterior até chegar)
  useEffect(() => {
    api.current?.show(week)
  }, [week])

  return <div ref={host} className="baby3d-host" data-busy="true" role="img" aria-label={`Ilustração 3D do bebé na semana ${week}. Arrasta para rodar.`} />
}
