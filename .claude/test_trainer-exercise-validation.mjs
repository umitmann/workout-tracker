import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  parseTrainerExerciseForm,
  parseYouTubeUrl,
  youtubeEmbedUrl,
} from '../src/lib/trainerExerciseValidation.ts'

test('YouTube URLs are canonicalized to one stored form and a privacy-enhanced embed', () => {
  for (const input of [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?t=12',
    'https://youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  ]) {
    assert.deepEqual(parseYouTubeUrl(input), {
      canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoId: 'dQw4w9WgXcQ',
    })
  }
  assert.equal(
    youtubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  )
})

test('arbitrary, insecure, malformed, and lookalike video URLs are rejected', () => {
  for (const input of [
    'http://youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.example/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',
    'https://vimeo.com/123',
    'javascript:alert(1)',
    'https://youtube.com/watch?v=too-short',
  ]) {
    assert.equal(parseYouTubeUrl(input), null, input)
  }
  assert.equal(youtubeEmbedUrl(null), null)
})

test('trainer exercise form normalizes bounded arrays and optional values', () => {
  const form = new FormData()
  form.set('name', '  Tempo Goblet Squat ')
  form.set('category', ' Strength ')
  form.set('equipment', ' Dumbbell ')
  form.set('primaryMuscles', 'Quadriceps, glutes, quadriceps')
  form.set('secondaryMuscles', 'core')
  form.set('primaryDetailedMuscles', 'Rectus femoris, vastus lateralis')
  form.set('secondaryDetailedMuscles', '')
  form.set('instructions', 'Brace before descending.\n\nKeep the knees tracking over toes.')
  form.set('videoUrl', 'https://youtu.be/dQw4w9WgXcQ')
  form.set('visibility', 'clients')

  assert.deepEqual(parseTrainerExerciseForm(form), {
    success: true,
    data: {
      exerciseId: null,
      name: 'Tempo Goblet Squat',
      category: 'strength',
      equipment: 'Dumbbell',
      primaryMuscles: ['quadriceps', 'glutes'],
      secondaryMuscles: ['abdominals'],
      primaryDetailedMuscles: ['rectus_femoris', 'vastus_lateralis'],
      secondaryDetailedMuscles: [],
      instructions: ['Brace before descending.', 'Keep the knees tracking over toes.'],
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      visibility: 'clients',
    },
  })
})

test('trainer detailed muscles must be recognized and match their broad group', () => {
  const form = new FormData()
  form.set('name', 'Custom curl')
  form.set('category', 'strength')
  form.set('primaryMuscles', 'biceps')
  form.set('secondaryMuscles', 'forearms')
  form.set('primaryDetailedMuscles', 'Vastus lateralis, made up muscle')
  form.set('secondaryDetailedMuscles', 'Brachioradialis')
  form.set('visibility', 'clients')

  const result = parseTrainerExerciseForm(form)
  assert.equal(result.success, false)
  if (result.success) return
  assert.ok(result.fieldErrors.primaryDetailedMuscles)
  assert.equal(result.fieldErrors.secondaryDetailedMuscles, undefined)
})

test('trainer exercise form rejects invalid visibility, video, and oversized content', () => {
  const form = new FormData()
  form.set('name', '')
  form.set('category', 'x'.repeat(81))
  form.set('primaryMuscles', Array.from({ length: 21 }, (_, i) => `muscle-${i}`).join(','))
  form.set('instructions', 'x'.repeat(1001))
  form.set('videoUrl', 'https://example.com/video')
  form.set('visibility', 'platform')

  const result = parseTrainerExerciseForm(form)
  assert.equal(result.success, false)
  if (result.success) return
  assert.ok(result.fieldErrors.name)
  assert.ok(result.fieldErrors.category)
  assert.ok(result.fieldErrors.primaryMuscles)
  assert.ok(result.fieldErrors.instructions)
  assert.ok(result.fieldErrors.videoUrl)
  assert.ok(result.fieldErrors.visibility)
})
