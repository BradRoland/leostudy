// Explicit integration check for the isolated local test stack. Never uses .env.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { parse } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const env = parse(await readFile(new URL('../.env.staging.local', import.meta.url)))
assert.equal(env.SUPABASE_URL, 'http://127.0.0.1:55431', 'Integration check requires the isolated localhost API')
assert.equal(env.SMTP_HOST || env.CLASS_REQUEST_SMTP_HOST, '127.0.0.1', 'Integration check requires the local mail sink')
const accounts = JSON.parse(await readFile(new URL('../.test-accounts.local', import.meta.url)))
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options)
const authClient = () => createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, options)
const suffix = randomUUID().slice(0, 8)
const className = `Workflow HTTP ${suffix}`
let requesterId
let requestId
let classId
let academyId

async function action(path, token, body, expected = 200) {
  const response = await fetch(`http://127.0.0.1:8789${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
  })
  const data = await response.json()
  assert.equal(response.status, expected, data.error || 'Unexpected API status')
  return data
}

try {
  const password = `Staging-only-${randomUUID()}!9`
  const email = `workflow-${suffix}@example.test`
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'Workflow Test Requester', custom_profile_field: 'preserve-me' } })
  assert.ifError(created.error)
  requesterId = created.data.user.id
  const requester = authClient()
  const signedIn = await requester.auth.signInWithPassword({ email, password })
  assert.ifError(signedIn.error)
  const token = signedIn.data.session.access_token
  const owner = authClient()
  const ownerSignIn = await owner.auth.signInWithPassword({ email: accounts.owner.email, password: accounts.owner.password })
  assert.ifError(ownerSignIn.error)
  const ownerToken = ownerSignIn.data.session.access_token
  const start = new Date()
  const end = new Date(start.getTime() + 180 * 86400_000)
  const details = {
    academyName: `Workflow Test Academy ${suffix}`, academyCity: 'Test City', academyState: 'CA', className,
    startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10),
    departments: ['Test Police', 'Test Sheriff'], requesterDepartment: 'Test Police', requesterNote: 'Isolated HTTP and SMTP acceptance check.',
  }
  await action('/api/class-requests', '', details, 401)
  await action('/api/class-requests', token, { ...details, endDate: '2026-02-30' }, 400)
  requestId = (await action('/api/class-requests', token, details)).requestId
  assert.ok(requestId)
  const requesterMetadata = await service.auth.admin.getUserById(requesterId)
  assert.ifError(requesterMetadata.error)
  assert.equal(requesterMetadata.data.user.user_metadata.academy_onboarding_version, 1)
  assert.equal(requesterMetadata.data.user.user_metadata.custom_profile_field, 'preserve-me')
  assert.equal((await action('/api/class-requests', token, details)).requestId, requestId)
  await action('/api/class-requests/approve', token, { requestId }, 403)
  const pendingMembership = await service.from('class_memberships').select('id').eq('user_id', requesterId)
  assert.equal(pendingMembership.data.length, 0, 'Pending request does not grant membership')
  classId = (await action('/api/class-requests/approve', ownerToken, { requestId })).classId
  assert.ok(classId)
  assert.equal((await action('/api/class-requests/approve', ownerToken, { requestId })).classId, classId)
  const member = await service.from('class_memberships').select('role,status,department_id').eq('class_id', classId).eq('user_id', requesterId).single()
  assert.ifError(member.error)
  assert.equal(member.data.role, 'class_admin')
  assert.equal(member.data.status, 'active')
  const classRow = await service.from('academy_classes').select('academy_id,status,visibility,join_mode').eq('id', classId).single()
  academyId = classRow.data.academy_id
  assert.equal(classRow.data.visibility, 'listed')
  assert.equal(classRow.data.join_mode, 'open')
  const departments = await service.from('class_departments').select('id,name').eq('class_id', classId)
  assert.equal(departments.data.length, 2)
  assert.equal(departments.data.find((department) => department.id === member.data.department_id).name, 'Test Police')
  let events = []
  for (let attempt = 0; attempt < 70; attempt++) {
    const queue = await service.from('class_request_email_outbox').select('event_type,status').eq('request_id', requestId)
    assert.ifError(queue.error)
    events = queue.data
    if (events.length === 2 && events.every((event) => event.status === 'sent')) break
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  assert.equal(events.length, 2)
  assert.ok(events.every((event) => event.status === 'sent'), `Email queue should complete: ${JSON.stringify(events)}`)
  const inbox = await fetch('http://127.0.0.1:55432/api/v1/messages').then((response) => response.json())
  const delivered = inbox.messages.filter((message) => message.Subject?.includes(className))
  assert.equal(delivered.length, 2, 'Exactly one owner review and one requester approval arrive in the local sink')
  const bodies = await Promise.all(delivered.map((message) => fetch(`http://127.0.0.1:55432/api/v1/message/${message.ID}`).then((response) => response.json())))
  assert.ok(bodies.some((message) => message.Text.includes(`/owner/classes?request=${requestId}`)))
  assert.ok(bodies.some((message) => message.Text.includes('/signin') && message.Text.includes('class administrator')))
  for (const message of bodies) {
    for (const value of ['Test Police', 'Test Sheriff', details.startDate, details.endDate]) assert.ok(message.Text.includes(value))
  }
  console.log('PASS: real HTTP authorization, validated request, owner approval, duplicate protection, class admin/department assignment, dynamic listing, and exactly two SMTP sink messages.')
} finally {
  if (requestId && !classId) {
    const saved = await service.from('class_creation_requests').select('created_class_id').eq('id', requestId).maybeSingle().throwOnError()
    classId = saved.data?.created_class_id
  }
  if (classId && !academyId) {
    const saved = await service.from('academy_classes').select('academy_id').eq('id', classId).maybeSingle().throwOnError()
    academyId = saved.data?.academy_id
  }
  if (requestId) await service.from('class_creation_requests').delete().eq('id', requestId).throwOnError()
  if (classId) await service.from('academy_classes').delete().eq('id', classId).throwOnError()
  if (academyId) await service.from('academies').delete().eq('id', academyId).throwOnError()
  if (requesterId) assert.ifError((await service.auth.admin.deleteUser(requesterId)).error)
}
