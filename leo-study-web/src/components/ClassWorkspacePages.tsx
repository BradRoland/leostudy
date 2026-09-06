import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  acceptInvite,
  approveClassCreationRequest,
  approveJoinRequest,
  createClassJoinCode,
  denyJoinRequest,
  formatInviteUrl,
  loadClassDepartments,
  loadClassJoinRequests,
  loadActiveClasses,
  loadCreatedClasses,
  loadOwnerClassCreationRequests,
  loadOwnClassCreationRequests,
  lookupInvite,
  rejectClassCreationRequest,
  joinClassDirectly,
  requestToJoinClass,
  setActiveClass,
  submitClassCreationRequest,
  updateClassJoinMode,
  type AcademyClassRow,
  type ClassCreationRequest,
  type ClassDepartment,
  type ClassInvitePreview,
  type ClassJoinRequest,
  type ClassMembership,
} from '../lib/classApi'
import { AcademyWelcome, OnboardingStatus } from './AuthOnboarding'
import { ClassEnrollment, type EnrollmentProfileSeed } from './ClassEnrollment'
import { cleanRequestDepartments, validateClassRequest, type OnboardingProfile } from '../lib/onboarding'
import { extractInviteCodeFromPath, formatAcademyClassLabel, normalizeInviteCode } from '../lib/classWorkspace'

const initialClassRequest = {
  academyName: '', academyCity: '', academyState: '',
  className: '', startDate: '', endDate: '', departments: [''], requesterDepartment: '', requesterNote: '',
}
function readClassRequestForm() {
  try {
    const saved = JSON.parse(window.localStorage.getItem('pending_class_creation_request') || 'null')
    if (saved && typeof saved.className === 'string' && Array.isArray(saved.departments)) return { ...initialClassRequest, ...saved } as typeof initialClassRequest
  } catch { /* A malformed draft should not prevent a new request. */ }
  return { ...initialClassRequest }
}

type Props = {
  mode: 'classes' | 'join' | 'request' | 'invite' | 'admin' | 'owner'
  currentPath: string
  memberships: ClassMembership[]
  activeClass: ClassMembership | null
  isOwner: boolean
  onRefreshMemberships: () => Promise<void>
  currentUserId?: string
  onClassRequestNeedsAuth?: (payload: {
    academyName: string
    academyCity: string
    academyState: string
    className: string
    startDate: string
    endDate: string
    departments: string[]
    requesterDepartment: string
    requesterNote: string
  }) => void
  onInviteNeedsAuth?: (code: string, authMode: 'signin' | 'signup') => void
  onClassRequestSubmitted?: () => void
  embedded?: boolean
  initialError?: string
  profileOnly?: boolean
  profileSaveReady?: boolean
  profileSeed?: EnrollmentProfileSeed
  onSaveOnboardingProfile?: (profile: OnboardingProfile) => Promise<void>
  onFinishOnboarding?: () => Promise<void>
}

function classTitle(row: AcademyClassRow) {
  return formatAcademyClassLabel(row.academies?.name, row.class_name)
}

function membershipTitle(row: ClassMembership | null | undefined) {
  return formatAcademyClassLabel(row?.academyName, row?.className)
}

function classDates(startDate?: string | null, endDate?: string | null) {
  if (!startDate && !endDate) return 'Dates not set'
  if (startDate && endDate) return `${startDate} to ${endDate}`
  return startDate ? `Starts ${startDate}` : `Ends ${endDate}`
}

function classRequiresJoinApproval(row?: AcademyClassRow | null) {
  return ['approval_required', 'request_only', 'request_and_code'].includes(String(row?.join_mode || '').toLowerCase())
}

function StatusLine({ error, success }: { error: string; success: string }) {
  return (
    <>
      {error ? <p className="bad" role="alert">{error}</p> : null}
      {success ? <p className="saved-pill" role="status">{success}</p> : null}
    </>
  )
}

