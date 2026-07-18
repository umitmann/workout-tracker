import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const editorUrl = new URL('../src/app/workouts/[id]/TemplateEditor.tsx', import.meta.url)
const desktopUrl = new URL('../src/app/workouts/[id]/DesktopWorkoutGenerator.tsx', import.meta.url)
const bodyUrl = new URL('../src/app/workouts/[id]/MuscleBody3D.tsx', import.meta.url)

test('desktop generator is client-only, lazy, and the established editor remains the default', async () => {
  const editor = await readFile(editorUrl, 'utf8')
  assert.match(editor, /dynamic\([\s\S]+DesktopWorkoutGenerator[\s\S]+ssr:\s*false/)
  assert.match(editor, /useState<WorkoutGeneratorMode>\('classic'\)/)
  assert.match(editor, /resolveWorkoutGeneratorMode\('desktop', window\.innerWidth\)/)
  assert.match(editor, /hidden lg:inline-flex/)
  assert.match(editor, /Open 3D generator/)
  assert.match(editor, /Use classic editor/)
})

test('desktop planner provides one connected select-map-program workflow', async () => {
  const desktop = await readFile(desktopUrl, 'utf8')
  assert.match(desktop, /calculateMuscleLoad/)
  assert.match(desktop, /aria-label="Exercise library"/)
  assert.match(desktop, /aria-label="Muscle exposure map"/)
  assert.match(desktop, /aria-label="Selected workout"/)
  assert.match(desktop, /Primary set = 1\.0/)
  assert.match(desktop, /Secondary set = 0\.5/)
  assert.match(desktop, /Fine-tune advanced targets/)
})

test('desktop workspace keeps all three columns visible with independent scroll regions', async () => {
  const [editor, desktop, body] = await Promise.all([
    readFile(editorUrl, 'utf8'),
    readFile(desktopUrl, 'utf8'),
    readFile(bodyUrl, 'utf8'),
  ])
  assert.match(editor, /desktopWorkspaceActive/)
  assert.match(editor, /flex h-\[100dvh\] flex-col overflow-hidden/)
  assert.match(desktop, /min-h-0[^"]*flex-1[^"]*overflow-hidden/)
  assert.match(desktop, /data-testid="exercise-library-scroll"/)
  assert.match(desktop, /data-testid="selected-workout-scroll"/)
  assert.match(desktop, /aria-label="Muscle exposure controls"/)
  assert.match(desktop, /overscroll-contain/)
  assert.match(body, /className\?: string/)
  assert.doesNotMatch(body, /h-\[600px\]/)
})

test('picker and selected-workout cards share the same muscle-preview state', async () => {
  const [desktop, body] = await Promise.all([
    readFile(desktopUrl, 'utf8'),
    readFile(bodyUrl, 'utf8'),
  ])
  assert.match(desktop, /onMouseEnter=\{\(\) => setHoveredExerciseId\(exercise\.id\)\}/)
  assert.match(desktop, /onMouseEnter=\{\(\) => setHoveredExerciseId\(item\.exerciseId\)\}/)
  assert.match(desktop, /data-preview-source="selected-workout"/)
  assert.match(body, /data-preview-muscles=\{previewMuscles\.join\(','\)\}/)
  assert.match(desktop, /calculateDetailedMuscleLoad/)
  assert.match(desktop, /previewDetailedMuscles/)
  assert.match(body, /loadByDetailedMuscle/)
  assert.match(body, /previewDetailedMuscles/)
})

test('3D body has accessible camera controls, WebGL fallback, and disposes resources', async () => {
  const body = await readFile(bodyUrl, 'utf8')
  for (const label of ['Front view', 'Back view', 'Reset view']) {
    assert.match(body, new RegExp(`aria-label="${label}"`))
  }
  assert.match(body, /Interactive 3D muscle map/)
  assert.match(body, /3D preview is unavailable/)
  assert.match(body, /renderer\.dispose\(\)/)
  assert.match(body, /controls\.dispose\(\)/)
  assert.match(body, /ResizeObserver/)
  assert.match(body, /Math\.min\(window\.devicePixelRatio, 2\)/)
  assert.match(body, /GLTFLoader/)
  assert.match(body, /MeshoptDecoder/)
  assert.match(body, /createMusclePathGeometry/)
  assert.match(body, /BodyParts3D/)
  assert.match(body, /data-anatomy-model="segmented-path-v2"/)
  assert.doesNotMatch(body, /deliberately stylised/)
})
