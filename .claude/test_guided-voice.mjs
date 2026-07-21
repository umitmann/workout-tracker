/**
 * Pure contracts for selectable guided-workout coaching and voice delivery.
 * Browser behavior is covered separately by Playwright.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  DEFAULT_GUIDED_VOICE_SETTINGS,
  GUIDED_COACHING_MODES,
  GUIDED_DELIVERY_STYLES,
  guidedPhaseAnnouncement,
  guidedReadyAnnouncement,
  guidedRestAnnouncement,
  normalizeGuidedVoiceSettings,
  speechOptionsForGuidedVoice,
} = await import('../src/lib/guidedVoice.ts')
const { selectGuidedSpeechVoice } = await import('../src/lib/guidedSpeech.ts')

test('the default is sparse tempo plus rep guidance with silent seconds', () => {
  assert.deepEqual(DEFAULT_GUIDED_VOICE_SETTINGS, {
    enabled: true,
    coachingMode: 'minimal',
    coachVoice: 'maya',
    deliveryStyle: 'clear',
    voiceURI: null,
    rhythmCues: true,
    restCues: 'chimes',
  })
  assert.deepEqual(GUIDED_COACHING_MODES.map((mode) => mode.value), [
    'minimal', 'reps', 'tempo', 'supportive', 'technique', 'silent',
  ])
})

test('every coaching mode has a distinct, bounded speech contract', () => {
  const base = { phase: 'down', rep: 4, goalReps: 8, announceRep: true }
  assert.equal(guidedPhaseAnnouncement({ ...base, mode: 'minimal' }), 'Rep 4. Lower')
  assert.equal(guidedPhaseAnnouncement({ ...base, mode: 'reps' }), 'Rep 4')
  assert.equal(guidedPhaseAnnouncement({ ...base, mode: 'tempo' }), 'Lower')
  assert.equal(guidedPhaseAnnouncement({ ...base, mode: 'supportive' }), 'Rep 4. Halfway. Lower')
  assert.equal(guidedPhaseAnnouncement({ ...base, mode: 'technique' }), 'Rep 4. Lower')
  assert.equal(guidedPhaseAnnouncement({ ...base, mode: 'silent' }), null)
  assert.equal(guidedPhaseAnnouncement({ ...base, mode: 'reps', phase: 'up', announceRep: false }), null)
})

test('supportive speech is sparse and factual rather than invented praise', () => {
  assert.equal(guidedPhaseAnnouncement({ mode: 'supportive', phase: 'down', rep: 8, goalReps: 8, announceRep: true }), 'Rep 8. Last rep. Lower')
  assert.equal(guidedPhaseAnnouncement({ mode: 'supportive', phase: 'up', rep: 8, goalReps: 8, announceRep: false }), 'Up')
  assert.doesNotMatch(guidedPhaseAnnouncement({ mode: 'supportive', phase: 'down', rep: 2, goalReps: 8, announceRep: true }), /perfect|form|faster|harder/i)
})

test('ready speech summarizes the prescription and includes a bounded user/PT cue only in technique mode', () => {
  assert.equal(guidedReadyAnnouncement({
    enabled: true, mode: 'minimal', exerciseName: 'Bench Press',
    setNumber: 2, goalReps: 8, weight: 60,
    techniqueCue: 'Brace before lowering',
  }), 'Bench Press. Set 2. 8 reps. 60 kilograms.')
  assert.equal(guidedReadyAnnouncement({
    enabled: true, mode: 'technique', exerciseName: 'Bench Press',
    setNumber: 2, goalReps: 8, weight: 60,
    techniqueCue: '  Brace   before lowering.  ',
  }), 'Bench Press. Set 2. 8 reps. 60 kilograms. Cue. Brace before lowering.')
  assert.equal(guidedReadyAnnouncement({
    enabled: true, mode: 'silent', exerciseName: 'Squat',
    setNumber: 1, goalReps: 5,
  }), null)
})

test('rest voice never counts seconds and remains separate from chimes', () => {
  assert.equal(guidedRestAnnouncement('voice', 'halfway'), 'Rest halfway')
  assert.equal(guidedRestAnnouncement('voice', 'complete'), 'Rest complete')
  assert.equal(guidedRestAnnouncement('chimes', 'halfway'), null)
  assert.equal(guidedRestAnnouncement('off', 'complete'), null)
})

test('delivery style changes prosody independently from the selected speaker', () => {
  assert.deepEqual(GUIDED_DELIVERY_STYLES.map((profile) => profile.value), ['clear', 'calm', 'energetic'])
  assert.deepEqual(speechOptionsForGuidedVoice({ ...DEFAULT_GUIDED_VOICE_SETTINGS, deliveryStyle: 'clear' }), { rate: 1.05, pitch: 1, volume: 1 })
  assert.deepEqual(speechOptionsForGuidedVoice({ ...DEFAULT_GUIDED_VOICE_SETTINGS, deliveryStyle: 'calm' }), { rate: 0.92, pitch: 0.96, volume: 0.85 })
  assert.deepEqual(speechOptionsForGuidedVoice({ ...DEFAULT_GUIDED_VOICE_SETTINGS, deliveryStyle: 'energetic' }), { rate: 1.14, pitch: 1.04, volume: 1 })
  assert.deepEqual(speechOptionsForGuidedVoice({ ...DEFAULT_GUIDED_VOICE_SETTINGS, coachVoice: 'system', deliveryStyle: 'clear', voiceURI: 'voice:nl' }), { rate: 1, pitch: 1, volume: 1, voiceURI: 'voice:nl' })
})

test('stored voice settings fail safely and preserve valid user choices', () => {
  assert.deepEqual(normalizeGuidedVoiceSettings(null), DEFAULT_GUIDED_VOICE_SETTINGS)
  assert.deepEqual(normalizeGuidedVoiceSettings({
    enabled: false, coachingMode: 'supportive',
    coachVoice: 'system', deliveryStyle: 'energetic', voiceURI: 'voice:nl',
    rhythmCues: false, restCues: 'voice',
  }), {
    enabled: false, coachingMode: 'supportive',
    coachVoice: 'system', deliveryStyle: 'energetic', voiceURI: 'voice:nl',
    rhythmCues: false, restCues: 'voice',
  })
  assert.deepEqual(normalizeGuidedVoiceSettings({
    coachingMode: 'shout', coachVoice: 'alien', deliveryStyle: 'harsh', restCues: 'seconds',
  }), DEFAULT_GUIDED_VOICE_SETTINGS)
})

test('legacy profile settings migrate without losing a chosen system voice', () => {
  assert.deepEqual(normalizeGuidedVoiceSettings({
    enabled: true,
    coachingMode: 'minimal',
    voiceProfile: 'device',
    voiceURI: 'voice:nl',
    rhythmCues: true,
    restCues: 'chimes',
  }), {
    ...DEFAULT_GUIDED_VOICE_SETTINGS,
    coachVoice: 'system',
    voiceURI: 'voice:nl',
  })
  assert.equal(normalizeGuidedVoiceSettings({ voiceProfile: 'calm' }).deliveryStyle, 'calm')
})

test('device voice selection prefers exact URI, then language, then default', () => {
  const voices = [
    { voiceURI: 'voice:en', name: 'English', lang: 'en-US', default: true },
    { voiceURI: 'voice:nl', name: 'Dutch', lang: 'nl-NL', default: false },
  ]
  assert.equal(selectGuidedSpeechVoice(voices, 'voice:nl', 'en-US')?.voiceURI, 'voice:nl')
  assert.equal(selectGuidedSpeechVoice(voices, 'missing', 'nl-BE')?.voiceURI, 'voice:nl')
  assert.equal(selectGuidedSpeechVoice(voices, 'missing', 'fr-FR')?.voiceURI, 'voice:en')
  assert.equal(selectGuidedSpeechVoice([], 'missing', 'fr-FR'), null)
})
