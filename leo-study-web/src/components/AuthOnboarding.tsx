import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { ClassCreationRequestInput } from '../lib/classApi'
import { getLiveIntegrations } from '../lib/liveIntegrations'
import { AcademyBrand, AcademyLogo } from './AcademyBrand'
import './Onboarding.css'

const developmentPreview = getLiveIntegrations(import.meta.env).disabled

export function AcademyWelcome({ children, step, steps = ['Account', 'Class', 'Department', 'Profile', 'Study plan'] }: { children: ReactNode; step?: number; steps?: string[] }) {
  return <div className="academy-welcome">
    <header className="academy-welcome-header">
      <Link className="academy-welcome-brand" to="/signin" aria-label="180 Academy sign in"><AcademyBrand /></Link>
      <span className="academy-header-note">Built for academy life.</span>
    </header>
    <div className="academy-welcome-body">
      <aside className="academy-welcome-story" aria-label="Welcome to 180 Academy">
        <div className="academy-story-copy"><span className="academy-eyebrow"><span aria-hidden />YOUR NEXT CHAPTER STARTS HERE</span><h1>A focused start.<br /><span>A stronger finish.</span></h1><p>Make room for what matters. Your class, your study routine, and your progress—all together.</p></div>
        <div className="academy-story-preview" aria-hidden="true">
          <div className="academy-story-preview-top"><span>THE 180 APPROACH</span><AcademyLogo /></div>
          <p>Show up.<br />Put in the work.<br /><strong>Move forward.</strong></p>
          <div className="academy-story-track"><span /><span /><span /><span /><span /><span /></div>
          <div className="academy-story-preview-bottom"><span>One focused session at a time.</span><span>↗</span></div>
        </div>
        <div className="academy-story-benefits"><div><span>01</span><strong>Study with direction</strong><p>Know what to practice next.</p></div><div><span>02</span><strong>Grow with your class</strong><p>Keep your people close.</p></div></div>
      </aside>
      <main className="academy-welcome-main">
        <div className="academy-form-wrap">
          {step !== undefined ? <div className="academy-setup-progress"><div className="academy-progress-caption"><strong>{steps[step]}</strong><span>Step {step + 1} of {steps.length}</span></div><ol className="academy-progress" aria-label="Account setup progress">{steps.map((label, index) => <li key={label} className={index === step ? 'is-current' : index < step ? 'is-complete' : ''} aria-current={index === step ? 'step' : undefined}><span className="visually-hidden">{label}{index < step ? ', completed' : ''}</span></li>)}</ol></div> : null}
          {children}
        </div>
        <p className="academy-form-footer"><span aria-hidden>↗</span> A little progress today. More confidence tomorrow.</p>
      </main>
    </div>
  </div>
}

export function OnboardingStatus({ error, success }: { error?: string; success?: string }) {
  return <>{error ? <p className="academy-feedback is-error" role="alert">{error}</p> : null}{success ? <p className="academy-feedback is-success" role="status">{success}</p> : null}</>
}

export function PasswordField({ label, value, onChange, create = false }: { label: string; value: string; onChange: (value: string) => void; create?: boolean }) {
  const [visible, setVisible] = useState(false)
  const inputId = useId()
  return <div className="academy-password-field"><label htmlFor={inputId}>{label}</label><div className="academy-password"><input id={inputId} type={visible ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={create ? 'new-password' : 'current-password'} minLength={create ? 8 : undefined} required /><button type="button" aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? 'Hide' : 'Show'}</button></div></div>
}

