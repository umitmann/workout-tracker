export type MobileMuscleView = 'front' | 'back'

export type MobileMuscleShape =
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; rotate?: number }
  | { kind: 'path'; d: string }

export type MobileMuscleRegion = {
  id: string
  muscle: string
  view: MobileMuscleView
  shapes: MobileMuscleShape[]
}

// A lightweight, tap-friendly front/back anatomy map for phones. The regions
// use anatomical placement rather than the desktop procedural capsules, while
// deliberately grouping small individual muscles into the catalog's existing
// 17 training regions. It is a planning aid, not a medical illustration.
export const MOBILE_MUSCLE_REGIONS: MobileMuscleRegion[] = [
  { id: 'front-neck', muscle: 'neck', view: 'front', shapes: [{ kind: 'path', d: 'M76 63 L104 63 L108 91 Q90 101 72 91 Z' }] },
  { id: 'front-shoulders', muscle: 'shoulders', view: 'front', shapes: [{ kind: 'ellipse', cx: 56, cy: 103, rx: 20, ry: 15, rotate: -12 }, { kind: 'ellipse', cx: 124, cy: 103, rx: 20, ry: 15, rotate: 12 }] },
  { id: 'front-chest', muscle: 'chest', view: 'front', shapes: [{ kind: 'path', d: 'M67 102 Q89 92 89 129 Q72 139 61 124 Z M91 102 Q113 92 119 124 Q108 139 91 129 Z' }] },
  { id: 'front-biceps', muscle: 'biceps', view: 'front', shapes: [{ kind: 'ellipse', cx: 47, cy: 156, rx: 11, ry: 27, rotate: 8 }, { kind: 'ellipse', cx: 133, cy: 156, rx: 11, ry: 27, rotate: -8 }] },
  { id: 'front-forearms', muscle: 'forearms', view: 'front', shapes: [{ kind: 'ellipse', cx: 39, cy: 211, rx: 9, ry: 31, rotate: 8 }, { kind: 'ellipse', cx: 141, cy: 211, rx: 9, ry: 31, rotate: -8 }] },
  { id: 'front-abdominals', muscle: 'abdominals', view: 'front', shapes: [{ kind: 'path', d: 'M75 133 Q90 128 105 133 L102 224 Q90 234 78 224 Z' }] },
  { id: 'front-abductors', muscle: 'abductors', view: 'front', shapes: [{ kind: 'path', d: 'M65 216 Q76 220 79 245 L66 273 Q58 251 59 231 Z M115 216 Q104 220 101 245 L114 273 Q122 251 121 231 Z' }] },
  { id: 'front-adductors', muscle: 'adductors', view: 'front', shapes: [{ kind: 'path', d: 'M80 230 Q90 239 88 307 L73 283 Z M100 230 Q90 239 92 307 L107 283 Z' }] },
  { id: 'front-quadriceps', muscle: 'quadriceps', view: 'front', shapes: [{ kind: 'ellipse', cx: 72, cy: 287, rx: 17, ry: 55, rotate: 3 }, { kind: 'ellipse', cx: 108, cy: 287, rx: 17, ry: 55, rotate: -3 }] },
  { id: 'front-calves', muscle: 'calves', view: 'front', shapes: [{ kind: 'ellipse', cx: 72, cy: 375, rx: 11, ry: 34 }, { kind: 'ellipse', cx: 108, cy: 375, rx: 11, ry: 34 }] },
  { id: 'back-traps', muscle: 'traps', view: 'back', shapes: [{ kind: 'path', d: 'M72 78 L108 78 L116 130 L90 151 L64 130 Z' }] },
  { id: 'back-shoulders', muscle: 'shoulders', view: 'back', shapes: [{ kind: 'ellipse', cx: 55, cy: 105, rx: 20, ry: 16, rotate: -12 }, { kind: 'ellipse', cx: 125, cy: 105, rx: 20, ry: 16, rotate: 12 }] },
  { id: 'back-triceps', muscle: 'triceps', view: 'back', shapes: [{ kind: 'ellipse', cx: 47, cy: 158, rx: 11, ry: 28, rotate: 8 }, { kind: 'ellipse', cx: 133, cy: 158, rx: 11, ry: 28, rotate: -8 }] },
  { id: 'back-lats', muscle: 'lats', view: 'back', shapes: [{ kind: 'path', d: 'M61 120 Q73 132 86 151 L79 215 Q61 198 60 161 Z M119 120 Q107 132 94 151 L101 215 Q119 198 120 161 Z' }] },
  { id: 'back-middle', muscle: 'middle back', view: 'back', shapes: [{ kind: 'path', d: 'M82 135 L98 135 L102 190 L90 210 L78 190 Z' }] },
  { id: 'back-lower', muscle: 'lower back', view: 'back', shapes: [{ kind: 'path', d: 'M78 187 L102 187 L107 226 Q90 239 73 226 Z' }] },
  { id: 'back-glutes', muscle: 'glutes', view: 'back', shapes: [{ kind: 'ellipse', cx: 75, cy: 244, rx: 20, ry: 25, rotate: 8 }, { kind: 'ellipse', cx: 105, cy: 244, rx: 20, ry: 25, rotate: -8 }] },
  { id: 'back-hamstrings', muscle: 'hamstrings', view: 'back', shapes: [{ kind: 'ellipse', cx: 72, cy: 300, rx: 16, ry: 48, rotate: 3 }, { kind: 'ellipse', cx: 108, cy: 300, rx: 16, ry: 48, rotate: -3 }] },
]
