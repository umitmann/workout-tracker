'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { MUSCLE_ANATOMY_REGIONS } from '@/lib/muscleAnatomy'

type MaterialRecord = {
  muscle: string
  material: THREE.MeshStandardMaterial
}

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
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const muscleMeshesRef = useRef<THREE.Mesh[]>([])
  const materialRecordsRef = useRef<MaterialRecord[]>([])
  const onSelectRef = useRef(onSelectMuscle)
  const [hoveredMuscle, setHoveredMuscle] = useState<string | null>(null)
  const [unsupported, setUnsupported] = useState(false)

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
    scene.fog = new THREE.FogExp2(0x09090b, 0.035)
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
    camera.position.set(0, 0.15, 13)
    cameraRef.current = camera

    const controls = new OrbitControls(camera, canvas)
    controls.enablePan = false
    controls.enableDamping = false
    controls.minDistance = 8.5
    controls.maxDistance = 18
    controls.minPolarAngle = 0.35
    controls.maxPolarAngle = Math.PI - 0.35
    controls.target.set(0, 0.25, 0)
    controlsRef.current = controls

    scene.add(new THREE.HemisphereLight(0xfef3c7, 0x18181b, 2.2))
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.4)
    keyLight.position.set(4, 6, 7)
    scene.add(keyLight)
    const rimLight = new THREE.DirectionalLight(0xfb923c, 2.4)
    rimLight.position.set(-4, 2, -6)
    scene.add(rimLight)

    const figure = new THREE.Group()
    scene.add(figure)
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()
    const capsuleGeometry = new THREE.CapsuleGeometry(0.5, 1, 8, 18)
    const sphereGeometry = new THREE.SphereGeometry(0.5, 24, 18)
    geometries.add(capsuleGeometry)
    geometries.add(sphereGeometry)

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x3f3f46,
      transparent: true,
      opacity: 0.44,
      roughness: 0.78,
      metalness: 0.02,
    })
    materials.add(bodyMaterial)

    function addBodyPart(
      geometry: THREE.BufferGeometry,
      position: readonly [number, number, number],
      scale: readonly [number, number, number],
      rotation: readonly [number, number, number] = [0, 0, 0],
    ) {
      const mesh = new THREE.Mesh(geometry, bodyMaterial)
      mesh.position.set(...position)
      mesh.scale.set(...scale)
      mesh.rotation.set(...rotation)
      figure.add(mesh)
    }

    addBodyPart(sphereGeometry, [0, 3.58, 0], [0.62, 0.72, 0.58])
    addBodyPart(capsuleGeometry, [0, 1.62, 0], [1.04, 1.25, 0.58])
    addBodyPart(sphereGeometry, [0, 0.22, 0], [0.92, 0.72, 0.58])
    addBodyPart(capsuleGeometry, [-1.29, 1.52, 0], [0.39, 0.92, 0.39], [0, 0, -0.12])
    addBodyPart(capsuleGeometry, [1.29, 1.52, 0], [0.39, 0.92, 0.39], [0, 0, 0.12])
    addBodyPart(capsuleGeometry, [-1.5, 0.34, 0], [0.32, 0.86, 0.32], [0, 0, -0.1])
    addBodyPart(capsuleGeometry, [1.5, 0.34, 0], [0.32, 0.86, 0.32], [0, 0, 0.1])
    addBodyPart(capsuleGeometry, [-0.47, -0.94, 0], [0.54, 1.2, 0.52], [0, 0, 0.03])
    addBodyPart(capsuleGeometry, [0.47, -0.94, 0], [0.54, 1.2, 0.52], [0, 0, -0.03])
    addBodyPart(capsuleGeometry, [-0.44, -2.54, 0], [0.4, 1.05, 0.4])
    addBodyPart(capsuleGeometry, [0.44, -2.54, 0], [0.4, 1.05, 0.4])
    addBodyPart(sphereGeometry, [-0.44, -3.47, 0.18], [0.46, 0.26, 0.8])
    addBodyPart(sphereGeometry, [0.44, -3.47, 0.18], [0.46, 0.26, 0.8])

    const muscleMeshes: THREE.Mesh[] = []
    const materialRecords: MaterialRecord[] = []
    for (const region of MUSCLE_ANATOMY_REGIONS) {
      const material = new THREE.MeshStandardMaterial({
        color: 0x52525b,
        emissive: 0x000000,
        roughness: 0.55,
        metalness: 0.05,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      })
      materials.add(material)
      materialRecords.push({ muscle: region.muscle, material })
      const mesh = new THREE.Mesh(
        region.geometry === 'sphere' ? sphereGeometry : capsuleGeometry,
        material,
      )
      mesh.name = region.id
      mesh.userData.muscle = region.muscle
      mesh.position.set(...region.position)
      mesh.scale.set(...region.scale)
      mesh.rotation.set(...region.rotation)
      mesh.renderOrder = 2
      figure.add(mesh)
      muscleMeshes.push(mesh)
    }
    muscleMeshesRef.current = muscleMeshes
    materialRecordsRef.current = materialRecords

    const floorGeometry = new THREE.RingGeometry(2.2, 2.24, 80)
    const floorMaterial = new THREE.MeshBasicMaterial({
      color: 0xf97316,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
    })
    geometries.add(floorGeometry)
    materials.add(floorMaterial)
    const floor = new THREE.Mesh(floorGeometry, floorMaterial)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -3.72
    scene.add(floor)

    let frame = 0
    const render = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => renderer.render(scene, camera))
    }
    renderRef.current = render
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
      const hit = raycaster.intersectObjects(muscleMeshes, false)[0]
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

    return () => {
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
      cameraRef.current = null
      controlsRef.current = null
      muscleMeshesRef.current = []
      materialRecordsRef.current = []
    }
  }, [])

  useEffect(() => {
    const preview = new Set(previewMuscles)
    for (const { muscle, material } of materialRecordsRef.current) {
      const percentage = loadByMuscle[muscle] ?? 0
      const active = selectedMuscle === muscle
      const hovered = hoveredMuscle === muscle
      const previewed = preview.has(muscle)
      const color = new THREE.Color(percentage > 0 ? 0xfbbf24 : 0x52525b)
      if (percentage > 0) color.lerp(new THREE.Color(0xef4444), percentage / 100)
      if (previewed && percentage === 0) color.set(0xf59e0b)
      material.color.copy(color)
      material.emissive.set(active || hovered ? 0x7c2d12 : 0x000000)
      material.setValues({
        emissiveIntensity: active ? 0.9 : hovered ? 0.55 : 0,
        opacity: percentage > 0 || previewed || active ? 0.96 : 0.42,
      })
    }
    renderRef.current()
  }, [hoveredMuscle, loadByMuscle, previewMuscles, selectedMuscle])

  function showView(side: 'front' | 'back' | 'reset') {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return
    const distance = side === 'reset' ? 13 : Math.max(10.5, camera.position.length())
    camera.position.set(0, 0.25, side === 'back' ? -distance : distance)
    camera.up.set(0, 1, 0)
    controls.target.set(0, 0.25, 0)
    controls.update()
    renderRef.current()
  }

  return (
    <div className="relative h-[600px] overflow-hidden rounded-[28px] border border-white/10 bg-zinc-950 shadow-2xl shadow-orange-950/20">
      <div ref={hostRef} className="absolute inset-0">
        <canvas
          ref={canvasRef}
          aria-label="Interactive 3D muscle map. Drag to rotate, scroll to zoom, and click a muscle to filter exercises."
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
        <div className="rounded-full border border-white/10 bg-black/45 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-300 backdrop-blur">
          Drag · Zoom · Select
        </div>
        {hoveredMuscle && (
          <div aria-live="polite" className="rounded-full bg-orange-500 px-3 py-1.5 text-xs font-bold capitalize text-white shadow-lg">
            {hoveredMuscle} · {loadByMuscle[hoveredMuscle] ?? 0}%
          </div>
        )}
      </div>

      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1 rounded-full border border-white/10 bg-black/60 p-1.5 backdrop-blur">
        <button type="button" aria-label="Front view" onClick={() => showView('front')} className="rounded-full px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-orange-400">Front</button>
        <button type="button" aria-label="Back view" onClick={() => showView('back')} className="rounded-full px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-orange-400">Back</button>
        <button type="button" aria-label="Reset view" onClick={() => showView('reset')} className="rounded-full px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-orange-400">Reset</button>
      </div>
    </div>
  )
}
