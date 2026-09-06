// Disposable fixtures only. Never run this against production.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { parse } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { createCheckoutFulfillment } from './stripe-tier-service.mjs'
const env = parse(await readFile(new URL('../.env.staging.local', import.meta.url)))
assert.equal(env.SUPABASE_URL, 'http://127.0.0.1:55431')
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const user = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const check = ({ data, error }) => { assert.ifError(error); return data }
let id
try {
  const email = `support-audit-${randomUUID()}@example.invalid`, password = `Test!${randomUUID()}`
  id = check(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user.id
  check(await user.auth.signInWithPassword({ email, password }))
  assert.ok((await user.from('profiles').upsert({ user_id: id, supporter_tier: 'tier10' })).error, 'forged paid insertion must fail')
  check(await user.from('profiles').upsert({ user_id: id, username: `SupportAudit ${randomUUID()}`, avatar_path: '', bio: '', agency: '' }, { onConflict: 'user_id' }).select('supporter_tier').single())
  const tier = async () => check(await admin.from('profiles').select('supporter_tier').eq('user_id', id).single()).supporter_tier
  assert.equal(await tier(), 'free')
  assert.ok((await user.from('profiles').update({ supporter_tier: 'tier10' }).eq('user_id', id)).error, 'self-upgrade must fail')
  const args = { p_session_id: `cs_test_${randomUUID()}`, p_user_id: id, p_tier: 'tier5', p_livemode: false }
  assert.ok((await user.rpc('fulfill_supporter_checkout', args)).error, 'client must not invoke paid grants')
  assert.equal(await tier(), 'free')
  const grantCheckout = async ({ sessionId, userId, tier, livemode }) => check(await admin.rpc('fulfill_supporter_checkout', { p_session_id: sessionId, p_user_id: userId, p_tier: tier, p_livemode: livemode }))
  const session = { id: args.p_session_id, status: 'complete', payment_status: 'unpaid', mode: 'payment', livemode: false, client_reference_id: id }
  const fulfill = createCheckoutFulfillment({ retrieveSession: async () => session, resolveTierFromSession: async () => 'tier5', expectedLivemode: false, grantCheckout })
  assert.equal((await fulfill(session)).applied, false)
  assert.equal(await tier(), 'free')
  session.payment_status = 'paid'
  const concurrent = await Promise.all(Array.from({ length: 6 }, () => fulfill(session)))
  assert.equal(concurrent.filter(r => r.applied).length, 1)
  assert.equal(concurrent.filter(r => r.duplicate).length, 5)
  assert.equal(await tier(), 'tier5')
  check(await user.from('profiles').upsert({ user_id: id, bio: 'Profile changed after payment', avatar_path: '' }, { onConflict: 'user_id' }))
  assert.equal(await tier(), 'tier5', 'profile save preserves paid access')
  check(await admin.rpc('fulfill_supporter_checkout', { ...args, p_session_id: `cs_test_${randomUUID()}`, p_tier: 'tier10' }))
  check(await admin.rpc('fulfill_supporter_checkout', { ...args, p_session_id: `cs_test_${randomUUID()}`, p_tier: 'tier2' }))
  assert.equal(await tier(), 'tier10', 'late lower purchase does not downgrade')
  assert.ok((await admin.rpc('fulfill_supporter_checkout', { ...args, p_tier: 'tier2' })).error, 'same session cannot be reinterpreted')
  const retryId = `cs_test_${randomUUID()}`
  assert.ok((await admin.rpc('fulfill_supporter_checkout', { ...args, p_session_id: retryId, p_user_id: randomUUID() })).error)
  check(await admin.rpc('fulfill_supporter_checkout', { ...args, p_session_id: retryId }))
  console.log('PASS: isolated clone denies forged access; paid fulfillment, concurrent retries, profile preservation, upgrade ordering, conflict protection and failed-grant retry work.')
} finally {
  await user.auth.signOut()
  if (id) check(await admin.auth.admin.deleteUser(id))
}
