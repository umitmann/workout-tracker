import * as THREE from 'three'
import type { MuscleAnatomyRegion } from './muscleAnatomy'

const RING_SEGMENTS = 10

function profileAt(region: MuscleAnatomyRegion, t: number): number {
  const belly = Math.sin(Math.PI * t)
  const power = region.architecture === 'sheet' ? 0.3 : region.architecture === 'fan' ? 0.55 : 0.78
  return region.taper + (1 - region.taper) * Math.pow(Math.max(0, belly), power)
}

export function createMusclePathGeometry(region: MuscleAnatomyRegion): THREE.BufferGeometry {
  const points = region.path.map(([x, y, z]) => new THREE.Vector3(x, y, z))
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal')
  const tubularSegments = Math.max(10, (points.length - 1) * 7)
  const frames = curve.computeFrenetFrames(tubularSegments, false)
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let segment = 0; segment <= tubularSegments; segment += 1) {
    const t = segment / tubularSegments
    const center = curve.getPointAt(t)
    const width = region.radius * profileAt(region, t)
    const depth = width * region.depthScale
    const normal = frames.normals[segment]
    const binormal = frames.binormals[segment]

    for (let ring = 0; ring < RING_SEGMENTS; ring += 1) {
      const angle = (ring / RING_SEGMENTS) * Math.PI * 2
      const offset = normal.clone().multiplyScalar(Math.cos(angle) * width)
        .add(binormal.clone().multiplyScalar(Math.sin(angle) * depth))
      positions.push(center.x + offset.x, center.y + offset.y, center.z + offset.z)
      uvs.push(t, ring / RING_SEGMENTS)
    }
  }

  for (let segment = 0; segment < tubularSegments; segment += 1) {
    for (let ring = 0; ring < RING_SEGMENTS; ring += 1) {
      const nextRing = (ring + 1) % RING_SEGMENTS
      const a = segment * RING_SEGMENTS + ring
      const b = (segment + 1) * RING_SEGMENTS + ring
      const c = (segment + 1) * RING_SEGMENTS + nextRing
      const d = segment * RING_SEGMENTS + nextRing
      indices.push(a, b, d, b, c, d)
    }
  }

  const startCenterIndex = positions.length / 3
  positions.push(...points[0].toArray())
  uvs.push(0, 0.5)
  const endCenterIndex = positions.length / 3
  positions.push(...points.at(-1)!.toArray())
  uvs.push(1, 0.5)
  const lastRingStart = tubularSegments * RING_SEGMENTS
  for (let ring = 0; ring < RING_SEGMENTS; ring += 1) {
    const nextRing = (ring + 1) % RING_SEGMENTS
    indices.push(startCenterIndex, nextRing, ring)
    indices.push(endCenterIndex, lastRingStart + ring, lastRingStart + nextRing)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}
