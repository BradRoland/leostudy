import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { liveIntegrationsDisabled } from './live-integrations.mjs'

function requireEnv(name, fallback = '') {
  const value = process.env[name] || fallback
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

function paymentLinkId(value) {
  return typeof value === 'string' ? value.trim() : String(value?.id || '').trim()
}

// Only configured Stripe objects identify a product. Dollar amounts, names and
// arbitrary metadata can describe unrelated purchases in the same Stripe account.
export function createTierResolver({ priceToTier = new Map(), paymentLinkToTier = new Map(), retrieveSession }) {
  async function resolveTierFromSession(session) {
    const linkTier = paymentLinkToTier.get(paymentLinkId(session.payment_link))
    if (linkTier) return linkTier
    const detailed = session.line_items ? session : await retrieveSession(session.id)
    const tiers = (detailed.line_items?.data || []).map(item => priceToTier.get(typeof item.price === 'string' ? item.price : item.price?.id)).filter(Boolean)
    return ['tier10', 'tier5', 'tier2'].find(tier => tiers.includes(tier)) || null
  }
  return { resolveTierFromSession }
}

export async function handleStripeEvent(event, fulfill) {
  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
    return fulfill(event.data.object)
  }
  return { applied: false, reason: 'event_not_applicable' }
}

export function createCheckoutFulfillment({ retrieveSession, resolveTierFromSession, findUserByEmail, grantCheckout, expectedLivemode }) {
  return async function applyTierFromCheckoutSession(eventSession) {
    if (!eventSession?.id) throw new Error('Checkout session is missing')
    // Stripe is authoritative, including when an older event arrives after a retry.
    const session = await retrieveSession(eventSession.id)
    if (session.id !== eventSession.id || session.livemode !== expectedLivemode) throw new Error('Checkout environment mismatch')
    if (session.payment_status !== 'paid' || session.status !== 'complete') return { applied: false, reason: 'payment_not_paid' }
    if (session.mode !== 'payment') throw new Error('Supporter checkout must be a one-time payment')
    const tier = await resolveTierFromSession(session)
    if (!tier) throw new Error('Paid checkout has no configured supporter product')
    let userId = String(session.client_reference_id || '').trim()
    if (!userId) {
      const email = String(session.customer_details?.email || session.customer_email || '').trim().toLowerCase()
      if (email) userId = (await findUserByEmail(email))?.id || ''
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) throw new Error('Paid checkout has no matching academy account')
    // Persisting a grant and changing access are atomic and safe to retry.
    return grantCheckout({ sessionId: session.id, userId, tier, livemode: session.livemode })
  }
}

export function createStripeTierService() {
  const stripeDisabled = liveIntegrationsDisabled()
  const stripeSecretKey = stripeDisabled ? '' : requireEnv('STRIPE_SECRET_KEY')
  const supabaseUrl = requireEnv('SUPABASE_URL', process.env.VITE_SUPABASE_URL || '')
  const supabaseServiceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

  const stripe = stripeDisabled ? null : new Stripe(stripeSecretKey)
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const priceToTier = new Map(
    [
      [process.env.STRIPE_PRICE_ID_TIER2 || '', 'tier2'],
      [process.env.STRIPE_PRICE_ID_TIER5 || '', 'tier5'],
      [process.env.STRIPE_PRICE_ID_TIER10 || '', 'tier10'],
    ].filter(([priceId]) => Boolean(priceId)),
  )

  const paymentLinkToTier = new Map(
    [
      [paymentLinkId(process.env.STRIPE_PAYMENT_LINK_ID_TIER2), 'tier2'],
      [paymentLinkId(process.env.STRIPE_PAYMENT_LINK_ID_TIER5), 'tier5'],
      [paymentLinkId(process.env.STRIPE_PAYMENT_LINK_ID_TIER10), 'tier10'],
    ].filter(([plinkId]) => Boolean(plinkId)),
  )

  async function findUserByEmail(email) {
    const target = email.trim().toLowerCase()
    for (let page = 1; page <= 20; page += 1) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
      if (error) throw error
      const users = data?.users || []
      const match = users.find((user) => (user.email || '').toLowerCase() === target)
      if (match) return match
      if (users.length < 200) break
    }
    return null
  }

  async function verifySupabaseServiceAccess() {
    const { error } = await supabase.from('profiles').select('user_id').limit(1)
    if (error) {
      throw new Error(`Supabase service-role access check failed: ${error.message}`)
    }
  }

  const retrieveSession = (sessionId) => {
    if (!stripe) throw new Error('Stripe is disabled in this preview.')
    return stripe.checkout.sessions.retrieve(sessionId, { expand: ['line_items.data.price'] })
  }
  const { resolveTierFromSession } = createTierResolver({ priceToTier, paymentLinkToTier, retrieveSession })
  const grantCheckout = async ({ sessionId, userId, tier, livemode }) => {
    const { data, error } = await supabase.rpc('fulfill_supporter_checkout', {
      p_session_id: sessionId, p_user_id: userId, p_tier: tier, p_livemode: livemode,
    })
    if (error) throw error
    return data
  }
  const applyTierFromCheckoutSession = createCheckoutFulfillment({
    retrieveSession, resolveTierFromSession, findUserByEmail, grantCheckout,
    expectedLivemode: /^(sk|rk)_live_/.test(stripeSecretKey),
  })

  async function applyTierToUser(targetUserId, tier) {
    if (stripeDisabled || !/^(sk|rk)_test_/.test(stripeSecretKey)) throw new Error('Manual grants require Stripe test mode.')
    const { error } = await supabase.from('profiles').upsert({ user_id: targetUserId, supporter_tier: tier }, { onConflict: 'user_id' })
    if (error) throw error
  }

  return {
    stripe,
    supabase,
    findUserByEmail,
    verifySupabaseServiceAccess,
    applyTierToUser,
    applyTierFromCheckoutSession,
  }
}
