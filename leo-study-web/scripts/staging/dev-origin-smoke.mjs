// Private LAN origin acceptance before changing the development DNS route.
// Fixture administration stays on the retained localhost clone.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { parse } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const origin = 'http://192.168.1.1:55434'
const publicOrigin = 'https://dev.180.academy'
const env = parse(await readFile(new URL('../../.env.staging.local', import.meta.url)))
assert.equal(env.SUPABASE_URL, 'http://127.0.0.1:55431')
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options)
const anonymous = createClient(origin + '/supabase', env.VITE_SUPABASE_ANON_KEY, options)
const check = ({ data, error }) => { if (error) throw new Error(error.message || 'Test API failed'); return data }
const marker = randomUUID().slice(0, 8)
const email = `dev-origin-${marker}@example.invalid`
const password = `Dev-origin-${randomUUID()}!9`
const userIds = []
let userClient

try {
  for (const path of ['/signin', '/api/health', '/supabase/auth/v1/health']) assert.equal((await fetch(origin + path)).status, 200)
  for (const path of ['/api/stripe/webhook', '/stripe/webhook', '/api/class-requests/notify-discord', '/webhooks/source/github/events/manual', '/supabase/auth/v1/admin/users']) {
    assert.equal((await fetch(origin + path)).status, 404)
  }
  const publicClasses = check(await anonymous.from('academy_classes')
    .select('id,class_name,start_date,end_date,status,visibility,join_mode,academy_id,academies(name,city,state)')
    .eq('status', 'active').eq('visibility', 'listed').order('end_date', { ascending: true, nullsFirst: false }))
  assert.ok(publicClasses.length >= 2)
  const publicDepartments = check(await anonymous.from('class_departments').select('id,class_id,name').eq('class_id', publicClasses[0].id).order('name', { ascending: true }))
  assert.ok(publicDepartments.length > 0)
  const invite = await anonymous.rpc('lookup_class_invite', { p_code: `INVALID-${marker}` })
  assert.equal(invite.status, 400, 'Invalid invite must reach the validated lookup, not private REST')

  const headers = [
    {},
    { apikey: env.VITE_SUPABASE_ANON_KEY, authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` },
    { apikey: env.VITE_SUPABASE_ANON_KEY, authorization: 'Bearer invalid.token.value' },
  ]
  for (const table of ['profiles', 'app_state', 'user_roles']) {
    for (const header of headers) {
      const response = await fetch(`${origin}/supabase/rest/v1/${table}?select=user_id`, { headers: header })
      assert.ok([401, 403].includes(response.status), `${table} private request must be refused`)
    }
  }
  // Additional parameters or nested selections cannot turn public discovery
  // into a way around the private REST validation step.
  const discoveryUrl = new URL(origin + '/supabase/rest/v1/academy_classes')
  discoveryUrl.searchParams.set('select', 'id,class_name,start_date,end_date,status,visibility,join_mode,academy_id,academies(name,city,state)')
  discoveryUrl.searchParams.set('status', 'eq.active')
  discoveryUrl.searchParams.set('visibility', 'eq.listed')
  discoveryUrl.searchParams.set('order', 'end_date.asc.nullslast')
  discoveryUrl.searchParams.append('select', '*,class_memberships(*)')
  assert.ok([401, 403].includes((await fetch(discoveryUrl, { headers: headers[1] })).status))

  const user = check(await service.auth.admin.createUser({ email, password, email_confirm: true })).user
  userIds.push(user.id)
  check(await service.from('profiles').upsert({ user_id: user.id, username: `Dev Origin ${marker}` }))
  userClient = createClient(origin + '/supabase', env.VITE_SUPABASE_ANON_KEY, options)
  check(await userClient.auth.signInWithPassword({ email, password }))
  assert.equal(check(await userClient.from('profiles').select('user_id').eq('user_id', user.id).single()).user_id, user.id)
  const callback = publicOrigin + '/auth/callback?recovery=1'
  check(await userClient.auth.resetPasswordForEmail(email, { redirectTo: callback }))
  let message
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const inbox = await fetch('http://127.0.0.1:55432/api/v1/messages').then(response => response.json())
    message = inbox.messages.find(item => item.To?.some(recipient => recipient.Address === email))
    if (message) break
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  assert.ok(message, 'Recovery message must arrive in the local sink')
  const body = await fetch('http://127.0.0.1:55432/api/v1/message/' + message.ID).then(response => response.json())
  const action = new URL((body.HTML.match(/href="([^"]+)"/) || [])[1]?.replaceAll('&amp;', '&'))
  assert.equal(action.origin, publicOrigin)
  assert.equal(action.pathname, '/supabase/auth/v1/verify')
  assert.equal(action.searchParams.get('redirect_to'), callback)
  const verification = await fetch(origin + action.pathname + action.search, { redirect: 'manual' })
  assert.equal(verification.status, 303)
  const redirect = new URL(verification.headers.get('location'))
  assert.equal(redirect.origin, publicOrigin)
  assert.equal(redirect.pathname, '/auth/callback')
  assert.equal(redirect.searchParams.get('recovery'), '1')

  // Autoconfirm remains enabled as configured for the preview. Generate a
  // signup confirmation link to validate its configured path without changing
  // that behavior or sending outside the sink.
  const confirmation = check(await service.auth.admin.generateLink({ type: 'signup', email: `dev-confirm-${marker}@example.invalid`, password, options: { redirectTo: publicOrigin + '/auth/callback' } }))
  userIds.push(confirmation.user.id)
  const confirmationAction = new URL(confirmation.properties.action_link)
  assert.equal(confirmationAction.origin, publicOrigin)
  assert.equal(confirmationAction.pathname, '/supabase/auth/v1/verify')
  assert.equal(confirmationAction.searchParams.get('redirect_to'), publicOrigin + '/auth/callback')
  console.log('PASS: private origin static/Auth health, integration/admin denial, exact public discovery/invite shape, nine private REST denial cases, duplicate-query denial, authenticated own-profile read, actual recovery email+verification redirect, and confirmation URL configuration. No token or email body printed.')
} finally {
  if (userClient) await userClient.auth.signOut()
  for (const id of userIds) check(await service.auth.admin.deleteUser(id))
}
