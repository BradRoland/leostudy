import 'dotenv/config'
import http from 'node:http'
import { createStripeTierService } from './stripe-tier-service.mjs'
import { liveIntegrationsDisabled } from './live-integrations.mjs'

if (liveIntegrationsDisabled()) {
  console.log('Stripe webhook service is disabled in this preview.')
  process.exit(0)
}

const port = Number(process.env.STRIPE_WEBHOOK_PORT || 8788)
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ''
const stripeTestToken = process.env.STRIPE_TEST_TOKEN || ''

if (!stripeWebhookSecret || !process.env.STRIPE_SECRET_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY || !(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)) {
  console.error('Missing env vars. Required: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const { stripe, findUserByEmail, applyTierToUser, applyTierFromCheckoutSession, verifySupabaseServiceAccess } = createStripeTierService()

try {
  await verifySupabaseServiceAccess()
} catch (error) {
  console.error(error.message)
  console.error('Check that SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY point to the same Supabase backend used by the website.')
  process.exit(1)
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  if (req.method !== 'POST' || (req.url !== '/stripe/webhook' && req.url !== '/stripe/test/apply')) {
    res.writeHead(404)
    res.end('Not found')
    return
  }

  const chunks = []
  req.on('data', (chunk) => chunks.push(chunk))

  req.on('end', async () => {
    try {
      const body = Buffer.concat(chunks)

      if (req.url === '/stripe/test/apply') {
        if (!stripeTestToken) {
          res.writeHead(403)
          res.end('Test endpoint disabled. Set STRIPE_TEST_TOKEN.')
          return
        }

        const providedToken = String(req.headers['x-test-token'] || '')
        if (providedToken !== stripeTestToken) {
          res.writeHead(401)
          res.end('Invalid test token')
          return
        }

        const payload = JSON.parse(body.toString('utf8') || '{}')
        const tier = String(payload.tier || '').toLowerCase()
        if (!['tier2', 'tier5', 'tier10'].includes(tier)) {
          res.writeHead(400)
          res.end('tier must be one of: tier2, tier5, tier10')
          return
        }

        let targetUserId = String(payload.userId || '').trim()
        if (!targetUserId) {
          const email = String(payload.email || '').trim().toLowerCase()
          if (email) {
            const user = await findUserByEmail(email)
            targetUserId = user?.id || ''
          }
        }

        if (!targetUserId) {
          res.writeHead(400)
          res.end('Missing userId, or no user found for provided email.')
          return
        }

        await applyTierToUser(targetUserId, tier)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, userId: targetUserId, tier }))
        return
      }

      const signature = req.headers['stripe-signature']
      if (!signature) {
        res.writeHead(400)
        res.end('Missing stripe-signature header')
        return
      }

      let event
      try {
        event = stripe.webhooks.constructEvent(body, signature, stripeWebhookSecret)
      } catch (error) {
        console.warn('stripe webhook signature verification failed', error.message)
        res.writeHead(400)
        res.end('Invalid stripe signature')
        return
      }

      if (event.type === 'checkout.session.completed') {
        await applyTierFromCheckoutSession(event.data.object)
      }

      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ received: true }))
    } catch (error) {
      console.error('stripe webhook handler error', error)
      res.writeHead(500)
      res.end('Webhook processing failed')
    }
  })
})

server.listen(port, () => {
  console.log(`Stripe webhook server listening on http://localhost:${port}`)
  console.log('POST Stripe events to /stripe/webhook')
})
