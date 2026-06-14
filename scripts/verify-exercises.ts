/**
 * Post-merge invariant checks on scripts/exercises.json.
 * Run after merge-exercises.ts, before seed-exercises.ts.
 */
import { readFileSync } from 'fs'
import path from 'path'

interface Exercise {
  name: string
  category: string | null
  equipment: string | null
  primaryMuscles: string[]
  secondaryMuscles: string[]
  images: string[]
  instructions: string[]
}

const data = JSON.parse(
  readFileSync(path.join(process.cwd(), 'scripts', 'exercises.json'), 'utf-8'),
) as Exercise[]

let failures = 0

function fail(msg: string) {
  console.error(`FAIL: ${msg}`)
  failures++
}

// No duplicate names (case-insensitive)
const seen = new Set<string>()
for (const e of data) {
  const key = e.name.toLowerCase().trim()
  if (seen.has(key)) fail(`Duplicate name: "${e.name}"`)
  seen.add(key)
}

// Every exercise has a name and category
for (const e of data) {
  if (!e.name?.trim()) fail(`Exercise with empty name: ${JSON.stringify(e)}`)
  if (!e.category) fail(`Missing category on: "${e.name}"`)
}

// Image URL format: wger images are absolute URLs; yuhonas images are relative paths.
// Both are valid in exercises.json — the seed script resolves yuhonas paths at insert time.
// Invariant: no image entry is an empty string.
for (const e of data) {
  for (const img of e.images ?? []) {
    if (!img.trim()) fail(`Empty image entry on "${e.name}"`)
  }
}

console.log(`Checked ${data.length} exercises.`)
if (failures > 0) {
  console.error(`${failures} invariant(s) violated.`)
  process.exit(1)
} else {
  console.log('All invariants pass.')
}
