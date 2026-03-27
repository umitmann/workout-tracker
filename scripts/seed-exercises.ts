import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import rawExercises from './exercises.json'

const IMAGES_BASE =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises'

interface RawExercise {
  id: string
  name: string
  category: string | null
  equipment: string | null
  primaryMuscles: string[]
  secondaryMuscles: string[]
  images: string[]
  instructions: string[]
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
  console.log(`Loaded ${raw.length} exercises`)

  const exercises = raw.map((e) => ({
    name: e.name,
    category: e.category ?? null,
    equipment: e.equipment ?? null,
    muscles: e.primaryMuscles.length > 0 ? e.primaryMuscles : null,
    muscles_secondary: e.secondaryMuscles.length > 0 ? e.secondaryMuscles : null,
    images: e.images.length > 0 ? e.images.map((img) => `${IMAGES_BASE}/${img}`) : null,
    instructions: e.instructions.length > 0 ? e.instructions : null,
  }))

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
