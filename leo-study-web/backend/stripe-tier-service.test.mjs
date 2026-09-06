import assert from 'node:assert/strict'
import test from 'node:test'
import { createTierResolver } from './stripe-tier-service.mjs'

test('resolves tier from Payment Link id before fetching line items', async () => {
  const resolver = createTierResolver({
    paymentLinkToTier: new Map([['plink_tier5', 'tier5']]),
    retrieveSession: async () => {
      throw new Error('line items should not be fetched when payment link maps directly')
    },
  })

  const tier = await resolver.resolveTierFromSession({
    id: 'cs_test_123',
    payment_link: 'plink_tier5',
  })

  assert.equal(tier, 'tier5')
})

test('resolves tier from expanded checkout line item price id', async () => {
  const resolver = createTierResolver({
    priceToTier: new Map([['price_tier10', 'tier10']]),
    retrieveSession: async () => ({
      line_items: {
        data: [
          {
            price: { id: 'price_tier10', unit_amount: 1000 },
            amount_subtotal: 1000,
          },
        ],
      },
    }),
  })

  const tier = await resolver.resolveTierFromSession({
    id: 'cs_test_456',
  })

  assert.equal(tier, 'tier10')
})

const { createCheckoutFulfillment, handleStripeEvent } = await import('./stripe-tier-service.mjs')
const userId = '10000000-0000-4000-8000-000000000001'
function setup(overrides = {}) {
  const session = { id: 'cs_test_paid', status: 'complete', payment_status: 'paid', mode: 'payment', livemode: false, client_reference_id: userId, ...overrides }
  const grants = []
  const fulfill = createCheckoutFulfillment({
    retrieveSession: async () => session,
    resolveTierFromSession: async () => 'tier5', findUserByEmail: async () => ({ id: userId }),
    grantCheckout: async grant => { grants.push(grant); return { applied: true, tier: grant.tier } },
    expectedLivemode: false,
  })
  return { session, grants, fulfill }
}

test('fulfills a verified paid checkout with the right account and tier', async () => {
  const { grants, fulfill } = setup()
  assert.deepEqual(await fulfill({ id: 'cs_test_paid', client_reference_id: 'untrusted-event-field' }), { applied: true, tier: 'tier5' })
  assert.deepEqual(grants, [{ sessionId: 'cs_test_paid', userId, tier: 'tier5', livemode: false }])
})
for (const payment_status of ['unpaid', 'no_payment_required', undefined]) {
  test(`does not grant access for ${payment_status} payment`, async () => {
    const { fulfill, grants } = setup({ payment_status })
    assert.equal((await fulfill({ id: 'cs_test_paid' })).applied, false)
    assert.equal(grants.length, 0)
  })
}
test('accepts delayed payment success after an unpaid completion', async () => {
  const { session, grants, fulfill } = setup({ payment_status: 'unpaid' })
  await handleStripeEvent({ type: 'checkout.session.completed', data: { object: session } }, fulfill)
  assert.equal(grants.length, 0)
  session.payment_status = 'paid'
  await handleStripeEvent({ type: 'checkout.session.async_payment_succeeded', data: { object: session } }, fulfill)
  assert.equal(grants.length, 1)
})
test('ignores failed and unrelated events', async () => {
  for (const type of ['checkout.session.async_payment_failed', 'payment_intent.succeeded', 'charge.refunded']) {
    await handleStripeEvent({ type }, () => assert.fail('must not grant'))
  }
})
test('rejects wrong environment and recurring checkout', async () => {
  for (const change of [{ livemode: true }, { mode: 'subscription' }, { id: 'wrong_session' }]) {
    const { fulfill, grants } = setup(change)
    await assert.rejects(fulfill({ id: 'cs_test_paid' }))
    assert.equal(grants.length, 0)
  }
})
test('legacy email matching works; invalid reference cannot silently fall back to another account', async () => {
  const { fulfill, grants } = setup({ client_reference_id: '', customer_email: 'member@example.invalid' })
  await fulfill({ id: 'cs_test_paid' })
  assert.equal(grants[0].userId, userId)
  await assert.rejects(setup({ client_reference_id: 'invalid' }).fulfill({ id: 'cs_test_paid' }))
})
test('propagates database and missing-product failures so Stripe can retry', async () => {
  for (const missingProduct of [true, false]) {
    const fulfill = createCheckoutFulfillment({ retrieveSession: async () => setup().session,
      resolveTierFromSession: async () => missingProduct ? null : 'tier5', expectedLivemode: false,
      grantCheckout: async () => { throw new Error('database unavailable') },
    })
    await assert.rejects(fulfill({ id: 'cs_test_paid' }))
  }
})
test('unrelated products never become supporter purchases because of their amount, label or metadata', async () => {
  const resolver = createTierResolver({ retrieveSession: async () => ({ line_items: { data: [{ price: { id: 'unrelated', unit_amount: 1000 }, description: '$10 tier' }] } }) })
  assert.equal(await resolver.resolveTierFromSession({ id: 'cs_unrelated', metadata: { tier: 'tier10' }, amount_total: 1000 }), null)
})
test('handles expanded Payment Links', async () => {
  const resolver = createTierResolver({ paymentLinkToTier: new Map([['plink_2', 'tier2']]) })
  assert.equal(await resolver.resolveTierFromSession({ payment_link: { id: 'plink_2' } }), 'tier2')
})
test('Stripe signature verification rejects tampering before fulfillment', async () => {
  const Stripe = (await import('stripe')).default
  const stripe = new Stripe('sk_test_synthetic_only')
  const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: setup().session } })
  const secret = 'whsec_synthetic_unit_test'
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret })
  const { fulfill, grants } = setup()
  const event = stripe.webhooks.constructEvent(payload, signature, secret)
  await handleStripeEvent(event, fulfill)
  assert.equal(grants.length, 1)
  assert.throws(() => stripe.webhooks.constructEvent(payload + ' ', signature, secret))
  assert.throws(() => stripe.webhooks.constructEvent(payload, signature, 'whsec_wrong'))
})
