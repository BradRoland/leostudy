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
  { key: 'academy', title: 'Patrol Cadet', unlockLevel: 1, path: '/reward-avatars/patrol-v2.webp', description: 'First on scene.' },
  { key: 'orbit', title: 'K9 Partner', unlockLevel: 3, path: '/reward-avatars/k9-v2.webp', description: 'Loyal, alert, ready.' },
  { key: 'summit', title: 'Motor Unit', unlockLevel: 5, path: '/reward-avatars/motor-v2.webp', description: 'Precision on patrol.' },
  { key: 'bloom', title: 'Detective', unlockLevel: 10, path: '/reward-avatars/detective-v2.webp', description: 'Follow every detail.' },
  { key: 'compass', title: 'Air Support', unlockLevel: 20, path: '/reward-avatars/aviation-v2.webp', description: 'A wider perspective.' },
  { key: 'nova', title: 'Watch Commander', unlockLevel: 35, path: '/reward-avatars/commander-v2.webp', description: 'Lead with confidence.' },
  { key: 'legacy', title: 'Guardian', unlockLevel: 50, path: '/reward-avatars/guardian-v2.webp', description: 'Earned through dedication.' },
] as const

export type RewardAvatar = typeof rewardAvatars[number]
