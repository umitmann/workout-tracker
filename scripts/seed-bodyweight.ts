/**
 * Seeds fundamental bodyweight exercises that are absent from both
 * yuhonas/free-exercise-db and wger. Run after seed-exercises.ts.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const EXERCISES = [
  {
    name: 'Push-Up',
    category: 'strength',
    equipment: 'body only',
    muscles: ['chest', 'triceps'],
    muscles_secondary: ['shoulders'],
    instructions: [
      'Place your hands slightly wider than shoulder-width apart on the floor.',
      'Keep your body in a straight line from head to heels, core braced.',
      'Lower your chest to just above the floor by bending your elbows.',
      'Push back up to the starting position until your arms are fully extended.',
      'Repeat for the desired number of reps.',
    ],
    images: null,
  },
  {
    name: 'Pull-Up',
    category: 'strength',
    equipment: 'body only',
    muscles: ['lats', 'biceps'],
    muscles_secondary: ['traps', 'middle back'],
    instructions: [
      'Hang from a pull-up bar with an overhand grip, hands slightly wider than shoulder-width.',
      'Start from a dead hang with arms fully extended.',
      'Pull yourself up until your chin clears the bar.',
      'Lower back down with control to the dead hang.',
      'Repeat for the desired number of reps.',
    ],
    images: null,
  },
  {
    name: 'Crunch',
    category: 'strength',
    equipment: 'body only',
    muscles: ['abdominals'],
    muscles_secondary: null,
    instructions: [
      'Lie on your back with knees bent and feet flat on the floor.',
      'Place your hands lightly behind your head.',
      'Contract your abs and lift your shoulders off the floor.',
      'Hold for a moment at the top, then lower slowly.',
      'Repeat for the desired number of reps.',
    ],
    images: null,
  },
  {
    name: 'Squat',
    category: 'strength',
    equipment: 'body only',
    muscles: ['quadriceps', 'glutes'],
    muscles_secondary: ['hamstrings', 'calves'],
    instructions: [
      'Stand with feet shoulder-width apart, toes slightly turned out.',
      'Brace your core and push your hips back as you lower down.',
      'Descend until your thighs are parallel to the floor or lower.',
      'Drive through your heels to stand back up.',
      'Repeat for the desired number of reps.',
    ],
    images: null,
  },
  {
    name: 'Lunge',
    category: 'strength',
    equipment: 'body only',
    muscles: ['quadriceps', 'glutes'],
    muscles_secondary: ['hamstrings', 'calves'],
    instructions: [
      'Stand tall with feet together.',
      'Step one foot forward and lower your hips until both knees are at 90 degrees.',
      'Keep your front knee over your ankle and your torso upright.',
      'Push through your front heel to return to standing.',
      'Alternate legs for the desired number of reps.',
    ],
    images: null,
  },
  {
    name: 'Dip',
    category: 'strength',
    equipment: 'body only',
    muscles: ['triceps', 'chest'],
    muscles_secondary: ['shoulders'],
    instructions: [
      'Grip parallel bars and support yourself with arms fully extended.',
      'Lean slightly forward to engage the chest, or stay upright to focus on triceps.',
      'Lower your body by bending your elbows until your upper arms are parallel to the floor.',
      'Push back up to the starting position.',
      'Repeat for the desired number of reps.',
    ],
    images: null,
  },
  {
    name: 'Burpee',
    category: 'cardio',
    equipment: 'body only',
    muscles: ['abdominals', 'chest'],
    muscles_secondary: ['quadriceps', 'shoulders'],
    instructions: [
      'Stand with feet shoulder-width apart.',
      'Drop into a squat and place your hands on the floor.',
      'Jump your feet back into a push-up position.',
      'Perform one push-up, then jump your feet back to your hands.',
      'Explode upward into a jump with arms overhead.',
    ],
    images: null,
  },
  {
    name: 'Mountain Climber',
    category: 'cardio',
    equipment: 'body only',
    muscles: ['abdominals'],
    muscles_secondary: ['quadriceps', 'shoulders'],
    instructions: [
      'Start in a high plank position with arms straight and core braced.',
      'Drive one knee toward your chest.',
      'Quickly switch legs, driving the other knee in as the first goes back.',
      'Continue alternating at a fast pace.',
    ],
    images: null,
  },
  {
    name: 'Jumping Jack',
    category: 'cardio',
    equipment: 'body only',
    muscles: ['abductors'],
    muscles_secondary: ['calves', 'shoulders'],
    instructions: [
      'Stand with feet together and arms at your sides.',
      'Jump your feet out wide while raising your arms overhead.',
      'Jump back to the starting position.',
      'Repeat continuously for the desired duration.',
    ],
    images: null,
  },
  {
    name: 'Glute Bridge',
    category: 'strength',
    equipment: 'body only',
    muscles: ['glutes'],
    muscles_secondary: ['hamstrings', 'abdominals'],
    instructions: [
      'Lie on your back with knees bent and feet flat on the floor, hip-width apart.',
      'Drive through your heels and squeeze your glutes to raise your hips.',
      'Form a straight line from shoulders to knees at the top.',
      'Lower back down with control.',
      'Repeat for the desired number of reps.',
    ],
    images: null,
  },
  {
    name: 'Superman',
    category: 'strength',
    equipment: 'body only',
    muscles: ['lower back'],
    muscles_secondary: ['glutes'],
    instructions: [
      'Lie face down with arms extended overhead.',
      'Simultaneously lift your arms, chest, and legs off the floor.',
      'Hold for 2–3 seconds at the top.',
      'Lower back down with control.',
      'Repeat for the desired number of reps.',
    ],
    images: null,
  },
  {
    name: 'Tricep Dip',
    category: 'strength',
    equipment: 'body only',
    muscles: ['triceps'],
    muscles_secondary: ['chest', 'shoulders'],
    instructions: [
      'Sit on the edge of a sturdy bench or chair, hands gripping the edge beside your hips.',
      'Slide your hips off the bench and lower your body by bending your elbows.',
      'Lower until your upper arms are parallel to the floor.',
      'Push back up to the starting position.',
      'Repeat for the desired number of reps.',
    ],
    images: null,
  },
]

async function seed() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, key)

  // Paginate to avoid the 1000-row default cap
  const existingNames = new Set<string>()
  let from = 0
  while (true) {
    const { data } = await supabase.from('exercises').select('name').range(from, from + 999)
    for (const e of data ?? []) existingNames.add(e.name.toLowerCase().trim())
    if (!data || data.length < 1000) break
    from += data.length
  }

  const toInsert = EXERCISES.filter((e) => !existingNames.has(e.name.toLowerCase().trim()))

  if (toInsert.length === 0) {
    console.log('All bodyweight basics already in DB.')
    return
  }

  console.log(`Inserting ${toInsert.length} exercises: ${toInsert.map((e) => e.name).join(', ')}`)

  const { error } = await supabase.from('exercises').insert(toInsert)
  if (error) {
    console.error('Insert failed:', error.message)
    process.exit(1)
  }

  console.log('Done.')
}

seed()
