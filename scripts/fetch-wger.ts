import { writeFileSync } from 'fs'
import path from 'path'

const BASE = 'https://wger.de/api/v2'
const LANG_EN = 2

// wger muscle ID → our existing muscle name strings
const MUSCLE_MAP: Record<number, string> = {
  1: 'biceps',       // Biceps brachii
  2: 'shoulders',    // Anterior deltoid
  3: 'chest',        // Serratus anterior
  4: 'chest',        // Pectoralis major
  5: 'triceps',      // Triceps brachii
  6: 'abdominals',   // Rectus abdominis
  7: 'calves',       // Gastrocnemius
  8: 'glutes',       // Gluteus maximus
  9: 'traps',        // Trapezius
  10: 'quadriceps',  // Quadriceps femoris
  11: 'hamstrings',  // Biceps femoris
  12: 'lats',        // Latissimus dorsi
  13: 'biceps',      // Brachialis
  14: 'abdominals',  // Obliquus externus abdominis
  15: 'calves',      // Soleus
}

// wger equipment ID → our existing equipment name strings
const EQUIPMENT_MAP: Record<number, string> = {
  1: 'barbell',
  2: 'e-z curl bar',  // SZ-Bar
  3: 'dumbbell',
  4: 'other',         // Gym mat
  5: 'exercise ball', // Swiss Ball
  6: 'other',         // Pull-up bar
  7: 'body only',     // none (bodyweight)
  8: 'other',         // Bench
  9: 'other',         // Incline bench
  10: 'kettlebells',
  11: 'bands',        // Resistance band
}

interface WgerTranslation {
  language: number
  name: string
  description: string
  description_source: string
}

interface WgerExerciseInfo {
  id: number
  category: { id: number; name: string }
  muscles: { id: number }[]
  muscles_secondary: { id: number }[]
  equipment: { id: number }[]
  images: { image: string }[]
  translations: WgerTranslation[]
}

interface WgerPage {
  results: WgerExerciseInfo[]
  next: string | null
}

async function fetchAll(startUrl: string): Promise<WgerExerciseInfo[]> {
  const results: WgerExerciseInfo[] = []
  let next: string | null = startUrl

  while (next) {
    const res = await fetch(next)
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${next}`)
    const data = (await res.json()) as WgerPage
    results.push(...data.results)
    next = data.next
    process.stdout.write(`\rFetched ${results.length} exercises...`)
    if (next) await new Promise((r) => setTimeout(r, 250)) // be polite
  }

  process.stdout.write('\n')
  return results
}

function htmlToInstructions(html: string): string[] {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return []
  return text
    .split(/(?<=\.)\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)]
}

async function main() {
  console.log('Fetching exercise list from wger.de...')

  const exercises = await fetchAll(
    `${BASE}/exerciseinfo/?format=json&language=${LANG_EN}&limit=100`,
  )

  console.log(`Total exercises from API: ${exercises.length}`)

  const normalized = exercises.flatMap((e) => {
    const translation = e.translations.find((t) => t.language === LANG_EN)
    if (!translation?.name.trim()) return []

    const primaryMuscles = unique(
      e.muscles.map((m) => MUSCLE_MAP[m.id]).filter(Boolean),
    )
    const secondaryMuscles = unique(
      e.muscles_secondary.map((m) => MUSCLE_MAP[m.id]).filter(Boolean),
    )

    const equipment =
      e.equipment.map((eq) => EQUIPMENT_MAP[eq.id]).find(Boolean) ?? null

    const instructions = htmlToInstructions(
      translation.description_source || translation.description,
    )

    const images = e.images.map((img) => img.image)

    return [
      {
        name: translation.name.trim(),
        category: e.category.name.toLowerCase(),
        equipment,
        primaryMuscles,
        secondaryMuscles,
        instructions,
        images,
      },
    ]
  })

  console.log(`Exercises with English names: ${normalized.length}`)

  const outPath = path.join(process.cwd(), 'scripts', 'exercises-wger.json')
  writeFileSync(outPath, JSON.stringify(normalized, null, 2))
  console.log(`Written → ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
