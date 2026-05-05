import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

function requireEnv(name, fallback = '') {
  const value = process.env[name] || fallback
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

function paymentLinkId(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw.startsWith('plink_')) return raw
  const parts = raw.split('/')
  return parts[parts.length - 1] || ''
}

export function createStripeTierService() {
  const stripeSecretKey = requireEnv('STRIPE_SECRET_KEY')
  const supabaseUrl = requireEnv('SUPABASE_URL', process.env.VITE_SUPABASE_URL || '')
  const supabaseServiceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

  const stripe = new Stripe(stripeSecretKey)
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

  const amountToTier = new Map([
    [Number(process.env.STRIPE_AMOUNT_TIER2 || 200), 'tier2'],
    [Number(process.env.STRIPE_AMOUNT_TIER5 || 500), 'tier5'],
    [Number(process.env.STRIPE_AMOUNT_TIER10 || 1000), 'tier10'],
  ])

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

  async function resolveTierFromSession(session) {
    const metadataTier = String(session.metadata?.tier || '').toLowerCase()
    if (metadataTier === 'tier2' || metadataTier === 'tier5' || metadataTier === 'tier10') {
      return metadataTier
    }

    const plinkId = paymentLinkId(session.payment_link)
    if (plinkId && paymentLinkToTier.has(plinkId)) {
      return paymentLinkToTier.get(plinkId)
    }

    const detailed = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ['line_items.data.price'],
    })

    const lineItems = detailed.line_items?.data || []
    for (const lineItem of lineItems) {
      const priceId = typeof lineItem.price === 'string' ? lineItem.price : lineItem.price?.id
      if (priceId && priceToTier.has(priceId)) {
        return priceToTier.get(priceId)
      }

      const unitAmount = Number(lineItem.price?.unit_amount || 0)
      if (unitAmount && amountToTier.has(unitAmount)) {
        return amountToTier.get(unitAmount)
      }

      const itemAmount = Number(lineItem.amount_subtotal || 0)
      if (itemAmount && amountToTier.has(itemAmount)) {
        return amountToTier.get(itemAmount)
      }

      const label = String(lineItem.description || lineItem.price?.nickname || '').toLowerCase()
      if (label.includes('tier 10') || label.includes('$10') || label.includes('10 supporter')) return 'tier10'
      if (label.includes('tier 5') || label.includes('$5') || label.includes('5 supporter')) return 'tier5'
      if (label.includes('tier 2') || label.includes('$2') || label.includes('2 supporter')) return 'tier2'
    }

    const amountCandidates = [Number(session.amount_subtotal || 0), Number(session.amount_total || 0)]
    for (const amount of amountCandidates) {
      if (amountToTier.has(amount)) {
        return amountToTier.get(amount)
      }
    }

    console.warn('stripe webhook: tier resolution failed', {
      sessionId: session.id,
      paymentLink: session.payment_link || null,
      amountSubtotal: session.amount_subtotal || null,
      amountTotal: session.amount_total || null,
      lineItems: lineItems.map((lineItem) => ({
        priceId: typeof lineItem.price === 'string' ? lineItem.price : lineItem.price?.id || null,
        unitAmount: lineItem.price?.unit_amount || null,
        amountSubtotal: lineItem.amount_subtotal || null,
        description: lineItem.description || lineItem.price?.nickname || null,
      })),
    })
    return null
  }

  async function applyTierToUser(targetUserId, tier) {
    const { error } = await supabase.from('profiles').upsert(
      {
        user_id: targetUserId,
        supporter_tier: tier,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )

    if (error) throw error
  }

  async function applyTierFromCheckoutSession(session) {
    const tier = await resolveTierFromSession(session)
    if (!tier) {
      console.warn('stripe webhook: could not resolve tier for session', session.id)
      return { applied: false, reason: 'tier_not_resolved' }
    }

    const userId = String(session.client_reference_id || '').trim()
    const email = String(session.customer_details?.email || session.customer_email || '').trim().toLowerCase()

    let targetUserId = userId
    if (!targetUserId && email) {
      const user = await findUserByEmail(email)
      targetUserId = user?.id || ''
    }

    if (!targetUserId) {
      console.warn('stripe webhook: no matching Supabase user', {
        sessionId: session.id,
        clientReferenceId: userId || null,
        email: email || null,
      })
      return { applied: false, reason: 'user_not_found' }
    }

    await applyTierToUser(targetUserId, tier)
    console.log(`stripe webhook: upgraded ${targetUserId} to ${tier}`)
    return { applied: true, userId: targetUserId, tier }
  }

  return {
    stripe,
    supabase,
    findUserByEmail,
    applyTierToUser,
    applyTierFromCheckoutSession,
  }
}
