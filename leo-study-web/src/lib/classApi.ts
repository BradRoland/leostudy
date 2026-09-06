import {
  buildInviteUrl,
  normalizeInviteCode,
  shouldShowClassAsActive,
} from './classWorkspace'
import { supabase } from './supabase'

export type ClassRole = 'cadet' | 'moderator' | 'class_admin'

export type AcademyClassRow = {
  id: string
  class_name: string
  start_date: string | null
  end_date: string | null
  status: string
  visibility: string
  join_mode: string
  academy_id: string
  academies?: {
    name?: string | null
    city?: string | null
    state?: string | null
  } | null
}

export type ClassDepartment = {
  id: string
  class_id: string
  name: string
}

export type ClassMembership = {
  id: string
  classId: string
  className: string
  academyName: string
  academyLocation: string
  role: ClassRole
  isActive: boolean
  departmentId: string | null
  departmentName: string
  startDate: string | null
  endDate: string | null
  status: string
}

export type ClassInvitePreview = {
  classId: string
  className: string
  academyName: string
  academyLocation: string
  startDate: string | null
  endDate: string | null
  roleGranted: ClassRole
  departmentId: string | null
  departmentName: string
  expiresAt: string | null
  maxUses: number | null
  useCount: number
}

export type ClassCreationRequestInput = {
  academyName: string
  academyCity: string
  academyState: string
  className: string
  startDate: string
  endDate: string
  departments: string[]
  requesterDepartment: string
  requesterNote: string
}

export type ClassCreationRequest = {
  id: string
  requester_user_id: string
  requester_name: string
  requester_email: string
  academy_name: string
  academy_city: string
  academy_state: string
  class_name: string
  start_date: string | null
  end_date: string | null
  departments: string[]
  requester_department: string
  requester_note: string
  status: string
  created_invite_code: string | null
  created_class_id: string | null
  decision_note: string
  created_at: string
}

export type ClassJoinRequest = {
  id: string
  user_id: string
  class_id?: string
  department_id?: string | null
  note?: string | null
  status?: string
  created_at?: string
  class_departments?: {
    name?: string | null
  } | null
}

export type OwnerClassMember = {
  membershipId: string
  userId: string
  email: string
  username: string
  avatarPath: string
  departmentId: string | null
  departmentName: string
  role: ClassRole
  isActive: boolean
  status: string
  joinedAt: string
  timeoutUntil: string | null
}

export type OwnerCreateClassInput = {
  academyName: string
  academyCity: string
  academyState: string
  className: string
  startDate: string
  endDate: string
  joinMode: 'open' | 'approval_required' | 'code_only'
  departments: string[]
}

export type OwnerUpdateClassInput = {
  classId: string
  className: string
  startDate: string
  endDate: string
  joinMode: 'open' | 'approval_required' | 'code_only'
  status: 'pending' | 'active' | 'completed' | 'archived' | 'rejected'
  visibility: 'listed' | 'unlisted'
  departments: string[]
}

type MembershipQueryRow = {
  id?: unknown
  class_id?: unknown
  role?: unknown
  is_active?: unknown
  status?: unknown
  department_id?: unknown
  class_departments?: { id?: unknown; name?: unknown } | null
  academy_classes?: {
    id?: unknown
    class_name?: unknown
    start_date?: string | null
    end_date?: string | null
    status?: unknown
    academies?: { name?: unknown; city?: unknown; state?: unknown } | null
  } | null
}

export function inviteBaseUrl() {
  return String(import.meta.env.VITE_INVITE_BASE_URL || 'https://join.180.academy').replace(/\/+$/, '')
}

export function formatInviteUrl(code: string) {
  return buildInviteUrl(code, inviteBaseUrl())
}

function academyLocation(row: { city?: string | null; state?: string | null } | null | undefined) {
  return [row?.city, row?.state].map((value) => String(value || '').trim()).filter(Boolean).join(', ')
}

