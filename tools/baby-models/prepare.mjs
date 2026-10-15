#!/usr/bin/env node
/**
 * Prepara um modelo 3D do bebé para a app.
 *
 * Uso:
 *   node prepare.mjs <ficheiro.obj|.glb|.gltf> --week 18 --length 14.2 [--tris 60000] [--tex 2048]
 *                    [--rx 0 --ry 0 --rz 0] [--out ../../public/models/baby]
 *
 *  --week    semana a que o modelo corresponde
 *  --length  comprimento do bebé nessa semana, em cm (só informativo)
 *  --tris    alvo de triângulos (por omissão 60000, bom para telemóvel)
 *  --tex     tamanho máximo das texturas (por omissão 2048)
 *  --rx/ry/rz  rotação em graus para pôr o modelo de pé e virado para a câmara
 *
 * Faz: converte OBJ para GLB, junta vértices, simplifica, comprime as texturas para WebP e a geometria
 * com meshopt, e regista a fase em public/models/baby/manifest.json.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import obj2gltf from 'obj2gltf'
import sharp from 'sharp'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, simplify, textureCompress, weld, meshopt } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'

const args = process.argv.slice(2)
const input = args.find((a) => !a.startsWith('--') && !/^-?\d/.test(a) && fs.existsSync(a))
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : def
}
if (!input) {
  console.error('Falta o ficheiro de entrada. Ver o topo deste script.')
  process.exit(1)
}
const week = Number(opt('week'))
if (!week) {
  console.error('Falta --week')
  process.exit(1)
}
const length = Number(opt('length', 0))
const targetTris = Number(opt('tris', 60000))
const texSize = Number(opt('tex', 2048))
const rot = [Number(opt('rx', 0)), Number(opt('ry', 0)), Number(opt('rz', 0))]
const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(here, opt('out', '../../public/models/baby'))
fs.mkdirSync(outDir, { recursive: true })

await MeshoptEncoder.ready
await MeshoptSimplifier.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })

let doc
const ext = path.extname(input).toLowerCase()
if (ext === '.obj') {
  const glb = await obj2gltf(input, { binary: true, separateTextures: false })
  doc = await io.readBinary(new Uint8Array(glb))
} else if (ext === '.glb' || ext === '.gltf') {
  doc = await io.read(input)
} else {
  console.error(`Formato ${ext} não suportado aqui. Converte FBX para GLB (Blender: File > Export > glTF 2.0) e volta a correr.`)
  process.exit(1)
}

const countTris = () => {
  let n = 0
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices()
      n += idx ? idx.getCount() / 3 : (prim.getAttribute('POSITION')?.getCount() ?? 0) / 3
    }
  return n
}
const before = countTris()
const ratio = Math.min(1, targetTris / before)
const steps = [dedup(), weld()]
if (ratio < 1) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.001 }))
steps.push(
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [texSize, texSize] }),
  prune(),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
)
await doc.transform(...steps)

const file = `w${String(week).padStart(2, '0')}.glb`
await io.write(path.join(outDir, file), doc)
const size = fs.statSync(path.join(outDir, file)).size

// regista no manifesto
const mPath = path.join(outDir, 'manifest.json')
const manifest = fs.existsSync(mPath) ? JSON.parse(fs.readFileSync(mPath, 'utf8')) : { credit: '', stages: [] }
manifest.stages = manifest.stages.filter((s) => s.week !== week)
manifest.stages.push({ week, file, lengthCm: length || undefined, rotation: rot })
manifest.stages.sort((a, b) => a.week - b.week)
fs.writeFileSync(mPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(`OK ${file}: ${Math.round(before)} -> ${Math.round(countTris())} triângulos, ${(size / 1024 / 1024).toFixed(2)} MB`)
console.log(`Manifesto atualizado: ${mPath}`)
