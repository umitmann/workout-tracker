export type AnatomyPoint = readonly [number, number, number]

export type MuscleAnatomyRegion = {
  id: string
  muscle: string
  view: 'front' | 'back' | 'side'
  architecture: 'fusiform' | 'fan' | 'pennate' | 'sheet'
  path: readonly AnatomyPoint[]
  radius: number
  depthScale: number
  taper: number
}

const region = (
  id: string,
  muscle: string,
  view: MuscleAnatomyRegion['view'],
  architecture: MuscleAnatomyRegion['architecture'],
  path: readonly AnatomyPoint[],
  radius: number,
  depthScale = 0.56,
  taper = 0.16,
): MuscleAnatomyRegion => ({ id, muscle, view, architecture, path, radius, depthScale, taper })

const mirrored = (
  id: string,
  muscle: string,
  view: MuscleAnatomyRegion['view'],
  architecture: MuscleAnatomyRegion['architecture'],
  rightPath: readonly AnatomyPoint[],
  radius: number,
  depthScale = 0.56,
  taper = 0.16,
): readonly MuscleAnatomyRegion[] => [
  region(`${id}-right`, muscle, view, architecture, rightPath, radius, depthScale, taper),
  region(
    `${id}-left`,
    muscle,
    view,
    architecture,
    rightPath.map(([x, y, z]) => [-x, y, z] as const),
    radius,
    depthScale,
    taper,
  ),
]

