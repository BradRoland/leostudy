import test from 'node:test'
import assert from 'node:assert/strict'
import { levelFromXp, xpRequiredForLevel, rewardAvatars, levelTierName } from './academyProgression.ts'

test('existing XP thresholds stay intact and level boundaries are exact', () => {
  assert.equal(xpRequiredForLevel(1), 0)
  assert.equal(xpRequiredForLevel(2), 354)
  for (let level = 2; level <= 100; level += 1) {
    const threshold = xpRequiredForLevel(level)
    assert.equal(levelFromXp(threshold - 1), level - 1)
    assert.equal(levelFromXp(threshold), level)
  }
  assert.equal(levelFromXp(Number.MAX_SAFE_INTEGER), 100)
  assert.equal(levelFromXp(Number.NaN), 1)
  assert.equal(levelFromXp(-100), 1)
})

test('earned avatar rewards have stable distinct assets and ascending unlocks', () => {
  assert.equal(new Set(rewardAvatars.map(reward => reward.path)).size, rewardAvatars.length)
  assert.deepEqual(rewardAvatars.map(reward => reward.unlockLevel), [1, 3, 5, 10, 20, 35, 50])
  assert.equal(levelTierName(1), 'Explorer')
  assert.equal(levelTierName(50), 'Academy Legend')
})
