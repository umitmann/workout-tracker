/**
 * Unit tests for filterExercises — scenario: exercise-picker-muscle-filter
 * Run: node --experimental-strip-types --test .claude/test_exercise-picker-muscle-filter.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

// Import the pure function under test
const { filterExercises } = await import('../src/lib/filterExercises.ts')

const DB = [
  { name: 'Bench Press',    category: 'strength',  muscles: ['chest', 'triceps'] },
  { name: 'Squat',          category: 'strength',  muscles: ['quadriceps', 'glutes'] },
  { name: 'Bicep Curl',     category: 'strength',  muscles: ['biceps'] },
  { name: 'Running',        category: 'cardio',    muscles: null },
  { name: 'Cable Fly',      category: 'strength',  muscles: ['chest'] },
  { name: 'Hip Flexor',     category: 'stretching',muscles: ['abdominals'] },
]

const noFilters = { text: '', muscles: [], categories: [] }

// §18.1 — no filters active → full list returned
test('no filters → full list', () => {
  assert.equal(filterExercises(DB, noFilters).length, DB.length)
})

// §18.2 — single muscle chip → OR across that muscle
test('single muscle chip filters by that muscle', () => {
  const result = filterExercises(DB, { ...noFilters, muscles: ['chest'] })
  assert.deepEqual(result.map(e => e.name), ['Bench Press', 'Cable Fly'])
})

// §18.3 — two muscle chips → OR (exercises targeting ANY selected muscle)
test('two muscle chips combine with OR', () => {
  const result = filterExercises(DB, { ...noFilters, muscles: ['chest', 'biceps'] })
  assert.deepEqual(result.map(e => e.name), ['Bench Press', 'Bicep Curl', 'Cable Fly'])
})

// §18.5 — muscle + category → AND across dimensions
test('muscle + category combine with AND', () => {
  const result = filterExercises(DB, { text: '', muscles: ['chest'], categories: ['strength'] })
  assert.deepEqual(result.map(e => e.name), ['Bench Press', 'Cable Fly'])
})

// §18.5 — muscle + mismatched category → zero results, no silent relaxation
test('conflicting muscle + category returns empty, does not relax', () => {
  const result = filterExercises(DB, { text: '', muscles: ['chest'], categories: ['cardio'] })
  assert.equal(result.length, 0)
})

// §18.6 — text + muscle + category all apply simultaneously
test('text + muscle + category all apply with AND', () => {
  const result = filterExercises(DB, { text: 'bench', muscles: ['chest'], categories: ['strength'] })
  assert.deepEqual(result.map(e => e.name), ['Bench Press'])
})

// text search alone
test('text search is case-insensitive', () => {
  const result = filterExercises(DB, { ...noFilters, text: 'BENCH' })
  assert.deepEqual(result.map(e => e.name), ['Bench Press'])
})

// §18.9 — exercise with muscles=null never appears when a muscle chip is active
test('exercise with muscles=null excluded when muscle filter active', () => {
  const result = filterExercises(DB, { ...noFilters, muscles: ['chest'] })
  assert.ok(!result.some(e => e.name === 'Running'), 'Running (muscles=null) must not appear')
})

// §18.9 — exercise with muscles=null still appears with no muscle filter
test('exercise with muscles=null appears when no muscle filter', () => {
  const result = filterExercises(DB, noFilters)
  assert.ok(result.some(e => e.name === 'Running'))
})

// multiple category chips → OR within categories
test('two category chips combine with OR', () => {
  const result = filterExercises(DB, { ...noFilters, categories: ['cardio', 'stretching'] })
  assert.deepEqual(result.map(e => e.name), ['Running', 'Hip Flexor'])
})

// exercise with category=null excluded when category filter active (defensive)
test('exercise with category=null excluded when category filter active', () => {
  const withNullCat = [...DB, { name: 'Mystery', category: null, muscles: ['biceps'] }]
  const result = filterExercises(withNullCat, { ...noFilters, categories: ['strength'] })
  assert.ok(!result.some(e => e.name === 'Mystery'))
})
