// Run only after the development deployment has explicitly been declared ready.
// Setup/cleanup stays on the localhost clone; public traffic uses anon/user tokens.
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { parse } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { chromium, expect } from '@playwright/test'

assert.ok(process.argv.includes('--run-approved-dev-check'), 'Wait for deployment readiness, then pass --run-approved-dev-check.')
const appUrl = 'https://dev.180.academy'
const apiUrl = `${appUrl}/supabase`
const env = parse(await readFile(new URL('../../.env.staging.local', import.meta.url)))
const accounts = JSON.parse(await readFile(new URL('../../.test-accounts.local', import.meta.url), 'utf8'))
assert.equal(env.SUPABASE_URL, 'http://127.0.0.1:55431', 'Fixture service must use the retained isolated clone.')
assert.match(accounts.cadet.email, /@example\.invalid$/)
assert.ok(accounts.cadet.userId && accounts.cadet.password)
const anonKey = env.VITE_SUPABASE_ANON_KEY
assert.ok(anonKey && env.SUPABASE_SERVICE_ROLE_KEY, 'Ignored clone keys are required.')
const marker = randomUUID().slice(0, 8)
const avatarBucket = env.VITE_SUPABASE_AVATAR_BUCKET || 'avatars'
const artifactDirectory = new URL('../../artifacts/public-dev.local/', import.meta.url)
const result = { appUrl, startedAt: new Date().toISOString(), passed: false, checks: [], blockedOrigins: [], socketPaths: [], cleanupErrors: [] }
let stage = 'clone preflight', academyId, classId, browser, activePage, peerClient, preflightClient, incomingMessage = '', incomingFrames = 0
const users = [], clients = []
const pageErrors = [], failedApiResponses = []
const blockedAssetOrigins = new Set(['https://static.cloudflareinsights.com', 'https://cloudflareinsights.com', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'])
const check = ({ data, error }) => { if (error) throw new Error(error.message || 'API request failed'); return data }
const safeError = error => {
  let message = String(error?.message || error)
  for (const secret of [anonKey, env.SUPABASE_SERVICE_ROLE_KEY, accounts.cadet.password, ...users.map(user => user.password)]) {
    if (secret) message = message.replaceAll(secret, '[redacted]')
  }
  return message.replace(/(https?:\/\/|wss?:\/\/)([^\s?]+)\?\S+/g, '$1$2?[redacted]').slice(0, 2000)
}

function limitedFetch(expectedOrigin, prefix = '/') {
  return (input, options) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    assert.equal(url.origin, expectedOrigin, 'Unexpected API origin refused.')
    assert.ok(url.pathname.startsWith(prefix), 'Unexpected API path refused.')
    const timeout = AbortSignal.timeout(30000)
    return fetch(input, { ...options, redirect: 'error', signal: options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout })
  }
}
const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: limitedFetch(env.SUPABASE_URL) } })
const publicClient = () => {
  const client = createClient(apiUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: limitedFetch(appUrl, '/supabase/') } })
  clients.push(client)
  return client
}

async function isolatedBrowserContext() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  context.setDefaultTimeout(20000)
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin !== appUrl) {
      result.blockedOrigins.push(url.origin)
      return route.abort('blockedbyclient')
    }
    return route.continue()
  })
  await context.routeWebSocket('**/*', route => {
    const url = new URL(route.url())
    if (url.origin !== 'wss://dev.180.academy' || !url.pathname.startsWith('/supabase/realtime/')) {
      result.blockedOrigins.push(url.origin)
      return route.close({ code: 1008, reason: 'Development origin only' })
    }
    result.socketPaths.push(url.origin + url.pathname)
    const server = route.connectToServer()
    server.onMessage(message => {
      if (incomingMessage && String(message).includes(incomingMessage)) incomingFrames += 1
      route.send(message)
    })
  })
  context.on('page', page => {
    page.on('pageerror', error => pageErrors.push(safeError(error)))
    page.on('response', response => {
      const url = new URL(response.url())
      if (response.status() >= 400 && url.pathname.startsWith('/supabase/')) {
        const authorization = response.request().headers().authorization
        failedApiResponses.push({ status: response.status(), path: url.pathname, pagePath: new URL(page.url()).pathname,
          identity: !authorization || authorization === `Bearer ${anonKey}` ? 'anonymous' : 'user token' })
      }
    })
  })
  return context
}

