import { AcademyIcon } from './AcademyIcon'
import { RankBadge } from './RankBadge'
import { dailyRewardSchedule } from '../lib/dailyRewards'
import { rewardAvatars, type RewardAvatar } from '../lib/academyProgression'
import { profileDecorationCatalog, profileDecorationAssetPath } from '../lib/profileDecorationData'
import type { useDailyRewards } from '../hooks/useDailyRewards'
import './Rewards.css'

type Props = {
  rewards: ReturnType<typeof useDailyRewards>
  level: number
  currentXp: number
  nextXp: number
  onOpenRewards?: () => void
  onStudy: () => void
}

export function RewardsPanel({ rewards, level, currentXp, nextXp, onOpenRewards, onStudy }: Props) {
  const { status, loading, claiming, error, message } = rewards
  const milestones = [
    ...profileDecorationCatalog.filter(item => !['auto', 'none'].includes(item.key)).map(item => ({ key: item.key, level: item.unlockLevel, title: item.title, kind: 'Profile frame', path: profileDecorationAssetPath(item.key) })),
    ...rewardAvatars.map(item => ({ key: item.key, level: item.unlockLevel, title: item.title, kind: 'Avatar', path: item.path })),
  ].sort((a, b) => a.level - b.level)
  const upcoming = milestones.filter(item => item.level > level).slice(0, 3)
  const displayed = upcoming.length ? upcoming : milestones.slice(-3)
  const progress = level >= 100 ? 100 : Math.min(100, Math.round(currentXp / Math.max(1, nextXp) * 100))

  return <section className="academy-rewards" aria-label="Your rewards">
    <div className="reward-daily-card">
      <div className="reward-section-heading"><div><p className="reward-eyebrow">A LITTLE SOMETHING FOR YOU</p><h2>Today’s reward</h2></div><span className={`reward-gift${status?.claimedToday ? ' is-claimed' : ''}`} aria-hidden="true"><AcademyIcon name={status?.claimedToday ? 'updates' : 'leaderboards'}/></span></div>
      <div className="reward-daily-value"><strong>{status ? `+${status.rewardXp}` : '—'}<span> XP</span></strong><span>{status?.claimedToday ? 'Added to your progress' : status ? `Reward ${status.cycleDay} of 7` : 'Checking your rewards'}</span></div>
      <p className="reward-intro">{status?.claimedToday ? 'A good start. Turn that momentum into a little practice.' : 'Come back, collect a boost, and take your next step.'}</p>
      <ol className="reward-week" aria-label="Seven reward journey">
        {dailyRewardSchedule.map((xp, index) => {
          const day = index + 1
          const done = Boolean(status && day <= status.completedInCycle)
          const current = day === status?.cycleDay
          return <li key={day} className={`${done ? 'is-complete' : ''} ${current ? 'is-current' : ''}`} aria-current={current ? 'step' : undefined} aria-label={`Reward ${day}: ${xp} XP${done ? ', collected' : current ? ', next to collect' : ''}`}><span>{done ? '✓' : day === 7 ? '✦' : day}</span><strong>+{xp}</strong><small>XP</small></li>
        })}
      </ol>
      <div className="reward-action-row">
        {status?.claimedToday ? <button type="button" className="primary reward-claim" onClick={onStudy}>Keep learning<AcademyIcon name="arrow"/></button> : <button type="button" className="primary reward-claim" disabled={!status?.canClaim || claiming || loading} onClick={() => { void rewards.claim() }}>{claiming ? 'Collecting…' : loading ? 'Checking…' : `Collect ${status?.rewardXp || 25} XP`}<AcademyIcon name="arrow"/></button>}
        {status?.claimedToday ? <span className="reward-collected">✓ Collected today</span> : status ? <span className="reward-fine-print">One reward per day</span> : null}
      </div>
      {message ? <p className="reward-success" role="status">{message}</p> : null}
      {error ? <div className="reward-error" role="alert"><p>{error}</p><button type="button" className="secondary" disabled={loading || claiming} onClick={() => { void rewards.refresh() }}>Retry rewards</button></div> : null}
      {status && !status.eligible ? <p className="reward-fine-print">Join an active class to start collecting daily rewards.</p> : null}
      <p className="reward-fine-print">{status?.claimedToday ? `Next reward: ${status.nextRewardXp} XP after ${new Date(status.resetsAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}. ` : 'Rewards refresh at midnight UTC. '}Miss a day? Your reward journey stays with you.</p>
    </div>

    <div className="reward-level-card">
      <div className="reward-section-heading"><div><p className="reward-eyebrow">EARNED, ONE STEP AT A TIME</p><h2>Your next unlocks</h2></div>{onOpenRewards ? <button type="button" className="reward-text-button" onClick={onOpenRewards}>View all<AcademyIcon name="arrow"/></button> : null}</div>
      <div className="reward-rank-row"><RankBadge level={level}/><span>{level >= 100 ? 'Highest level reached' : `${Math.max(0, nextXp - currentXp).toLocaleString()} XP to level ${level + 1}`}</span></div>
      <div className="reward-progress" role="progressbar" aria-label="Level progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }}/></div>
      <p className="reward-intro">{upcoming.length ? 'Every level grows your badge. Milestones unlock a new look.' : 'Your collection is complete. Keep growing your expertise.'}</p>
      <div className="reward-roadmap">{displayed.map(item => <div key={item.key} className="reward-roadmap-item"><span className={`reward-roadmap-art${item.kind === 'Avatar' ? ' is-avatar' : ''}`}><img src={item.path} alt="" loading="lazy"/></span><span><strong>{item.title}</strong><small>{item.kind}</small></span><span className="reward-level-tag">{item.level <= level ? 'Unlocked' : `Lv ${item.level}`}</span></div>)}</div>
      <p className="reward-fine-print">{status ? `${status.totalBonusXp.toLocaleString()} bonus XP collected · ` : ''}Practice, mastery, and completed games also earn XP.</p>
    </div>
  </section>
}

export function RewardAvatarPicker({ level, busy, selectedKey, onSelect }: { level: number; busy: boolean; selectedKey?: string; onSelect: (avatar: RewardAvatar) => void }) {
  return <section className="reward-avatar-collection" aria-label="Earned avatars"><div className="reward-section-heading"><div><p className="reward-eyebrow">MAKE IT YOURS</p><h3>Your avatar collection</h3><p className="reward-intro">Choose an earned design, then save your profile. You can also upload your own photo.</p></div></div>
    <div className="reward-avatar-grid">{rewardAvatars.map(avatar => <button type="button" key={avatar.key} className={`reward-avatar-choice${selectedKey === avatar.key ? ' is-selected' : ''}`} aria-label={`${level < avatar.unlockLevel ? 'Locked' : 'Select'} ${avatar.title} avatar${level < avatar.unlockLevel ? `, level ${avatar.unlockLevel}` : ''}`} aria-pressed={selectedKey === avatar.key} disabled={busy || level < avatar.unlockLevel} onClick={() => onSelect(avatar)}><img src={avatar.path} alt="" loading="lazy"/><strong>{avatar.title}</strong><small>{level < avatar.unlockLevel ? `Level ${avatar.unlockLevel}` : selectedKey === avatar.key ? 'Selected' : 'Unlocked'}</small></button>)}</div>
  </section>
}
