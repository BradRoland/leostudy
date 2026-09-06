// Opt-in integration test: official Stripe CLI sandbox + disposable clone users.
// Does not enable Stripe in the public preview or read/export CLI OAuth credentials.
import assert from 'node:assert/strict'
import http from 'node:http'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import Stripe from 'stripe'
import { parse } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { createCheckoutFulfillment, createTierResolver, handleStripeEvent } from './stripe-tier-service.mjs'

const run = promisify(execFile)
const cli = process.env.STRIPE_TEST_CLI
const configPath = process.env.STRIPE_TEST_CLI_CONFIG
assert.ok(cli && configPath, 'Set an authorized sandbox CLI path and isolated config path')
const sandbox = JSON.parse(await readFile(new URL('../.env.stripe-sandbox.local.json', import.meta.url)))
assert.equal(sandbox.livemode, false)
const config = await readFile(configPath, 'utf8')
assert.equal(config.match(/^account_id\s*=\s*['"]([^'"]+)['"]/m)?.[1], sandbox.stripeAccount, 'CLI must select the retained sandbox')
const base = ['--config', configPath, '--project-name', 'academy-payment-test', '--color', 'off']
async function command(args) {
  assert.ok(!args.includes('--live'))
  return (await run(cli, [...base, ...args], { timeout: 90000, maxBuffer: 2 ** 20 })).stdout
}
async function json(args) { return JSON.parse(await command(args)) }
const env = parse(await readFile(new URL('../.env.staging.local', import.meta.url)))
assert.equal(env.SUPABASE_URL, 'http://127.0.0.1:55431')
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const check = ({ data, error }) => { assert.ifError(error); return data }
const users = []
const temporaryPrices = []
const receipts = []
const errors = []
let listener, server, secret, listenerOutput = ''
const temporary = await mkdtemp(join(tmpdir(), 'academy-sandbox-'))
const stripe = new Stripe('sk_test_signature_verification_only')
const retrieveSession = id => json(['checkout', 'sessions', 'retrieve', id, '--expand', 'line_items.data.price'])
const priceToTier = new Map(Object.entries(sandbox.tiers).map(([tier, item]) => [item.price, tier]))
const { resolveTierFromSession } = createTierResolver({
  priceToTier,
  paymentLinkToTier: new Map(Object.entries(sandbox.tiers).map(([tier, item]) => [item.paymentLink, tier])),
  retrieveSession,
})
const fulfill = createCheckoutFulfillment({ retrieveSession, resolveTierFromSession, expectedLivemode: false,
  grantCheckout: async ({ sessionId, userId, tier, livemode }) => check(await admin.rpc('fulfill_supporter_checkout', {
    p_session_id: sessionId, p_user_id: userId, p_tier: tier, p_livemode: livemode,
  })),
})
async function waitFor(fn, description, timeout = 60000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const result = await fn()
    if (result) return result
    if (errors.length) throw errors[0]
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`Timed out: ${description}`)
}
async function createUser() {
  const id = check(await admin.auth.admin.createUser({ email: `stripe-test-${randomUUID()}@example.invalid`, password: `Test!${randomUUID()}`, email_confirm: true })).user.id
  users.push(id)
  check(await admin.from('profiles').insert({ user_id: id, username: `StripeTest ${randomUUID()}`, supporter_tier: 'free' }))
  return id
}
async function tier(id) { return check(await admin.from('profiles').select('supporter_tier').eq('user_id', id).single()).supporter_tier }
async function trigger(userId, level, token = 'tok_visa', sepaPrice) {
  // Same sequence as Stripe CLI v1.50.10's checkout.session.completed fixture.
  // Structured parameters avoid ambiguous merges of nested --override fields.
  const fixture = { _meta: { template_version: 0 }, fixtures: [
    { name: 'checkout_session', path: '/v1/checkout/sessions', method: 'post', params: {
      mode: 'payment', client_reference_id: userId,
      success_url: 'https://dev.180.academy/support', cancel_url: 'https://dev.180.academy/support',
      line_items: [{ price: sepaPrice || sandbox.tiers[level].price, quantity: 1 }],
      ...(sepaPrice ? { payment_method_types: ['sepa_debit'], payment_intent_data: { setup_future_usage: 'off_session' } } : {}),
    } },
    { name: 'payment_page', path: '/v1/payment_pages/${checkout_session:id}', method: 'get' },
    { name: 'payment_method', path: '/v1/payment_methods', method: 'post', params: {
      ...(sepaPrice ? { type: 'sepa_debit', sepa_debit: { iban: token } } : { type: 'card', card: { token } }),
      billing_details: { email: 'stripe@example.com', name: 'Academy Sandbox Test', address: { line1: '71 Crown Street', city: 'London', postal_code: 'W10 2WB', country: 'GB' } },
    } },
    { name: 'payment_page_confirm', path: '/v1/payment_pages/${checkout_session:id}/confirm', method: 'post', params: {
      payment_method: '${payment_method:id}', expected_amount: Number(level.slice(4)) * 100,
    } },
  ] }
  return command(['trigger', 'checkout.session.completed', '--raw', JSON.stringify(fixture)])
}
try {
  for (const item of Object.values(sandbox.tiers)) assert.equal((await json(['prices', 'retrieve', item.price])).livemode, false)
  server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/stripe/webhook') { res.writeHead(404).end(); return }
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = Buffer.concat(chunks), signature = req.headers['stripe-signature']
    let event
    try { event = stripe.webhooks.constructEvent(body, signature, secret) }
    catch { res.writeHead(400).end(); return }
    try {
      const result = await handleStripeEvent(event, fulfill)
      receipts.push({ event, result, body, signature })
      res.writeHead(200).end('ok')
    } catch (error) { errors.push(error); res.writeHead(500).end('failed') }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const endpoint = `http://127.0.0.1:${server.address().port}/stripe/webhook`
  listener = spawn(cli, [...base, 'listen', '--events', 'checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed', '--forward-to', endpoint], { stdio: ['ignore', 'pipe', 'pipe'] })
  listener.on('error', error => errors.push(error))
  const collect = chunk => { listenerOutput += chunk.toString(); secret = listenerOutput.match(/whsec_[A-Za-z0-9]+/)?.[0] }
  listener.stdout.on('data', collect)
  listener.stderr.on('data', collect)
  await waitFor(() => secret, 'Stripe listener authorization')
  assert.equal((await fetch(endpoint, { method: 'POST', body: '{}' })).status, 400)
  assert.equal((await fetch(endpoint, { method: 'POST', headers: { 'stripe-signature': 'invalid' }, body: '{}' })).status, 400)
  console.log('PASS: sandbox catalog confirmed; signed-event listener rejects missing and invalid signatures.')
  const userId = await createUser()
  for (const level of ['tier2', 'tier5', 'tier10']) {
    await trigger(userId, level)
    await waitFor(async () => await tier(userId) === level, `${level} automatic grant`)
    const receipt = receipts.find(r => r.event.data.object.client_reference_id === userId && r.result.tier === level)
    assert.ok(receipt?.result.applied, 'actual Stripe-signed event must cause the grant')
    const before = receipts.length
    assert.equal((await fetch(endpoint, { method: 'POST', headers: { 'stripe-signature': receipt.signature }, body: receipt.body })).status, 200)
    assert.equal(receipts[before].result.duplicate, true)
    console.log(`PASS: genuine sandbox ${level} checkout automatically grants access; signed replay is idempotent.`)
  }
  const unpaidUser = await createUser()
  const open = await json(['checkout', 'sessions', 'create', '--mode', 'payment', '--client-reference-id', unpaidUser,
    '--success-url', 'https://dev.180.academy/support', '-d', `line_items[0][price]=${sandbox.tiers.tier2.price}`, '-d', 'line_items[0][quantity]=1'])
  assert.equal(open.livemode, false)
  assert.equal((await fulfill(open)).reason, 'payment_not_paid')
  assert.equal(await tier(unpaidUser), 'free')
  await command(['checkout', 'sessions', 'expire', open.id])
  assert.equal((await fulfill(open)).reason, 'payment_not_paid')
  assert.equal(await tier(unpaidUser), 'free')
  console.log('PASS: actual unpaid and expired Stripe sessions cannot grant access.')
  let declined = false
  try { await trigger(unpaidUser, 'tier2', 'tok_chargeDeclined') }
  catch (error) { declined = /card_declined|card was declined/i.test(`${error.stdout || ''} ${error.stderr || ''}`); if (!declined) throw error }
  assert.equal(declined, true)
  assert.equal(await tier(unpaidUser), 'free')
  console.log('PASS: Stripe declines the test card and the academy account remains free.')
  if (process.env.STRIPE_TEST_ASYNC === '1') {
    // Official CLI async fixtures use SEPA/EUR. This price is mapped only here.
    const original = await json(['prices', 'retrieve', sandbox.tiers.tier2.price])
    const price = await json(['prices', 'create', '--currency', 'eur', '--unit-amount', '200', '--product', original.product,
      '-d', 'metadata[purpose]=academy-delayed-payment-test'])
    assert.equal(price.livemode, false)
    temporaryPrices.push(price.id)
    priceToTier.set(price.id, 'tier2')
    for (const [expectedEvent, iban] of [
      ['checkout.session.async_payment_succeeded', 'AT611904300234573201'],
      ['checkout.session.async_payment_failed', 'IT60X0542811101000000123456'],
    ]) {
      const delayedUser = await createUser()
      await trigger(delayedUser, 'tier2', iban, price.id)
      const completion = await waitFor(() => receipts.find(r => r.event.type === 'checkout.session.completed' && r.event.data.object.client_reference_id === delayedUser), 'unpaid completion')
      assert.equal(completion.result.applied, false)
      assert.equal(completion.result.reason, 'payment_not_paid')
      const outcome = await waitFor(() => receipts.find(r => r.event.type === expectedEvent && r.event.data.object.client_reference_id === delayedUser), expectedEvent, 240000)
      assert.equal(await tier(delayedUser), expectedEvent.endsWith('succeeded') ? 'tier2' : 'free')
      assert.equal(outcome.result.applied, expectedEvent.endsWith('succeeded'))
      console.log(`PASS: genuine ${expectedEvent} reconciles access correctly after unpaid completion.`)
    }
  }
  assert.equal(errors.length, 0)
  console.log('PASS: actual Stripe sandbox payment events and authoritative session reads verified against disposable clone accounts. Hosted Checkout browser interaction and tax are separate checks.')
} finally {
  listener?.kill('SIGTERM')
  await new Promise(resolve => server ? server.close(resolve) : resolve())
  for (const id of users) check(await admin.auth.admin.deleteUser(id))
  for (const id of temporaryPrices) await command(['prices', 'update', id, '--active=false'])
  // Listener logs can contain a signing secret; keep them only on a failed run.
  if (errors.length) await writeFile(join(temporary, 'listener.private.log'), listenerOutput, { mode: 0o600 })
  else await rm(temporary, { recursive: true, force: true })
}
