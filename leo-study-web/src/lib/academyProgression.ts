export function xpRequiredForLevel(level: number): number {
  let total = 0
  for (let current = 1; current < Math.min(101, level); current += 1) {
    total += 260 + current * 70 + Math.floor(Math.pow(current, 1.52) * 24)
  }
  return total
}

export function levelFromXp(totalXp: number): number {
  let level = 1
  const safeXp = Number.isFinite(totalXp) ? Math.max(0, totalXp) : 0
  while (level < 100 && safeXp >= xpRequiredForLevel(level + 1)) level += 1
  return level
}

export function levelTierName(level: number): string {
  if (level >= 50) return 'Academy Legend'
  if (level >= 40) return 'Luminary'
  if (level >= 30) return 'Vanguard'
  if (level >= 25) return 'Pathfinder'
  if (level >= 15) return 'Specialist'
  if (level >= 10) return 'Scholar'
  if (level >= 5) return 'Focused'
  if (level >= 2) return 'Rising'
  return 'Explorer'
}

export function rankTone(level: number): string {
  return level >= 50 ? 'legend' : level >= 30 ? 'violet' : level >= 15 ? 'gold' : level >= 5 ? 'blue' : 'slate'
}

export const rewardAvatars = [
  { key: 'academy', title: 'Academy', unlockLevel: 1, path: '/default-avatar-academy-v1.png' },
  { key: 'orbit', title: 'Orbit', unlockLevel: 3, path: '/reward-avatars/orbit.png' },
  { key: 'summit', title: 'Summit', unlockLevel: 5, path: '/reward-avatars/summit.png' },
  { key: 'bloom', title: 'Bloom', unlockLevel: 10, path: '/reward-avatars/bloom.png' },
  { key: 'compass', title: 'Compass', unlockLevel: 20, path: '/reward-avatars/compass.png' },
  { key: 'nova', title: 'Nova', unlockLevel: 35, path: '/reward-avatars/nova.png' },
  { key: 'legacy', title: 'Legacy', unlockLevel: 50, path: '/reward-avatars/legacy.png' },
] as const

export type RewardAvatar = typeof rewardAvatars[number]