try {
  const knownUser = check(await service.auth.admin.getUserById(accounts.cadet.userId)).user
  assert.equal(knownUser.email, accounts.cadet.email, 'Known synthetic account must match the local clone.')
  stage = 'public HTTPS health and integration isolation'
  const publicFetch = limitedFetch(appUrl)
  const health = await publicFetch(`${appUrl}/api/health`)
  assert.equal(health.status, 200)
  assert.equal((await health.json()).ok, true)
  // GET never submits a webhook and proves the preview's integration gate is active.
  const disabledStripe = await publicFetch(`${appUrl}/api/stripe/webhook`)
  assert.equal(disabledStripe.status, 404)
  const versionResponse = await publicFetch(`${appUrl}/app-version.json`)
  if (versionResponse.ok) {
    const version = await versionResponse.json()
    if (typeof version.version === 'string') result.version = version.version
    if (typeof version.buildId === 'string') result.buildId = version.buildId
    if (typeof version.builtAt === 'string') result.builtAt = version.builtAt
  }
  result.checks.push('HTTPS health, development integration gate, and version response')

  stage = 'anonymous and invalid-token private REST boundary'
  for (const table of ['profiles', 'app_state', 'user_roles']) {
    for (const authorization of ['', `Bearer ${anonKey}`, 'Bearer invalid-public-dev-qa-token']) {
      const response = await publicFetch(`${apiUrl}/rest/v1/${table}?select=user_id&limit=1`, {
        headers: { apikey: anonKey, ...(authorization ? { Authorization: authorization } : {}) },
      })
      // Never parse or output private rows if the boundary is unexpectedly open.
      assert.ok([401, 403].includes(response.status), `Private ${table} request must be denied without a valid user token; received ${response.status}.`)
      await response.body?.cancel()
    }
  }
  const anonymous = publicClient()
  const listedClasses = check(await anonymous.from('academy_classes')
    .select('id,class_name,start_date,end_date,status,visibility,join_mode,academy_id,academies(name,city,state)')
    .eq('status', 'active').eq('visibility', 'listed').order('end_date', { ascending: true, nullsFirst: false }))
  const activeClasses = listedClasses.filter(row => !row.end_date || row.end_date >= new Date().toISOString().slice(0, 10))
  assert.ok(activeClasses.some(row => row.class_name === 'Class 181'), 'Public active class selection must remain available.')
  const departments = check(await anonymous.from('class_departments').select('id,class_id,name').eq('class_id', activeClasses[0].id).order('name', { ascending: true }))
  assert.ok(departments.length > 0)
  result.checks.push('Anonymous/anon-key/invalid-JWT private REST denied; exact public class and department queries remain available')

  stage = 'public Auth/REST clone identity'
  preflightClient = publicClient()
  const auth = check(await preflightClient.auth.signInWithPassword({ email: accounts.cadet.email, password: accounts.cadet.password }))
  assert.equal(auth.user.id, accounts.cadet.userId, 'Public Auth must resolve the known clone account.')
  const knownProfile = check(await preflightClient.from('profiles').select('user_id').eq('user_id', accounts.cadet.userId).single())
  assert.equal(knownProfile.user_id, accounts.cadet.userId)
  const publishedContent = check(await preflightClient.from('content_items').select('id').eq('is_published', true).limit(1))
  assert.ok(publishedContent.length > 0, 'Published study content must load for an authenticated user.')
  check(await preflightClient.auth.signOut({ scope: 'local' }))
  result.checks.push('Same-origin Auth and REST resolve the expected isolated clone; authenticated published study content loads')

  stage = 'disposable private fixtures'
  academyId = check(await service.from('academies').insert({ name: `Public development QA ${marker}`, city: 'Synthetic', state: 'CA' }).select('id').single()).id
  classId = check(await service.from('academy_classes').insert({ academy_id: academyId, class_name: `Development QA ${marker}`, status: 'active', visibility: 'unlisted', join_mode: 'open' }).select('id').single()).id
  const departmentId = check(await service.from('class_departments').insert({ class_id: classId, name: 'Development Test Department' }).select('id').single()).id
  for (const [index, firstName] of ['Casey', 'Morgan'].entries()) {
    const email = `public-dev-${marker}-${index}@example.invalid`, password = `${randomUUID()}-Dev!9`
    const username = `${firstName} Public QA ${marker}`
    const user = check(await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username, display_name: username, academy_onboarding_version: 1 } })).user
    users.push({ id: user.id, email, password, username, firstName })
    check(await service.from('profiles').upsert({ user_id: user.id, username, supporter_tier: 'free', agency: 'Development Test Department' }))
    check(await service.from('class_memberships').insert({ user_id: user.id, class_id: classId, department_id: departmentId, role: index ? 'cadet' : 'class_admin', status: 'active', is_active: true }))
    check(await service.from('app_state').upsert({ user_id: user.id, profile_details: { firstName, lastName: `Public QA ${marker}`, dailyGoalMinutes: 15, onboardingCompleted: index > 0, displayMode: 'light', themeId: 'midnight', agency: 'Development Test Department' } }))
  }
  const memberIds = check(await service.from('class_memberships').select('user_id').eq('class_id', classId)).map(row => row.user_id)
  assert.deepEqual(new Set(memberIds), new Set(users.map(user => user.id)), 'Chat must contain only disposable synthetic users.')

  stage = 'public synthetic signup and class selection'
  browser = await chromium.launch()
  await mkdir(artifactDirectory, { recursive: true })
  const signupContext = await isolatedBrowserContext()
  try {
    const signupPage = await signupContext.newPage()
    activePage = signupPage
    const email = `public-dev-${marker}-signup@example.invalid`, password = `${randomUUID()}-Dev!9`
    await signupPage.goto(`${appUrl}/signup`)
    await expect(signupPage.getByRole('button', { name: 'Continue with Google', exact: true })).toHaveCount(0)
    await expect(signupPage.getByText('Use email and password in this development preview.', { exact: true })).toBeVisible()
    await signupPage.getByLabel('Email address', { exact: true }).fill(email)
    await signupPage.getByLabel('Password', { exact: true }).fill(password)
    await signupPage.getByLabel('Confirm password', { exact: true }).fill(password)
    const accountCreated = signupPage.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/create-account' && response.request().method() === 'POST')
    await signupPage.getByRole('button', { name: 'Create account', exact: false }).click()
    const createdResponse = await accountCreated
    assert.equal(createdResponse.status(), 200)
    const createdAccount = await createdResponse.json()
    assert.ok(createdAccount.ok && createdAccount.userId, 'Public signup must create a disposable synthetic account.')
    users.push({ id: createdAccount.userId, email, password })
    await expect(signupPage.getByRole('heading', { name: 'Find your class.' })).toBeVisible({ timeout: 30000 })
    await expect(signupPage.getByRole('radio', { name: /Class 181/ })).toBeVisible()
    await expect(signupPage.getByRole('radio', { name: /Class 182/ })).toBeVisible()
    await signupPage.getByRole('radio', { name: /Class 181/ }).check()
    await signupPage.getByRole('button', { name: 'Continue', exact: false }).click()
    await expect(signupPage.getByRole('heading', { name: 'Where do you serve?' })).toBeVisible()
    await expect(signupPage.getByRole('radio').first()).toBeVisible()
    const membership = check(await service.from('class_memberships').select('id').eq('user_id', createdAccount.userId))
    assert.equal(membership.length, 0, 'Class selection alone must not add a member to an existing class.')
    result.checks.push('Public account creation, active class selection, and separate department screen')
  } finally { await signupContext.close() }

  stage = 'public browser and avatar onboarding'
  const context = await isolatedBrowserContext()
  const page = await context.newPage()
  activePage = page
  await page.goto(`${appUrl}/signin`)
  await expect(page).toHaveTitle('180 Academy')
  await expect(page.getByRole('button', { name: 'Continue with Google', exact: true })).toHaveCount(0)
  await page.evaluate(async () => {
    const brand = new Image()
    brand.src = '/brand/180-academy-mark.png'
    await brand.decode()
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
  await page.screenshot({ path: new URL('signin-desktop.png', artifactDirectory).pathname, animations: 'disabled' })
  await page.getByLabel('Email address', { exact: true }).fill(users[0].email)
  await page.getByLabel('Password', { exact: true }).fill(users[0].password)
  await page.getByRole('button', { name: 'Sign in', exact: false }).click()
  stage = 'approved member profile setup screen'
  await expect(page.getByRole('heading', { name: 'Make yourself at home.' })).toBeVisible({ timeout: 30000 })
  await page.getByLabel('First name', { exact: true }).fill(users[0].firstName)
  await page.getByLabel('Last name', { exact: true }).fill(`Public QA ${marker}`)
  await page.locator('input[type=file]').setInputFiles({ name: 'public-dev-avatar.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFfQAAAAASUVORK5CYII=', 'base64') })
  await expect(page.getByAltText('Your profile preview')).toBeVisible()
  await page.getByRole('button', { name: 'Continue', exact: false }).click()
  await page.getByRole('button', { name: 'Let’s get started', exact: false }).click()
  stage = 'profile and avatar submission'
  await expect(page.locator('.today-dashboard')).toBeVisible({ timeout: 30000 })
  const profile = check(await service.from('profiles').select('avatar_path').eq('user_id', users[0].id).single())
  assert.ok(profile.avatar_path?.startsWith(`${users[0].id}/`), 'Avatar must be saved in the disposable user folder.')
  const avatarUrl = `${apiUrl}/storage/v1/object/public/${avatarBucket}/${profile.avatar_path}`
  const avatarResponse = await publicFetch(avatarUrl)
  assert.equal(avatarResponse.status, 200)
  assert.match(avatarResponse.headers.get('content-type') || '', /^image\/png/)
  assert.ok((await avatarResponse.arrayBuffer()).byteLength > 0)
  await expect.poll(() => page.locator('.taskbar-profile-image').evaluate(image => image.complete && image.naturalWidth > 0 && image.src.includes('/supabase/storage/v1/object/public/'))).toBe(true)
  await page.reload()
  await expect(page.locator('.today-dashboard')).toBeVisible()
  await page.screenshot({ path: new URL('dashboard-desktop.png', artifactDirectory).pathname, animations: 'disabled' })
  await page.goto(`${appUrl}/study`)
  await expect(page.locator('#main-content')).toBeVisible()
  await expect(page).toHaveURL(`${appUrl}/study`)
  result.checks.push('Browser login, profile-only onboarding, proxied avatar upload/read, and reload/deep-link persistence')

  stage = 'public Realtime chat'
  peerClient = publicClient()
  check(await peerClient.auth.signInWithPassword({ email: users[1].email, password: users[1].password }))
  await page.goto(`${appUrl}/chat`)
  const chat = page.locator('.global-chat-panel-full')
  await expect(chat).toBeVisible()
  await expect(chat.getByText('Live updates', { exact: true })).toBeVisible({ timeout: 30000 })
  const outgoing = `Public development message ${marker}`
  await chat.getByLabel('Message', { exact: true }).fill(outgoing)
  await chat.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(chat.getByText(outgoing, { exact: true })).toBeVisible()
  const savedMessages = check(await peerClient.from('class_messages').select('message').eq('class_id', classId).eq('user_id', users[0].id))
  assert.equal(savedMessages.filter(row => row.message === outgoing).length, 1)
  incomingMessage = `Public development live reply ${marker}`
  check(await peerClient.from('class_messages').insert({ class_id: classId, user_id: users[1].id, display_name: users[1].username, department_name: 'Development Test Department', message: incomingMessage }))
  await expect.poll(() => incomingFrames, { timeout: 20000 }).toBeGreaterThan(0)
  await expect(chat.getByText(incomingMessage, { exact: true })).toBeVisible()
  assert.ok(result.socketPaths.some(path => path === 'wss://dev.180.academy/supabase/realtime/v1/websocket'))
  result.checks.push('Proxied WebSocket connection and actual inbound message frame, REST chat send/read, and browser update')

  stage = 'public desktop and phone layouts'
  await mkdir(artifactDirectory, { recursive: true })
  await page.screenshot({ path: new URL('chat-desktop.png', artifactDirectory).pathname, animations: 'disabled' })
  for (const [name, width, height] of [['mobile', 390, 844], ['narrow', 320, 720]]) {
    await page.setViewportSize({ width, height })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), `Chat overflow at ${width}px`)
    const bottom = await chat.locator('.global-chat-composer').evaluate(element => element.getBoundingClientRect().bottom)
    assert.ok(bottom <= height - 72, 'Composer must remain above mobile navigation.')
    await page.screenshot({ path: new URL(`chat-${name}.png`, artifactDirectory).pathname, animations: 'disabled' })
  }
  await page.goto(`${appUrl}/home`)
  await expect(page.locator('.today-dashboard')).toBeVisible()
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), 'Narrow dashboard overflow')
  await page.screenshot({ path: new URL('dashboard-narrow.png', artifactDirectory).pathname, animations: 'disabled' })
  assert.deepEqual(pageErrors, [])
  const expectedAnonymousContentDenial = response => response.status === 403 && response.path === '/supabase/rest/v1/content_items'
    && response.identity === 'anonymous' && ['/signup', '/signin'].includes(response.pagePath)
  result.expectedAnonymousContentDenials = failedApiResponses.filter(expectedAnonymousContentDenial)
  assert.deepEqual(failedApiResponses.filter(response => !expectedAnonymousContentDenial(response)), [])
  assert.deepEqual(result.blockedOrigins.filter(origin => !blockedAssetOrigins.has(origin)), [], 'The public build must not attempt production APIs or unexpected external integrations during this smoke.')
  result.checks.push('1440/390/320px layouts, no uncaught errors/unexpected API failures, and no production API/integration attempts')
  result.passed = true
} catch (error) {
  result.failure = { stage, message: safeError(error) }
  if (activePage && !activePage.isClosed()) {
    await mkdir(artifactDirectory, { recursive: true })
    result.failure.pagePath = new URL(activePage.url()).pathname
    await activePage.screenshot({ path: new URL('failure.png', artifactDirectory).pathname, animations: 'disabled' }).catch(() => {})
    const alerts = await activePage.getByRole('alert').allTextContents().catch(() => [])
    if (alerts.length) result.failure.alerts = alerts.map(safeError)
  }
  if (failedApiResponses.length) result.failedApiResponses = failedApiResponses
  process.exitCode = 1
} finally {
  if (browser) await browser.close().catch(error => result.cleanupErrors.push(safeError(error)))
  for (const client of clients) await client.auth.signOut({ scope: 'local' }).catch(error => result.cleanupErrors.push(safeError(error)))
  for (const user of users) {
    try {
      const objects = check(await service.storage.from(avatarBucket).list(user.id))
      if (objects.length) check(await service.storage.from(avatarBucket).remove(objects.map(object => `${user.id}/${object.name}`)))
    } catch (error) { result.cleanupErrors.push(safeError(error)) }
  }
  for (const [table, id] of [['academy_classes', classId], ['academies', academyId]]) {
    if (id) try { check(await service.from(table).delete().eq('id', id)) } catch (error) { result.cleanupErrors.push(safeError(error)) }
  }
  for (const user of users) {
    try { check(await service.auth.admin.deleteUser(user.id)) } catch (error) { result.cleanupErrors.push(safeError(error)) }
  }
  if (result.cleanupErrors.length) { result.passed = false; process.exitCode = 1 }
  result.completedAt = new Date().toISOString()
  result.socketPaths = [...new Set(result.socketPaths)]
  result.blockedOrigins = [...new Set(result.blockedOrigins)]
  result.blockedExternalAssetOrigins = result.blockedOrigins.filter(origin => blockedAssetOrigins.has(origin))
  await mkdir(artifactDirectory, { recursive: true })
  await writeFile(new URL('result.json', artifactDirectory), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
}
