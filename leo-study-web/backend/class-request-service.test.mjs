import assert from 'node:assert/strict'
import test from 'node:test'
import { createClassRequestService, validateClassRequest } from './class-request-service.mjs'
import { buildClassRequestEmail, createClassEmailTransport, createClassRequestEmailService, getClassEmailConfig } from './class-request-email-service.mjs'

const request = {
  academyName: 'Central Academy', academyCity: 'Oakland', academyState: 'CA', className: 'Class 183',
  departments: ['Oakland PD', 'Alameda SO'], requesterDepartment: 'Oakland PD', requesterNote: 'Evening class',
  startDate: '2026-09-06', endDate: '2027-05-01',
}
const requestId = 'a1111111-1111-4111-8111-111111111111'
const env = { CLASS_REQUEST_EMAIL_ENABLED: 'true', CLASS_REQUEST_EMAIL_FROM: 'Academy <mail@example.test>', CLASS_REQUEST_OWNER_EMAIL: 'owner@example.test', CLASS_REQUEST_APP_URL: 'https://test.example.test', RESEND_API_KEY: 'local-mocked-key' }
const event = { id: 'event-1', request_id: requestId, lock_token: 'lock-1', event_type: 'owner_review', first_attempt_at: '2026-09-06T00:00:00Z', payload: {
  academy_name: request.academyName, academy_city: request.academyCity, academy_state: request.academyState, class_name: request.className,
  start_date: request.startDate, end_date: request.endDate, departments: request.departments, requester_department: request.requesterDepartment,
  requester_name: 'Test Cadet', requester_email: 'cadet@example.test', requester_note: request.requesterNote,
} }

function serviceFixture({ owner = false, authenticated = true } = {}) {
  const calls = []
  const roles = { select() { return this }, eq() { return this }, async limit() { return { data: owner ? [{ user_id: 'owner' }] : [], error: null } } }
  const service = createClassRequestService({
    supabase: { auth: { async getUser(token) { calls.push(['verify', token]); return { data: { user: authenticated ? { id: 'verified-user' } : null } } } }, from: () => roles },
    userClient(token) { return { async rpc(name, args) { calls.push([name, args, token]); return { data: name === 'request_class_creation' ? requestId : { classId: 'new-class' } } } } },
  })
  return { service, calls }
}

test('request validation rejects invalid dates and departments and normalizes valid input', () => {
  assert.throws(() => validateClassRequest({ ...request, endDate: '2027-02-30' }), /valid start/)
  assert.throws(() => validateClassRequest({ ...request, endDate: '2026-01-01' }), /on or after/)
  assert.throws(() => validateClassRequest({ ...request, departments: [] }), /departments/)
  assert.throws(() => validateClassRequest({ ...request, requesterDepartment: 'Outside department' }), /department list/)
  assert.deepEqual(validateClassRequest({ ...request, departments: ['Oakland PD ', 'oakland pd', 'Alameda SO'] }).departments, ['oakland pd', 'Alameda SO'])
})

test('unauthenticated submissions and forged owner approvals never reach RPCs', async () => {
  const { service, calls } = serviceFixture()
  assert.equal((await service({ action: 'submit', payload: request })).status, 401)
  assert.equal((await service({ token: 'cadet-token', action: 'approve', payload: { requestId } })).status, 403)
  assert.equal(calls.some(([name]) => name === 'owner_approve_class_creation_request'), false)
  const expired = serviceFixture({ authenticated: false })
  assert.equal((await expired.service({ token: 'expired', action: 'submit', payload: request })).status, 401)
})

test('submission and owner approval call database with verified user token, not service privileges', async () => {
  const { service, calls } = serviceFixture({ owner: true })
  const submitted = await service({ token: 'verified-token', action: 'submit', payload: request })
  assert.equal(submitted.body.requestId, requestId)
  assert.equal(submitted.body.notification, 'queued')
  assert.equal((await service({ token: 'verified-token', action: 'approve', payload: { requestId } })).body.classId, 'new-class')
  assert.equal(calls.at(-1)[0], 'owner_approve_class_creation_request')
  assert.equal(calls.at(-1)[2], 'verified-token')
})

test('database validation remains readable while infrastructure errors do not leak HTML', async () => {
  let failure = { code: 'P0001', message: 'Graduation date cannot be in the past' }
  const service = createClassRequestService({
    supabase: { auth: { async getUser() { return { data: { user: { id: 'cadet', user_metadata: { academy_onboarding_version: 1 } } } } } } },
    userClient: () => ({ async rpc() { return { error: failure } } }),
  })
  assert.match((await service({ token: 'token', action: 'submit', payload: request })).body.error, /Graduation date/)
  failure = { message: '<html>502 Bad Gateway</html>' }
  const unavailable = await service({ token: 'token', action: 'submit', payload: request })
  assert.equal(unavailable.status, 503)
  assert.doesNotMatch(unavailable.body.error, /html|502/)
})

