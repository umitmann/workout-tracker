/**
 * Normalizes wger body-part category names to workout-type names in both
 * scripts/exercises.json and the Supabase exercises table.
 *
 * wger body-part categories (abs, arms, back, calves, chest, legs, shoulders)
 * all map to "strength" — the muscle filter already handles body-part filtering.
 * "cardio" is unchanged.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

const CATEGORY_MAP: Record<string, string> = {
  abs: 'strength',
  arms: 'strength',
  back: 'strength',
  calves: 'strength',
  cardio: 'cardio',
  chest: 'strength',
  legs: 'strength',
  shoulders: 'strength',
}

function normalize(cat: string | null): string | null {
  if (!cat) return null
  return CATEGORY_MAP[cat.toLowerCase()] ?? cat
}

// --- 1. Fix exercises.json ---
const jsonPath = path.join(process.cwd(), 'scripts', 'exercises.json')
const exercises = JSON.parse(readFileSync(jsonPath, 'utf-8')) as { category: string | null }[]

let jsonChanged = 0
const normalized = exercises.map((e) => {
  const cat = normalize(e.category)
  if (cat !== e.category) jsonChanged++
  return { ...e, category: cat }
})

writeFileSync(jsonPath, JSON.stringify(normalized, null, 2))
console.log(`exercises.json: ${jsonChanged} categories updated`)

// --- 2. Fix exercises-wger.json ---
const wgerPath = path.join(process.cwd(), 'scripts', 'exercises-wger.json')
const wger = JSON.parse(readFileSync(wgerPath, 'utf-8')) as { category: string | null }[]

let wgerChanged = 0
const wgerNormalized = wger.map((e) => {
  const cat = normalize(e.category)
  if (cat !== e.category) wgerChanged++
  return { ...e, category: cat }
})

writeFileSync(wgerPath, JSON.stringify(wgerNormalized, null, 2))
console.log(`exercises-wger.json: ${wgerChanged} categories updated`)

// --- 3. Fix DB ---
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing Supabase env vars')
  process.exit(1)
}

const supabase = createClient(url, key)

let dbTotal = 0
async function updateDb() {
  for (const [from, to] of Object.entries(CATEGORY_MAP)) {
    if (from === to) continue
    const { data, error } = await supabase
      .from('exercises')
      .update({ category: to })
      .eq('category', from)
      .select('id')

    if (error) {
      console.error(`DB update "${from}" → "${to}" failed:`, error.message)
      process.exit(1)
    }

    const n = data?.length ?? 0
    if (n > 0) console.log(`DB: "${from}" → "${to}": ${n} rows`)
    dbTotal += n
  }

  console.log(`DB: ${dbTotal} rows updated total`)
  console.log('Done.')
}

updateDb()
