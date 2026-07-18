'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import {
  ANATOMY_MODEL_ATTRIBUTION,
  ANATOMY_MODEL_MESHES,
  ANATOMY_MODEL_URL,
} from '@/lib/anatomyModel'
import { MUSCLE_ANATOMY_REGIONS } from '@/lib/muscleAnatomy'
import { createMusclePathGeometry } from '@/lib/musclePathGeometry'

type MaterialRecord = {
  muscle: string
  material: THREE.MeshStandardMaterial
}

type Appearance = {
  loadByMuscle: Readonly<Record<string, number>>
  previewMuscles: readonly string[]
  selectedMuscle: string | null
  hoveredMuscle: string | null
}

const Y_AXIS = new THREE.Vector3(0, 1, 0)

export default function MuscleBody3D({
  loadByMuscle,
  previewMuscles,
  selectedMuscle,
  onSelectMuscle,
}: {
  loadByMuscle: Readonly<Record<string, number>>
  previewMuscles: readonly string[]
  selectedMuscle: string | null
  onSelectMuscle: (muscle: string) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderRef = useRef<() => void>(() => undefined)
  const applyAppearanceRef = useRef<() => void>(() => undefined)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const muscleMeshesRef = useRef<THREE.Mesh[]>([])
  const materialRecordsRef = useRef<MaterialRecord[]>([])
  const onSelectRef = useRef(onSelectMuscle)
  const [hoveredMuscle, setHoveredMuscle] = useState<string | null>(null)
  const [unsupported, setUnsupported] = useState(false)
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'fallback'>('loading')
  const appearanceRef = useRef<Appearance>({ loadByMuscle, previewMuscles, selectedMuscle, hoveredMuscle })

  useEffect(() => {
    onSelectRef.current = onSelectMuscle
  }, [onSelectMuscle])

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return
    const activeCanvas = canvas

    const probe = document.createElement('canvas')
    if (!probe.getContext('webgl2')) {
      const fallbackFrame = requestAnimationFrame(() => setUnsupported(true))
      return () => cancelAnimationFrame(fallbackFrame)
    }

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      })
    } catch {
      const fallbackFrame = requestAnimationFrame(() => setUnsupported(true))
      return () => cancelAnimationFrame(fallbackFrame)
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = false

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x09090b, 0.028)
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)
    camera.position.set(0, 0.08, 12.5)
    cameraRef.current = camera

    const controls = new OrbitControls(camera, canvas)
    controls.enablePan = false
    controls.enableDamping = false
    controls.minDistance = 8.4
    controls.maxDistance = 17
    controls.minPolarAngle = 0.35
    controls.maxPolarAngle = Math.PI - 0.35
    controls.target.set(0, -0.1, 0)
    controlsRef.current = controls

    scene.add(new THREE.HemisphereLight(0xfff7ed, 0x111827, 2.5))
    const keyLight = new THREE.DirectionalLight(0xffffff, 4.2)
    keyLight.position.set(4, 6, 7)
    scene.add(keyLight)
    const fillLight = new THREE.DirectionalLight(0xfecaca, 2.1)
    fillLight.position.set(-4, 1, 5)
    scene.add(fillLight)
    const rimLight = new THREE.DirectionalLight(0xfb923c, 3)
    rimLight.position.set(-4, 3, -6)
    scene.add(rimLight)

    const figure = new THREE.Group()
    figure.name = 'anatomical_planning_figure'
    scene.add(figure)
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()

    const boneMaterial = new THREE.MeshStandardMaterial({
      color: 0xd6d3d1,
      transparent: true,
      opacity: 0.34,
      roughness: 0.86,
      metalness: 0,
      depthWrite: false,
    })
    const ribMaterial = new THREE.LineBasicMaterial({
      color: 0xa8a29e,
      transparent: true,
      opacity: 0.32,
    })
    materials.add(boneMaterial)
    materials.add(ribMaterial)

    const boneGeometry = new THREE.CylinderGeometry(1, 1, 1, 10, 1)
    const jointGeometry = new THREE.SphereGeometry(1, 18, 12)
    geometries.add(boneGeometry)
    geometries.add(jointGeometry)

    function addBone(start: readonly [number, number, number], end: readonly [number, number, number], radius: number) {
      const from = new THREE.Vector3(...start)
      const to = new THREE.Vector3(...end)
      const direction = to.clone().sub(from)
      const mesh = new THREE.Mesh(boneGeometry, boneMaterial)
      mesh.position.copy(from).add(to).multiplyScalar(0.5)
      mesh.scale.set(radius, direction.length(), radius)
      mesh.quaternion.setFromUnitVectors(Y_AXIS, direction.normalize())
      mesh.renderOrder = 0
      figure.add(mesh)
    }

    function addJoint(position: readonly [number, number, number], radius: number, scale: readonly [number, number, number] = [1, 1, 1]) {
      const mesh = new THREE.Mesh(jointGeometry, boneMaterial)
      mesh.position.set(...position)
      mesh.scale.set(radius * scale[0], radius * scale[1], radius * scale[2])
      mesh.renderOrder = 0
      figure.add(mesh)
    }

    addJoint([0, 3.52, 0], 0.5, [0.82, 1, 0.78])
    addBone([0, 3.0, 0], [0, 0.18, 0], 0.075)
    addBone([-0.05, 2.55, 0], [-0.92, 2.48, 0], 0.055)
    addBone([0.05, 2.55, 0], [0.92, 2.48, 0], 0.055)
    addBone([-1.02, 2.42, 0], [-1.35, 1.22, 0], 0.08)
    addBone([1.02, 2.42, 0], [1.35, 1.22, 0], 0.08)
    addBone([-1.35, 1.16, 0], [-1.58, 0.08, 0], 0.055)
    addBone([1.35, 1.16, 0], [1.58, 0.08, 0], 0.055)
    addBone([-0.42, 0.15, 0], [-0.47, -1.7, 0], 0.105)
    addBone([0.42, 0.15, 0], [0.47, -1.7, 0], 0.105)
    addBone([-0.47, -1.78, 0], [-0.43, -3.18, 0], 0.07)
    addBone([0.47, -1.78, 0], [0.43, -3.18, 0], 0.07)
    for (const joint of [
      [-1.02, 2.42, 0], [1.02, 2.42, 0], [-1.35, 1.16, 0], [1.35, 1.16, 0],
      [-0.42, 0.12, 0], [0.42, 0.12, 0], [-0.47, -1.76, 0], [0.47, -1.76, 0],
      [-0.43, -3.2, 0], [0.43, -3.2, 0],
    ] as const) addJoint(joint, 0.12)

    const pelvisGeometry = new THREE.TorusGeometry(0.55, 0.07, 8, 36)
    geometries.add(pelvisGeometry)
    const pelvis = new THREE.Mesh(pelvisGeometry, boneMaterial)
    pelvis.position.y = 0.18
    pelvis.rotation.x = Math.PI / 2
    pelvis.scale.set(1.35, 1, 0.68)
    figure.add(pelvis)

    for (let rib = 0; rib < 7; rib += 1) {
      const y = 1.18 + rib * 0.18
      const width = 0.7 + Math.sin((rib / 6) * Math.PI) * 0.24
      const points = Array.from({ length: 48 }, (_, index) => {
        const angle = (index / 48) * Math.PI * 2
        return new THREE.Vector3(Math.cos(angle) * width, y, Math.sin(angle) * (0.31 + width * 0.1))
      })
      const ribGeometry = new THREE.BufferGeometry().setFromPoints(points)
      geometries.add(ribGeometry)
      figure.add(new THREE.LineLoop(ribGeometry, ribMaterial))
    }

    const materialByMuscle = new Map<string, THREE.MeshStandardMaterial>()
    function getMuscleMaterial(muscle: string) {
      const existing = materialByMuscle.get(muscle)
      if (existing) return existing
      const material = new THREE.MeshStandardMaterial({
        color: 0x5b3738,
        emissive: 0x000000,
        roughness: 0.68,
        metalness: 0.02,
      })
      materialByMuscle.set(muscle, material)
      materials.add(material)
      return material
    }

    const fallbackMeshes: THREE.Mesh[] = []
    for (const region of MUSCLE_ANATOMY_REGIONS) {
      const geometry = createMusclePathGeometry(region)
      geometries.add(geometry)
      const mesh = new THREE.Mesh(geometry, getMuscleMaterial(region.muscle))
      mesh.name = `path__${region.id}`
      mesh.userData.muscle = region.muscle
      mesh.userData.anatomicalName = region.id.replaceAll('-', ' ')
      mesh.renderOrder = 1
      figure.add(mesh)
      fallbackMeshes.push(mesh)
    }
    muscleMeshesRef.current = [...fallbackMeshes]
    materialRecordsRef.current = [...materialByMuscle].map(([muscle, material]) => ({ muscle, material }))

    let frame = 0
    const render = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => renderer.render(scene, camera))
    }
    renderRef.current = render

    const applyAppearance = () => {
      const { loadByMuscle: loads, previewMuscles: previews, selectedMuscle: selected, hoveredMuscle: hovered } = appearanceRef.current
      const preview = new Set(previews)
      for (const { muscle, material } of materialRecordsRef.current) {
        const percentage = loads[muscle] ?? 0
        const active = selected === muscle
        const isHovered = hovered === muscle
        const previewed = preview.has(muscle)
        const color = new THREE.Color(percentage > 0 ? 0xfbbf24 : 0x5b3738)
        if (percentage > 0) color.lerp(new THREE.Color(0xef4444), percentage / 100)
        if (previewed && percentage === 0) color.set(0xf59e0b)
        material.color.copy(color)
        material.emissive.set(active || isHovered ? 0x7c2d12 : 0x000000)
        material.emissiveIntensity = active ? 0.78 : isHovered ? 0.42 : 0
      }
      render()
    }
    applyAppearanceRef.current = applyAppearance
    applyAppearance()

    let disposed = false
    const muscleByNode = new Map(ANATOMY_MODEL_MESHES.map((definition) => [definition.nodeName, definition.muscle]))
    const modelLoader = new GLTFLoader()
    modelLoader.setMeshoptDecoder(MeshoptDecoder)
    modelLoader.load(
      ANATOMY_MODEL_URL,
      (gltf) => {
        const loadedGeometries = new Set<THREE.BufferGeometry>()
        const sourceMaterials = new Set<THREE.Material>()
        const detailedMeshes: THREE.Mesh[] = []
        const loadedMuscles = new Set<string>()
        gltf.scene.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return
          loadedGeometries.add(object.geometry)
          const originalMaterials = Array.isArray(object.material) ? object.material : [object.material]
          originalMaterials.forEach((material) => sourceMaterials.add(material))
          const muscle = typeof object.userData.muscle === 'string'
            ? object.userData.muscle
            : muscleByNode.get(object.name)
          if (!muscle) return
          object.material = getMuscleMaterial(muscle)
          object.userData.muscle = muscle
          object.renderOrder = 2
          detailedMeshes.push(object)
          loadedMuscles.add(muscle)
        })
        sourceMaterials.forEach((material) => material.dispose())
        if (disposed) {
          loadedGeometries.forEach((geometry) => geometry.dispose())
          return
        }
        loadedGeometries.forEach((geometry) => geometries.add(geometry))
        fallbackMeshes.forEach((mesh) => {
          mesh.visible = !loadedMuscles.has(mesh.userData.muscle as string)
        })
        figure.add(gltf.scene)
        muscleMeshesRef.current = [...detailedMeshes, ...fallbackMeshes.filter((mesh) => mesh.visible)]
        materialRecordsRef.current = [...materialByMuscle].map(([muscle, material]) => ({ muscle, material }))
        setModelStatus('ready')
        applyAppearance()
      },
      undefined,
      () => {
        if (disposed) return
        setModelStatus('fallback')
        applyAppearance()
      },
    )

    controls.addEventListener('change', render)

    const resize = () => {
      const width = Math.max(1, host.clientWidth)
      const height = Math.max(1, host.clientHeight)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      render()
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)
    resize()

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let pointerDown = { x: 0, y: 0 }
    function hitTest(event: PointerEvent): string | null {
      const rect = activeCanvas.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(muscleMeshesRef.current, false)[0]
      return typeof hit?.object.userData.muscle === 'string' ? hit.object.userData.muscle : null
    }
    function handlePointerMove(event: PointerEvent) {
      const muscle = hitTest(event)
      activeCanvas.style.cursor = muscle ? 'pointer' : 'grab'
      setHoveredMuscle((current) => (current === muscle ? current : muscle))
    }
    function handlePointerDown(event: PointerEvent) {
      pointerDown = { x: event.clientX, y: event.clientY }
    }
    function handlePointerUp(event: PointerEvent) {
      if (Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 5) return
      const muscle = hitTest(event)
      if (muscle) onSelectRef.current(muscle)
    }
    function handlePointerLeave() {
      setHoveredMuscle(null)
    }
    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('pointerup', handlePointerUp)
    canvas.addEventListener('pointerleave', handlePointerLeave)

    const floorGeometry = new THREE.RingGeometry(2.05, 2.09, 80)
    const floorMaterial = new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
    geometries.add(floorGeometry)
    materials.add(floorMaterial)
    const floor = new THREE.Mesh(floorGeometry, floorMaterial)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -3.72
    scene.add(floor)

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      controls.removeEventListener('change', render)
      controls.dispose()
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointerup', handlePointerUp)
      canvas.removeEventListener('pointerleave', handlePointerLeave)
      geometries.forEach((geometry) => geometry.dispose())
      materials.forEach((material) => material.dispose())
      renderer.dispose()
      renderer.forceContextLoss()
      renderRef.current = () => undefined
      applyAppearanceRef.current = () => undefined
      cameraRef.current = null
      controlsRef.current = null
      muscleMeshesRef.current = []
      materialRecordsRef.current = []
    }
  }, [])

  useEffect(() => {
    appearanceRef.current = { loadByMuscle, previewMuscles, selectedMuscle, hoveredMuscle }
    applyAppearanceRef.current()
  }, [hoveredMuscle, loadByMuscle, previewMuscles, selectedMuscle])

  function showView(side: 'front' | 'back' | 'reset') {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return
    const distance = side === 'reset' ? 12.5 : Math.max(10.2, camera.position.length())
    camera.position.set(0, 0.08, side === 'back' ? -distance : distance)
    camera.up.set(0, 1, 0)
    controls.target.set(0, -0.1, 0)
    controls.update()
    renderRef.current()
  }

  return (
    <div
      className="relative h-[600px] overflow-hidden rounded-[28px] border border-white/10 bg-zinc-950 shadow-2xl shadow-orange-950/20"
      data-anatomy-model="segmented-path-v2"
    >
      <div ref={hostRef} className="absolute inset-0">
        <canvas
          ref={canvasRef}
          aria-label="Interactive 3D muscle map using a musculoskeletal planning model. Drag to rotate, scroll to zoom, and click a muscle to filter exercises."
          className="h-full w-full touch-none"
        />
      </div>

      {unsupported && (
        <div className="absolute inset-0 grid place-items-center bg-zinc-950 px-10 text-center">
          <div>
            <p className="text-base font-bold text-white">3D preview is unavailable</p>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Your browser or graphics settings do not expose WebGL 2. Use the muscle buttons below—the planner remains fully usable.
            </p>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
        <div className="rounded-full border border-white/10 bg-black/55 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-300 backdrop-blur">
          {modelStatus === 'loading' ? 'Loading segmented anatomy…' : 'Surface atlas · path model'}
        </div>
        {hoveredMuscle && (
          <div aria-live="polite" className="rounded-full bg-orange-500 px-3 py-1.5 text-xs font-bold capitalize text-white shadow-lg">
            {hoveredMuscle} · {loadByMuscle[hoveredMuscle] ?? 0}%
          </div>
        )}
      </div>

      <div className="absolute bottom-4 left-4 max-w-[180px] text-[9px] leading-4 text-zinc-500">
        Planning visualization, not a diagnostic model. Anatomy:{' '}
        <a className="text-zinc-400 underline decoration-zinc-700 underline-offset-2 hover:text-white" href={ANATOMY_MODEL_ATTRIBUTION.sourceUrl} target="_blank" rel="noreferrer">
          BodyParts3D
        </a>{' '}· CC BY 4.0
      </div>

      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1 rounded-full border border-white/10 bg-black/65 p-1.5 backdrop-blur">
        <button type="button" aria-label="Front view" onClick={() => showView('front')} className="rounded-full px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-orange-400">Front</button>
        <button type="button" aria-label="Back view" onClick={() => showView('back')} className="rounded-full px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-orange-400">Back</button>
        <button type="button" aria-label="Reset view" onClick={() => showView('reset')} className="rounded-full px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-orange-400">Reset</button>
      </div>
    </div>
  )
}