test('owner review email contains all class information, escaped HTML, and authenticated review link', () => {
  const message = buildClassRequestEmail({ ...event, payload: { ...event.payload, requester_note: '<script>bad</script>' } }, getClassEmailConfig(env))
  assert.deepEqual(message.to, ['owner@example.test'])
  for (const value of ['Oakland PD', 'Alameda SO', '2026-09-06', '2027-05-01', 'Central Academy']) assert.ok(message.text.includes(value))
  assert.ok(message.html.includes('&lt;script&gt;'))
  assert.ok(!message.html.includes('<script>'))
  assert.ok(message.text.includes(`/owner/classes?request=${requestId}`))
  assert.ok(!message.text.includes('/approve?'))
})

test('approval mail goes to requester and a test override redirects all messages safely', () => {
  const approved = { ...event, event_type: 'request_approved' }
  const message = buildClassRequestEmail(approved, getClassEmailConfig(env))
  assert.deepEqual(message.to, ['cadet@example.test'])
  assert.match(message.text, /class administrator/)
  assert.match(message.text, /https:\/\/test\.example\.test\/signin/)
  assert.deepEqual(buildClassRequestEmail(approved, getClassEmailConfig({ ...env, CLASS_REQUEST_EMAIL_TEST_RECIPIENT: 'sink@example.test' })).to, ['sink@example.test'])
})

test('unconfigured or disabled delivery never claims or sends emails', async () => {
  const supabase = { rpc() { throw new Error('Should not be called') } }
  for (const values of [{}, { ...env, CLASS_REQUEST_EMAIL_ENABLED: 'false' }, { ...env, CLASS_REQUEST_APP_URL: 'javascript:bad' }]) {
    assert.equal((await createClassRequestEmailService({ supabase, env: values }).drain()).processed, 0)
  }
})

test('provider requests have stable idempotency key and transient failures are retryable', async () => {
  const requests = []
  const transport = createClassEmailTransport(getClassEmailConfig(env), { fetchImpl: async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => ({ id: 'sent-id' }) } } })
  await transport(event, buildClassRequestEmail(event, getClassEmailConfig(env)))
  assert.equal(requests[0].options.headers['idempotency-key'], 'class-request/event-1')
  const failed = createClassEmailTransport(getClassEmailConfig(env), { fetchImpl: async () => ({ ok: false, status: 429 }) })
  await assert.rejects(failed(event, {}), { retryable: true })
})

test('SMTP uncertain post-DATA failures require review; explicit temporary rejections can retry', async () => {
  const config = getClassEmailConfig({ ...env, CLASS_REQUEST_SMTP_HOST: 'localhost', CLASS_REQUEST_SMTP_REQUIRE_TLS: 'false' })
  const uncertain = createClassEmailTransport(config, { createTransport: () => ({ sendMail: async () => { throw Object.assign(new Error('lost connection'), { command: 'DATA', code: 'ETIMEDOUT' }) } }) })
  await assert.rejects(uncertain(event, {}), { retryable: false })
  const transient = createClassEmailTransport(config, { createTransport: () => ({ sendMail: async () => { throw Object.assign(new Error('temporary'), { command: 'DATA', responseCode: 451 }) } }) })
  await assert.rejects(transient(event, {}), { retryable: true })
})

test('queue acknowledges success, reschedules transient failure, and suppresses parallel local drains', async () => {
  const outcomes = []
  let claims = 0
  const service = createClassRequestEmailService({
    supabase: { async rpc(name, args) { if (name.startsWith('claim')) { claims++; return { data: [event, { ...event, id: 'event-2' }] } } outcomes.push(args); return { data: true } } },
    env, now: () => new Date('2026-09-06T01:00:00Z'), logger: { warn() {}, error() {} },
    async sendEmail(row) { if (row.id === 'event-2') throw Object.assign(new Error('temporarily down'), { retryable: true }); return 'provider-1' },
  })
  const [first, parallel] = await Promise.all([service.drain(), service.drain()])
  assert.equal(claims, 1)
  assert.equal(first.processed, 2)
  assert.equal(parallel.processed, 0)
  assert.equal(outcomes[0].p_outcome, 'sent')
  assert.equal(outcomes[0].p_lock_token, 'lock-1')
  assert.equal(outcomes[1].p_outcome, 'retry')
})

test('expired HTTPS idempotency window does not send again', async () => {
  const outcomes = []
  const service = createClassRequestEmailService({
    supabase: { async rpc(name, args) { if (name.startsWith('claim')) return { data: [event] }; outcomes.push(args); return { data: true } } },
    env, now: () => new Date('2026-09-08T00:00:00Z'), logger: { warn() {}, error() {} },
    sendEmail() { throw new Error('Should not send') },
  })
  await service.drain()
  assert.equal(outcomes[0].p_outcome, 'needs_review')
  assert.match(outcomes[0].p_error, /Idempotency window expired/)
})
