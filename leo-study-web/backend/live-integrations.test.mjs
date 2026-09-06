import assert from 'node:assert/strict'
import test from 'node:test'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { liveIntegrationsDisabled } from './live-integrations.mjs'

const appRoot = fileURLToPath(new URL('../', import.meta.url))
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
function startBackend(env, script = 'backend/coolify-server.mjs') {
  const child = spawn(process.execPath, [script], {
    cwd: appRoot,
    env: { ...process.env, DOTENV_CONFIG_PATH: '/nonexistent-preview-test-env',
      STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', CLASS_REQUEST_EMAIL_ENABLED: 'false',
      ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })
  return { child, output: () => output }
}

test('preview backend starts without Stripe credentials, blocks live handlers, and retains class APIs', async (t) => {
  const calls = []
  const fakeSupabase = http.createServer((req, res) => {
    calls.push(`${req.method} ${req.url}`)
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('[]')
  })
  fakeSupabase.listen(0, '127.0.0.1')
  await once(fakeSupabase, 'listening')
  t.after(() => new Promise((resolve) => fakeSupabase.close(resolve)))
  const apiPort = fakeSupabase.address().port
  const reserve = http.createServer()
  reserve.listen(0, '127.0.0.1')
  await once(reserve, 'listening')
  const appPort = reserve.address().port
  await new Promise((resolve) => reserve.close(resolve))
  const { child, output } = startBackend({
    DISABLE_LIVE_INTEGRATIONS: 'true', HOST: '127.0.0.1', PORT: String(appPort),
    SUPABASE_URL: `http://127.0.0.1:${apiPort}`, SUPABASE_SERVICE_ROLE_KEY: 'preview-only-service-key',
    DISCORD_CLASS_REQUEST_WEBHOOK_URL: `http://127.0.0.1:${apiPort}/discord`,
    COOLIFY_WEBHOOK_HOST: '127.0.0.1', COOLIFY_WEBHOOK_PORT: String(apiPort),
  })
  t.after(async () => {
    if (child.exitCode !== null) return
    const stopped = once(child, 'exit')
    child.kill('SIGTERM')
    await stopped
  })
  const origin = `http://127.0.0.1:${appPort}`
  let ready = false
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) break
    try { ready = (await fetch(`${origin}/health`)).ok } catch { /* process is starting */ }
    if (ready) break
    await delay(50)
  }
  assert.equal(ready, true, output())
  for (const endpoint of ['/api/stripe/webhook', '/stripe/webhook', '/stripe/test/apply', '/api/class-requests/notify-discord', '/webhooks/source/github/events/manual']) {
    for (const method of ['GET', 'POST']) {
      const response = await fetch(`${origin}${endpoint}?preview=1`, { method })
      assert.equal(response.status, 404, `${method} ${endpoint}`)
      assert.match((await response.json()).error, /disabled in this preview/)
    }
  }
  const classResponse = await fetch(`${origin}/api/class-requests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  assert.equal(classResponse.status, 401, 'normal authenticated class endpoint remains available')
  assert.equal(calls.length, 1, 'only the startup read may reach the configured Supabase endpoint')
  assert.match(calls[0], /^GET \/rest\/v1\/profiles\?/)
})

test('standalone Stripe service exits without opening a listener in preview mode', async () => {
  const { child, output } = startBackend({ DISABLE_LIVE_INTEGRATIONS: 'true' }, 'backend/stripe-webhook.mjs')
  const [code] = await once(child, 'exit')
  assert.equal(code, 0, output())
  assert.match(output(), /disabled in this preview/)
})

test('normal backend still requires Stripe credentials when preview safety is not enabled', async () => {
  assert.equal(liveIntegrationsDisabled({}), false)
  const { child, output } = startBackend({ DISABLE_LIVE_INTEGRATIONS: 'false' })
  const [code] = await once(child, 'exit')
  assert.equal(code, 1)
  assert.match(output(), /Required: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET/)
})
