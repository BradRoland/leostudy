export type ProfileDecoration = {
  key: string
  membership?: 'tier10'
  title: string
  unlockLevel: number
  description: string
  cssClass: string
  tone: 'classic' | 'cute' | 'funny' | 'elite'
  animated: boolean
  modalEffect: 'none' | 'sparkle' | 'sirens' | 'cosmic' | 'inferno' | 'legend'
}

export const profileDecorationCatalog: ProfileDecoration[] = [
  { key: 'auto', title: 'Automatic', unlockLevel: 1, description: 'Wear your highest unlocked frame as you grow.', cssClass: 'avatar-decor-auto', tone: 'classic', animated: false, modalEffect: 'none' },
  { key: 'none', title: 'Minimal', unlockLevel: 1, description: 'Keep your profile simple with no frame.', cssClass: 'avatar-decor-none', tone: 'classic', animated: false, modalEffect: 'none' },
  { key: 'rank_01', title: 'Foundation', unlockLevel: 1, description: 'An earned foundation frame for your academy profile.', cssClass: 'avatar-decor-rank-01', tone: 'classic', animated: false, modalEffect: 'none' },
  { key: 'rank_02', title: 'First Light', unlockLevel: 2, description: 'An earned first light frame for your academy profile.', cssClass: 'avatar-decor-rank-02', tone: 'classic', animated: false, modalEffect: 'none' },
  { key: 'rank_03', title: 'Silverline', unlockLevel: 4, description: 'An earned silverline frame for your academy profile.', cssClass: 'avatar-decor-rank-03', tone: 'classic', animated: false, modalEffect: 'none' },
  { key: 'rank_04', title: 'Steady Ascent', unlockLevel: 6, description: 'An earned steady ascent frame for your academy profile.', cssClass: 'avatar-decor-rank-04', tone: 'classic', animated: false, modalEffect: 'none' },
  { key: 'rank_05', title: 'Blue Horizon', unlockLevel: 8, description: 'An earned blue horizon frame for your academy profile.', cssClass: 'avatar-decor-rank-05', tone: 'classic', animated: false, modalEffect: 'none' },
  { key: 'rank_06', title: 'Scholar', unlockLevel: 10, description: 'An earned scholar frame for your academy profile.', cssClass: 'avatar-decor-rank-06', tone: 'classic', animated: false, modalEffect: 'none' },
  { key: 'rank_07', title: 'Golden Focus', unlockLevel: 12, description: 'An earned golden focus frame for your academy profile.', cssClass: 'avatar-decor-rank-07', tone: 'elite', animated: false, modalEffect: 'none' },
  { key: 'rank_08', title: 'Specialist', unlockLevel: 15, description: 'An earned specialist frame for your academy profile.', cssClass: 'avatar-decor-rank-08', tone: 'elite', animated: false, modalEffect: 'none' },
  { key: 'rank_09', title: 'Prism', unlockLevel: 18, description: 'An earned prism frame for your academy profile.', cssClass: 'avatar-decor-rank-09', tone: 'elite', animated: false, modalEffect: 'none' },
  { key: 'rank_10', title: 'Trailblazer', unlockLevel: 22, description: 'An earned trailblazer frame for your academy profile.', cssClass: 'avatar-decor-rank-10', tone: 'elite', animated: false, modalEffect: 'none' },
  { key: 'rank_11', title: 'Pathfinder', unlockLevel: 26, description: 'An earned pathfinder frame for your academy profile.', cssClass: 'avatar-decor-rank-11', tone: 'elite', animated: false, modalEffect: 'none' },
  { key: 'rank_12', title: 'Vanguard', unlockLevel: 30, description: 'An earned vanguard frame for your academy profile.', cssClass: 'avatar-decor-rank-12', tone: 'elite', animated: false, modalEffect: 'none' },
  { key: 'rank_13', title: 'Nova', unlockLevel: 35, description: 'An earned nova frame for your academy profile.', cssClass: 'avatar-decor-rank-13', tone: 'elite', animated: false, modalEffect: 'none' },
  { key: 'rank_14', title: 'Luminary', unlockLevel: 42, description: 'An earned luminary frame for your academy profile.', cssClass: 'avatar-decor-rank-14', tone: 'elite', animated: false, modalEffect: 'none' },
  { key: 'rank_15', title: 'Academy Legend', unlockLevel: 50, description: 'An earned academy legend frame for your academy profile.', cssClass: 'avatar-decor-rank-15', tone: 'elite', animated: false, modalEffect: 'none' },
  { key: 'pro_crest', title: 'Pro Crest', unlockLevel: 1, membership: 'tier10', description: 'A refined academy crest available with Pro.', cssClass: 'avatar-decor-pro-crest', tone: 'elite', animated: false, modalEffect: 'none' },
  { key: 'pro_laurel', title: 'Pro Laurel', unlockLevel: 1, membership: 'tier10', description: 'A clean silver laurel available with Pro.', cssClass: 'avatar-decor-pro-laurel', tone: 'elite', animated: false, modalEffect: 'none' },
]

const profileDecorationAssetByKey: Record<string, string> = {
  pro_crest: '/avatar-decorations/academy-pro-crest.svg',
  pro_laurel: '/avatar-decorations/academy-pro-laurel.svg',
  rank_01: '/avatar-decorations/academy-rank-01.svg',
  rank_02: '/avatar-decorations/academy-rank-02.svg',
  rank_03: '/avatar-decorations/academy-rank-03.svg',
  rank_04: '/avatar-decorations/academy-rank-04.svg',
  rank_05: '/avatar-decorations/academy-rank-05.svg',
  rank_06: '/avatar-decorations/academy-rank-06.svg',
  rank_07: '/avatar-decorations/academy-rank-07.svg',
  rank_08: '/avatar-decorations/academy-rank-08.svg',
  rank_09: '/avatar-decorations/academy-rank-09.svg',
  rank_10: '/avatar-decorations/academy-rank-10.svg',
  rank_11: '/avatar-decorations/academy-rank-11.svg',
  rank_12: '/avatar-decorations/academy-rank-12.svg',
  rank_13: '/avatar-decorations/academy-rank-13.svg',
  rank_14: '/avatar-decorations/academy-rank-14.svg',
  rank_15: '/avatar-decorations/academy-rank-15.svg',
}

export function profileDecorationAssetPath(decorationKey: string) {
  return profileDecorationAssetByKey[decorationKey] || ''
}

export function getProfileDecoration(key?: string) {
  return profileDecorationCatalog.find((decoration) => decoration.key === key) || profileDecorationCatalog[0]
}

export function autoDecorationKeyForLevel(level: number) {
  const unlocked = profileDecorationCatalog
    .filter((decoration) => !decoration.membership && decoration.key !== 'auto' && decoration.key !== 'none' && decoration.unlockLevel <= level)
    .sort((left, right) => right.unlockLevel - left.unlockLevel)
  return unlocked[0]?.key || 'rank_01'
}

export function getEffectiveProfileDecorationForLevel(level: number, selectedKey = 'auto', hasPro = false) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1))
  const decoration = getProfileDecoration(selectedKey)
  if (decoration.key === 'none') return decoration
  if (decoration.key === 'auto') return getProfileDecoration(autoDecorationKeyForLevel(safeLevel))
  if (decoration.membership) return hasPro ? decoration : getProfileDecoration(autoDecorationKeyForLevel(safeLevel))
  if (decoration.unlockLevel <= safeLevel) return decoration
  return getProfileDecoration(autoDecorationKeyForLevel(safeLevel))
}
