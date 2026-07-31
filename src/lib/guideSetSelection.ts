export type GuideSourceSet = {
  localId: string
  reps: number | null
  weight: number | null
  done: boolean
  note?: string | null
}

export type GuideSetupRow = {
  localId: string
  reps: number
  weight: number
  selected: boolean
  maxMode: boolean
  done: boolean
  note?: string | null
  setNumber: number
}

export function buildGuideRows(sets: GuideSourceSet[]): GuideSetupRow[] {
  const hasPending = sets.some((set) => !set.done)
  return sets.map((set, index) => ({
    localId: set.localId,
    reps: Math.max(1, set.reps ?? 8),
    weight: set.weight ?? 0,
    selected: hasPending ? !set.done : true,
    maxMode: false,
    done: set.done,
    note: set.note,
    setNumber: index + 1,
  }))
}

export function guideAllRows(rows: GuideSetupRow[]): GuideSetupRow[] {
  return rows.map((row) => ({ ...row, selected: true }))
}

export function guidePendingRows(rows: GuideSetupRow[]): GuideSetupRow[] {
  return rows.map((row) => ({ ...row, selected: !row.done }))
}

export function setAllSelectedMaxMode(rows: GuideSetupRow[], maxMode: boolean): GuideSetupRow[] {
  return rows.map((row) => row.selected ? { ...row, maxMode } : row)
}

export function selectedGuideRows(rows: GuideSetupRow[]): GuideSetupRow[] {
  return rows.filter((row) => row.selected)
}
