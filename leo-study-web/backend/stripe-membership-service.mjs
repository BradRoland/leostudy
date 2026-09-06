import { createHash, randomUUID } from 'node:crypto'

const objectId = value => typeof value === 'string' ? value : value?.id
const iso = seconds => Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null
const check = ({ data, error }) => { if (error) throw error; return data }
const subscriptionIdFromInvoice = invoice => objectId(invoice.parent?.subscription_details?.subscription || invoice.subscription)
const invoiceLinePrice = line => objectId(line.pricing?.price_details?.price || line.price)

export function buildSubscriptionSnapshot(subscription, { userId, sequence, priceToTier, expectedLivemode }) {
  if (subscription.livemode !== expectedLivemode) throw new Error('Subscription environment mismatch')
  const items = subscription.items?.data || []
  const item = items.find(row => priceToTier.has(objectId(row.price)))
  if (!item) return null // Unrelated products in the same Stripe account are ignored.
  if (items.length !== 1 || item.quantity !== 1) throw new Error('Unexpected academy subscription items')
  if (item.price?.recurring?.interval !== 'month' || item.price.recurring.interval_count !== 1) throw new Error('Academy membership must renew monthly')
  const invoice = subscription.latest_invoice
  let paidThrough = null, paidTier = null
  if (invoice && typeof invoice === 'object' && invoice.status === 'paid') {
    if (invoice.livemode !== expectedLivemode || subscriptionIdFromInvoice(invoice) !== subscription.id) throw new Error('Invoice does not match subscription')
    const line = (invoice.lines?.data || []).filter(row => invoiceLinePrice(row) === objectId(item.price) && row.amount >= 0 && Number.isFinite(row.period?.end)).sort((a,b) => b.period.end - a.period.end)[0]
    if (line) {
      paidThrough = iso(line.period?.end)
      paidTier = paidThrough ? priceToTier.get(invoiceLinePrice(line)) : null
    }
  }
  return {
    subscription_id: subscription.id, user_id: userId, customer_id: objectId(subscription.customer),
    price_id: objectId(item.price), tier: priceToTier.get(objectId(item.price)), status: subscription.status,
    paid_tier: paidTier, paid_through: paidThrough,
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end || subscription.cancel_at),
    current_period_end: iso(item.current_period_end || subscription.current_period_end),
    livemode: subscription.livemode, sync_sequence: sequence,
  }
}

export function createMembershipReconciler({ retrieveSubscription, nextSequence, findCustomer, saveSnapshot, priceToTier, expectedLivemode }) {
  return async function reconcile(subscriptionId) {
    // Reserve order before the remote read, so slower old reads cannot overwrite
    // a reconciliation that started later. The database rejects older sequences.
    const sequence = await nextSequence()
    const subscription = await retrieveSubscription(subscriptionId)
    if (subscription.id !== subscriptionId) throw new Error('Subscription identity mismatch')
    if (!(subscription.items?.data || []).some(item => priceToTier.has(objectId(item.price)))) return { ignored: true }
    const customer = await findCustomer(objectId(subscription.customer))
    if (!customer || customer.livemode !== expectedLivemode) throw new Error('Unknown academy billing customer')
    if (subscription.metadata?.academy_user_id && subscription.metadata.academy_user_id !== customer.user_id) throw new Error('Subscription account mismatch')
    const snapshot = buildSubscriptionSnapshot(subscription, { userId: customer.user_id, sequence, priceToTier, expectedLivemode })
    return saveSnapshot(snapshot)
  }
}

