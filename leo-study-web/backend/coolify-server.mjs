import 'dotenv/config'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createHash, randomInt } from 'node:crypto'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { createStripeTierService } from './stripe-tier-service.mjs'
import { createClassRequestService } from './class-request-service.mjs'
import { createClassRequestEmailService } from './class-request-email-service.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')
const distRoot = path.join(appRoot, 'dist')
const indexPath = path.join(distRoot, 'index.html')
const port = Number(process.env.PORT || 80)
const host = process.env.HOST || '0.0.0.0'
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

const { stripe, supabase, applyTierFromCheckoutSession, verifySupabaseServiceAccess } = createStripeTierService()
const classRequestService = createClassRequestService({
  supabase,
  userClient: (token) => createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } },
  ),
})
const classEmailService = createClassRequestEmailService({ supabase })

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

function hashInviteCode(code) {
  return createHash('sha256').update(String(code || '').toUpperCase().replace(/\s+/g, '')).digest('hex')
}

function createFiveDigitCode() {
  return String(randomInt(0, 100000)).padStart(5, '0')
}

async function getAuthorizedClassManager(req, res, classId) {
  const authorization = String(req.headers.authorization || '')
  const token = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : ''
  if (!token) {
    sendJson(res, 401, { ok: false, error: 'Missing bearer token.' })
    return null
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  const user = userData?.user || null
  if (userError || !user) {
    sendJson(res, 401, { ok: false, error: 'Invalid bearer token.' })
    return null
  }

  const [{ data: ownerRows }, { data: adminRows }] = await Promise.all([
    supabase.from('user_roles').select('user_id').eq('user_id', user.id).eq('role', 'owner').limit(1),
    supabase
      .from('class_memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('class_id', classId)
      .eq('role', 'class_admin')
      .eq('status', 'active')
      .limit(1),
  ])
  if (!ownerRows?.length && !adminRows?.length) {
    sendJson(res, 403, { ok: false, error: 'Class admin role required.' })
    return null
  }
  return { user }
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

async function handleClassRequestDiscordNotification(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST' })
    res.end('Method not allowed')
    return
  }

  const webhookUrl = process.env.DISCORD_CLASS_REQUEST_WEBHOOK_URL || ''
  const authorization = String(req.headers.authorization || '')
  const token = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : ''
  if (!token) {
    sendJson(res, 401, { ok: false, error: 'Missing bearer token' })
    return
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  const user = userData?.user || null
  if (userError || !user) {
    sendJson(res, 401, { ok: false, error: 'Invalid bearer token' })
    return
  }

  const body = await readRawBody(req)
  let payload
  try {
    payload = JSON.parse(body.toString('utf8') || '{}')
  } catch {
    sendJson(res, 400, { ok: false, error: 'Invalid JSON body' })
    return
  }

  const requestId = String(payload.requestId || '').trim()
  if (!requestId) {
    sendJson(res, 400, { ok: false, error: 'Missing requestId' })
    return
  }

  const { data: requestRow, error: requestError } = await supabase
    .from('class_creation_requests')
    .select('id,requester_user_id,requester_name,requester_email,academy_name,academy_city,academy_state,class_name,start_date,end_date,departments,requester_department,requester_note,status,created_at')
    .eq('id', requestId)
    .maybeSingle()

  if (requestError || !requestRow) {
    sendJson(res, 404, { ok: false, error: 'Class request not found' })
    return
  }
  if (requestRow.requester_user_id !== user.id) {
    sendJson(res, 403, { ok: false, error: 'Request ownership required' })
    return
  }
  if (!webhookUrl) {
    sendJson(res, 200, { ok: true, notified: false, reason: 'DISCORD_CLASS_REQUEST_WEBHOOK_URL not configured' })
    return
  }

  const ownerLink = `${process.env.VITE_AUTH_REDIRECT_BASE_URL || 'https://180.academy'}/owner/classes`
  const departments = Array.isArray(requestRow.departments) ? requestRow.departments : []
  const discordPayload = {
    content: 'New academy class request',
    embeds: [
      {
        title: `${requestRow.academy_name} ${requestRow.class_name}`,
        url: ownerLink,
        color: 3447003,
        fields: [
          { name: 'Location', value: `${requestRow.academy_city || 'Unknown'}, ${requestRow.academy_state || 'CA'}`, inline: true },
          { name: 'Dates', value: `${requestRow.start_date || 'Not set'} to ${requestRow.end_date || 'Not set'}`, inline: true },
          { name: 'Departments', value: String(departments.length), inline: true },
          { name: 'Requester', value: `${requestRow.requester_name || 'Unknown'}${requestRow.requester_email ? ` (${requestRow.requester_email})` : ''}`, inline: false },
          { name: 'Requester department', value: requestRow.requester_department || 'Not provided', inline: false },
          { name: 'Note', value: String(requestRow.requester_note || 'No note').slice(0, 900), inline: false },
        ],
        footer: { text: `Request ${requestRow.id}` },
      },
    ],
  }

  const discordResponse = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(discordPayload),
  })

  if (!discordResponse.ok) {
    sendJson(res, 502, { ok: false, error: `Discord webhook failed: ${discordResponse.status}` })
    return
  }

  await supabase
    .from('class_creation_requests')
    .update({ discord_notified_at: new Date().toISOString() })
    .eq('id', requestId)

  sendJson(res, 200, { ok: true, notified: true })
}

async function handleClassRequestAction(req, res, action) {
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST' })
    res.end('Method not allowed')
    return
  }
  let bytes = 0
  const chunks = []
  for await (const chunk of req) {
    bytes += chunk.length
    if (bytes > 48 * 1024) {
      sendJson(res, 413, { error: 'Class request is too large.' })
      return
    }
    chunks.push(chunk)
  }
  let payload
  try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') }
  catch {
    sendJson(res, 400, { error: 'Invalid request. Please try again.' })
    return
  }
  const authorization = String(req.headers.authorization || '')
  const token = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : ''
  const result = await classRequestService({ token, action, payload })
  sendJson(res, result.status, result.body)
  if (result.status === 200) {
    void classEmailService.drain().catch(() => console.error('Class request saved; queued email will retry.'))
  }
}

