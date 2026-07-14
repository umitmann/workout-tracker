export type MuscleAnatomyRegion = {
  id: string
  muscle: string
  view: 'front' | 'back' | 'side'
  geometry: 'capsule' | 'sphere'
  position: readonly [number, number, number]
  scale: readonly [number, number, number]
  rotation: readonly [number, number, number]
}

const region = (
  id: string,
  muscle: string,
  view: MuscleAnatomyRegion['view'],
  position: MuscleAnatomyRegion['position'],
  scale: MuscleAnatomyRegion['scale'],
  rotation: MuscleAnatomyRegion['rotation'] = [0, 0, 0],
  geometry: MuscleAnatomyRegion['geometry'] = 'capsule',
): MuscleAnatomyRegion => ({ id, muscle, view, geometry, position, scale, rotation })

// A deliberately stylised anatomical map. Bilateral regions are separate
// meshes so the figure reads as a human body while sharing one muscle score.
export const MUSCLE_ANATOMY_REGIONS: readonly MuscleAnatomyRegion[] = [
  region('neck-front', 'neck', 'front', [0, 2.85, 0.18], [0.28, 0.42, 0.22]),
  region('neck-back', 'neck', 'back', [0, 2.85, -0.19], [0.3, 0.42, 0.2]),
  region('trap-left', 'traps', 'back', [-0.34, 2.45, -0.32], [0.42, 0.72, 0.16], [0, 0, -0.52]),
  region('trap-right', 'traps', 'back', [0.34, 2.45, -0.32], [0.42, 0.72, 0.16], [0, 0, 0.52]),
  region('shoulder-left', 'shoulders', 'side', [-0.98, 2.28, 0], [0.46, 0.5, 0.46], [0, 0, 1.57], 'sphere'),
  region('shoulder-right', 'shoulders', 'side', [0.98, 2.28, 0], [0.46, 0.5, 0.46], [0, 0, 1.57], 'sphere'),
  region('chest-left', 'chest', 'front', [-0.38, 2.12, 0.38], [0.48, 0.58, 0.18], [0, 0, -0.12], 'sphere'),
  region('chest-right', 'chest', 'front', [0.38, 2.12, 0.38], [0.48, 0.58, 0.18], [0, 0, 0.12], 'sphere'),
  region('abs-upper', 'abdominals', 'front', [0, 1.55, 0.36], [0.34, 0.48, 0.15]),
  region('abs-lower', 'abdominals', 'front', [0, 0.92, 0.34], [0.32, 0.46, 0.14]),
  region('lat-left', 'lats', 'back', [-0.5, 1.62, -0.38], [0.43, 0.9, 0.18], [0, 0, -0.2]),
  region('lat-right', 'lats', 'back', [0.5, 1.62, -0.38], [0.43, 0.9, 0.18], [0, 0, 0.2]),
  region('middle-back', 'middle back', 'back', [0, 1.78, -0.41], [0.34, 0.72, 0.16]),
  region('lower-back', 'lower back', 'back', [0, 0.95, -0.37], [0.42, 0.5, 0.15]),
  region('biceps-left', 'biceps', 'front', [-1.34, 1.63, 0.21], [0.24, 0.64, 0.24], [0, 0, -0.12]),
  region('biceps-right', 'biceps', 'front', [1.34, 1.63, 0.21], [0.24, 0.64, 0.24], [0, 0, 0.12]),
  region('triceps-left', 'triceps', 'back', [-1.34, 1.63, -0.2], [0.25, 0.66, 0.23], [0, 0, -0.12]),
  region('triceps-right', 'triceps', 'back', [1.34, 1.63, -0.2], [0.25, 0.66, 0.23], [0, 0, 0.12]),
  region('forearm-left', 'forearms', 'side', [-1.52, 0.65, 0], [0.2, 0.73, 0.2], [0, 0, -0.1]),
  region('forearm-right', 'forearms', 'side', [1.52, 0.65, 0], [0.2, 0.73, 0.2], [0, 0, 0.1]),
  region('glute-left', 'glutes', 'back', [-0.4, 0.12, -0.4], [0.48, 0.55, 0.3], [0, 0, -0.08], 'sphere'),
  region('glute-right', 'glutes', 'back', [0.4, 0.12, -0.4], [0.48, 0.55, 0.3], [0, 0, 0.08], 'sphere'),
  region('abductor-left', 'abductors', 'side', [-0.74, -0.28, -0.02], [0.24, 0.7, 0.22], [0, 0, 0.08]),
  region('abductor-right', 'abductors', 'side', [0.74, -0.28, -0.02], [0.24, 0.7, 0.22], [0, 0, -0.08]),
  region('adductor-left', 'adductors', 'front', [-0.25, -0.68, 0.22], [0.22, 0.82, 0.2], [0, 0, -0.04]),
  region('adductor-right', 'adductors', 'front', [0.25, -0.68, 0.22], [0.22, 0.82, 0.2], [0, 0, 0.04]),
  region('quad-left', 'quadriceps', 'front', [-0.48, -0.88, 0.34], [0.34, 1.08, 0.28], [0, 0, 0.04]),
  region('quad-right', 'quadriceps', 'front', [0.48, -0.88, 0.34], [0.34, 1.08, 0.28], [0, 0, -0.04]),
  region('hamstring-left', 'hamstrings', 'back', [-0.46, -0.94, -0.31], [0.32, 1.02, 0.25], [0, 0, 0.04]),
  region('hamstring-right', 'hamstrings', 'back', [0.46, -0.94, -0.31], [0.32, 1.02, 0.25], [0, 0, -0.04]),
  region('calf-left', 'calves', 'back', [-0.45, -2.42, -0.25], [0.27, 0.85, 0.23]),
  region('calf-right', 'calves', 'back', [0.45, -2.42, -0.25], [0.27, 0.85, 0.23]),
]

export function muscleRegionCoverage(): Set<string> {
  return new Set(MUSCLE_ANATOMY_REGIONS.map((regionDefinition) => regionDefinition.muscle))
}