export async function loadClassMemberships(userId: string): Promise<ClassMembership[]> {
  if (!supabase || !userId) return []
  const { data, error } = await supabase
    .from('class_memberships')
    .select(`
      id,
      class_id,
      role,
      is_active,
      status,
      department_id,
      class_departments(id,name),
      academy_classes(id,class_name,start_date,end_date,status,academies(name,city,state))
    `)
    // Owners and class admins can read other members through RLS. This query
    // chooses the signed-in person's workspace, so it must remain personal.
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('joined_at', { ascending: false })

  if (error) throw error
  return ((data || []) as unknown[]).map((row) => {
    const value = row as MembershipQueryRow
    const classRow = value.academy_classes || {}
    const academy = classRow.academies || {}
    const department = value.class_departments || {}
    return {
      id: String(value.id),
      classId: String(value.class_id),
      className: String(classRow.class_name || 'Class'),
      academyName: String(academy.name || 'Academy'),
      academyLocation: academyLocation({
        city: typeof academy.city === 'string' ? academy.city : '',
        state: typeof academy.state === 'string' ? academy.state : '',
      }),
      role: (['cadet', 'moderator', 'class_admin'].includes(String(value.role)) ? String(value.role) : 'cadet') as ClassRole,
      isActive: Boolean(value.is_active),
      departmentId: value.department_id ? String(value.department_id) : null,
      departmentName: String(department.name || ''),
      startDate: classRow.start_date || null,
      endDate: classRow.end_date || null,
      status: String(classRow.status || 'active'),
    }
  })
}

export async function loadActiveClasses() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('academy_classes')
    .select('id,class_name,start_date,end_date,status,visibility,join_mode,academy_id,academies(name,city,state)')
    .eq('status', 'active')
    .eq('visibility', 'listed')
    .order('end_date', { ascending: true, nullsFirst: false })
  if (error) throw error
  return ((data || []) as AcademyClassRow[]).filter((row) =>
    shouldShowClassAsActive({
      status: row.status,
      visibility: row.visibility,
      endDate: row.end_date,
    }),
  )
}

export async function loadCreatedClasses() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('academy_classes')
    .select('id,class_name,start_date,end_date,status,visibility,join_mode,academy_id,academies(name,city,state)')
    .order('class_name', { ascending: true })
  if (error) throw error
  return (data || []) as AcademyClassRow[]
}

export async function loadClassDepartments(classId: string) {
  if (!supabase || !classId) return []
  const { data, error } = await supabase
    .from('class_departments')
    .select('id,class_id,name')
    .eq('class_id', classId)
    .order('name', { ascending: true })
  if (error) throw error
  return (data || []) as ClassDepartment[]
}

export async function addClassDepartment(classId: string, name: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const cleanName = name.trim()
  if (!classId || !cleanName) throw new Error('Enter a department name.')
  const { data, error } = await supabase.rpc('add_class_department', {
    p_class_id: classId,
    p_name: cleanName,
  })
  if (error) {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token || ''
    if (!token) throw error
    const response = await fetch('/api/classes/departments', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ classId, name: cleanName }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(String(payload?.error || error.message || 'Could not add class agency.'))
    }
    return String(payload?.departmentId || '')
  }
  return String(data || '')
}

export async function renameClassDepartment(departmentId: string, name: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const cleanName = name.trim()
  if (!departmentId || !cleanName) throw new Error('Enter a department name.')
  const { error } = await supabase.rpc('rename_class_department', {
    p_department_id: departmentId,
    p_name: cleanName,
  })
  if (error) throw error
}

export async function deleteClassDepartment(departmentId: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  if (!departmentId) throw new Error('Choose a department.')
  const { error } = await supabase.rpc('delete_class_department', {
    p_department_id: departmentId,
  })
  if (error) {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token || ''
    if (!token) throw error
    const response = await fetch('/api/classes/departments', {
      method: 'DELETE',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ departmentId }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(String(payload?.error || error.message || 'Could not delete class agency.'))
    }
  }
}

export async function createClassJoinCode(classId: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  if (!classId) throw new Error('Choose a class.')
  const session = await supabase.auth.getSession()
  const token = session.data.session?.access_token || ''
  if (!token) throw new Error('Sign in again to create a class code.')
  const response = await fetch('/api/classes/invites', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ classId }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(String(payload?.error || 'Could not create class code.'))
  return String(payload?.code || '')
}

export async function updateOwnClassDepartment(classId: string, departmentId: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  if (!classId || !departmentId) throw new Error('Choose a department.')
  const { error } = await supabase.rpc('update_own_class_department', {
    p_class_id: classId,
    p_department_id: departmentId,
  })
  if (error) throw new Error(error.message || 'Could not update your class agency.')
}

