import test from 'node:test'
import assert from 'node:assert/strict'
import { gameUnlocks, hasGameUnlock, normalizeRoomCode } from './gameUnlocks.ts'
import { levelFromXp, xpRequiredForLevel } from './academyProgression.ts'
test('each unlock becomes available at its exact earned XP boundary', () => {
  for (const unlock of gameUnlocks) {
    assert.equal(hasGameUnlock(levelFromXp(xpRequiredForLevel(unlock.level)-1), unlock.key), false)
    assert.equal(hasGameUnlock(levelFromXp(xpRequiredForLevel(unlock.level)), unlock.key), true)
    assert.equal(hasGameUnlock(Number.NaN, unlock.key), false)
  }
})
test('room-code paste preserves leading zeros and rejects letters instead of silently rewriting them', () => {
  assert.equal(normalizeRoomCode(' 012-345 '), '012345')
  assert.equal(normalizeRoomCode('000001'), '000001')
  assert.equal(/^[0-9]{6}$/.test(normalizeRoomCode('abc123')), false)
})
