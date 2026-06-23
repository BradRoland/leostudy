import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildInviteUrl,
  extractInviteCodeFromPath,
  formatAcademyClassLabel,
  normalizeInviteCode,
  shouldShowClassAsActive,
} from './classWorkspace.ts'

test('normalizes invite codes for manual entry and URLs', () => {
  assert.equal(normalizeInviteCode(' pa181-x7kq2 '), 'PA181-X7KQ2')
  assert.equal(normalizeInviteCode('pa181 x7kq2'), 'PA181X7KQ2')
})

test('rejects invite codes with unsafe characters', () => {
  assert.equal(normalizeInviteCode('../PA181'), '')
  assert.equal(normalizeInviteCode('PA181?token=bad'), '')
})

test('builds canonical join domain invite URLs', () => {
  assert.equal(
    buildInviteUrl('PA181-X7KQ2', 'https://join.180.academy'),
    'https://join.180.academy/PA181-X7KQ2',
  )
})

test('extracts invite code from invite and root join paths', () => {
  assert.equal(extractInviteCodeFromPath('/invite/pa181-x7kq2'), 'PA181-X7KQ2')
  assert.equal(extractInviteCodeFromPath('/pa181-x7kq2'), 'PA181-X7KQ2')
  assert.equal(extractInviteCodeFromPath('/classes'), '')
  assert.equal(extractInviteCodeFromPath('/classes/join'), '')
})

test('shows only active listed classes whose end date has not passed', () => {
  assert.equal(shouldShowClassAsActive({
    status: 'active',
    visibility: 'listed',
    endDate: '2026-08-01',
  }, new Date('2026-06-22T12:00:00Z')), true)

  assert.equal(shouldShowClassAsActive({
    status: 'active',
    visibility: 'listed',
    endDate: '2026-05-01',
  }, new Date('2026-06-22T12:00:00Z')), false)

  assert.equal(shouldShowClassAsActive({
    status: 'active',
    visibility: 'unlisted',
    endDate: '2026-08-01',
  }, new Date('2026-06-22T12:00:00Z')), false)
})

test('formats Police Academy 180 classes without repeating 180', () => {
  assert.equal(formatAcademyClassLabel('Police Academy 180', 'Class 180'), 'Police Academy Class 180')
  assert.equal(formatAcademyClassLabel('Police Academy 180', 'class 1'), 'Police Academy class 1')
})
