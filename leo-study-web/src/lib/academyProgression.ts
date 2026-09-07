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
  { key: 'academy', title: 'Police Cadet', unlockLevel: 1, path: '/reward-avatars/patrol-v3.webp', description: 'Polished badge. Ready for the first watch.' },
  { key: 'orbit', title: 'K9 Sentinel', unlockLevel: 3, path: '/reward-avatars/k9-v3.webp', description: 'An alert shepherd with a working K9 harness.' },
  { key: 'summit', title: 'Highway Patrol', unlockLevel: 5, path: '/reward-avatars/motor-v3.webp', description: 'Chrome, cobalt and a highway patrol motorcycle.' },
  { key: 'bloom', title: 'Major Crimes Detective', unlockLevel: 10, path: '/reward-avatars/detective-v3.webp', description: 'Trench coat, case notes and an eye for evidence.' },
  { key: 'compass', title: 'Helicopter Pilot', unlockLevel: 20, path: '/reward-avatars/aviation-v3.webp', description: 'Flight helmet, radio checks and rotorcraft ready.' },
  { key: 'nova', title: 'Watch Commander', unlockLevel: 35, path: '/reward-avatars/commander-v3.webp', description: 'Service ribbons and the confidence to lead.' },
  { key: 'legacy', title: 'Honor Guard Eagle', unlockLevel: 50, path: '/reward-avatars/guardian-v3.webp', description: 'Sculpted feathers, gold laurels and earned honor.' },
] as const

export type RewardAvatar = typeof rewardAvatars[number]
