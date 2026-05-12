export type ProfileDecoration = {
  key: string
  title: string
  unlockLevel: number
  description: string
  cssClass: string
  tone: 'classic' | 'cute' | 'funny' | 'elite'
  animated: boolean
}

export const profileDecorationCatalog: ProfileDecoration[] = [
  { key: 'auto', title: 'Auto Rank', unlockLevel: 1, description: 'Automatically wears your highest unlocked rank frame.', cssClass: 'avatar-decor-auto', tone: 'classic', animated: false },
  { key: 'none', title: 'Clean Avatar', unlockLevel: 1, description: 'Halo only. No rank frame overlay.', cssClass: 'avatar-decor-none', tone: 'classic', animated: false },
  { key: 'rank_01', title: 'Bronze Recruit', unlockLevel: 1, description: 'Your first academy rank frame.', cssClass: 'avatar-decor-rank-01', tone: 'classic', animated: false },
  { key: 'rank_02', title: 'Bronze Star', unlockLevel: 2, description: 'Adds a first-star badge to your profile ring.', cssClass: 'avatar-decor-rank-02', tone: 'classic', animated: false },
  { key: 'rank_03', title: 'Silver Shield', unlockLevel: 4, description: 'A clean silver shield frame for early momentum.', cssClass: 'avatar-decor-rank-03', tone: 'classic', animated: false },
  { key: 'rank_04', title: 'Silver Laurel', unlockLevel: 6, description: 'Silver laurels for consistent study habits.', cssClass: 'avatar-decor-rank-04', tone: 'classic', animated: false },
  { key: 'rank_05', title: 'Blue Chevron', unlockLevel: 8, description: 'A blue chevron frame for stronger progress.', cssClass: 'avatar-decor-rank-05', tone: 'classic', animated: false },
  { key: 'rank_06', title: 'Study Cadet', unlockLevel: 10, description: 'Notebook-and-book frame for serious study reps.', cssClass: 'avatar-decor-rank-06', tone: 'cute', animated: false },
  { key: 'rank_07', title: 'Gold Sergeant', unlockLevel: 12, description: 'Gold chevrons for players leveling with purpose.', cssClass: 'avatar-decor-rank-07', tone: 'elite', animated: false },
  { key: 'rank_08', title: 'Code 3', unlockLevel: 15, description: 'Animated red-and-blue rank frame.', cssClass: 'avatar-decor-rank-08', tone: 'elite', animated: true },
  { key: 'rank_09', title: 'Crystal Vanguard', unlockLevel: 18, description: 'Crystal glow frame for sharp test performance.', cssClass: 'avatar-decor-rank-09', tone: 'elite', animated: true },
  { key: 'rank_10', title: 'Command Elite', unlockLevel: 22, description: 'Gold command frame with ribbon finish.', cssClass: 'avatar-decor-rank-10', tone: 'elite', animated: true },
  { key: 'rank_11', title: 'Winged Silver', unlockLevel: 26, description: 'Silver wing frame for high performers.', cssClass: 'avatar-decor-rank-11', tone: 'elite', animated: true },
  { key: 'rank_12', title: 'Radiant Gold', unlockLevel: 30, description: 'Radiant gold frame with animated glow.', cssClass: 'avatar-decor-rank-12', tone: 'elite', animated: true },
  { key: 'rank_13', title: 'Tactical Neon', unlockLevel: 35, description: 'Animated tactical neon frame for elite grinders.', cssClass: 'avatar-decor-rank-13', tone: 'elite', animated: true },
  { key: 'rank_14', title: 'Crown Commander', unlockLevel: 42, description: 'Crowned gold commander frame.', cssClass: 'avatar-decor-rank-14', tone: 'elite', animated: true },
  { key: 'rank_15', title: 'Legend Ascendant', unlockLevel: 50, description: 'The highest animated legend frame.', cssClass: 'avatar-decor-rank-15', tone: 'elite', animated: true },
]

const profileDecorationAssetByKey: Record<string, string> = {
  rank_01: '/avatar-decorations/rank-01.png',
  rank_02: '/avatar-decorations/rank-02.png',
  rank_03: '/avatar-decorations/rank-03.png',
  rank_04: '/avatar-decorations/rank-04.png',
  rank_05: '/avatar-decorations/rank-05.png',
  rank_06: '/avatar-decorations/rank-06.png',
  rank_07: '/avatar-decorations/rank-07.png',
  rank_08: '/avatar-decorations/rank-08.png',
  rank_09: '/avatar-decorations/rank-09.png',
  rank_10: '/avatar-decorations/rank-10.png',
  rank_11: '/avatar-decorations/rank-11.png',
  rank_12: '/avatar-decorations/rank-12.png',
  rank_13: '/avatar-decorations/rank-13.png',
  rank_14: '/avatar-decorations/rank-14.png',
  rank_15: '/avatar-decorations/rank-15.png',
}

export function profileDecorationAssetPath(decorationKey: string) {
  return profileDecorationAssetByKey[decorationKey] || ''
}

export function getProfileDecoration(key?: string) {
  return profileDecorationCatalog.find((decoration) => decoration.key === key) || profileDecorationCatalog[0]
}

export function autoDecorationKeyForLevel(level: number) {
  const unlocked = profileDecorationCatalog
    .filter((decoration) => decoration.key !== 'auto' && decoration.key !== 'none' && decoration.unlockLevel <= level)
    .sort((left, right) => right.unlockLevel - left.unlockLevel)
  return unlocked[0]?.key || 'rank_01'
}

export function getEffectiveProfileDecorationForLevel(level: number, selectedKey = 'auto') {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1))
  const decoration = getProfileDecoration(selectedKey)
  if (decoration.key === 'none') return decoration
  if (decoration.key === 'auto') return getProfileDecoration(autoDecorationKeyForLevel(safeLevel))
  if (decoration.unlockLevel <= safeLevel) return decoration
  return getProfileDecoration(autoDecorationKeyForLevel(safeLevel))
}
