#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { ANATOMY_MODEL_MESHES } from '../src/lib/anatomyModel'

class NodeFileReader {
  result: ArrayBuffer | string | null = null
  error: Error | null = null
  onloadend: null | (() => void) = null

  readAsArrayBuffer(blob: Blob) {
    blob.arrayBuffer()
      .then((result) => { this.result = result })
      .catch((error: Error) => { this.error = error })
      .finally(() => this.onloadend?.())
  }

  readAsDataURL(blob: Blob) {
    blob.arrayBuffer()
      .then((result) => {
        this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`
      })
      .catch((error: Error) => { this.error = error })
      .finally(() => this.onloadend?.())
  }
}

globalThis.FileReader = NodeFileReader as unknown as typeof FileReader

async function main() {
  const [, , zipArgument, outputArgument] = process.argv
  if (!zipArgument || !outputArgument) {
    throw new Error('Usage: tsx scripts/build-muscle-anatomy-model.ts <BodyParts3D zip> <output.glb>')
  }

  const zipPath = resolve(zipArgument)
  const outputPath = resolve(outputArgument)
  const loader = new OBJLoader()
  const root = new THREE.Group()
  root.name = 'bodyparts3d_muscle_atlas'
  root.rotation.x = -Math.PI / 2
  root.scale.setScalar(0.00435)
  root.position.y = -3.7
  root.userData = {
    source: 'BodyParts3D',
    attribution: 'BodyParts3D, © The Database Center for Life Science',
    license: 'CC BY 4.0',
  }

  const material = new THREE.MeshStandardMaterial({
    color: 0x8b3a32,
    roughness: 0.82,
    metalness: 0,
  })

  for (const definition of ANATOMY_MODEL_MESHES) {
    const source = execFileSync(
      'unzip',
      ['-p', zipPath, `isa_BP3D_4.0_obj_99/${definition.sourcePartId}.obj`],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    )
    if (!source.trim()) throw new Error(`BodyParts3D part ${definition.sourcePartId} was not found in ${zipPath}`)

    const parsed = loader.parse(source)
    let meshIndex = 0
    parsed.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const mesh = new THREE.Mesh(object.geometry.clone(), material)
      mesh.name = meshIndex === 0 ? definition.nodeName : `${definition.nodeName}_part_${meshIndex + 1}`
      mesh.userData = {
        muscle: definition.muscle,
        anatomicalName: definition.anatomicalName,
        sourcePartId: definition.sourcePartId,
        side: definition.side,
      }
      root.add(mesh)
      meshIndex += 1
    })
    if (meshIndex === 0) throw new Error(`BodyParts3D part ${definition.sourcePartId} contained no mesh`)
  }

  const result = await new GLTFExporter().parseAsync(root, {
    binary: true,
    onlyVisible: true,
    trs: false,
  })
  if (!(result instanceof ArrayBuffer)) throw new Error('Expected binary GLB output')

  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, Buffer.from(result))
  process.stdout.write(`Wrote ${ANATOMY_MODEL_MESHES.length} segmented muscles to ${outputPath} (${Math.round(result.byteLength / 1024)} KiB)\n`)
}

void main()