type AuthEntryProps = {
  mode: 'signin' | 'signup' | 'request'
  email: string; onEmailChange: (value: string) => void
  password: string; onPasswordChange: (value: string) => void
  passwordConfirm: string; onPasswordConfirmChange: (value: string) => void
  displayName: string; onDisplayNameChange: (value: string) => void
  loading: boolean; error: string; success: string
  onSubmit: () => Promise<void>; onGoogle: () => Promise<void>
  onResetPassword: () => Promise<void>
  request?: ClassCreationRequestInput | null
  onRequestDepartment: (department: string) => void
  onSignInForRequest: () => void
}
export function AuthEntry(props: AuthEntryProps) {
  const isSignIn = props.mode === 'signin'
  const isRequest = props.mode === 'request'
  const [resetMode, setResetMode] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [props.mode, resetMode])
  return <AcademyWelcome step={isSignIn ? undefined : isRequest ? 1 : 0} steps={isRequest ? ['Class details', 'Your account', 'Owner approval'] : undefined}>
    <header className="academy-form-heading"><p className="academy-eyebrow">{resetMode ? 'ACCOUNT RECOVERY' : isSignIn ? 'WELCOME BACK' : isRequest ? 'YOUR CLASS STARTS HERE' : 'LET’S GET YOU READY'}</p><h2 ref={heading} tabIndex={-1}>{resetMode ? 'Reset your password' : isSignIn ? 'Back to your next milestone.' : isRequest ? 'Create your class account.' : 'Your academy journey starts here.'}</h2><p>{resetMode ? 'Enter your account email and we’ll send a secure reset link.' : isSignIn ? 'Sign in to pick up where you left off.' : isRequest ? 'Your request will go to the site owner for review. Once approved, you’ll become your class admin.' : 'Create an account, then choose your class and make this space yours.'}</p></header>
    <form className="academy-form" onSubmit={(event) => { event.preventDefault(); void (resetMode ? props.onResetPassword() : props.onSubmit()) }}>
      {isRequest ? props.request ? <div className="academy-selection-summary"><strong>{props.request.academyName} · {props.request.className}</strong><span>{props.request.startDate} — {props.request.endDate}</span><label>Your department<select aria-label="Your department" required value={props.request.requesterDepartment} onChange={(event) => props.onRequestDepartment(event.target.value)}><option value="">Choose your department</option>{props.request.departments.map((department) => <option key={department}>{department}</option>)}</select></label><Link to="/classes/request">Edit class details</Link></div> : <p className="academy-feedback is-error">Start by <Link to="/classes/request">adding your class details</Link>.</p> : null}
      <label>Email address<input type="email" required value={props.email} autoComplete="email" placeholder="you@example.com" onChange={(event) => props.onEmailChange(event.target.value)} /></label>
      {isRequest && !resetMode ? <label>Your full name<input value={props.displayName} required maxLength={80} autoComplete="name" placeholder="First and last name" onChange={(event) => props.onDisplayNameChange(event.target.value)} /></label> : null}
      {!resetMode ? <><PasswordField label="Password" value={props.password} onChange={props.onPasswordChange} create={!isSignIn} />{!isSignIn ? <><p className="academy-field-hint">Use at least 8 characters.</p><PasswordField label="Confirm password" value={props.passwordConfirm} onChange={props.onPasswordConfirmChange} create /></> : <button className="academy-text-button academy-forgot" type="button" onClick={() => setResetMode(true)}>Forgot password?</button>}</> : null}
      <OnboardingStatus error={props.error} success={props.success} />
      <button className="academy-primary" type="submit" disabled={props.loading || (isRequest && !props.request)}>{props.loading ? 'Please wait…' : resetMode ? 'Send reset link' : isSignIn ? 'Sign in' : isRequest ? 'Create account & submit request' : 'Create account'}<span aria-hidden> →</span></button>
      {!developmentPreview && !resetMode && !isRequest ? <><div className="academy-divider"><span>or</span></div><button className="academy-secondary academy-google" type="button" onClick={() => void props.onGoogle()} disabled={props.loading}><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><path fill="#4285F4" d="M21.8 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.5c-.2 1.3-1 2.3-2 3v2.5h3.3c1.9-1.8 3-4.4 3-7.4Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.8-2.4l-3.3-2.5c-.9.6-2.1 1-3.5 1-2.6 0-4.8-1.8-5.6-4.1H3v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 14c-.4-1.3-.4-2.7 0-4V7.4H3a10 10 0 0 0 0 9.2L6.4 14Z"/><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5L18.7 4A9.9 9.9 0 0 0 3 7.4L6.4 10c.8-2.3 3-4.1 5.6-4.1Z"/></svg>Continue with Google</button></> : null}
      {developmentPreview && !resetMode ? <p className="academy-field-hint">Use email and password in this development preview.</p> : null}
      <p className="academy-auth-switch">{resetMode ? <button className="academy-text-button" type="button" onClick={() => setResetMode(false)}>Back to sign in</button> : isRequest ? <button className="academy-text-button" type="button" onClick={props.onSignInForRequest}>Already have an account? Sign in to submit</button> : isSignIn ? <>New here? <Link to="/signup">Create an account</Link></> : <>Already have an account? <Link to="/signin">Sign in</Link></>}</p>
      {!resetMode ? <div className="academy-request-link"><span>Bring your class together.</span><Link to="/classes/request">Request to add your class <span aria-hidden>↗</span></Link></div> : null}
    </form>
  </AcademyWelcome>
}

export function PasswordRecovery({ loading, error, onSave }: { loading: boolean; error: string; onSave: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [localError, setLocalError] = useState('')
  return <div className="academy-recovery-flow"><AcademyWelcome><header className="academy-form-heading"><p className="academy-eyebrow">SECURE ACCOUNT RECOVERY</p><h2>Choose a fresh password.</h2><p>Set a new password to get back to your study space.</p></header><form className="academy-form" onSubmit={(event) => { event.preventDefault(); if (password.length < 8) { setLocalError('Use at least 8 characters.'); return } if (password !== confirm) { setLocalError('Passwords do not match.'); return } setLocalError(''); void onSave(password) }}><PasswordField label="New password" value={password} onChange={setPassword} create /><PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} create /><OnboardingStatus error={localError || error} /><button type="submit" className="academy-primary" disabled={loading}>{loading ? 'Updating password…' : 'Save password & continue'}</button></form></AcademyWelcome></div>
}