export async function submitClassCreationRequest(input: ClassCreationRequestInput) {
  const result = await classRequestAction('/api/class-requests', input)
  return String(result.requestId || '')
}

async function classRequestAction(url: string, body: object) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sign in to continue.')
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.ok) throw new Error(String(payload?.error || 'The class service is unavailable. Your details are still here; please try again.'))
  return payload as { requestId?: string; classId?: string; inviteCode?: string }
}

export async function loadOwnClassCreationRequests() {
  if (!supabase) return []
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!authData.user) return []
  const { data, error } = await supabase.from('class_creation_requests').select('*')
    .eq('requester_user_id', authData.user.id).order('created_at', { ascending: false }).limit(20)
  if (error) throw error
  return (data || []) as ClassCreationRequest[]
}

export async function notifyDiscordForClassRequest(requestId: string) {
  if (!requestId || !supabase) return
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token || ''
  await fetch('/api/class-requests/notify-discord', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ requestId }),
  }).catch(() => {})
}

export async function loadOwnerClassCreationRequests() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('class_creation_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data || []) as ClassCreationRequest[]
}

export async function approveClassCreationRequest(requestId: string) {
  return classRequestAction('/api/class-requests/approve', { requestId })
}

export async function rejectClassCreationRequest(requestId: string, reason = '') {
  await classRequestAction('/api/class-requests/reject', { requestId, reason })
}

export async function acceptInvite(code: string, departmentId?: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const normalized = normalizeInviteCode(code)
  if (!normalized) throw new Error('Enter a valid invite code.')
  const { data, error } = await supabase.rpc('accept_class_invite', {
    p_code: normalized,
    p_department_id: departmentId || null,
  })
  if (error) throw error
  return String(data || '')
}

export async function lookupInvite(code: string): Promise<ClassInvitePreview> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const normalized = normalizeInviteCode(code)
  if (!normalized) throw new Error('Enter a valid invite code.')
  const { data, error } = await supabase.rpc('lookup_class_invite', { p_code: normalized })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('Invite not found.')
  return {
    classId: String(row.class_id || ''),
    className: String(row.class_name || 'Class'),
    academyName: String(row.academy_name || 'Academy'),
    academyLocation: academyLocation({
      city: typeof row.academy_city === 'string' ? row.academy_city : '',
      state: typeof row.academy_state === 'string' ? row.academy_state : '',
    }),
    startDate: row.start_date || null,
    endDate: row.end_date || null,
    roleGranted: (['cadet', 'moderator', 'class_admin'].includes(String(row.role_granted)) ? String(row.role_granted) : 'cadet') as ClassRole,
    departmentId: row.department_id ? String(row.department_id) : null,
    departmentName: String(row.department_name || ''),
    expiresAt: row.expires_at || null,
    maxUses: typeof row.max_uses === 'number' ? row.max_uses : null,
    useCount: typeof row.use_count === 'number' ? row.use_count : Number(row.use_count || 0),
  }
}

export async function createClassInvite(classId: string, role: ClassRole = 'cadet') {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('create_class_invite', {
    p_class_id: classId,
    p_role: role,
    p_department_id: null,
    p_max_uses: null,
    p_expires_at: null,
  })
  if (error) throw error
  return String(data || '')
}

export async function joinClassDirectly(classId: string, departmentId: string | null) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('join_class_directly', {
    p_class_id: classId,
    p_department_id: departmentId,
  })
  if (error) throw error
  return String(data || '')
}

export async function requestToJoinClass(classId: string, departmentId: string | null, note = '') {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('request_to_join_class', {
    p_class_id: classId,
    p_department_id: departmentId,
    p_note: note,
  })
  if (error) throw error
  return String(data || '')
}

export async function loadClassJoinRequests(classId: string) {
  if (!supabase || !classId) return []
  const { data, error } = await supabase
    .from('class_join_requests')
    .select('id,class_id,user_id,department_id,note,status,created_at,class_departments(name)')
    .eq('class_id', classId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data || []) as ClassJoinRequest[]
}

export async function approveJoinRequest(requestId: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.rpc('approve_class_join_request', { p_request_id: requestId })
  if (error) throw error
}

