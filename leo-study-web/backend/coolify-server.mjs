import 'dotenv/config'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStripeTierService } from './stripe-tier-service.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')
const distRoot = path.join(appRoot, 'dist')
const indexPath = path.join(distRoot, 'index.html')
const port = Number(process.env.PORT || 80)
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ''

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webp', 'image/webp'],
])

if (!stripeWebhookSecret || !process.env.STRIPE_SECRET_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY || !(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)) {
  console.error('Missing env vars. Required: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const { stripe, applyTierFromCheckoutSession, verifySupabaseServiceAccess } = createStripeTierService()

try {
  await verifySupabaseServiceAccess()
} catch (error) {
  console.error(error.message)
  console.error('Check that SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY point to the same Supabase backend used by the website.')
  process.exit(1)
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}

function proxyCoolifyWebhook(req, res) {
  const headers = { ...req.headers, host: req.headers.host || '180.academy' }
  delete headers.connection
  delete headers['content-length']

  const proxyReq = http.request(
    {
      hostname: process.env.COOLIFY_WEBHOOK_HOST || 'coolify',
      port: Number(process.env.COOLIFY_WEBHOOK_PORT || 8080),
      path: '/webhooks/source/github/events/manual',
      method: req.method,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
      proxyRes.pipe(res)
    },
  )

  proxyReq.on('error', (error) => {
    console.error('coolify webhook proxy error', error)
    res.writeHead(502)
    res.end('Coolify webhook proxy failed')
  })

  req.pipe(proxyReq)
}

function safeDistPath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath.split('?')[0] || '/')
  const normalized = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, '')
  const relativePath = normalized === '/' ? '/index.html' : normalized
  const filePath = path.join(distRoot, relativePath)
  return filePath.startsWith(distRoot) ? filePath : indexPath
}

async function serveStatic(req, res) {
  const filePath = safeDistPath(req.url || '/')
  const resolvedPath = await stat(filePath).then((info) => (info.isFile() ? filePath : indexPath)).catch(() => indexPath)
  const extension = path.extname(resolvedPath)
  res.writeHead(200, {
    'content-type': contentTypes.get(extension) || 'application/octet-stream',
    'cache-control': resolvedPath === indexPath ? 'no-store' : 'public, max-age=31536000, immutable',
  })
  createReadStream(resolvedPath).pipe(res)
}

async function handleStripeWebhook(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST' })
    res.end('Method not allowed')
    return
  }

  const signature = req.headers['stripe-signature']
  if (!signature) {
    res.writeHead(400)
    res.end('Missing stripe-signature header')
    return
  }

  const body = await readRawBody(req)
  let event
  try {
    event = stripe.webhooks.constructEvent(body, signature, stripeWebhookSecret)
  } catch (error) {
    console.warn('stripe coolify webhook signature verification failed', error.message)
    res.writeHead(400)
    res.end('Invalid stripe signature')
    return
  }

  if (event.type === 'checkout.session.completed') {
    await applyTierFromCheckoutSession(event.data.object)
  }

  sendJson(res, 200, { received: true })
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/api/health')) {
      sendJson(res, 200, { ok: true, service: 'leo-study-web' })
      return
    }

    if (req.url === '/webhooks/source/github/events/manual') {
      proxyCoolifyWebhook(req, res)
      return
    }

    if (req.url === '/api/stripe/webhook' || req.url === '/stripe/webhook') {
      await handleStripeWebhook(req, res)
      return
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      await serveStatic(req, res)
      return
    }

    res.writeHead(404)
    res.end('Not found')
  } catch (error) {
    console.error('coolify server error', error)
    res.writeHead(500)
    res.end('Server error')
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`LEO Study Coolify server listening on 0.0.0.0:${port}`)
})
