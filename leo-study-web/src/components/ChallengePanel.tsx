import { useState } from 'react'
import { AcademyIcon } from './AcademyIcon'
import { gameUnlocks } from '../lib/gameUnlocks'
import { xpRequiredForLevel } from '../lib/academyProgression'
import type { useAcademyProgression } from '../hooks/useAcademyProgression'
import './ChallengePanel.css'

export function ChallengePanel({ progression, onPractice }: { progression: ReturnType<typeof useAcademyProgression>; onPractice: () => void }) {
  const [cadence, setCadence] = useState<'daily' | 'weekly'>('daily')
  const { status, error, message, claiming } = progression
  const next = gameUnlocks.find(item => item.level > (status?.level || 1))
  return <section className="academy-challenges" aria-label="Practice challenges">
    <header><div><p className="challenge-eyebrow">BUILD YOUR MOMENTUM</p><h2>A little practice. Real progress.</h2><p>Small goals that move your knowledge forward.</p></div><AcademyIcon name="leaderboards" /></header>
    <div className="challenge-tabs" role="group" aria-label="Challenge schedule">
      <button type="button" aria-pressed={cadence === 'daily'} onClick={() => setCadence('daily')}>Daily challenges</button>
      <button type="button" aria-pressed={cadence === 'weekly'} onClick={() => setCadence('weekly')}>Weekly challenges</button>
    </div>
    {error ? <div role="alert" className="challenge-feedback">{error} <button type="button" onClick={() => void progression.refresh()}>Retry</button></div> : null}
    {!status && !error ? <p role="status">Loading your challenges…</p> : null}
    <div className="challenge-grid">{status?.challenges.filter(item => item.cadence === cadence).map(item => <article className={`challenge-card${item.claimed ? ' is-complete' : ''}`} key={item.id}>
      <div className="challenge-card-heading"><span>{item.claimed ? 'COMPLETED' : item.progress >= item.target ? 'READY TO CLAIM' : 'IN PROGRESS'}</span><strong>+{item.xp} XP</strong></div>
      <h3>{item.title}</h3><div className="challenge-progress-label"><span>{item.progress} / {item.target}</span><span>{Math.round(item.progress / item.target * 100)}%</span></div>
      <progress value={item.progress} max={item.target} aria-label={item.title} />
      <button className={item.progress >= item.target && !item.claimed ? 'primary' : 'secondary'} type="button" disabled={item.claimed || Boolean(claiming)} onClick={() => item.progress >= item.target ? void progression.claim(item.id) : onPractice()}>{item.claimed ? 'XP added ✓' : claiming === item.id ? 'Saving…' : item.progress >= item.target ? `Claim ${item.xp} XP` : 'Continue practice'}</button>
    </article>)}</div>
    <p className="challenge-footnote">Complete at least five questions per session in a practice test or solo game. {cadence === 'daily' ? 'New goals every day at 00:00 UTC.' : 'New goals every Monday at 00:00 UTC.'} Claimed XP never expires.</p>
    {message ? <p className="challenge-feedback" role="status">{message}</p> : null}
    <div className="challenge-unlock"><span className="challenge-unlock-icon"><AcademyIcon name="games" /></span><div><span className="challenge-eyebrow">{next ? 'YOUR NEXT GAME UNLOCK' : 'YOUR GAME TOOLKIT'}</span><h3>{next ? next.title : 'Every game feature unlocked'}</h3><p>{next ? `${Math.max(0, xpRequiredForLevel(next.level) - (status?.totalXp || 0)).toLocaleString()} XP to Level ${next.level} · ${next.detail}` : 'Keep building your knowledge and collecting profile rewards.'}</p></div></div>
    <details className="challenge-roadmap"><summary>See your unlock journey</summary><ol>{gameUnlocks.map(item => <li key={item.key}><strong>Level {item.level}</strong><span>{item.title}</span><span>{status && status.level >= item.level ? 'Unlocked ✓' : 'Upcoming'}</span></li>)}</ol><p>Joining a classmate’s room is available at every level. Both players need Level 5 for Connect Four.</p></details>
  </section>
}
