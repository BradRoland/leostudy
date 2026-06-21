import { createStripeTierService } from '../../backend/stripe-tier-service.mjs'

export const config = {
  maxDuration: 30,
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST')
    res.status(405).send('Method not allowed')
    return
  }

  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ''
  if (!stripeWebhookSecret) {
    res.status(500).send('Missing STRIPE_WEBHOOK_SECRET')
    return
  }

  try {
    const body = await readRawBody(req)
    const signature = req.headers['stripe-signature']
    if (!signature) {
      res.status(400).send('Missing stripe-signature header')
      return
    }

    const { stripe, applyTierFromCheckoutSession, verifySupabaseServiceAccess } = createStripeTierService()
    await verifySupabaseServiceAccess()

    let event
    try {
      event = stripe.webhooks.constructEvent(body, signature, stripeWebhookSecret)
    } catch (error) {
      console.warn('stripe vercel webhook signature verification failed', error.message)
      res.status(400).send('Invalid stripe signature')
      return
    }

    if (event.type === 'checkout.session.completed') {
      await applyTierFromCheckoutSession(event.data.object)
    }

    res.status(200).json({ received: true })
  } catch (error) {
    console.error('stripe vercel webhook handler error', error)
    res.status(500).send('Webhook processing failed')
  }
}
