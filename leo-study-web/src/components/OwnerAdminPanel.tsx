import { useEffect, useMemo, useState } from 'react'
import {
  loadClassDepartments,
  loadCreatedClasses,
  ownerCreateClass,
  ownerListClassMembers,
  ownerRemoveClassMember,
  ownerSetClassMemberRole,
  ownerTimeoutClassMember,
  updateClassJoinMode,
  type AcademyClassRow,
  type ClassDepartment,
  type ClassRole,
  type OwnerClassMember,
} from '../lib/classApi'

function classLabel(row: AcademyClassRow) {
  return `${row.academies?.name || 'Academy'} ${row.class_name}`
}

function displayMember(member: OwnerClassMember) {
  return member.username || member.email || `User ${member.userId.slice(0, 8)}`
}

function formatTimeout(value: string | null) {
  if (!value) return ''
  const expiresAt = Date.parse(value)
  if (!Number.isFinite(expiresAt)) return ''
  if (expiresAt <= Date.now()) return ''
  return new Date(expiresAt).toLocaleString()
}

export function OwnerAdminPanel({ onRefreshMemberships }: { onRefreshMemberships: () => Promise<void> }) {
  const [classes, setClasses] = useState<AcademyClassRow[]>([])
  const [selectedClassId, setSelectedClassId] = useState('')
  const [departments, setDepartments] = useState<ClassDepartment[]>([])
  const [members, setMembers] = useState<OwnerClassMember[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [memberFilter, setMemberFilter] = useState('')
  const [timeoutMinutes, setTimeoutMinutes] = useState(10)
  const [newClass, setNewClass] = useState({
    className: '',
    startDate: '',
    endDate: '',
    joinMode: 'open' as 'open' | 'approval_required' | 'code_only',
    departments: ['', '', ''],
  })

  const selectedClass = useMemo(
    () => classes.find((row) => row.id === selectedClassId) || classes[0] || null,
    [classes, selectedClassId],
  )
  const filteredMembers = useMemo(() => {
    const needle = memberFilter.trim().toLowerCase()
    if (!needle) return members
    return members.filter((member) =>
      [member.username, member.email, member.departmentName, member.role]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [memberFilter, members])

  const refreshClasses = async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await loadCreatedClasses()
      setClasses(rows)
      setSelectedClassId((current) => current || rows[0]?.id || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load classes.')
    } finally {
      setLoading(false)
    }
  }

  const refreshSelectedClass = async (classId = selectedClass?.id || '') => {
    if (!classId) {
      setDepartments([])
      setMembers([])
      return
    }
    setLoading(true)
    setError('')
    try {
      const [departmentRows, memberRows] = await Promise.all([
        loadClassDepartments(classId),
        ownerListClassMembers(classId),
      ])
      setDepartments(departmentRows)
      setMembers(memberRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load class overview.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refreshClasses()
  }, [])

  useEffect(() => {
    if (!selectedClass?.id) return
    void refreshSelectedClass(selectedClass.id)
  }, [selectedClass?.id])

  const createClass = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const classId = await ownerCreateClass({
        academyName: 'Police Academy 180',
        academyCity: '',
        academyState: 'CA',
        className: newClass.className,
        startDate: newClass.startDate,
        endDate: newClass.endDate,
        joinMode: newClass.joinMode,
        departments: newClass.departments,
      })
      setNewClass({ className: '', startDate: '', endDate: '', joinMode: 'open', departments: ['', '', ''] })
      setSelectedClassId(classId)
      setSuccess('Class created.')
      await refreshClasses()
      await refreshSelectedClass(classId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create class.')
    } finally {
      setSaving(false)
    }
  }

  const changeJoinMode = async (joinMode: 'open' | 'approval_required') => {
    if (!selectedClass) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await updateClassJoinMode(selectedClass.id, joinMode)
      setSuccess(joinMode === 'open' ? 'Class is open to join.' : 'Class now requires approval.')
      await refreshClasses()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update join mode.')
    } finally {
      setSaving(false)
    }
  }

  const changeRole = async (member: OwnerClassMember, role: ClassRole) => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await ownerSetClassMemberRole(member.membershipId, role)
      setSuccess(`${displayMember(member)} is now ${role.replace('_', ' ')}.`)
      await refreshSelectedClass()
      await onRefreshMemberships()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update role.')
    } finally {
      setSaving(false)
    }
  }

  const timeoutMember = async (member: OwnerClassMember) => {
    if (!selectedClass) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const expiresAt = await ownerTimeoutClassMember(selectedClass.id, member.userId, timeoutMinutes, 'Timed out by owner.')
      setSuccess(`${displayMember(member)} timed out until ${new Date(expiresAt).toLocaleString()}.`)
      await refreshSelectedClass()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not time out member.')
    } finally {
      setSaving(false)
    }
  }

  const removeMember = async (member: OwnerClassMember) => {
    const confirmed = window.confirm(`Remove ${displayMember(member)} from this class?`)
    if (!confirmed) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await ownerRemoveClassMember(member.membershipId, 'Removed by owner.')
      setSuccess(`${displayMember(member)} was removed from the class.`)
      await refreshSelectedClass()
      await onRefreshMemberships()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove member.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="owner-admin-panel">
      <div className="settings-inline-head">
        <div>
          <h3>Owner Admin Panel</h3>
          <p className="muted tiny">Create classes, inspect members, assign roles, remove cadets, and time out class chat access.</p>
        </div>
        <button className="secondary" type="button" onClick={() => void refreshClasses()} disabled={loading || saving}>Refresh</button>
      </div>

      <div className="owner-admin-layout">
        <section className="owner-admin-section">
          <h4>Create Class</h4>
          <div className="settings-grid">
            <label>
              Class number/name
              <input value={newClass.className} onChange={(event) => setNewClass({ ...newClass, className: event.target.value })} placeholder="Class 181" />
            </label>
            <label>
              Start date
              <input type="date" value={newClass.startDate} onChange={(event) => setNewClass({ ...newClass, startDate: event.target.value })} />
            </label>
            <label>
              End date
              <input type="date" value={newClass.endDate} onChange={(event) => setNewClass({ ...newClass, endDate: event.target.value })} />
            </label>
            <label>
              Join mode
              <select value={newClass.joinMode} onChange={(event) => setNewClass({ ...newClass, joinMode: event.target.value as typeof newClass.joinMode })}>
                <option value="open">Anyone can join</option>
                <option value="approval_required">Admin approval required</option>
                <option value="code_only">Code only</option>
              </select>
            </label>
          </div>
          <div className="owner-admin-department-list">
            <div className="settings-inline-head">
              <h4>Departments</h4>
              <button
                className="secondary"
                type="button"
                onClick={() => setNewClass((previous) => ({ ...previous, departments: [...previous.departments, ''] }))}
              >
                Add
              </button>
            </div>
            {newClass.departments.map((department, index) => (
              <div className="department-entry-row" key={`owner-create-department-${index}`}>
                <input
                  value={department}
                  onChange={(event) => setNewClass((previous) => {
                    const departments = [...previous.departments]
                    departments[index] = event.target.value
                    return { ...previous, departments }
                  })}
                  placeholder={`Department ${index + 1}`}
                />
                <button
                  className="secondary"
                  type="button"
                  disabled={newClass.departments.length <= 1}
                  onClick={() => setNewClass((previous) => ({
                    ...previous,
                    departments: previous.departments.filter((_, departmentIndex) => departmentIndex !== index),
                  }))}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button className="primary" type="button" disabled={saving || !newClass.className.trim()} onClick={() => void createClass()}>
            {saving ? 'Saving...' : 'Create Class'}
          </button>
        </section>

        <section className="owner-admin-section">
          <h4>Class Overview</h4>
          <label>
            Class
            <select value={selectedClass?.id || ''} onChange={(event) => setSelectedClassId(event.target.value)}>
              {classes.map((row) => <option key={row.id} value={row.id}>{classLabel(row)}</option>)}
            </select>
          </label>
          {selectedClass ? (
            <>
              <div className="owner-admin-stats">
                <span>{members.filter((member) => member.status === 'active').length} active users</span>
                <span>{departments.length} agencies</span>
                <span>{selectedClass.join_mode === 'approval_required' ? 'Approval required' : selectedClass.join_mode === 'code_only' ? 'Code only' : 'Open join'}</span>
              </div>
              <div className="button-row">
                <button className="secondary" type="button" disabled={saving || selectedClass.join_mode === 'open'} onClick={() => void changeJoinMode('open')}>Make Open</button>
                <button className="secondary" type="button" disabled={saving || selectedClass.join_mode === 'approval_required'} onClick={() => void changeJoinMode('approval_required')}>Require Approval</button>
              </div>
            </>
          ) : <p className="muted">No class selected.</p>}
        </section>
      </div>

      {error ? <p className="bad">{error}</p> : null}
      {success ? <p className="saved-pill">{success}</p> : null}

      <section className="owner-admin-section owner-admin-members-section">
        <div className="settings-inline-head">
          <div>
            <h4>Users in Class</h4>
            <p className="muted tiny">Promote moderators/admins, kick users, or temporarily block chat posting.</p>
          </div>
          <label className="owner-admin-timeout-field">
            Timeout minutes
            <input type="number" min={1} max={10080} value={timeoutMinutes} onChange={(event) => setTimeoutMinutes(Number(event.target.value))} />
          </label>
        </div>
        <input className="owner-admin-search" value={memberFilter} onChange={(event) => setMemberFilter(event.target.value)} placeholder="Search users, email, agency, or role" />
        <div className="owner-admin-member-list">
          {filteredMembers.length === 0 ? <p className="muted">No users match this class view.</p> : null}
          {filteredMembers.map((member) => {
            const timeout = formatTimeout(member.timeoutUntil)
            return (
              <article className="owner-admin-member-row" key={member.membershipId}>
                <div>
                  <strong>{displayMember(member)}</strong>
                  <p className="muted tiny">{member.email || member.userId}</p>
                  <p className="muted tiny">{member.departmentName || 'No agency'} · {member.status}{timeout ? ` · timed out until ${timeout}` : ''}</p>
                </div>
                <div className="owner-admin-member-actions">
                  <select value={member.role} disabled={saving || member.status !== 'active'} onChange={(event) => void changeRole(member, event.target.value as ClassRole)}>
                    <option value="cadet">Cadet</option>
                    <option value="moderator">Moderator</option>
                    <option value="class_admin">Class admin</option>
                  </select>
                  <button className="secondary" type="button" disabled={saving || member.status !== 'active'} onClick={() => void timeoutMember(member)}>Timeout</button>
                  <button className="danger" type="button" disabled={saving || member.status !== 'active'} onClick={() => void removeMember(member)}>Kick</button>
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}