async function handleCreateAccount(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST' })
    res.end('Method not allowed')
    return
  }

  const body = await readRawBody(req)
  let payload
  try {
    payload = JSON.parse(body.toString('utf8') || '{}')
  } catch {
    sendJson(res, 400, { ok: false, error: 'Invalid JSON body' })
    return
  }

  const email = String(payload.email || '').trim().toLowerCase()
  const password = String(payload.password || '')
  const username = String(payload.username || '').trim()
  if (!email || !password || !username) {
    sendJson(res, 400, { ok: false, error: 'Email, password, and username are required.' })
    return
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      username,
      display_name: username,
      academy_onboarding_version: 1,
    },
  })

  if (error) {
    const status = error.message.toLowerCase().includes('already') ? 409 : 400
    sendJson(res, status, { ok: false, error: error.message })
    return
  }

  sendJson(res, 200, { ok: true, userId: data.user?.id || null })
}

async function handleAddClassDepartment(req, res) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.writeHead(405, { allow: 'POST, DELETE' })
    res.end('Method not allowed')
    return
  }

  const body = await readRawBody(req)
  let payload
  try {
    payload = JSON.parse(body.toString('utf8') || '{}')
  } catch {
    sendJson(res, 400, { ok: false, error: 'Invalid JSON body' })
    return
  }

  if (req.method === 'DELETE') {
    const departmentId = String(payload.departmentId || '').trim()
    if (!departmentId) {
      sendJson(res, 400, { ok: false, error: 'Department is required.' })
      return
    }
    const { data: department, error: departmentError } = await supabase
      .from('class_departments')
      .select('id,class_id,name')
      .eq('id', departmentId)
      .maybeSingle()
    if (departmentError || !department) {
      sendJson(res, 404, { ok: false, error: 'Agency was not found in this class.' })
      return
    }
    const manager = await getAuthorizedClassManager(req, res, String(department.class_id || ''))
    if (!manager) return
    const { error: deleteError } = await supabase.from('class_departments').delete().eq('id', departmentId)
    if (deleteError) {
      sendJson(res, 500, { ok: false, error: deleteError.message || 'Could not delete class agency.' })
      return
    }
    await supabase.from('class_audit_events').insert({
      class_id: department.class_id,
      actor_user_id: manager.user.id,
      event_type: 'department_deleted',
      metadata: { departmentId, name: department.name },
    })
    sendJson(res, 200, { ok: true })
    return
  }

  const classId = String(payload.classId || '').trim()
  const name = String(payload.name || '').trim()
  if (!classId || !name) {
    sendJson(res, 400, { ok: false, error: 'Class and department name are required.' })
    return
  }

  const manager = await getAuthorizedClassManager(req, res, classId)
  if (!manager) return

  const { data: existingRows } = await supabase
    .from('class_departments')
    .select('id,name')
    .eq('class_id', classId)
    .ilike('name', name)
    .limit(1)
  if (existingRows?.[0]?.id) {
    sendJson(res, 200, { ok: true, departmentId: existingRows[0].id })
    return
  }

  const { data: department, error: insertError } = await supabase
    .from('class_departments')
    .insert({ class_id: classId, name })
    .select('id')
    .single()
  if (insertError) {
    sendJson(res, 500, { ok: false, error: insertError.message || 'Could not add class agency.' })
    return
  }

  await supabase.from('class_audit_events').insert({
    class_id: classId,
    actor_user_id: manager.user.id,
    event_type: 'department_added',
    metadata: { departmentId: department.id, name },
  })

  sendJson(res, 200, { ok: true, departmentId: department.id })
}