export function ClassWorkspacePages({
  mode,
  currentPath,
  memberships,
  activeClass,
  isOwner,
  onRefreshMemberships,
  currentUserId = '',
  onClassRequestNeedsAuth,
  onInviteNeedsAuth,
  onClassRequestSubmitted,
  embedded = false,
  profileSeed,
  profileOnly = false,
  profileSaveReady = false,
  initialError = '',
  onSaveOnboardingProfile,
  onFinishOnboarding,
}: Props) {
  const navigate = useNavigate()
  const [availableClasses, setAvailableClasses] = useState<AcademyClassRow[]>([])
  const [selectedClassId, setSelectedClassId] = useState(profileOnly ? activeClass?.classId || '' : '')
  const [departments, setDepartments] = useState<ClassDepartment[]>([])
  const [joinDepartmentId, setJoinDepartmentId] = useState('')
  const [inviteCode, setInviteCode] = useState(() => extractInviteCodeFromPath(currentPath))
  const [invitePreview, setInvitePreview] = useState<ClassInvitePreview | null>(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [classRequest, setClassRequest] = useState(readClassRequestForm)
  const [classReload, setClassReload] = useState(0)
  const [departmentsLoading, setDepartmentsLoading] = useState(false)
  const [submittingEnrollment, setSubmittingEnrollment] = useState(false)
  const [ownRequests, setOwnRequests] = useState<ClassCreationRequest[]>([])
  const [ownRequestsLoaded, setOwnRequestsLoaded] = useState(false)
  const [ownerRequests, setOwnerRequests] = useState<ClassCreationRequest[]>([])
  const [adminRequests, setAdminRequests] = useState<ClassJoinRequest[]>([])
  const [lastGeneratedInvite, setLastGeneratedInvite] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(initialError)
  const [success, setSuccess] = useState('')

  const selectedClass = useMemo(() => {
    return availableClasses.find((entry) => entry.id === selectedClassId) || availableClasses[0] || null
  }, [availableClasses, selectedClassId])
  const pageClassName = embedded ? 'class-page class-page-embedded' : 'page-shell class-page'

  useEffect(() => {
    setInviteCode(extractInviteCodeFromPath(currentPath))
  }, [currentPath])

  useEffect(() => {
    if (mode !== 'classes' && mode !== 'join' && mode !== 'admin') return
    let cancelled = false
    setLoading(true)
    setError('')
    const loadClasses = mode === 'admin' ? loadCreatedClasses : loadActiveClasses
    loadClasses()
      .then((rows) => {
        if (cancelled) return
        const activeRow: AcademyClassRow | null = profileOnly && activeClass ? { id: activeClass.classId, class_name: activeClass.className, start_date: activeClass.startDate, end_date: activeClass.endDate, status: activeClass.status, visibility: 'listed', join_mode: 'open', academy_id: '', academies: { name: activeClass.academyName } } : null
        const classRows = activeRow && !rows.some((row) => row.id === activeRow.id) ? [activeRow, ...rows] : rows
        const selectableRows = mode === 'classes' ? classRows.filter((row) => !memberships.some((membership) => membership.classId === row.id)) : classRows
        setAvailableClasses(selectableRows)
        setSelectedClassId((current) => profileOnly && activeClass ? activeClass.classId : selectableRows.some((row) => row.id === current) ? current : selectableRows[0]?.id || '')
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load classes.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [mode, classReload, profileOnly, activeClass, memberships])

  useEffect(() => {
    if (!selectedClassId || mode === 'invite') return
    let cancelled = false
    setDepartments([])
    setJoinDepartmentId('')
    setDepartmentsLoading(true)
    loadClassDepartments(selectedClassId)
      .then((rows) => {
        if (cancelled) return
        setDepartments(rows)
        setJoinDepartmentId(profileOnly && activeClass?.departmentId && rows.some((row) => row.id === activeClass.departmentId) ? activeClass.departmentId : rows.length === 1 ? rows[0].id : '')
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load departments. Please refresh the class list.') })
      .finally(() => { if (!cancelled) setDepartmentsLoading(false) })
    return () => { cancelled = true }
  }, [mode, selectedClassId, classReload, profileOnly, activeClass?.departmentId])

  useEffect(() => {
    if (mode !== 'invite') return
    const normalized = normalizeInviteCode(inviteCode)
    setInvitePreview(null)
    setDepartments([])
    setJoinDepartmentId('')
    setError('')
    if (!normalized) return

    let cancelled = false
    setInviteLoading(true)
    lookupInvite(normalized)
      .then(async (preview) => {
        if (cancelled) return
        setInvitePreview(preview)
        if (preview.departmentId) {
          setJoinDepartmentId(preview.departmentId)
          setDepartments([])
          return
        }
        const rows = await loadClassDepartments(preview.classId)
        if (!cancelled) setDepartments(rows)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load invite.')
      })
      .finally(() => {
        if (!cancelled) setInviteLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [inviteCode, mode])

  useEffect(() => {
    if ((mode !== 'join' && mode !== 'request' && mode !== 'invite') || !currentUserId) return
    let cancelled = false
    setOwnRequestsLoaded(false)
    loadOwnClassCreationRequests().then((rows) => { if (!cancelled) setOwnRequests(rows) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your request status.') })
      .finally(() => { if (!cancelled) setOwnRequestsLoaded(true) })
    return () => { cancelled = true }
  }, [mode, currentUserId, classReload])

  useEffect(() => {
    if (mode !== 'owner' || ownerRequests.length === 0) return
    const requestId = new URLSearchParams(window.location.search).get('request')
    if (!requestId) return
    const target = document.getElementById(`class-request-${requestId}`)
    target?.scrollIntoView({ block: 'center', behavior: 'auto' })
    target?.focus({ preventScroll: true })
  }, [mode, ownerRequests])

  const loadOwnerRequests = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setOwnerRequests(await loadOwnerClassCreationRequests())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load class requests.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (mode === 'owner' && isOwner) void loadOwnerRequests()
  }, [mode, isOwner, loadOwnerRequests])

  const loadAdminRequests = useCallback(async () => {
    if (!activeClass) return
    setLoading(true)
    setError('')
    try {
      setAdminRequests(await loadClassJoinRequests(activeClass.classId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load join requests.')
    } finally {
      setLoading(false)
    }
  }, [activeClass])

  useEffect(() => {
    if (mode === 'admin' && activeClass) void loadAdminRequests()
  }, [mode, activeClass, loadAdminRequests])

  const submitRequest = async () => {
    const payload = { ...classRequest, departments: cleanRequestDepartments(classRequest.departments) }
    const validationError = validateClassRequest(payload)
    if (validationError) { setError(validationError); return }
    window.localStorage.setItem('pending_class_creation_request', JSON.stringify(payload))
    if (!currentUserId && onClassRequestNeedsAuth) { onClassRequestNeedsAuth(payload); return }
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      await submitClassCreationRequest(payload)
      window.localStorage.removeItem('pending_class_creation_request')
      setSuccess('Your request is saved. We’ll email you when it’s approved, and you’ll become your class admin.')
      onClassRequestSubmitted?.()
      setClassRequest({ ...initialClassRequest })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit class request. Your details are saved so you can retry.')
    } finally { setLoading(false) }
  }

  const submitInvite = async () => {
    const normalized = normalizeInviteCode(inviteCode)
    if (!normalized) {
      setError('Enter a valid invite code.')
      return
    }
    if (!currentUserId) {
      onInviteNeedsAuth?.(normalized, 'signup')
      return
    }
    if (mode === 'invite' && activeClass && invitePreview && activeClass.classId === invitePreview.classId) {
      navigate('/home', { replace: true })
      return
    }
    if (mode === 'invite' && departments.length > 0 && !joinDepartmentId) {
      setError('Choose your department.')
      return
    }
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      await acceptInvite(normalized, joinDepartmentId || undefined)
      await onRefreshMemberships()
      window.localStorage.removeItem('pending_class_selection')
      window.localStorage.removeItem('pending_class_invite_code')
      navigate('/home', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept invite.')
    } finally {
      setLoading(false)
    }
  }

  const joinSelectedClass = async (profileInput?: OnboardingProfile) => {
    if (!selectedClass || (!joinDepartmentId && !profileOnly) || submittingEnrollment) return
    if (profileInput && !profileSaveReady) return
    setSubmittingEnrollment(true)
    setError('')
    setSuccess('')
    try {
      if (profileInput) await onSaveOnboardingProfile?.(profileInput)
      if (profileOnly && activeClass) {
        await onFinishOnboarding?.()
        await onRefreshMemberships()
        navigate('/home', { replace: true })
      } else if (classRequiresJoinApproval(selectedClass)) {
        await requestToJoinClass(selectedClass.id, joinDepartmentId, '')
        window.localStorage.removeItem('pending_class_selection')
        setSuccess('Join request sent. Your class admin will review it.')
      } else {
        await joinClassDirectly(selectedClass.id, joinDepartmentId)
        await onFinishOnboarding?.()
        await onRefreshMemberships()
        window.localStorage.removeItem('pending_class_selection')
        navigate('/home', { replace: true })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not finish joining. Your choices are still here so you can retry.')
    } finally { setSubmittingEnrollment(false) }
  }

  const switchClass = async (classId: string) => {
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      await setActiveClass(classId)
      await onRefreshMemberships()
      setSuccess('Active class changed.')
      navigate('/home', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not switch class.')
    } finally {
      setLoading(false)
    }
  }

  const reviewClassRequest = async (requestId: string, decision: 'approve' | 'reject') => {
    if (loading || !isOwner) return
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      if (decision === 'approve') {
        await approveClassCreationRequest(requestId)
        setSuccess('Class approved. The requester is now the class admin, and their approval email is queued.')
      } else {
        await rejectClassCreationRequest(requestId, 'Please review your class details and submit an updated request.')
        setSuccess('Class request declined.')
      }
      setOwnerRequests(await loadOwnerClassCreationRequests())
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update the request. Please try again.') }
    finally { setLoading(false) }
  }

  const pendingRequest = ownRequests.find((request) => request.status === 'pending')
  if ((mode === 'join' || mode === 'request' || mode === 'invite') && pendingRequest && (mode === 'request' || !activeClass)) return <AcademyWelcome><header className="academy-form-heading"><p className="academy-eyebrow">REQUEST RECEIVED</p><h2>Your class is under review.</h2><p>Your request for {pendingRequest.class_name} is saved. We’ll email you when the owner approves it, and you’ll become the class admin.</p></header><div className="academy-form"><div className="academy-selection-summary"><strong>{pendingRequest.academy_name} · {pendingRequest.class_name}</strong><span>{classDates(pendingRequest.start_date, pendingRequest.end_date)}</span><span>{pendingRequest.departments.length} departments · Pending approval</span></div><button type="button" className="academy-primary" disabled={loading} onClick={() => { void onRefreshMemberships(); setClassReload((value) => value + 1) }}>Check approval status</button><OnboardingStatus error={error} /></div></AcademyWelcome>

  if (mode === 'request') {
    const departmentOptions = cleanRequestDepartments(classRequest.departments)
    return <div className="academy-request-flow"><AcademyWelcome steps={['Class details', 'Your account', 'Owner approval']} step={0}>
      <header className="academy-form-heading"><p className="academy-eyebrow">BRING YOUR CLASS TOGETHER</p><h2>Add your academy class.</h2><p>Tell us about your class. The site owner will review your request, and we’ll email you when it’s approved. You’ll become the class admin.</p></header>
      <form className="academy-form" onSubmit={(event) => { event.preventDefault(); void submitRequest() }}>
        <label>Academy name<input required maxLength={160} value={classRequest.academyName} placeholder="Your police academy" onChange={(event) => setClassRequest({ ...classRequest, academyName: event.target.value })} /></label>
        <div className="academy-form-grid"><label>City <span className="academy-optional">optional</span><input maxLength={100} value={classRequest.academyCity} onChange={(event) => setClassRequest({ ...classRequest, academyCity: event.target.value })} /></label><label>State <span className="academy-optional">optional</span><input maxLength={50} value={classRequest.academyState} placeholder="California" onChange={(event) => setClassRequest({ ...classRequest, academyState: event.target.value })} /></label></div>
        <label>Class number or name<input required maxLength={100} value={classRequest.className} placeholder="Class 183" onChange={(event) => setClassRequest({ ...classRequest, className: event.target.value })} /></label>
        <div className="academy-form-grid"><label>Start date<input required type="date" value={classRequest.startDate} onChange={(event) => setClassRequest({ ...classRequest, startDate: event.target.value })} /></label><label>Graduation date<input required type="date" min={classRequest.startDate || undefined} value={classRequest.endDate} onChange={(event) => setClassRequest({ ...classRequest, endDate: event.target.value })} /></label></div>
        <section className="academy-request-section"><h3>Departments in your class</h3><p className="academy-field-hint">Add every department represented in your class. Your classmates will choose from this list when they join.</p>
          {classRequest.departments.map((department, index) => <div className="academy-request-department" key={index}><label>Department {index + 1}<input maxLength={160} required={index === 0} value={department} placeholder="Police department or agency" onChange={(event) => setClassRequest((previous) => ({ ...previous, departments: previous.departments.map((value, position) => position === index ? event.target.value : value) }))} /></label><button type="button" className="academy-secondary" aria-label={`Remove department ${index + 1}`} disabled={classRequest.departments.length === 1} onClick={() => setClassRequest((previous) => ({ ...previous, departments: previous.departments.filter((_, position) => position !== index), requesterDepartment: previous.requesterDepartment === department ? '' : previous.requesterDepartment }))}>×</button></div>)}
          <button className="academy-secondary" type="button" onClick={() => setClassRequest((previous) => ({ ...previous, departments: [...previous.departments, ''] }))}>＋ Add another department</button>
          {departmentOptions.length ? <label>Your department<select aria-label="Your department" required value={classRequest.requesterDepartment} onChange={(event) => setClassRequest({ ...classRequest, requesterDepartment: event.target.value })}><option value="">Choose your department</option>{departmentOptions.map((department) => <option key={department}>{department}</option>)}</select></label> : null}
        </section>
        <label>Anything else we should know? <span className="academy-optional">optional</span><textarea maxLength={2000} value={classRequest.requesterNote} rows={3} placeholder="Add context that will help the owner review your request." onChange={(event) => setClassRequest({ ...classRequest, requesterNote: event.target.value })} /></label>
        <OnboardingStatus error={error} success={success} />
        <button className="academy-primary" disabled={loading || (!!currentUserId && !ownRequestsLoaded)} type="submit">{loading ? 'Saving your request…' : currentUserId ? 'Submit for approval' : 'Continue to your account'} <span aria-hidden>→</span></button>
        <button className="academy-text-button" type="button" onClick={() => navigate(currentUserId ? '/classes/join' : '/signup')}>Back to {currentUserId ? 'class selection' : 'sign up'}</button>
      </form>
    </AcademyWelcome></div>
  }

  if (mode === 'invite') {
    const normalizedInviteCode = normalizeInviteCode(inviteCode)
    const activeClassIsDifferent = Boolean(currentUserId && activeClass && invitePreview && activeClass.classId !== invitePreview.classId)
    const activeClassIsSame = Boolean(currentUserId && activeClass && invitePreview && activeClass.classId === invitePreview.classId)
    const inviteTitle = invitePreview ? `Join ${formatAcademyClassLabel(invitePreview.academyName, invitePreview.className)}?` : 'Join your class'
    const acceptLabel = activeClassIsDifferent ? 'Leave and Join Class' : activeClassIsSame ? 'Enter Class' : 'Join Class'
    return (
      <main className={`${pageClassName} class-join-flow`}>
        <section className="class-join-card class-invite-card" aria-label="Class invite">
          <p className="eyebrow">Class invite</p>
          <h1>{inviteTitle}</h1>
          {invitePreview ? (
            <div className="invite-summary">
              <strong>{formatAcademyClassLabel(invitePreview.academyName, invitePreview.className)}</strong>
              <span>{invitePreview.academyLocation || 'Location not set'} · {classDates(invitePreview.startDate, invitePreview.endDate)}</span>
            </div>
          ) : (
            <p className="muted">Use the link or code your class admin gave you.</p>
          )}
          <label>Invite code<input value={inviteCode} onChange={(event) => setInviteCode(normalizeInviteCode(event.target.value) || event.target.value.toUpperCase())} placeholder="12345" /></label>
          {inviteLoading ? <p className="muted tiny">Checking invite...</p> : null}
          {currentUserId && invitePreview?.departmentId ? <p className="saved-pill">Department: {invitePreview.departmentName || 'Locked by invite'}</p> : null}
          {currentUserId && invitePreview && !invitePreview.departmentId && departments.length > 0 ? (
            <label>
              Department
              <select value={joinDepartmentId} onChange={(event) => setJoinDepartmentId(event.target.value)}>
                <option value="">Choose department</option>
                {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
              </select>
            </label>
          ) : null}
          {!currentUserId ? (
            <>
              <p className="muted">Create an account or sign in, then this invite will bring you back here to finish joining.</p>
              <div className="button-row">
                <button className="primary" type="button" disabled={!normalizedInviteCode} onClick={() => normalizedInviteCode && onInviteNeedsAuth?.(normalizedInviteCode, 'signup')}>
                  Create Account
                </button>
                <button className="secondary" type="button" disabled={!normalizedInviteCode} onClick={() => normalizedInviteCode && onInviteNeedsAuth?.(normalizedInviteCode, 'signin')}>
                  I Already Have an Account
                </button>
              </div>
            </>
          ) : (
            <>
              {activeClassIsDifferent ? (
                <p className="bad">You are already in {membershipTitle(activeClass)}. Do you want to leave it and join {invitePreview ? formatAcademyClassLabel(invitePreview.academyName, invitePreview.className) : 'this class'}?</p>
              ) : null}
              <button className="primary" type="button" disabled={loading || inviteLoading || (!!currentUserId && !ownRequestsLoaded) || !normalizedInviteCode || !invitePreview || (!invitePreview.departmentId && departments.length > 0 && !joinDepartmentId)} onClick={() => void submitInvite()}>
                {loading ? 'Joining...' : acceptLabel}
              </button>
            </>
          )}
          <StatusLine error={error} success={success} />
        </section>
      </main>
    )
  }

  if (mode === 'join') {
    return <ClassEnrollment classes={availableClasses} selectedClassId={selectedClassId} departments={departments} departmentId={joinDepartmentId}
      onClassChange={(id) => { setSelectedClassId(id); setJoinDepartmentId(''); setError('') }} onDepartmentChange={setJoinDepartmentId}
      classesLoading={loading || (!!currentUserId && !ownRequestsLoaded)} departmentsLoading={departmentsLoading} submitting={submittingEnrollment} profileSaveReady={profileSaveReady} error={error || initialError} success={success}
      key={profileOnly ? `profile-${activeClass?.classId}` : 'class-enrollment'} profileOnly={profileOnly} profileOnlyDepartmentName={profileOnly ? activeClass?.departmentName : undefined} profileSeed={profileSeed} onComplete={joinSelectedClass} onRetry={() => setClassReload((value) => value + 1)} />
  }

  if (mode === 'owner') {
    return (
      <main className={pageClassName}>
        <section className="panel-block">
          <p className="eyebrow">Owner</p>
          <h1>Class Requests</h1>
          <p className="muted">Review academy class requests, inspect submitted departments and dates, then approve or decline. Approval creates the class workspace, departments, first invite, and class admin membership.</p>
          {!isOwner ? <p className="muted">Owner access is required.</p> : null}
          {isOwner ? <button className="secondary" type="button" onClick={() => void loadOwnerRequests()} disabled={loading}>Refresh</button> : null}
          <StatusLine error={error} success={success} />
          {isOwner && ownerRequests.length === 0 ? <p className="muted">No class requests yet.</p> : null}
          {ownerRequests.map((request) => (
            <article id={`class-request-${request.id}`} tabIndex={-1} className={`class-card ${new URLSearchParams(window.location.search).get('request') === request.id ? 'class-request-highlight' : ''}`} key={request.id}>
              <h3>{formatAcademyClassLabel(request.academy_name, request.class_name)}</h3>
              <p className="muted tiny">{request.academy_city}, {request.academy_state} · {classDates(request.start_date, request.end_date)}</p>
              <p className="muted tiny">Requested by: {request.requester_name || 'Unknown'}{request.requester_email ? ` · ${request.requester_email}` : ''}</p>
              <p>{request.requester_note || 'No note provided.'}</p>
              <p className="muted tiny">{request.departments.length} departments · requester department: {request.requester_department || 'Not set'} · status: {request.status}</p>
              {request.departments.length > 0 ? (
                <div className="department-chip-list">
                  {request.departments.map((department) => <span key={`${request.id}-${department}`}>{department}</span>)}
                </div>
              ) : null}
              {request.created_invite_code ? <p className="saved-pill">{formatInviteUrl(request.created_invite_code)}</p> : null}
              {request.status === 'pending' ? (
                <div className="button-row">
                  <button className="primary" type="button" disabled={loading} onClick={() => void reviewClassRequest(request.id, 'approve')}>{loading ? 'Saving…' : 'Approve class'}</button>
                  <button className="secondary" type="button" disabled={loading} onClick={() => void reviewClassRequest(request.id, 'reject')}>Decline request</button>
                </div>
              ) : null}
            </article>
          ))}
        </section>
      </main>
    )
  }

  if (mode === 'admin') {
    const canAdmin = activeClass?.role === 'class_admin' || activeClass?.role === 'moderator'
    const activeJoinMode = activeClass ? (availableClasses.find((entry) => entry.id === activeClass.classId)?.join_mode || '') : ''
    const approvalRequired = ['approval_required', 'request_only', 'request_and_code'].includes(activeJoinMode)
    return (
      <main className={pageClassName}>
        <section className="panel-block">
          <p className="eyebrow">Class admin</p>
          <h1>Class Access</h1>
          <p className="muted">
            {activeClass ? `Control how cadets join ${membershipTitle(activeClass)}. Five-digit codes always join instantly.` : 'Control how cadets join your class.'}
          </p>
          {!canAdmin ? <p className="muted">Class admin or moderator access is required.</p> : null}
          {canAdmin ? (
            <>
              {activeClass?.role === 'class_admin' ? (
                <div className="settings-feature-toggle-card">
                  <div className="settings-inline-head">
                    <div>
                      <h4>Class join approval</h4>
                      <p className="muted tiny">Turn this on if cadets must be approved before entering this class.</p>
                    </div>
                  </div>
                  <label className="switch-row">
                    <input
                      type="checkbox"
                      checked={approvalRequired}
                      disabled={loading}
                      onChange={async (event) => {
                        if (!activeClass) return
                        setLoading(true)
                        setError('')
                        setSuccess('')
                        try {
                          await updateClassJoinMode(activeClass.classId, event.target.checked ? 'approval_required' : 'open')
                          setAvailableClasses(await loadCreatedClasses())
                          setSuccess(event.target.checked ? 'Join approval required.' : 'Anyone can join this class.')
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Could not update class access.')
                        } finally {
                          setLoading(false)
                        }
                      }}
                    />
                    Require admin approval to join
                  </label>
                </div>
              ) : null}
              <div className="button-row">
                {activeClass?.role === 'class_admin' ? (
                  <button className="primary" type="button" onClick={async () => {
                    if (!activeClass) return
                    setError('')
                    setSuccess('')
                    const code = await createClassJoinCode(activeClass.classId)
                    setLastGeneratedInvite(code)
                    setSuccess('Code created.')
                  }}>Create 5-Digit Code</button>
                ) : null}
              </div>
              {lastGeneratedInvite ? <p className="saved-pill">Code: {lastGeneratedInvite}</p> : null}
              <StatusLine error={error} success={success} />
              {approvalRequired ? (
                <>
                  <div className="settings-inline-head">
                    <div>
                      <h4>Pending join requests</h4>
                      <p className="muted tiny">Approve cadets who picked this class without a code.</p>
                    </div>
                    <button className="secondary" type="button" onClick={() => void loadAdminRequests()} disabled={loading}>Refresh</button>
                  </div>
                  {adminRequests.length === 0 ? <p className="muted">No pending join requests.</p> : null}
                  {adminRequests.map((request) => (
                    <article id={`class-request-${request.id}`} tabIndex={-1} className={`class-card ${new URLSearchParams(window.location.search).get('request') === request.id ? 'class-request-highlight' : ''}`} key={request.id}>
                      <h3>Cadet {String(request.user_id || '').slice(0, 8)}</h3>
                      <p className="muted tiny">{request.class_departments?.name || 'No department selected'}</p>
                      <div className="button-row">
                        <button className="primary" type="button" disabled={loading} onClick={async () => {
                          setError('')
                          setSuccess('')
                          try {
                            await approveJoinRequest(request.id)
                            setSuccess('Join request approved.')
                            await loadAdminRequests()
                            await onRefreshMemberships()
                          } catch (err) {
                            setError(err instanceof Error ? err.message : 'Could not approve join request.')
                          }
                        }}>Approve</button>
                        <button className="secondary" type="button" disabled={loading} onClick={async () => {
                          setError('')
                          setSuccess('')
                          try {
                            await denyJoinRequest(request.id, 'Denied by class admin.')
                            setSuccess('Join request denied.')
                            await loadAdminRequests()
                          } catch (err) {
                            setError(err instanceof Error ? err.message : 'Could not deny join request.')
                          }
                        }}>Deny</button>
                      </div>
                    </article>
                  ))}
                </>
              ) : null}
            </>
          ) : null}
        </section>
      </main>
    )
  }

  return (
    <main className="page-shell class-page">
      <section className="panel-block">
        <p className="eyebrow">Classes</p>
        <h1>Your class workspace</h1>
        <div className="button-row class-management-actions">
          <button className="secondary" type="button" onClick={() => navigate('/classes/request')}>Request to add a class</button>
          {isOwner ? <button className="primary" type="button" onClick={() => navigate('/owner/classes')}>Review class requests</button> : null}
        </div>
        {memberships.length > 0 ? (
          <div className="class-grid">
            {memberships.map((membership) => (
              <article className="class-card" key={membership.id}>
                <h3>{membershipTitle(membership)}</h3>
                <p className="muted tiny">{membership.academyLocation || 'Location not set'} · {classDates(membership.startDate, membership.endDate)}</p>
                <p className="muted tiny">{membership.departmentName || 'No department'} · {{ cadet: 'Cadet', class_admin: 'Class admin', moderator: 'Moderator' }[membership.role]}</p>
                <button className={membership.isActive ? 'secondary' : 'primary'} type="button" disabled={membership.isActive || loading} onClick={() => void switchClass(membership.classId)}>
                  {membership.isActive ? 'Active Class' : 'Set Active'}
                </button>
                {membership.isActive && (membership.role === 'class_admin' || membership.role === 'moderator') ? <button className="primary class-manage-button" type="button" onClick={() => navigate('/classes/admin')}>Manage class</button> : null}
              </article>
            ))}
          </div>
        ) : <p className="muted">You are not in a class yet.</p>}
      </section>

      <section className="panel-block">
        <p className="eyebrow">Active classes</p>
        <h2>Join a class</h2>
        {availableClasses.length === 0 ? <p className="muted">No classes are available.</p> : null}
        <div className="class-grid">
          {availableClasses.map((row) => (
            <article className="class-card" key={row.id}>
              <h3>{classTitle(row)}</h3>
              <p className="muted tiny">{row.academies?.city || ''}{row.academies?.state ? `, ${row.academies.state}` : ''} · {classDates(row.start_date, row.end_date)}</p>
              <button className="secondary" type="button" onClick={() => setSelectedClassId(row.id)}>Select</button>
            </article>
          ))}
        </div>
        {selectedClass ? (
          <div className="join-request-box">
            <h3>Join {classTitle(selectedClass)}</h3>
            <label>Department<select value={joinDepartmentId} onChange={(event) => setJoinDepartmentId(event.target.value)}>
              <option value="">Choose department</option>
              {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select></label>
            <button className="primary" type="button" onClick={() => void joinSelectedClass()} disabled={loading || !selectedClass || (departments.length > 0 && !joinDepartmentId)}>
              {loading ? (classRequiresJoinApproval(selectedClass) ? 'Sending...' : 'Joining...') : classRequiresJoinApproval(selectedClass) ? 'Request to Join' : 'Join Class'}
            </button>
          </div>
        ) : null}
        <StatusLine error={error} success={success} />
      </section>
    </main>
  )
}
