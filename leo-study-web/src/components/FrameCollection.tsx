import { useState, type SyntheticEvent } from 'react'
import { profileDecorationCatalog, getEffectiveProfileDecorationForLevel } from '../lib/profileDecorationData'
import { ProfileAvatarDecoration } from '../lib/profileDecorations'
import './WorkspacePolish.css'

type Props = {
  hasPro?: boolean
  level: number
  selectedKey: string
  avatarUrl: string
  onAvatarError: (event: SyntheticEvent<HTMLImageElement>) => void
  onSelect: (key: string) => void
  onSave: () => Promise<void>
  saving: boolean
  disabled: boolean
  error: string
  success: string
}

export function FrameCollection({ hasPro = false, level, selectedKey, avatarUrl, onAvatarError, onSelect, onSave, saving, disabled, error, success }: Props) {
  const [filter, setFilter] = useState<'unlocked' | 'all'>('unlocked')
  const [saveRequested, setSaveRequested] = useState(false)
  const unlocked = profileDecorationCatalog.filter(frame => frame.membership ? hasPro : frame.unlockLevel <= level)
  const next = profileDecorationCatalog.find(frame => !frame.membership && frame.unlockLevel > level)
  const frames = filter === 'all' ? profileDecorationCatalog : unlocked
  const selected = profileDecorationCatalog.find(frame => frame.key === selectedKey)
  return <section className="profile-decoration-picker academy-frame-collection" aria-label="Your frame collection">
    <div className="profile-decoration-heading"><div><p className="eyebrow">MAKE YOUR PROGRESS VISIBLE</p><h3>Your frame collection</h3><p className="muted">Wear an earned frame, or let Automatic follow your latest unlock.</p></div><span className="reward-level-tag">{unlocked.length - 2} of {profileDecorationCatalog.length - 2} frames unlocked</span></div>
    <div className="frame-collection-filters" role="group" aria-label="Filter frames"><button type="button" aria-pressed={filter === 'unlocked'} onClick={() => setFilter('unlocked')}>Unlocked</button><button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All frames</button></div>
    {filter === 'unlocked' && next ? <p className="frame-next-unlock">Next to earn: <strong>{next.title}</strong> at level {next.unlockLevel}. <button type="button" onClick={() => setFilter('all')}>Preview all rewards</button></p> : null}
    <div className="profile-decoration-grid">{frames.map(frame => {
      const available = frame.membership ? hasPro : frame.unlockLevel <= level
      const active = selectedKey === frame.key
      const decoration = frame.key === 'auto' ? getEffectiveProfileDecorationForLevel(level) : frame
      return <button type="button" key={frame.key} className={`profile-decoration-card ${active ? 'active' : ''} ${available ? 'unlocked' : 'locked'}`} disabled={!available || saving} aria-pressed={active} onClick={() => { setSaveRequested(false); onSelect(frame.key) }}><span className="profile-decoration-preview avatar-decoration-wrap"><span className="profile-decoration-preview-face" aria-hidden="true"><img src={avatarUrl} alt="" className="profile-decoration-preview-avatar" loading="lazy" decoding="async" onError={onAvatarError}/></span><ProfileAvatarDecoration decoration={decoration}/></span><span className="profile-decoration-copy"><strong>{frame.title}</strong><small>{available ? active ? 'Selected' : 'Unlocked' : 'Locked'} · {frame.membership ? 'Academy Pro' : `Level ${frame.unlockLevel}`}</small><span>{available ? frame.description : frame.membership ? 'Included with Academy Pro' : `Unlocks at Level ${frame.unlockLevel}`}</span></span></button>
    })}</div>
    <div className="frame-save-row"><span><small>Your selection</small><strong>{selected?.title || 'Automatic'}</strong></span><button type="button" className="primary" disabled={saving || disabled} onClick={() => { setSaveRequested(true); void onSave() }}>{saving ? 'Saving…' : 'Save frame'}</button></div>
    {saveRequested && !saving && success ? <p className="reward-success" role="status">{success}</p> : null}
    {saveRequested && error ? <p className="reward-error" role="alert">{error}</p> : null}
  </section>
}