async function handleCreateClassInvite(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST' })
    res.end('Method not allowed')
    return
  }

  const body = await readRawBody(req)
  let payload
  try {
    payload = JSON.parse(body.toString('utf8') || '{}')
  } catch {
    sendJson(res, 400, { ok: false, error: 'Invalid JSON body' })
    return
  }

  const classId = String(payload.classId || '').trim()
  if (!classId) {
    sendJson(res, 400, { ok: false, error: 'Class is required.' })
    return
  }
  const manager = await getAuthorizedClassManager(req, res, classId)
  if (!manager) return

  let code = ''
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = createFiveDigitCode()
    const tokenHash = hashInviteCode(candidate)
    const { data: existing } = await supabase.from('class_invites').select('id').eq('token_hash', tokenHash).limit(1)
    if (existing?.length) continue
    const { error: insertError } = await supabase.from('class_invites').insert({
      class_id: classId,
      token_hash: tokenHash,
      code_hint: candidate,
      role_granted: 'cadet',
      created_by: manager.user.id,
    })
    if (insertError) {
      if (insertError.code === '23505') continue
      sendJson(res, 500, { ok: false, error: insertError.message || 'Could not create class code.' })
      return
    }
    await supabase.from('class_audit_events').insert({
      class_id: classId,
      actor_user_id: manager.user.id,
      event_type: 'invite_created',
      metadata: { role: 'cadet', codeType: 'five_digit' },
    })
    code = candidate
    break
  }
  if (!code) {
    sendJson(res, 500, { ok: false, error: 'Could not create a unique class code.' })
    return
  }
  sendJson(res, 200, { ok: true, code })
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

    if (req.url === '/api/class-requests/notify-discord') {
      await handleClassRequestDiscordNotification(req, res)
      return
    }

    const classRequestActions = {
      '/api/class-requests': 'submit',
      '/api/class-requests/approve': 'approve',
      '/api/class-requests/reject': 'reject',
    }
    if (classRequestActions[req.url]) {
      await handleClassRequestAction(req, res, classRequestActions[req.url])
      return
    }

    if (req.url === '/api/auth/create-account') {
      await handleCreateAccount(req, res)
      return
    }

    if (req.url === '/api/classes/departments') {
      await handleAddClassDepartment(req, res)
      return
    }

    if (req.url === '/api/classes/invites') {
      await handleCreateClassInvite(req, res)
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

server.listen(port, host, () => {
  console.log(`LEO Study Coolify server listening on ${host}:${port}`)
  classEmailService.start()
})
