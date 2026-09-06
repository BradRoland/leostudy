import { useEffect, useMemo, useRef, useState } from 'react'
import { loadClassRoster, formatRosterStudyTime, rosterDefaultAvatar, type ClassRosterMember } from '../lib/classRoster'
import { formatAcademyClassLabel } from '../lib/classWorkspace'
import type { ClassMembership } from '../lib/classApi'
import { AcademyIcon } from './AcademyIcon'
import './ClassRoster.css'

function Avatar({ member }: { member: ClassRosterMember }) {
  return <img src={member.avatarUrl} alt="" loading="lazy" onError={event => { if (!event.currentTarget.src.endsWith(rosterDefaultAvatar)) event.currentTarget.src = rosterDefaultAvatar }} />
}

function MemberStats({ member, expanded = false }: { member: ClassRosterMember; expanded?: boolean }) {
  const stats = [
    ['Study time', formatRosterStudyTime(member.studySeconds)],
    ['Study streak', `${member.streak} ${member.streak === 1 ? 'day' : 'days'}`],
    ['Codes mastered', member.mastered.toLocaleString()],
    ['1v1 wins', member.wins.toLocaleString()],
    ...(expanded ? [
      ['Best study streak', `${member.bestStreak} ${member.bestStreak === 1 ? 'day' : 'days'}`],
      ['Flashcards reviewed', member.flashcards.toLocaleString()],
      ['Scenarios reviewed', member.scenarios.toLocaleString()],
      ['Solo games played', member.gamesPlayed.toLocaleString()],
      ['1v1 losses', member.losses.toLocaleString()],
      ['1v1 win streak', member.winStreak.toLocaleString()],
    ] : []),
  ]
  return <dl className="classmate-stats">{stats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
}

function ClassmateProfile({ member, onClose }: { member: ClassRosterMember; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element?.showModal()
    element?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    return () => { element?.close(); if (opener?.isConnected) opener.focus() }
  }, [])
  return <dialog ref={dialog} className="classmate-profile" aria-labelledby="classmate-profile-name" onCancel={event => { event.preventDefault(); onClose() }} onKeyDown={event => {
    if (event.key !== 'Tab') return
    const controls = event.currentTarget.querySelectorAll<HTMLElement>('button,[tabindex="0"]')
    const first = controls[0], last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }} onClick={event => {
    if (event.target !== event.currentTarget) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose()
  }}>
    <header><span className="eyebrow">CLASSMATE PROFILE</span><button type="button" className="secondary" onClick={onClose}>Close</button></header>
    <div className="classmate-profile-scroll" tabIndex={0} role="region" aria-label="Classmate study and game statistics">
      <div className="classmate-profile-identity"><Avatar member={member}/><div><h2 id="classmate-profile-name">{member.name}</h2><p>{member.department}</p></div></div>
      {member.bio ? <p className="classmate-bio">{member.bio}</p> : null}
      <h3>Study &amp; game stats</h3>
      <MemberStats member={member} expanded/>
      <p className="classmate-stats-note">Study totals reflect their academy progress. Multiplayer results are from this class.</p>
    </div>
  </dialog>
}

export function ClassRoster({ activeClass, currentUserId }: { activeClass: ClassMembership | null; currentUserId: string }) {
  const [result, setResult] = useState<{ scope: string; members: ClassRosterMember[]; error: string } | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [query, setQuery] = useState('')
  const [selection, setSelection] = useState<{ scope: string; member: ClassRosterMember } | null>(null)
  const scope = `${currentUserId}:${activeClass?.classId || ''}:${refresh}`
  const classId = activeClass?.classId || ''
  const ready = result?.scope === scope
  const members = useMemo(() => ready ? result.members : [], [ready, result])
  const search = query.trim().toLocaleLowerCase()
  const visible = members.filter(member => `${member.name} ${member.department}`.toLocaleLowerCase().includes(search))
  useEffect(() => {
    if (!classId || !currentUserId) return
    let cancelled = false
    loadClassRoster(classId).then(members => { if (!cancelled) setResult({ scope, members, error: '' }) })
      .catch(() => { if (!cancelled) setResult({ scope, members: [], error: 'We could not load your classmates. Please try again.' }) })
    return () => { cancelled = true }
  }, [classId, currentUserId, scope])
  return <section className="academy-class-roster" aria-labelledby="class-workspace-title">
    <header className="class-roster-heading"><div><p className="eyebrow">LEARN TOGETHER</p><h1 id="class-workspace-title">Your Class Workspace</h1><p>{activeClass ? formatAcademyClassLabel(activeClass.academyName, activeClass.className) : 'Your class membership is not available.'}</p></div><span className="class-roster-emblem" aria-hidden="true"><AcademyIcon name="class"/></span></header>
    {activeClass ? <div className="class-roster-panel">
      <div className="class-roster-toolbar"><div><h2>Your classmates</h2><p role="status">{!ready ? 'Loading classmates…' : result.error ? 'Roster unavailable' : `${members.length} ${members.length === 1 ? 'member' : 'members'} in your class`}</p></div><button type="button" className="secondary" disabled={!ready} onClick={() => setRefresh(value => value + 1)}>Refresh roster</button></div>
      <label className="class-roster-search">Find a classmate<input type="search" placeholder="Search by name or department" value={query} onChange={event => setQuery(event.target.value)}/></label>
      {ready && result.error ? <p className="class-roster-error" role="alert">{result.error}</p> : null}
      {ready && !result.error && !members.length ? <p className="class-roster-empty">No classmates are listed yet. Refresh to check for new members.</p> : null}
      {ready && members.length > 0 && !visible.length ? <p className="class-roster-empty">No classmates match your search.</p> : null}
      <ul className="classmate-list">{visible.map(member => <li key={member.userId} className="classmate-row">
        <button type="button" className="classmate-open" aria-label={`View ${member.name}'s stats`} onClick={() => setSelection({ scope, member })}><Avatar member={member}/><span><strong>{member.name}{member.userId === currentUserId ? <small>You</small> : null}</strong><span>{member.department}</span></span></button>
        <MemberStats member={member}/>
        <button type="button" className="classmate-view" aria-label={`Open stats for ${member.name}`} onClick={() => setSelection({ scope, member })}>View stats<AcademyIcon name="arrow"/></button>
      </li>)}</ul>
    </div> : null}
    {selection?.scope === scope ? <ClassmateProfile member={selection.member} onClose={() => setSelection(null)}/> : null}
  </section>
}
