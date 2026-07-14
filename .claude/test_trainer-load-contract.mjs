import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('../tests/load/personal-trainer.js', import.meta.url),
  'utf8',
)

test('PT load profile uses controlled arrival rates for every read surface', () => {
  for (const scenario of [
    'trainer_directory',
    'exercise_library',
    'trainee_connections',
    'client_calendar',
    'completed_results',
  ]) {
    assert.match(
      source,
      new RegExp(`${scenario}\\s*(?::|=)\\s*\\{[\\s\\S]*?executor:\\s*'constant-arrival-rate'`),
    )
  }
  assert.match(source, /dropped_iterations:\s*\['count==0'\]/)
})

test('every load surface has failure, check, p95, and p99 thresholds', () => {
  const expectations = {
    trainer_directory: [600, 1200],
    exercise_library: [650, 1300],
    trainee_connections: [700, 1400],
    client_calendar: [800, 1500],
    completed_results: [900, 1800],
  }

  for (const [scenario, [p95, p99]] of Object.entries(expectations)) {
    assert.match(source, new RegExp(`http_req_failed\\{scenario:${scenario}\\}[^\\n]+rate<0\\.01`))
    assert.match(source, new RegExp(`http_req_duration\\{scenario:${scenario}\\}[^\\n]+p\\(95\\)<${p95}[^\\n]+p\\(99\\)<${p99}`))
    assert.match(source, new RegExp(`checks\\{scenario:${scenario}\\}[^\\n]+rate>0\\.99`))
  }
})

test('shared load profile is read-only and fails closed on redirects', () => {
  assert.equal(/http\.(?:post|put|patch|del|delete)\s*\(/.test(source), false)
  assert.match(source, /redirects:\s*0/)
  assert.match(source, /responseCallback:\s*http\.expectedStatuses\(200\)/)
  assert.match(source, /res\.status === 200/)
  assert.match(source, /fixture marker present/)
  assert.match(source, /no server error shell/)
})

test('trainee and trainer cookies are separated and required for enabled surfaces', () => {
  assert.match(source, /PT_LOAD_TRAINEE_COOKIE/)
  assert.match(source, /PT_LOAD_TRAINER_COOKIE/)
  assert.match(source, /if \(calendarPath \|\| resultsPath\) requireRuntimeValue\(trainerCookie/)
  assert.match(source, /params\(traineeCookie, 'directory'\)/)
  assert.match(source, /params\(traineeCookie, 'exercises'\)/)
  assert.match(source, /params\(trainerCookie, 'calendar'\)/)
  assert.match(source, /params\(trainerCookie, 'results'\)/)
})
