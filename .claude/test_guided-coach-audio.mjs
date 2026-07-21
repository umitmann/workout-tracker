/**
 * Contracts for deterministic, offline-capable guided coach audio.
 * Browser playback/fallback is covered by the guided Playwright suite.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'

const {
  GUIDED_COACH_VOICES,
  MAX_PACKAGED_REP,
  coachCuePath,
  guidedPhaseCoachCues,
  guidedPreviewCoachCues,
  guidedReadyCoachCues,
  guidedRestCoachCues,
  isPackagedCoachVoice,
} = await import('../src/lib/guidedCoachAudio.ts')

test('four genuinely different packaged coaches and the system fallback are offered', () => {
  assert.deepEqual(GUIDED_COACH_VOICES.map((coach) => coach.value), [
    'maya', 'alex', 'jordan', 'kai', 'system',
  ])
  const packaged = GUIDED_COACH_VOICES.filter((coach) => coach.packaged)
  assert.equal(packaged.length, 4)
  assert.equal(new Set(packaged.map((coach) => coach.sourceVoice)).size, 4)
  assert.ok(packaged.some((coach) => coach.presentation === 'feminine'))
  assert.ok(packaged.some((coach) => coach.presentation === 'masculine'))
  assert.ok(packaged.some((coach) => coach.accent === 'British English'))
  assert.ok(packaged.some((coach) => coach.accent === 'American English'))
  assert.equal(isPackagedCoachVoice('maya'), true)
  assert.equal(isPackagedCoachVoice('system'), false)
})

test('phase announcements resolve to bounded composable clips', () => {
  const base = { phase: 'down', rep: 4, goalReps: 8, announceRep: true }
  assert.deepEqual(guidedPhaseCoachCues({ ...base, mode: 'minimal' }), ['rep-4', 'lower'])
  assert.deepEqual(guidedPhaseCoachCues({ ...base, mode: 'reps' }), ['rep-4'])
  assert.deepEqual(guidedPhaseCoachCues({ ...base, mode: 'tempo' }), ['lower'])
  assert.deepEqual(guidedPhaseCoachCues({ ...base, mode: 'supportive' }), ['rep-4', 'halfway', 'lower'])
  assert.deepEqual(guidedPhaseCoachCues({ ...base, mode: 'technique' }), ['rep-4', 'lower'])
  assert.deepEqual(guidedPhaseCoachCues({ ...base, mode: 'silent' }), [])
  assert.deepEqual(guidedPhaseCoachCues({ ...base, mode: 'reps', announceRep: false }), [])
  assert.deepEqual(guidedPhaseCoachCues({ ...base, mode: 'tempo', phase: 'rest' }), ['hold'])
  assert.deepEqual(guidedPhaseCoachCues({ ...base, mode: 'tempo', phase: 'up' }), ['up'])
})

test('unsupported rep numbers atomically fall back instead of dropping the count', () => {
  assert.equal(MAX_PACKAGED_REP, 50)
  assert.deepEqual(guidedPhaseCoachCues({
    mode: 'minimal', phase: 'down', rep: 50, goalReps: 50, announceRep: true,
  }), ['rep-50', 'lower'])
  assert.equal(guidedPhaseCoachCues({
    mode: 'minimal', phase: 'down', rep: 51, goalReps: 60, announceRep: true,
  }), null)
})

test('ready, preview, and rest use only fixed non-personal clips', () => {
  assert.deepEqual(guidedReadyCoachCues(), ['get-ready'])
  assert.deepEqual(guidedPreviewCoachCues(), ['rep-3', 'lower', 'hold', 'up'])
  assert.deepEqual(guidedRestCoachCues('voice', 'halfway'), ['rest-halfway'])
  assert.deepEqual(guidedRestCoachCues('voice', 'complete'), ['rest-complete'])
  assert.deepEqual(guidedRestCoachCues('chimes', 'complete'), [])
})

test('asset paths are allow-listed and cannot contain user or PT text', () => {
  assert.equal(coachCuePath('alex', 'rep-12'), '/audio/coaches/alex/rep-12.mp3')
  assert.equal(coachCuePath('jordan', 'rest-complete'), '/audio/coaches/jordan/rest-complete.mp3')
  assert.throws(() => coachCuePath('system', 'lower'))
  assert.throws(() => coachCuePath('alex', '../private'))
  assert.throws(() => coachCuePath('alex', 'Brace before lowering'))
})

test('every manifest clip exists for every packaged coach', () => {
  const cues = [
    'get-ready', 'lower', 'hold', 'up', 'halfway', 'last-rep', 'rest-halfway', 'rest-complete',
    ...Array.from({ length: MAX_PACKAGED_REP }, (_, index) => `rep-${index + 1}`),
  ]
  for (const coach of GUIDED_COACH_VOICES.filter((item) => item.packaged)) {
    for (const cue of cues) {
      const path = `public${coachCuePath(coach.value, cue)}`
      assert.ok(existsSync(path), `${coach.value}/${cue}`)
      assert.ok(statSync(path).size > 1_000, `${coach.value}/${cue} is not a real encoded clip`)
    }
  }
})

test('generated audio has a reproducible source and license notice', () => {
  assert.ok(existsSync('scripts/generate-coach-audio.py'))
  const notice = readFileSync('public/audio/coaches/NOTICE.md', 'utf8')
  assert.match(notice, /Kokoro-82M/i)
  assert.match(notice, /Apache-2\.0/i)
  assert.match(notice, /synthetic/i)
})
