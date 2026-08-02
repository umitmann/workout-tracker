import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('exercise search filters the authorized catalog locally without iPhone form zoom', async () => {
  const [page, search, library] = await Promise.all([
    source('../src/app/routines/page.tsx'),
    source('../src/app/routines/ExerciseSearch.tsx'),
    source('../src/app/routines/ExerciseLibrary.tsx'),
  ])

  assert.match(page, /<ExerciseLibrary/)
  assert.doesNotMatch(page, /exercises\.filter/)
  assert.match(search, /text-base/)
  assert.match(search, /sm:text-sm/)
  assert.doesNotMatch(search, /useRouter|router\.push/)
  assert.match(library, /useMemo/)
  assert.match(library, /window\.history\.replaceState/)
  assert.match(library, /min-w-0/)
  assert.match(library, /max-w-/)
})

test('exercise discovery remains request-authorized and is never shared-cached', async () => {
  const [dal, library, shell, relationshipActions] = await Promise.all([
    source('../src/lib/dal.ts'),
    source('../src/app/routines/ExerciseLibrary.tsx'),
    source('../src/components/AppShell.tsx'),
    source('../src/app/actions/trainerRelationships.ts'),
  ])

  assert.match(dal, /list_available_exercises_v3/)
  assert.doesNotMatch(dal, /use cache|unstable_cache/)
  assert.doesNotMatch(library, /localStorage|sessionStorage|caches\.open/)
  assert.match(shell, /prefetch=\{item\.href === '\/routines' \? true : undefined\}/)
  assert.match(relationshipActions, /revalidatePath\('\/routines'\)/)
})
