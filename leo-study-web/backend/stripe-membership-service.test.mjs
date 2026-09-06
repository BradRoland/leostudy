import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSubscriptionSnapshot, createMembershipReconciler, dispatchMembershipEvent } from './stripe-membership-service.mjs'

const priceToTier = new Map([['price_plus','tier5'],['price_pro','tier10']])
const fixture = () => ({ id: 'sub_academy', customer: 'cus_academy', livemode: false, status: 'active', cancel_at_period_end: false,
  metadata: { academy_user_id: 'academy-user' }, items: { data: [{ quantity: 1, current_period_end: 1800000000,
    price: { id: 'price_plus', recurring: { interval: 'month', interval_count: 1 } } }] },
  latest_invoice: { id: 'in_academy', livemode: false, status: 'paid', parent: { subscription_details: { subscription: 'sub_academy' } },
    lines: { data: [{ amount: 500, period: { end: 1800000000 }, pricing: { price_details: { price: 'price_plus' } } }] } },
})
const options = { userId: 'academy-user', sequence: 8, priceToTier, expectedLivemode: false }
test('paid monthly invoice establishes a dated Plus entitlement', () => {
  const snapshot = buildSubscriptionSnapshot(fixture(), options)
  assert.equal(snapshot.paid_tier, 'tier5')
  assert.equal(Date.parse(snapshot.paid_through), 1800000000000)
  assert.equal(snapshot.sync_sequence, 8)
})
test('scheduled cancellation preserves paid-through time', () => {
  const sub = fixture(); sub.cancel_at_period_end = true
  const snapshot = buildSubscriptionSnapshot(sub, options)
  assert.equal(snapshot.cancel_at_period_end, true)
  assert.ok(snapshot.paid_through)
})
test('failed or incomplete invoices never extend paid access', () => {
  for (const status of ['open','draft','uncollectible','void']) {
    const sub = fixture(); sub.latest_invoice.status = status
    const snapshot = buildSubscriptionSnapshot(sub, options)
    assert.equal(snapshot.paid_through, null)
    assert.equal(snapshot.paid_tier, null)
  }
})
test('an unpaid upgrade does not grant Pro based on the selected price alone', () => {
  const sub = fixture(); sub.items.data[0].price.id = 'price_pro'; sub.latest_invoice.status = 'open'
  const snapshot = buildSubscriptionSnapshot(sub, options)
  assert.equal(snapshot.tier, 'tier10'); assert.equal(snapshot.paid_tier, null)
})
test('wrong mode, invoice ownership and unsupported billing periods fail closed', () => {
  const wrongMode = fixture(); wrongMode.livemode = true
  assert.throws(() => buildSubscriptionSnapshot(wrongMode, options), /environment/)
  const wrongInvoice = fixture(); wrongInvoice.latest_invoice.parent.subscription_details.subscription = 'sub_other'
  assert.throws(() => buildSubscriptionSnapshot(wrongInvoice, options), /match/)
  const annual = fixture(); annual.items.data[0].price.recurring.interval = 'year'
  assert.throws(() => buildSubscriptionSnapshot(annual, options), /monthly/)
  const quantity = fixture(); quantity.items.data[0].quantity = 2
  assert.throws(() => buildSubscriptionSnapshot(quantity, options), /items/)
})
test('unrelated catalog products are ignored', () => {
  const sub = fixture(); sub.items.data[0].price.id = 'price_other'
  assert.equal(buildSubscriptionSnapshot(sub, options), null)
})
test('reconciliation reserves ordering before fetching Stripe and verifies billing ownership', async () => {
  const order = []
  const reconcile = createMembershipReconciler({ priceToTier, expectedLivemode: false,
    nextSequence: async () => { order.push('sequence'); return 7 },
    retrieveSubscription: async () => { order.push('read'); return fixture() },
    findCustomer: async () => ({ user_id: 'academy-user', livemode: false }),
    saveSnapshot: async snapshot => { order.push('save'); assert.equal(snapshot.sync_sequence, 7); return { applied: true } },
  })
  assert.equal((await reconcile('sub_academy')).applied, true)
  assert.deepEqual(order, ['sequence','read','save'])
})
test('a mismatched billing account cannot receive a subscription', async () => {
  const reconcile = createMembershipReconciler({ priceToTier, expectedLivemode: false,
    nextSequence: async () => 1, retrieveSubscription: async () => fixture(),
    findCustomer: async () => ({ user_id: 'another-user', livemode: false }), saveSnapshot: async () => assert.fail('must not grant'),
  })
  await assert.rejects(reconcile('sub_academy'), /account mismatch/)
})
test('checkout, renewal and cancellation events reconcile authoritative subscription state', async () => {
  const reconciled = []
  const service = { retrieveCheckout: async () => ({ mode: 'subscription', subscription: 'sub_academy' }),
    retrieveInvoice: async () => fixture().latest_invoice, reconcile: async id => reconciled.push(id), legacyCheckout: async () => assert.fail('subscription must not get lifetime grant') }
  for (const type of ['checkout.session.completed','checkout.session.async_payment_succeeded','invoice.paid','invoice.payment_failed','customer.subscription.updated','customer.subscription.deleted']) {
    await dispatchMembershipEvent({ type, data: { object: { id: type.startsWith('customer.') ? 'sub_academy' : 'object' } } }, service)
  }
  assert.deepEqual(reconciled, Array(6).fill('sub_academy'))
})
test('old one-time checkout continues through the legacy fulfillment path', async () => {
  let legacy = false
  await dispatchMembershipEvent({ type: 'checkout.session.completed', data: { object: { id: 'cs_old' } } }, {
    retrieveCheckout: async () => ({ id: 'cs_old', mode: 'payment' }), legacyCheckout: async () => { legacy = true },
  })
  assert.equal(legacy, true)
})
test('unrelated invoice events are ignored and processing errors remain retryable', async () => {
  assert.deepEqual(await dispatchMembershipEvent({ type: 'invoice.paid', data: { object: { id: 'in_other' } } }, { retrieveInvoice: async () => ({}) }), { ignored: true })
  await assert.rejects(dispatchMembershipEvent({ type: 'customer.subscription.updated', data: { object: { id: 'sub_academy' } } }, { reconcile: async () => { throw new Error('Database unavailable') } }), /Database unavailable/)
})
