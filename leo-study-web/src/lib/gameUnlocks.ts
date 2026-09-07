export const gameUnlocks = [
  { key: 'timers', level: 3, title: 'Match timer options', detail: 'Choose a longer or faster Blaster practice round.' },
  { key: 'connect4', level: 5, title: 'Connect Four', detail: 'Turn correct answers into a winning strategy.' },
  { key: 'powerups', level: 6, title: 'Blaster power-ups', detail: 'Add a tactical edge to your rope battles.' },
  { key: 'overtime', level: 8, title: 'Overtime controls', detail: 'Raise the pressure with a shrinking rope.' },
  { key: 'rooms', level: 10, title: 'Custom room hosting', detail: 'Create a public match or share a private room code.' },
  { key: 'knockout', level: 12, title: 'Knockout rules', detail: 'Remove the timer. Settle the match with a rope knockout.' },
] as const
export type GameUnlock = typeof gameUnlocks[number]['key']
export function hasGameUnlock(level: number, feature: GameUnlock) {
  return Number.isFinite(level) && level >= gameUnlocks.find(item => item.key === feature)!.level
}
export function normalizeRoomCode(value: string) { return value.replace(/[\s-]/g, '').slice(0, 6) }
