import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AcademyClassRow, ClassDepartment } from '../lib/classApi'
import { dailyStudyGoals, validateOnboardingProfile, type OnboardingProfile, type StudyFocus } from '../lib/onboarding'
import { AcademyWelcome, OnboardingStatus } from './AuthOnboarding'

export type EnrollmentProfileSeed = { firstName: string; lastName: string; displayName: string; dailyGoalMinutes: number; studyFocus: StudyFocus; avatarUrl: string }
type Props = {
  classes: AcademyClassRow[]; selectedClassId: string; departments: ClassDepartment[]; departmentId: string
  onClassChange: (id: string) => void; onDepartmentChange: (id: string) => void
  classesLoading: boolean; departmentsLoading: boolean; submitting: boolean; error: string; success: string
  profileOnlyDepartmentName?: string; profileOnly?: boolean; profileSeed?: EnrollmentProfileSeed; onComplete: (profile: OnboardingProfile) => Promise<void>
  onRetry: () => void
}
const focusOptions: { value: StudyFocus; label: string; description: string }[] = [
  { value: 'balanced', label: 'A balanced routine', description: 'Build knowledge across your study modes.' },
  { value: 'recall', label: 'Remember the essentials', description: 'Practice code recall and flashcards.' },
  { value: 'scenarios', label: 'Apply what I know', description: 'Connect your knowledge to real scenarios.' },
  { value: 'exam', label: 'Get ready for assessments', description: 'Build confidence with practice questions.' },
]
export function ClassEnrollment(props: Props) {
  const [step, setStep] = useState(props.profileOnly ? 2 : 0)
  const [firstName, setFirstName] = useState(props.profileSeed?.firstName || '')
  const [lastName, setLastName] = useState(props.profileSeed?.lastName || '')
  const [displayName, setDisplayName] = useState(props.profileOnly ? props.profileSeed?.displayName || '' : '')
  const [goal, setGoal] = useState(props.profileSeed?.dailyGoalMinutes || 15)
  const [focus, setFocus] = useState<StudyFocus>(props.profileSeed?.studyFocus || 'balanced')
  const [avatar, setAvatar] = useState<File | null>(null)
  const avatarInput = useRef<HTMLInputElement>(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [localError, setLocalError] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const selectedClass = props.classes.find((row) => row.id === props.selectedClassId)
  const department = props.departments.find((row) => row.id === props.departmentId)
  const needsApproval = !props.profileOnly && ['approval_required', 'request_only', 'request_and_code'].includes(selectedClass?.join_mode || '')
  useEffect(() => { heading.current?.focus() }, [step])
  useEffect(() => {
    if (!avatar) { setAvatarPreview(''); return }
    const url = URL.createObjectURL(avatar)
    setAvatarPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [avatar])
  const profile: OnboardingProfile = { firstName, lastName, displayName: displayName.trim() || `${firstName.trim()} ${lastName.trim()}`.trim(), dailyGoalMinutes: goal, studyFocus: focus, avatar, departmentName: department?.name || props.profileOnlyDepartmentName || '' }
  const next = () => {
    setLocalError('')
    if (step === 0 && !selectedClass) { setLocalError('Choose your class to continue.'); return }
    if (step === 1 && !department) { setLocalError('Choose your department to continue.'); return }
    if (step === 2) {
      const error = validateOnboardingProfile(profile)
      if (error) { setLocalError(error); return }
    }
    if (step < 3) setStep(step + 1)
    else void props.onComplete(profile)
  }
  const titles = ['Find your class.', 'Where do you serve?', 'Make yourself at home.', 'Build a routine that lasts.']
  const descriptions = ['Choose your active academy class. You’ll study and grow alongside your classmates.', `Choose a department in ${selectedClass?.class_name || 'your class'}.`, 'Add your name and an optional photo so your classmates can recognize you.', 'Set a realistic daily goal and choose what you want to focus on. You can adjust these later.']
  return <AcademyWelcome step={step + 1}>
    <header className="academy-form-heading"><p className="academy-eyebrow">YOUR STUDY SPACE · STEP {step + 2} OF 5</p><h2 ref={heading} tabIndex={-1}>{props.success ? 'You’re on the list.' : titles[step]}</h2><p>{props.success ? 'Your class admin will review your join request. Your profile and study plan have been saved.' : descriptions[step]}</p></header>
    {props.success ? <><OnboardingStatus success={props.success} /><button className="academy-secondary" onClick={() => window.location.reload()}>Check approval status</button></> : <form className="academy-form" onSubmit={(event) => { event.preventDefault(); next() }}>
      {step === 0 ? <>
        {props.classesLoading ? <p className="academy-feedback" role="status">Finding active classes…</p> : <fieldset className="academy-choice-list"><legend className="visually-hidden">Choose your class</legend>{props.classes.map((row) => <label key={row.id} className={`academy-choice-card ${row.id === props.selectedClassId ? 'is-selected' : ''}`}><input type="radio" name="academy-class" checked={row.id === props.selectedClassId} onChange={() => props.onClassChange(row.id)} /><span className="academy-class-monogram" aria-hidden>{row.class_name.replace(/class\s*/i, '').slice(0, 4)}</span><span className="academy-choice-copy"><strong>{row.class_name}</strong><span>{row.academies?.name || 'Academy'}</span>{row.end_date ? <small>Graduation · {new Date(`${row.end_date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</small> : null}</span><span className="academy-active-badge">Active</span></label>)}</fieldset>}
        {!props.classesLoading && !props.classes.length ? <div className="academy-empty"><strong>Your class belongs here.</strong><p>No active classes are available right now. Request yours below, or refresh the list.</p><button type="button" className="academy-text-button" onClick={props.onRetry}>Refresh classes</button></div> : null}
        <Link className="academy-add-class" to="/classes/request"><span aria-hidden>＋</span><span><strong>Don’t see your class?</strong><small>Request to add your academy class</small></span><span aria-hidden>→</span></Link>
      </> : null}
      {step === 1 ? <><div className="academy-selection-summary"><strong>{selectedClass?.class_name}</strong><span>{selectedClass?.academies?.name}</span></div>{props.departmentsLoading ? <p role="status" className="academy-feedback">Loading departments…</p> : <fieldset className="academy-choice-list"><legend className="visually-hidden">Your department</legend>{props.departments.map((row) => <label key={row.id} className={`academy-choice-card ${props.departmentId === row.id ? 'is-selected' : ''}`}><input type="radio" required name="department" checked={props.departmentId === row.id} onChange={() => props.onDepartmentChange(row.id)} /><span className="academy-choice-copy"><strong>{row.name}</strong></span></label>)}</fieldset>}{!props.departmentsLoading && !props.departments.length ? <p className="academy-feedback">This class does not have departments available yet. Contact your class admin before joining.</p> : null}{needsApproval ? <p className="academy-field-hint">This class requires admin approval. We’ll save your choices when you finish.</p> : null}</> : null}
      {step === 2 ? <>
        <div className="academy-avatar-upload"><span className="academy-avatar-preview">{avatarPreview || props.profileSeed?.avatarUrl ? <img src={avatarPreview || props.profileSeed?.avatarUrl} alt="Your profile preview" /> : <span aria-hidden>{firstName.slice(0, 1) || '＋'}{lastName.slice(0, 1)}</span>}</span><div className="academy-avatar-controls"><label>Profile photo <span className="academy-optional">optional</span><input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0] || null; const error = file ? validateOnboardingProfile({ firstName: 'Valid', lastName: 'Name', displayName: '', avatar: file }) : ''; setLocalError(error); if (!error) setAvatar(file) }} /><small>JPG, PNG, or WebP · up to 5 MB</small></label>{avatar ? <button className="academy-text-button" type="button" onClick={() => { setAvatar(null); setLocalError(''); if (avatarInput.current) avatarInput.current.value = '' }}>Remove selected photo</button> : null}</div></div>
        <div className="academy-form-grid"><label>First name<input required maxLength={80} autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} /></label><label>Last name<input required maxLength={80} autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} /></label></div>
        <label>Display name <span className="academy-optional">optional</span><input maxLength={80} autoComplete="nickname" placeholder={`${firstName} ${lastName}`.trim() || 'Your name on leaderboards'} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><p className="academy-field-hint">We’ll use your full name unless you choose a display name. Each display name needs to be unique.</p>
      </> : null}
      {step === 3 ? <><fieldset className="academy-goals"><legend>Daily study goal</legend>{dailyStudyGoals.map((minutes) => <label key={minutes} className={goal === minutes ? 'is-selected' : ''}><input type="radio" name="daily-goal" checked={goal === minutes} onChange={() => setGoal(minutes)} /><strong>{minutes}</strong><span>min / day</span>{minutes === 15 ? <small>A good start</small> : null}</label>)}</fieldset><fieldset className="academy-choice-list"><legend>What would help you most?</legend>{focusOptions.map((option) => <label key={option.value} className={`academy-choice-card ${focus === option.value ? 'is-selected' : ''}`}><input type="radio" name="study-focus" checked={focus === option.value} onChange={() => setFocus(option.value)} /><span className="academy-choice-copy"><strong>{option.label}</strong><small>{option.description}</small></span></label>)}</fieldset><div className="academy-selection-summary"><strong>{firstName} {lastName} · {selectedClass?.class_name}</strong><span>{department?.name || props.profileOnlyDepartmentName}</span></div></> : null}
      <OnboardingStatus error={localError || props.error} />
      <div className="academy-form-actions">{step > (props.profileOnly ? 2 : 0) ? <button className="academy-secondary" type="button" disabled={props.submitting} onClick={() => { setLocalError(''); setStep(step - 1) }}>Back</button> : null}<button className="academy-primary" type="submit" disabled={props.submitting || props.classesLoading || (step === 0 && !selectedClass) || (step === 1 && (props.departmentsLoading || !department))}>{props.submitting ? 'Saving your study space…' : step === 3 ? needsApproval ? 'Send join request' : 'Let’s get started' : 'Continue'}<span aria-hidden> →</span></button></div>
    </form>}
  </AcademyWelcome>
}