// These compartments form the lightweight fallback and the path overlay for
// muscles not present in the segmented atlas. Origins, insertions, curved via
// points, broad-muscle compartments, and tapered bellies follow OpenSim's
// geometry-path vocabulary while remaining an original planning model.
export const MUSCLE_ANATOMY_REGIONS: readonly MuscleAnatomyRegion[] = [
  ...mirrored('sternocleidomastoid', 'neck', 'front', 'fusiform', [[0.11, 3.15, 0.13], [0.23, 2.86, 0.22], [0.39, 2.67, 0.13]], 0.11, 0.7),
  ...mirrored('splenius', 'neck', 'back', 'fusiform', [[0.12, 3.16, -0.12], [0.25, 2.9, -0.22], [0.37, 2.69, -0.15]], 0.11, 0.7),

  ...mirrored('trapezius-upper', 'traps', 'back', 'fan', [[0.07, 2.98, -0.2], [0.34, 2.72, -0.28], [0.88, 2.48, -0.2]], 0.21, 0.42),
  ...mirrored('trapezius-middle', 'traps', 'back', 'sheet', [[0.05, 2.54, -0.3], [0.44, 2.47, -0.38], [0.95, 2.4, -0.24]], 0.18, 0.38),
  ...mirrored('trapezius-lower', 'traps', 'back', 'fan', [[0.08, 1.82, -0.32], [0.35, 2.13, -0.39], [0.87, 2.35, -0.25]], 0.18, 0.4),

  ...mirrored('deltoid-anterior', 'shoulders', 'front', 'pennate', [[0.69, 2.49, 0.2], [1.03, 2.36, 0.35], [1.2, 1.97, 0.18]], 0.2, 0.62),
  ...mirrored('deltoid-lateral', 'shoulders', 'side', 'pennate', [[0.78, 2.51, 0], [1.12, 2.31, 0], [1.2, 1.94, 0]], 0.22, 0.72),
  ...mirrored('deltoid-posterior', 'shoulders', 'back', 'pennate', [[0.7, 2.48, -0.2], [1.02, 2.34, -0.34], [1.19, 1.97, -0.17]], 0.2, 0.62),

  ...mirrored('pectoralis-clavicular', 'chest', 'front', 'fan', [[0.09, 2.51, 0.31], [0.45, 2.43, 0.43], [1.05, 2.24, 0.2]], 0.2, 0.42),
  ...mirrored('pectoralis-sternal', 'chest', 'front', 'fan', [[0.07, 2.27, 0.38], [0.48, 2.19, 0.48], [1.05, 2.17, 0.22]], 0.24, 0.4),
  ...mirrored('pectoralis-abdominal', 'chest', 'front', 'fan', [[0.09, 2.02, 0.34], [0.47, 2.05, 0.44], [1.02, 2.12, 0.21]], 0.18, 0.38),

  ...mirrored('rectus-abdominis-upper', 'abdominals', 'front', 'pennate', [[0.19, 2.0, 0.35], [0.19, 1.72, 0.43], [0.18, 1.5, 0.4]], 0.17, 0.4, 0.23),
  ...mirrored('rectus-abdominis-lower', 'abdominals', 'front', 'pennate', [[0.18, 1.46, 0.4], [0.17, 1.18, 0.4], [0.16, 0.83, 0.31]], 0.16, 0.4, 0.23),
  ...mirrored('external-oblique', 'abdominals', 'front', 'sheet', [[0.67, 1.93, 0.22], [0.66, 1.48, 0.32], [0.4, 0.9, 0.28]], 0.2, 0.36, 0.35),

  ...mirrored('latissimus-superior', 'lats', 'back', 'fan', [[0.13, 1.18, -0.31], [0.54, 1.7, -0.43], [1.04, 2.12, -0.2]], 0.22, 0.42),
  ...mirrored('latissimus-middle', 'lats', 'back', 'fan', [[0.18, 0.96, -0.28], [0.63, 1.46, -0.43], [1.05, 2.1, -0.19]], 0.23, 0.42),
  ...mirrored('latissimus-inferior', 'lats', 'back', 'fan', [[0.31, 0.68, -0.23], [0.72, 1.32, -0.38], [1.05, 2.08, -0.18]], 0.19, 0.42),

  ...mirrored('rhomboid-major', 'middle back', 'back', 'sheet', [[0.09, 2.04, -0.37], [0.48, 2.19, -0.43], [0.82, 2.34, -0.25]], 0.15, 0.38),
  ...mirrored('rhomboid-minor', 'middle back', 'back', 'sheet', [[0.1, 2.35, -0.35], [0.43, 2.39, -0.4], [0.77, 2.43, -0.25]], 0.13, 0.38),
  ...mirrored('erector-spinae-lumbar', 'lower back', 'back', 'fusiform', [[0.22, 0.65, -0.28], [0.25, 1.04, -0.38], [0.27, 1.48, -0.35]], 0.14, 0.55),
  ...mirrored('erector-spinae-thoracic', 'lower back', 'back', 'fusiform', [[0.25, 1.42, -0.35], [0.28, 1.79, -0.4], [0.3, 2.12, -0.34]], 0.12, 0.55),

  ...mirrored('biceps-long-head', 'biceps', 'front', 'fusiform', [[1.12, 2.12, 0.17], [1.32, 1.68, 0.27], [1.4, 1.17, 0.16]], 0.16, 0.72),
  ...mirrored('biceps-short-head', 'biceps', 'front', 'fusiform', [[1.04, 2.11, 0.16], [1.23, 1.65, 0.25], [1.35, 1.19, 0.15]], 0.14, 0.72),
  ...mirrored('triceps-long-head', 'triceps', 'back', 'fusiform', [[1.02, 2.19, -0.17], [1.27, 1.63, -0.28], [1.39, 1.12, -0.14]], 0.17, 0.7),
  ...mirrored('triceps-lateral-head', 'triceps', 'back', 'pennate', [[1.17, 2.08, -0.14], [1.4, 1.65, -0.23], [1.43, 1.18, -0.13]], 0.15, 0.68),
  ...mirrored('forearm-flexors', 'forearms', 'front', 'pennate', [[1.4, 1.08, 0.12], [1.52, 0.64, 0.18], [1.58, 0.14, 0.1]], 0.13, 0.68),
  ...mirrored('forearm-extensors', 'forearms', 'back', 'pennate', [[1.39, 1.07, -0.12], [1.53, 0.63, -0.17], [1.6, 0.14, -0.09]], 0.13, 0.68),

  ...mirrored('gluteus-maximus-upper', 'glutes', 'back', 'fan', [[0.16, 0.48, -0.3], [0.47, 0.38, -0.51], [0.78, 0.09, -0.31]], 0.26, 0.58),
  ...mirrored('gluteus-maximus-lower', 'glutes', 'back', 'fan', [[0.17, 0.22, -0.32], [0.5, 0.08, -0.53], [0.68, -0.34, -0.28]], 0.25, 0.58),
  ...mirrored('gluteus-medius', 'abductors', 'side', 'fan', [[0.24, 0.56, -0.08], [0.61, 0.43, -0.12], [0.78, -0.05, -0.03]], 0.2, 0.6),
  ...mirrored('tensor-fasciae-latae', 'abductors', 'side', 'fusiform', [[0.72, 0.35, 0.05], [0.78, -0.04, 0.03], [0.69, -0.54, 0.03]], 0.13, 0.62),
  ...mirrored('adductor-longus', 'adductors', 'front', 'fan', [[0.17, 0.19, 0.16], [0.32, -0.27, 0.25], [0.37, -0.93, 0.16]], 0.17, 0.56),
  ...mirrored('adductor-magnus', 'adductors', 'front', 'fan', [[0.12, 0.1, 0.1], [0.3, -0.55, 0.18], [0.38, -1.48, 0.1]], 0.18, 0.52),

  ...mirrored('rectus-femoris', 'quadriceps', 'front', 'pennate', [[0.44, -0.08, 0.25], [0.49, -0.85, 0.4], [0.47, -1.69, 0.24]], 0.2, 0.68),
  ...mirrored('vastus-lateralis', 'quadriceps', 'front', 'pennate', [[0.62, -0.13, 0.17], [0.68, -0.87, 0.3], [0.54, -1.67, 0.19]], 0.19, 0.68),
  ...mirrored('vastus-medialis', 'quadriceps', 'front', 'pennate', [[0.31, -0.3, 0.19], [0.31, -1.02, 0.31], [0.43, -1.68, 0.22]], 0.18, 0.68),
  ...mirrored('biceps-femoris', 'hamstrings', 'back', 'pennate', [[0.57, -0.15, -0.2], [0.63, -0.9, -0.34], [0.52, -1.72, -0.2]], 0.19, 0.68),
  ...mirrored('semimembranosus', 'hamstrings', 'back', 'pennate', [[0.31, -0.14, -0.2], [0.37, -0.87, -0.32], [0.4, -1.72, -0.19]], 0.18, 0.68),
  ...mirrored('gastrocnemius-medial', 'calves', 'back', 'pennate', [[0.34, -1.79, -0.18], [0.34, -2.28, -0.34], [0.4, -2.86, -0.18]], 0.17, 0.72),
  ...mirrored('gastrocnemius-lateral', 'calves', 'back', 'pennate', [[0.53, -1.8, -0.17], [0.55, -2.25, -0.31], [0.46, -2.84, -0.17]], 0.15, 0.72),
]

export function muscleRegionCoverage(): Set<string> {
  return new Set(MUSCLE_ANATOMY_REGIONS.map((definition) => definition.muscle))
}
