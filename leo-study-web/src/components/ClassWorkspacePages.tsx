import { useEffect, useMemo, useState } from 'react'
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
  lookupInvite,
  notifyDiscordForClassRequest,
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
import { extractInviteCodeFromPath, formatAcademyClassLabel, normalizeInviteCode } from '../lib/classWorkspace'

const fixedClassRequestAcademy = {
  name: 'Police Academy 180',
  city: '',
  state: 'CA',
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
}

function cleanDepartmentFields(value: string[]) {
  return value.map((entry) => entry.trim()).filter(Boolean)
}

function isClassRequestReady(input: { className: string; departments: string[] }) {
  const departments = cleanDepartmentFields(input.departments)
  return Boolean(input.className.trim() && departments.length > 0)
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
      {error ? <p className="bad">{error}</p> : null}
      {success ? <p className="saved-pill">{success}</p> : null}
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
}: Props) {
  const navigate = useNavigate()
  const [availableClasses, setAvailableClasses] = useState<AcademyClassRow[]>([])
  const [selectedClassId, setSelectedClassId] = useState('')
  const [departments, setDepartments] = useState<ClassDepartment[]>([])
  const [joinDepartmentId, setJoinDepartmentId] = useState('')
  const [inviteCode, setInviteCode] = useState(() => extractInviteCodeFromPath(currentPath))
  const [invitePreview, setInvitePreview] = useState<ClassInvitePreview | null>(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [classRequest, setClassRequest] = useState({
    className: '',
    startDate: '',
    endDate: '',
    departments: ['', '', ''],
    requesterDepartment: '',
    requesterNote: '',
  })
  const [ownerRequests, setOwnerRequests] = useState<ClassCreationRequest[]>([])
  const [adminRequests, setAdminRequests] = useState<ClassJoinRequest[]>([])
  const [lastGeneratedInvite, setLastGeneratedInvite] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
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
    setLoading(true)
    const loadClasses = mode === 'admin' ? loadCreatedClasses : loadActiveClasses
    loadClasses()
      .then((rows) => {
        setAvailableClasses(rows)
        setSelectedClassId((current) => rows.some((row) => row.id === current) ? current : rows[0]?.id || '')
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load classes.'))
      .finally(() => setLoading(false))
  }, [mode])

  useEffect(() => {
    if (!selectedClassId) {
      setDepartments([])
      return
    }
    if (mode === 'invite') return
    loadClassDepartments(selectedClassId)
      .then((rows) => {
        setDepartments(rows)
        setJoinDepartmentId((current) => rows.some((row) => row.id === current) ? current : rows.length === 1 ? rows[0].id : '')
      })
      .catch(() => {
        setDepartments([])
        setJoinDepartmentId('')
      })
  }, [mode, selectedClassId])

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

  const loadOwnerRequests = async () => {
    setLoading(true)
    setError('')
    try {
      setOwnerRequests(await loadOwnerClassCreationRequests())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load class requests.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (mode === 'owner' && isOwner) void loadOwnerRequests()
  }, [mode, isOwner])

  const loadAdminRequests = async () => {
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
  }

  useEffect(() => {
    if (mode === 'admin' && activeClass) void loadAdminRequests()
  }, [mode, activeClass?.classId])

  const submitRequest = async () => {
    const payload = {
      academyName: fixedClassRequestAcademy.name,
      academyCity: fixedClassRequestAcademy.city,
      academyState: fixedClassRequestAcademy.state,
      ...classRequest,
      departments: cleanDepartmentFields(classRequest.departments),
    }
    if (!currentUserId && onClassRequestNeedsAuth) {
      onClassRequestNeedsAuth(payload)
      return
    }
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const requestId = await submitClassCreationRequest(payload)
      await notifyDiscordForClassRequest(requestId)
      setSuccess('Class request submitted. The site owner will review it.')
      onClassRequestSubmitted?.()
      setClassRequest({
        className: '',
        startDate: '',
        endDate: '',
        departments: ['', '', ''],
        requesterDepartment: '',
        requesterNote: '',
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit class request.')
    } finally {
      setLoading(false)
    }
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

  const joinSelectedClass = async () => {
    if (!selectedClass) return
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      if (classRequiresJoinApproval(selectedClass)) {
        await requestToJoinClass(selectedClass.id, joinDepartmentId || null, '')
        window.localStorage.removeItem('pending_class_selection')
        setSuccess('Join request sent. The class admin will review it.')
      } else {
        await joinClassDirectly(selectedClass.id, joinDepartmentId || null)
        await onRefreshMemberships()
        window.localStorage.removeItem('pending_class_selection')
        setSuccess('Class joined.')
        navigate('/home', { replace: true })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join class.')
    } finally {
      setLoading(false)
    }
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

  if (mode === 'request') {
    return (
      <main className={pageClassName}>
        <section className="class-request-card">
          <div className="class-flow-hero">
            <p className="eyebrow">Request a class</p>
            <h1>Add your academy class</h1>
            <p className="muted">Add the class number, dates, and departments. You will sign in before the request is sent.</p>
          </div>
          <div className="request-step-list" aria-label="Class request steps">
            <span>Step one: add your class number</span>
            <span>Step two: add a start date and end date</span>
            <span>Step three: add departments for owner review</span>
          </div>
          <div className="settings-grid">
            <label>Class number/name<input value={classRequest.className} onChange={(event) => setClassRequest({ ...classRequest, className: event.target.value })} placeholder="Class 181" /></label>
            <label>Start date<input type="date" value={classRequest.startDate} onChange={(event) => setClassRequest({ ...classRequest, startDate: event.target.value })} /></label>
            <label>End date<input type="date" value={classRequest.endDate} onChange={(event) => setClassRequest({ ...classRequest, endDate: event.target.value })} /></label>
          </div>
          <div className="department-entry-list">
            <div className="settings-inline-head">
              <div>
                <h4>Departments in your class</h4>
                <p className="muted tiny">Put one department in each box.</p>
              </div>
              <button type="button" className="secondary" onClick={() => setClassRequest((previous) => ({ ...previous, departments: [...previous.departments, ''] }))}>Add Department</button>
            </div>
            {classRequest.departments.map((department, index) => (
              <div className="department-entry-row" key={`class-request-department-${index}`}>
                <label>Department {index + 1}<input value={department} onChange={(event) => setClassRequest((previous) => {
                  const departments = [...previous.departments]
                  departments[index] = event.target.value
                  return { ...previous, departments }
                })} placeholder="Fresno Police Department" /></label>
                <button type="button" className="secondary" disabled={classRequest.departments.length <= 1} onClick={() => setClassRequest((previous) => ({ ...previous, departments: previous.departments.filter((_, departmentIndex) => departmentIndex !== index) }))}>Remove</button>
              </div>
            ))}
          </div>
          <label>Note to owner<textarea value={classRequest.requesterNote} onChange={(event) => setClassRequest({ ...classRequest, requesterNote: event.target.value })} rows={4} placeholder="Tell the owner who should manage the class and anything special about your academy." /></label>
          <button className="primary" type="button" disabled={loading || !isClassRequestReady(classRequest)} onClick={() => void submitRequest()}>
            {loading ? 'Submitting...' : currentUserId ? 'Submit Class Request' : 'Continue to Sign In'}
          </button>
          <StatusLine error={error} success={success} />
        </section>
      </main>
    )
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
              <button className="primary" type="button" disabled={loading || inviteLoading || !normalizedInviteCode || !invitePreview || (!invitePreview.departmentId && departments.length > 0 && !joinDepartmentId)} onClick={() => void submitInvite()}>
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
    const selectedClassRequiresApproval = classRequiresJoinApproval(selectedClass)
    return (
      <main className={`${pageClassName} class-join-flow`}>
        <section className="class-join-card">
          <p className="eyebrow">Join a class</p>
          <h1>Choose Class 181 or Class 182</h1>
          <p className="muted">
            {selectedClassRequiresApproval ? 'Choose your class and department. The class admin will approve your request.' : 'Pick your class and department to start with a fresh, class-only leaderboard.'}
          </p>
          {loading ? <p className="muted">Loading classes...</p> : null}
          {!loading && availableClasses.length === 0 ? <p className="muted">No classes are available yet.</p> : null}
          <label>
            Class
            <select value={selectedClassId} onChange={(event) => {
              setSelectedClassId(event.target.value)
              setJoinDepartmentId('')
            }}>
              {availableClasses.map((row) => (
                <option key={row.id} value={row.id}>
                  {classTitle(row)}
                </option>
              ))}
            </select>
          </label>
          {selectedClass ? <p className="muted tiny">{classDates(selectedClass.start_date, selectedClass.end_date)}</p> : null}
          <label>
            Department
            <select value={joinDepartmentId} onChange={(event) => setJoinDepartmentId(event.target.value)}>
              <option value="">Choose department</option>
              {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>
          </label>
          {departments.length === 0 ? <p className="muted tiny">This class does not have departments listed yet. You can still continue.</p> : null}
          <button className="primary" type="button" onClick={() => void joinSelectedClass()} disabled={loading || !selectedClass || (departments.length > 0 && !joinDepartmentId)}>
            {loading ? (selectedClassRequiresApproval ? 'Sending...' : 'Joining...') : selectedClassRequiresApproval ? 'Request to Join' : 'Join Class'}
          </button>
          <StatusLine error={error} success={success} />
        </section>
      </main>
    )
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
            <article className="class-card" key={request.id}>
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
                  <button className="primary" type="button" onClick={async () => {
                    setError('')
                    const result = await approveClassCreationRequest(request.id).catch((err) => {
                      setError(err instanceof Error ? err.message : 'Could not approve request.')
                      return null
                    })
                    if (result?.inviteCode) setSuccess(`Approved. Invite: ${formatInviteUrl(result.inviteCode)}`)
                    await loadOwnerRequests()
                  }}>Approve</button>
                  <button className="secondary" type="button" onClick={async () => {
                    await rejectClassCreationRequest(request.id, 'Rejected by owner.')
                    await loadOwnerRequests()
                  }}>Reject</button>
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
                    <article className="class-card" key={request.id}>
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
        <h1>Choose your class</h1>
        {memberships.length > 0 ? (
          <div className="class-grid">
            {memberships.map((membership) => (
              <article className="class-card" key={membership.id}>
                <h3>{membershipTitle(membership)}</h3>
                <p className="muted tiny">{membership.academyLocation || 'Location not set'} · {classDates(membership.startDate, membership.endDate)}</p>
                <p className="muted tiny">{membership.departmentName || 'No department'} · {membership.role}</p>
                <button className={membership.isActive ? 'secondary' : 'primary'} type="button" disabled={membership.isActive || loading} onClick={() => void switchClass(membership.classId)}>
                  {membership.isActive ? 'Active Class' : 'Set Active'}
                </button>
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