export async function dispatchMembershipEvent(event, { retrieveCheckout, retrieveInvoice, reconcile, legacyCheckout }) {
  if (['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)) {
    const session = await retrieveCheckout(event.data.object.id)
    if (session.mode === 'subscription') {
      if (!objectId(session.subscription)) throw new Error('Checkout subscription is missing')
      return reconcile(objectId(session.subscription))
    }
    return legacyCheckout(session)
  }
  if (['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed'].includes(event.type)) {
    return reconcile(event.data.object.id)
  }
  if (['invoice.paid','invoice.payment_failed','invoice.payment_action_required','invoice.finalization_failed'].includes(event.type)) {
    const invoice = await retrieveInvoice(event.data.object.id)
    const id = subscriptionIdFromInvoice(invoice)
    return id ? reconcile(id) : { ignored: true }
  }
  return { ignored: true }
}

export function createStripeMembershipService({ stripe, supabase, legacyCheckout, env = process.env }) {
  const priceToTier = new Map([
    [env.STRIPE_MONTHLY_PRICE_TIER5, 'tier5'], [env.STRIPE_MONTHLY_PRICE_TIER10, 'tier10'],
  ].filter(([id]) => id))
  const expectedLivemode = /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY || '')
  const origin = env.ACADEMY_PUBLIC_URL || 'https://180.academy'
  const url = new URL(origin)
  if (url.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('Invalid academy billing return URL')
  const requireStripe = () => { if (!stripe) throw new Error('Payments are unavailable in this preview') }
  const reconcile = createMembershipReconciler({
    retrieveSubscription: id => stripe.subscriptions.retrieve(id, { expand: ['latest_invoice'] }),
    nextSequence: async () => check(await supabase.rpc('next_subscription_sync')),
    findCustomer: async id => check(await supabase.from('academy_billing_customers').select('*').eq('customer_id', id).maybeSingle()),
    saveSnapshot: async snapshot => check(await supabase.rpc('record_subscription_snapshot', { p_snapshot: snapshot })),
    priceToTier, expectedLivemode,
  })
  const handleEvent = event => dispatchMembershipEvent(event, {
    retrieveCheckout: id => stripe.checkout.sessions.retrieve(id),
    retrieveInvoice: id => stripe.invoices.retrieve(id), reconcile, legacyCheckout,
  })
  async function getCustomer(user) {
    const existing = check(await supabase.from('academy_billing_customers').select('*').eq('user_id', user.id).maybeSingle())
    if (existing) {
      if (existing.livemode !== expectedLivemode) throw new Error('Billing environment mismatch')
      return existing.customer_id
    }
    const customer = await stripe.customers.create({ email: user.email, metadata: { academy_user_id: user.id } }, { idempotencyKey: `academy-customer-${user.id}` })
    if (customer.livemode !== expectedLivemode) throw new Error('Customer environment mismatch')
    check(await supabase.from('academy_billing_customers').upsert({ user_id: user.id, customer_id: customer.id, livemode: expectedLivemode }, { onConflict: 'user_id' }))
    return customer.id
  }
  async function portal(user) {
    requireStripe()
    const customer = check(await supabase.from('academy_billing_customers').select('*').eq('user_id', user.id).maybeSingle())
    if (!customer || customer.livemode !== expectedLivemode) throw new Error('No billing account is available yet')
    if (!env.STRIPE_PORTAL_CONFIGURATION) throw new Error('Membership management is not configured yet')
    const session = await stripe.billingPortal.sessions.create({ customer: customer.customer_id, configuration: env.STRIPE_PORTAL_CONFIGURATION, return_url: `${url.origin}/support` })
    return { url: session.url, kind: 'portal' }
  }
  async function checkout(user, tier) {
    requireStripe()
    if (!['tier5','tier10'].includes(tier)) throw new Error('Choose Plus or Pro')
    const price = [...priceToTier].find(([, value]) => value === tier)?.[0]
    if (!price) throw new Error('This membership is not configured yet')
    const lease = randomUUID()
    if (!check(await supabase.rpc('claim_membership_checkout', { p_user: user.id, p_token: lease }))) {
      const error = new Error('A checkout is already being prepared. Please try again in a moment.'); error.status = 409; throw error
    }
    try {
    const customer = await getCustomer(user)
    const subscriptions = await stripe.subscriptions.list({ customer, status: 'all', limit: 100 })
    if (subscriptions.data.some(sub => !['canceled','incomplete_expired'].includes(sub.status) && sub.items.data.some(item => priceToTier.has(objectId(item.price))))) return portal(user)
    const recentSessions = await stripe.checkout.sessions.list({ customer, limit: 100 })
    for (const session of recentSessions.data.filter(session => session.status === 'open' && session.mode === 'subscription' && session.metadata?.academy_user_id === user.id)) {
      if (session.metadata.academy_tier === tier && session.url) return { url: session.url, kind: 'checkout' }
      await stripe.checkout.sessions.expire(session.id)
    }
    const previous = recentSessions.data.find(session => session.mode === 'subscription' && session.metadata?.academy_user_id === user.id)?.id || 'first'
    const attempt = createHash('sha256').update(`${customer}:${tier}:${previous}`).digest('hex')
    const identifier = [...attempt.slice(0,8)].map(char => String.fromCharCode(97 + parseInt(char,16))).join('')
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription', customer, client_reference_id: user.id,
      integration_identifier: `academy_membership_${identifier}`,
      line_items: [{ price, quantity: 1 }],
      metadata: { academy_user_id: user.id, academy_tier: tier },
      subscription_data: { metadata: { academy_user_id: user.id } },
      success_url: `${url.origin}/support?checkout=success`, cancel_url: `${url.origin}/support?checkout=cancelled`,
    }, { idempotencyKey: `academy-monthly-${attempt}` })
    if (session.livemode !== expectedLivemode) throw new Error('Checkout environment mismatch')
    return { url: session.url, kind: 'checkout' }
    } finally { check(await supabase.rpc('release_membership_checkout', { p_user: user.id, p_token: lease })) }
  }
  async function requireMembership(userId, pro = false) {
    const rows = check(await supabase.from('academy_subscriptions').select('paid_tier,paid_through').eq('user_id', userId).gt('paid_through', new Date().toISOString()))
    if (!rows.some(row => pro ? row.paid_tier === 'tier10' : ['tier5','tier10'].includes(row.paid_tier))) {
      const error = new Error(pro ? 'Academy Pro is required' : 'An active Plus or Pro membership is required')
      error.status = 403
      throw error
    }
  }
  return { handleEvent, checkout, portal, reconcile, requireMembership }
}