export async function denyJoinRequest(requestId: string, reason = '') {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.rpc('deny_class_join_request', { p_request_id: requestId, p_reason: reason })
  if (error) throw error
}

export async function updateClassJoinMode(classId: string, joinMode: 'open' | 'approval_required') {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.rpc('update_class_join_mode', {
    p_class_id: classId,
    p_join_mode: joinMode,
  })
  if (error) throw error
}

export async function setActiveClass(classId: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.rpc('set_active_class', { p_class_id: classId })
  if (error) throw error
}

export async function ownerCreateClass(input: OwnerCreateClassInput) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const cleanClassName = input.className.trim()
  if (!cleanClassName) throw new Error('Enter a class name.')
  const { data, error } = await supabase.rpc('owner_create_class', {
    p_payload: {
      academyName: input.academyName.trim() || 'Police Academy 180',
      academyCity: input.academyCity.trim(),
      academyState: input.academyState.trim() || 'CA',
      className: cleanClassName,
      startDate: input.startDate,
      endDate: input.endDate,
      joinMode: input.joinMode,
      departments: input.departments.map((department) => department.trim()).filter(Boolean),
    },
  })
  if (error) throw error
  return String(data || '')
}

export async function ownerUpdateClass(input: OwnerUpdateClassInput) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const cleanClassName = input.className.trim()
  if (!input.classId) throw new Error('Choose a class.')
  if (!cleanClassName) throw new Error('Enter a class name.')
  const { error } = await supabase.rpc('owner_update_class', {
    p_class_id: input.classId,
    p_payload: {
      className: cleanClassName,
      startDate: input.startDate,
      endDate: input.endDate,
      joinMode: input.joinMode,
      status: input.status,
      visibility: input.visibility,
      departments: input.departments.map((department) => department.trim()).filter(Boolean),
    },
  })
  if (error) throw error
}

export async function ownerListClassMembers(classId: string): Promise<OwnerClassMember[]> {
  if (!supabase || !classId) return []
  const { data, error } = await supabase.rpc('owner_list_class_members', { p_class_id: classId })
  if (error) throw error
  return ((data || []) as unknown[]).map((row) => {
    const value = row as Record<string, unknown>
    const role = String(value.role || 'cadet')
    return {
      membershipId: String(value.membership_id || ''),
      userId: String(value.user_id || ''),
      email: String(value.email || ''),
      username: String(value.username || ''),
      avatarPath: String(value.avatar_path || ''),
      departmentId: value.department_id ? String(value.department_id) : null,
      departmentName: String(value.department_name || ''),
      role: (['cadet', 'moderator', 'class_admin'].includes(role) ? role : 'cadet') as ClassRole,
      isActive: Boolean(value.is_active),
      status: String(value.status || ''),
      joinedAt: String(value.joined_at || ''),
      timeoutUntil: value.timeout_until ? String(value.timeout_until) : null,
    }
  })
}

export async function ownerSetClassMemberRole(membershipId: string, role: ClassRole) {
  if (!supabase) throw new Error('Supabase is not configured.')
  if (!membershipId) throw new Error('Choose a member.')
  const { error } = await supabase.rpc('owner_set_class_member_role', {
    p_membership_id: membershipId,
    p_role: role,
  })
  if (error) throw error
}

export async function ownerRemoveClassMember(membershipId: string, reason = '') {
  if (!supabase) throw new Error('Supabase is not configured.')
  if (!membershipId) throw new Error('Choose a member.')
  const { error } = await supabase.rpc('owner_remove_class_member', {
    p_membership_id: membershipId,
    p_reason: reason,
  })
  if (error) throw error
}

export async function ownerTimeoutClassMember(classId: string, userId: string, minutes: number, reason = '') {
  if (!supabase) throw new Error('Supabase is not configured.')
  if (!classId || !userId) throw new Error('Choose a member.')
  const safeMinutes = Number.isFinite(minutes) ? Math.max(1, Math.min(10080, Math.round(minutes))) : 10
  const { data, error } = await supabase.rpc('owner_timeout_class_member', {
    p_class_id: classId,
    p_user_id: userId,
    p_minutes: safeMinutes,
    p_reason: reason,
  })
  if (error) throw error
  return String(data || '')
}
