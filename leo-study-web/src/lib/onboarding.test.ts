import assert from 'node:assert/strict'
import test from 'node:test'
import { requiresAccountProfileCompletion, splitProfileName, cleanRequestDepartments, safeAuthNextPath, sanitizeStudyFocus, sanitizeStudyGoal, validateClassRequest, validateOnboardingProfile } from './onboarding.ts'

const request = { academyName: 'Regional Police Academy', className: 'Class 183', startDate: '2026-09-01', endDate: '2027-03-30', departments: ['City Police', 'County Sheriff'], requesterDepartment: 'City Police' }
test('class requests require academy, class, valid chronological dates and departments', () => {
  assert.equal(validateClassRequest(request, '2026-09-05'), '')
  for (const field of ['academyName', 'className', 'startDate', 'endDate'] as const) assert.notEqual(validateClassRequest({ ...request, [field]: '' }, '2026-09-05'), '')
  assert.match(validateClassRequest({ ...request, endDate: '2026-08-30' }, '2026-09-05'), /after the start/)
  assert.match(validateClassRequest({ ...request, endDate: '2026-09-04' }, '2026-09-05'), /future/)
  assert.match(validateClassRequest({ ...request, startDate: '2026-02-30' }, '2026-09-05'), /valid class start/)
  assert.match(validateClassRequest({ ...request, departments: ['  '] }, '2026-09-05'), /at least one/)
})
test('department cleanup deduplicates equivalent names and rejects a mismatched requester department', () => {
  assert.deepEqual(cleanRequestDepartments([' City  Police ', '', 'city police', 'County Sheriff']), ['City Police', 'County Sheriff'])
  assert.match(validateClassRequest({ ...request, requesterDepartment: 'Other Department' }, '2026-09-05'), /Choose your department/)
})
test('profile setup requires both names but accepts an optional photo and display name', () => {
  const input = { firstName: 'Jordan', lastName: 'Lee', displayName: '', avatar: null }
  assert.equal(validateOnboardingProfile(input), '')
  assert.match(validateOnboardingProfile({ ...input, lastName: ' ' }), /first and last/)
  assert.match(validateOnboardingProfile({ ...input, avatar: { type: 'image/svg+xml', size: 1024 } as File }), /JPG, PNG, or WebP/)
  assert.match(validateOnboardingProfile({ ...input, avatar: { type: 'image/jpeg', size: 6 * 1024 * 1024 } as File }), /smaller than 5 MB/)
})
test('study preferences migrate missing or invalid values without affecting stored valid choices', () => {
  assert.equal(sanitizeStudyGoal(undefined), 15)
  assert.equal(sanitizeStudyGoal(30), 30)
  assert.equal(sanitizeStudyGoal(-10), 15)
  assert.equal(sanitizeStudyGoal(Infinity), 15)
  assert.equal(sanitizeStudyFocus('scenarios'), 'scenarios')
  assert.equal(sanitizeStudyFocus('bad value'), 'balanced')
})
test('auth redirects preserve the owner review request and invite destination while rejecting external redirects', () => {
  assert.equal(safeAuthNextPath('/owner/classes?request=ABcd-123'), '/owner/classes?request=ABcd-123')
  assert.equal(safeAuthNextPath('/invite/ABCDE'), '/invite/abcde')
  assert.equal(safeAuthNextPath('https://attacker.example'), '/home')
  assert.equal(safeAuthNextPath('//attacker.example'), '/home')
  assert.equal(safeAuthNextPath('/\\attacker.example'), '/home')
  assert.equal(safeAuthNextPath('/signin?next=/signin'), '/home')
  assert.equal(safeAuthNextPath('/auth/callback?code=private'), '/home')
})


test('new approved accounts finish profile setup while legacy and completed accounts keep immediate access', () => {
  assert.equal(requiresAccountProfileCompletion({ academy_onboarding_version: 1 }, false), true)
  assert.equal(requiresAccountProfileCompletion({ academy_onboarding_version: 1 }, true), false)
  assert.equal(requiresAccountProfileCompletion({}, false), false)
  assert.equal(requiresAccountProfileCompletion({ academy_onboarding_version: 'invalid' }, false), false)
  assert.deepEqual(splitProfileName('  Jordan   Lee '), { firstName: 'Jordan', lastName: 'Lee' })
  assert.deepEqual(splitProfileName('Jordan Van Lee'), { firstName: 'Jordan', lastName: 'Van Lee' })
  assert.deepEqual(splitProfileName('Cadet 12ab34cd'), { firstName: '', lastName: '' })
})
