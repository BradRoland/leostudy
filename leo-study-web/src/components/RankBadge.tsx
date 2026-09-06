import { levelTierName, rankTone } from '../lib/academyProgression'
import './Rewards.css'

export function RankBadge({ level, compact = false }: { level: number; compact?: boolean }) {
  return <span className={`academy-rank rank-${rankTone(level)}${compact ? ' is-compact' : ''}`} aria-label={`Level ${level}, ${levelTierName(level)}`}>
    <span className="academy-rank-seal" aria-hidden="true"><svg viewBox="0 0 48 52" fill="none"><path d="M24 2 44 10v19c0 9-12 17-20 21C16 46 4 38 4 29V10L24 2Z" fill="currentColor"/><path d="m12 16 12-5 12 5M14 37l10 6 10-6" stroke="var(--academy-surface)" strokeWidth="1.5" opacity=".5"/></svg><b>{level}</b></span>
    <span className="academy-rank-copy"><small>LEVEL {level}</small><strong>{levelTierName(level)}</strong></span>
  </span>
}
