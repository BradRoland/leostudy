import assert from 'node:assert/strict'
import test from 'node:test'
import { dailyRewardSchedule, decodeDailyRewardStatus, decodeDailyRewardClaim, loadDailyRewardStatus, claimDailyReward } from './dailyRewards.ts'

function status(totalClaims = 0, claimedToday = false) {
  const completedInCycle = claimedToday ? ((totalClaims - 1) % 7) + 1 : totalClaims % 7
  const cycleDay = claimedToday ? completedInCycle : completedInCycle + 1
  return {
    serverDate: '2026-09-06', resetsAt: '2026-09-07T00:00:00Z', eligible: true, claimedToday, canClaim: !claimedToday,
    totalClaims, totalBonusXp: 0, completedInCycle, cycleDay,
    rewardXp: dailyRewardSchedule[cycleDay - 1], nextRewardXp: dailyRewardSchedule[totalClaims % 7],
  }
}

test('reward response keeps the seventh reward completed until tomorrow and then starts the next cycle', () => {
  assert.equal(decodeDailyRewardStatus(status()).cycleDay, 1)
  assert.equal(decodeDailyRewardStatus(status(6)).rewardXp, 100)
  assert.equal(decodeDailyRewardStatus(status(7, true)).completedInCycle, 7)
  assert.equal(decodeDailyRewardStatus(status(7, true)).nextRewardXp, 25)
  assert.equal(decodeDailyRewardStatus(status(7, false)).cycleDay, 1)
})

test('server date controls availability and missed days never reset completed claims', () => {
  const unchanged = status(4)
  const later = { ...unchanged, serverDate: '2026-10-10', resetsAt: '2026-10-11T00:00:00Z' }
  assert.equal(decodeDailyRewardStatus(unchanged).cycleDay, 5)
  assert.equal(decodeDailyRewardStatus(later).cycleDay, 5)
  assert.equal(decodeDailyRewardStatus({ ...later, eligible: false, canClaim: false }).canClaim, false)
})

test('reward decoder rejects malformed dates, totals, cycle state and optimistic client claims', () => {
  for (const input of [null, [], {}, { ...status(), totalBonusXp: -1 }, { ...status(), totalClaims: '1' },
    { ...status(), claimedToday: true }, { ...status(), rewardXp: 999 }, { ...status(), cycleDay: 8 },
    { ...status(), canClaim: false }, { ...status(), serverDate: '2026-02-30' },
    { ...status(), resetsAt: '2026-09-07T00:00:00-07:00' }]) assert.throws(() => decodeDailyRewardStatus(input), /could not be loaded/)
  assert.throws(() => decodeDailyRewardClaim({ ...status(), claimed: true, awardedXp: 25 }))
})

test('replayed claim returns the same authoritative XP total and awards zero additional XP', () => {
  const claimed = { ...status(1, true), totalBonusXp: 25 }
  assert.equal(decodeDailyRewardClaim({ ...claimed, claimed: true, awardedXp: 25 }).awardedXp, 25)
  assert.equal(decodeDailyRewardClaim({ ...claimed, claimed: false, awardedXp: 0 }).totalBonusXp, 25)
  assert.throws(() => decodeDailyRewardClaim({ ...claimed, claimed: false, awardedXp: 25 }))
})

test('reward client sends no user ID, browser date or claimed amount and does not leak server failures', async () => {
  const calls: string[] = []
  const client = { rpc: async (name: string) => { calls.push(name); return { data: name === 'get_daily_reward_status' ? status() : { ...status(1, true), totalBonusXp: 25, claimed: true, awardedXp: 25 }, error: null } } }
  assert.equal((await loadDailyRewardStatus(client)).canClaim, true)
  assert.equal((await claimDailyReward(client)).awardedXp, 25)
  assert.deepEqual(calls, ['get_daily_reward_status', 'claim_daily_reward'])
  await assert.rejects(loadDailyRewardStatus({ rpc: async () => ({ data: null, error: { message: '<html>private upstream error</html>' } }) }), /temporarily unavailable/)
  await assert.rejects(claimDailyReward({ rpc: async () => ({ data: null, error: { code: '42501' } }) }), /join an active class/)
})
