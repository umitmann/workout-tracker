import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  isUuid,
  normalizeSpecialty,
  parseAdminStatus,
  parseDirectorySearchParams,
  parseTrainerProfileForm,
  parseTrainerReviewForm,
} = await import('../src/lib/trainerValidation.ts')

function profileForm(overrides = {}) {
  const values = {
    displayName: 'Coach Ada',
    avatarUrl: 'https://example.com/ada.jpg',
    bio: 'Strength coach.',
    specialties: 'Strength Training, mobility, strength training',
    locationText: 'Amsterdam',
    remoteAvailable: 'on',
    acceptingClients: 'on',
    listingStatus: 'published',
    ...overrides,
  }
  const form = new FormData()
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null) form.set(key, String(value))
  }
  return form
}

test('trainer profile: trims values and canonicalizes, sorts, and deduplicates specialties', () => {
  const result = parseTrainerProfileForm(profileForm())
  assert.equal(result.success, true)
  assert.deepEqual(result.data, {
    displayName: 'Coach Ada',
    avatarUrl: 'https://example.com/ada.jpg',
    bio: 'Strength coach.',
    specialties: ['mobility', 'strength-training'],
    remoteAvailable: true,
    locationText: 'Amsterdam',
    acceptingClients: true,
    listingStatus: 'published',
  })
})

test('trainer profile: absent checkboxes are false and blank optional fields become null', () => {
  const result = parseTrainerProfileForm(
    profileForm({ avatarUrl: '', locationText: '', remoteAvailable: undefined, acceptingClients: undefined }),
  )
  assert.equal(result.success, true)
  assert.equal(result.data.avatarUrl, null)
  assert.equal(result.data.locationText, null)
  assert.equal(result.data.remoteAvailable, false)
  assert.equal(result.data.acceptingClients, false)
})

test('trainer profile: rejects empty and overlong display names', () => {
  for (const displayName of ['', 'x'.repeat(81)]) {
    const result = parseTrainerProfileForm(profileForm({ displayName }))
    assert.equal(result.success, false)
    assert.ok(result.fieldErrors.displayName)
  }
})

test('trainer profile: accepts only valid HTTPS avatar URLs', () => {
  for (const avatarUrl of ['http://example.com/photo.jpg', 'not a url']) {
    const result = parseTrainerProfileForm(profileForm({ avatarUrl }))
    assert.equal(result.success, false)
    assert.ok(result.fieldErrors.avatarUrl)
  }
})

test('trainer profile: rejects a bio longer than 2,000 characters', () => {
  const result = parseTrainerProfileForm(profileForm({ bio: 'x'.repeat(2001) }))
  assert.equal(result.success, false)
  assert.ok(result.fieldErrors.bio)
})

test('trainer profile: rejects more than 20 specialties', () => {
  const specialties = Array.from({ length: 21 }, (_, index) => `specialty-${index}`).join(',')
  const result = parseTrainerProfileForm(profileForm({ specialties }))
  assert.equal(result.success, false)
  assert.ok(result.fieldErrors.specialties)
})

test('trainer profile: rejects unsafe specialty characters', () => {
  const result = parseTrainerProfileForm(profileForm({ specialties: 'strength, <script>' }))
  assert.equal(result.success, false)
  assert.ok(result.fieldErrors.specialties)
})

test('trainer profile: rejects client-side listing status tampering', () => {
  const result = parseTrainerProfileForm(profileForm({ listingStatus: 'approved' }))
  assert.equal(result.success, false)
  assert.ok(result.fieldErrors.listingStatus)
})

test('specialty normalizer creates the same slug used by database filtering', () => {
  assert.equal(normalizeSpecialty('  Strength   Training '), 'strength-training')
})

test('directory query: normalizes inputs and calculates bounded pagination', () => {
  const result = parseDirectorySearchParams({
    q: '  Amsterdam ',
    specialty: 'Strength Training',
    remote: 'true',
    page: '3',
  })
  assert.equal(result.success, true)
  assert.deepEqual(result.data, {
    query: 'Amsterdam',
    specialty: 'strength-training',
    remote: true,
    page: 3,
    pageSize: 20,
    offset: 40,
  })
})

test('directory query: rejects overlong, malformed, and out-of-range values', () => {
  for (const params of [
    { q: 'x'.repeat(101) },
    { specialty: '<script>' },
    { remote: 'yes' },
    { page: '0' },
    { page: '502' },
    { page: '1.5' },
  ]) {
    assert.equal(parseDirectorySearchParams(params).success, false)
  }
})

test('directory query: repeated parameters use only the first value', () => {
  const result = parseDirectorySearchParams({ q: ['safe', 'ignored'], remote: ['false', 'true'] })
  assert.equal(result.success, true)
  assert.equal(result.data.query, 'safe')
  assert.equal(result.data.remote, false)
})

test('review parser accepts only UUID profile ids and administrator decisions', () => {
  const valid = new FormData()
  valid.set('profileId', '19ee3335-95b5-4d78-a7b6-cf09a994dc01')
  valid.set('verificationStatus', 'approved')
  assert.equal(parseTrainerReviewForm(valid).success, true)

  for (const [profileId, status] of [
    ['not-a-uuid', 'approved'],
    ['19ee3335-95b5-4d78-a7b6-cf09a994dc01', 'pending'],
    ['19ee3335-95b5-4d78-a7b6-cf09a994dc01', 'platform_admin'],
  ]) {
    const form = new FormData()
    form.set('profileId', profileId)
    form.set('verificationStatus', status)
    assert.equal(parseTrainerReviewForm(form).success, false)
  }
})

test('UUID and admin filter helpers fail closed', () => {
  assert.equal(isUuid('19ee3335-95b5-4d78-a7b6-cf09a994dc01'), true)
  assert.equal(isUuid('../profiles'), false)
  assert.equal(parseAdminStatus('approved'), 'approved')
  assert.equal(parseAdminStatus('all'), null)
  assert.equal(parseAdminStatus('tampered'), 'pending')
})
