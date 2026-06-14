import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import rawExercises from './exercises.json'

// Only used for yuhonas exercises whose images are relative paths
const YUHONAS_IMAGES_BASE =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises'

interface RawExercise {
  id?: string
  name: string
  category: string | null
  equipment: string | null
  primaryMuscles: string[]
  secondaryMuscles: string[]
  images: string[]
  instructions: string[]
}

function resolveImage(img: string): string {
  // wger images are already absolute URLs; yuhonas images are relative paths
  return img.startsWith('http') ? img : `${YUHONAS_IMAGES_BASE}/${img}`
}

async function seed() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }

  const supabase = createClient(url, key)

  const raw = rawExercises as RawExercise[]
  console.log(`Loaded ${raw.length} exercises from JSON`)

  // Fetch all existing names — paginate to avoid the 1000-row default cap
  const existingNames = new Set<string>()
  let from = 0
  while (true) {
    const { data, error: fetchError } = await supabase
      .from('exercises')
      .select('name')
      .range(from, from + 999)

    if (fetchError) {
      console.error('Failed to fetch existing exercises:', fetchError.message)
      process.exit(1)
    }

    for (const e of data ?? []) existingNames.add(e.name.toLowerCase().trim())
    if (!data || data.length < 1000) break
    from += data.length
  }
  console.log(`Existing in DB: ${existingNames.size}`)

  const exercises = raw
    .filter((e) => !existingNames.has(e.name.toLowerCase().trim()))
    .map((e) => ({
      name: e.name,
      category: e.category ?? null,
      equipment: e.equipment ?? null,
      muscles: e.primaryMuscles.length > 0 ? e.primaryMuscles : null,
      muscles_secondary: e.secondaryMuscles.length > 0 ? e.secondaryMuscles : null,
      images: e.images.length > 0 ? e.images.map(resolveImage) : null,
      instructions: e.instructions.length > 0 ? e.instructions : null,
    }))

  if (exercises.length === 0) {
    console.log('Nothing new to seed.')
    return
  }

  console.log(`New exercises to insert: ${exercises.length}`)

  const BATCH_SIZE = 100
  const total = Math.ceil(exercises.length / BATCH_SIZE)

  for (let i = 0; i < exercises.length; i += BATCH_SIZE) {
    const batch = exercises.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('exercises').insert(batch)

    if (error) {
      console.error(`Batch ${i / BATCH_SIZE + 1}/${total} failed:`, error.message)
      process.exit(1)
    }

    console.log(`Batch ${i / BATCH_SIZE + 1}/${total} inserted`)
  }

  console.log(`Done — ${exercises.length} exercises seeded.`)
}

seed()
