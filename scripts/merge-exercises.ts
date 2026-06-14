/**
 * Merges scripts/exercises-wger.json into scripts/exercises.json.
 * Deduplicates by name (case-insensitive). Run after fetch-wger.ts.
 */
import { readFileSync, writeFileSync } from 'fs'
import path from 'path'

const root = process.cwd()

const existing = JSON.parse(
  readFileSync(path.join(root, 'scripts', 'exercises.json'), 'utf-8'),
) as { name: string }[]

const wger = JSON.parse(
  readFileSync(path.join(root, 'scripts', 'exercises-wger.json'), 'utf-8'),
) as { name: string }[]

const existingNames = new Set(existing.map((e) => e.name.toLowerCase().trim()))

// Deduplicate within wger data first, then against existing
const seenWger = new Set<string>()
const newEntries = wger.filter((e) => {
  const key = e.name.toLowerCase().trim()
  if (existingNames.has(key) || seenWger.has(key)) return false
  seenWger.add(key)
  return true
})

console.log(`Existing:  ${existing.length}`)
console.log(`From wger: ${wger.length}`)
console.log(`Net new:   ${newEntries.length}`)

const merged = [...existing, ...newEntries]
console.log(`Total:     ${merged.length}`)

writeFileSync(
  path.join(root, 'scripts', 'exercises.json'),
  JSON.stringify(merged, null, 2),
)
console.log('Done — scripts/exercises.json updated.')
