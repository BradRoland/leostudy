export const dailyRewardSchedule = [25, 30, 35, 40, 50, 60, 100] as const

export type DailyRewardStatus = {
  serverDate: string
  resetsAt: string
  eligible: boolean
  claimedToday: boolean
  canClaim: boolean
  totalClaims: number
  totalBonusXp: number
  cycleDay: number
  completedInCycle: number
  rewardXp: number
  nextRewardXp: number
}
export type DailyRewardClaim = DailyRewardStatus & { claimed: boolean; awardedXp: number }

type RewardClient = {
  rpc: (name: string) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>
}
const invalidResponse = () => new Error('Your daily reward could not be loaded. Please try again.')

export function decodeDailyRewardStatus(value: unknown): DailyRewardStatus {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidResponse()
  const row = value as Record<string, unknown>
  const number = (key: string) => {
    const candidate = row[key]
    if (typeof candidate !== 'number' || !Number.isSafeInteger(candidate) || candidate < 0) throw invalidResponse()
    return candidate
  }
  const boolean = (key: string) => {
    if (typeof row[key] !== 'boolean') throw invalidResponse()
    return row[key] as boolean
  }
  const serverDate = row.serverDate
  const resetsAt = row.resetsAt
  if (typeof serverDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(serverDate) || typeof resetsAt !== 'string') throw invalidResponse()
  const dayStart = Date.parse(`${serverDate}T00:00:00Z`)
  if (!Number.isFinite(dayStart) || new Date(dayStart).toISOString().slice(0, 10) !== serverDate || Date.parse(resetsAt) !== dayStart + 86400000) throw invalidResponse()
  const status = {
    serverDate, resetsAt, eligible: boolean('eligible'), claimedToday: boolean('claimedToday'), canClaim: boolean('canClaim'),
    totalClaims: number('totalClaims'), totalBonusXp: number('totalBonusXp'), cycleDay: number('cycleDay'),
    completedInCycle: number('completedInCycle'), rewardXp: number('rewardXp'), nextRewardXp: number('nextRewardXp'),
  }
  const completed = status.claimedToday ? ((status.totalClaims - 1) % 7) + 1 : status.totalClaims % 7
  const cycleDay = status.claimedToday ? completed : completed + 1
  if ((status.claimedToday && status.totalClaims === 0) || status.canClaim !== (status.eligible && !status.claimedToday)
    || status.completedInCycle !== completed || status.cycleDay !== cycleDay
    || status.rewardXp !== dailyRewardSchedule[cycleDay - 1]
    || status.nextRewardXp !== dailyRewardSchedule[status.totalClaims % 7]) throw invalidResponse()
  return status
}

export function decodeDailyRewardClaim(value: unknown): DailyRewardClaim {
  const status = decodeDailyRewardStatus(value)
  const row = value as Record<string, unknown>
  if (typeof row.claimed !== 'boolean' || !status.claimedToday || !status.eligible
    || row.awardedXp !== (row.claimed ? status.rewardXp : 0)) throw invalidResponse()
  return { ...status, claimed: row.claimed, awardedXp: row.awardedXp as number }
}

async function clientOrDefault(client?: RewardClient): Promise<RewardClient> {
  if (client) return client
  const { supabase } = await import('./supabase')
  if (!supabase) throw new Error('Sign in to view your daily reward.')
  return supabase
}

async function callRewardRpc(name: string, client?: RewardClient) {
  const { data, error } = await (await clientOrDefault(client)).rpc(name)
  if (error) {
    if (error.code === '42501') throw new Error('Sign in and join an active class to claim your daily reward.')
    throw new Error('Your daily reward is temporarily unavailable. Please try again.')
  }
  return data
}

export async function loadDailyRewardStatus(client?: RewardClient): Promise<DailyRewardStatus> {
  return decodeDailyRewardStatus(await callRewardRpc('get_daily_reward_status', client))
}

export async function claimDailyReward(client?: RewardClient): Promise<DailyRewardClaim> {
  return decodeDailyRewardClaim(await callRewardRpc('claim_daily_reward', client))
}
