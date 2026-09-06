import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

// These tests require the explicitly isolated staging stack. No production URL
// or credentials are accepted. All data belongs to the disposable clone.
const accounts = JSON.parse(readFileSync('.test-accounts.local', 'utf8')) as { cadet: { email: string; password: string }; owner: { email: string; password: string } }
async function login(page: Page) {
  await page.goto('/signin')
  await page.getByLabel('Email address', { exact: true }).fill(accounts.cadet.email)
  await page.getByLabel('Password', { exact: true }).fill(accounts.cadet.password)
  await page.getByRole('button', { name: 'Sign in', exact: false }).click()
  await expect(page.locator('.today-dashboard')).toBeVisible()
}

test.beforeEach(async ({ context }) => {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort('blockedbyclient')
    return route.continue()
  })
})

test('existing account restores dashboard and major study, game, class, and profile routes', async ({ page }) => {
  const failures: string[] = []
  page.on('pageerror', error => failures.push(error.message))
  await login(page)
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Alex/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your study plan', exact: true })).toBeVisible()
  const paths = ['/study','/study/flashcards','/study/practice-test','/study/guide','/scenarios','/library','/games','/games/matching','/games/speed','/games/blaster','/games/duel','/leaderboards','/classes','/profile','/stats','/chat','/home']
  for (const path of paths) {
    await page.goto(path)
    await expect(page.locator('#main-content')).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`${path.replaceAll('/', '\\/')}$`))
    await expect(page.locator('#main-content')).not.toBeEmpty()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, `Horizontal overflow at ${path}`).toBeLessThanOrEqual(2)
  }
  expect(failures).toEqual([])
})

test('wrong password stays signed out and gives a usable error', async ({ page }) => {
  await page.goto('/signin')
  await page.getByLabel('Email address', { exact: true }).fill(accounts.cadet.email)
  await page.getByLabel('Password', { exact: true }).fill('Intentionally-wrong-password-948!')
  await page.getByRole('button', { name: 'Sign in', exact: false }).click()
  await expect(page.getByRole('alert')).toContainText(/invalid|incorrect|password|credentials/i)
  await expect(page).toHaveURL(/\/signin$/)
  await expect(page.getByRole('button', { name: 'Sign in', exact: false })).toBeEnabled()
})

test('new account completes class, department, photo, profile, and goal screens', async ({ page }) => {
  const marker = `${Date.now()}${randomBytes(3).toString('hex')}`
  const email = `ui-enrollment-${marker}@example.invalid`
  const password = `Test-${marker}-A!`
  await page.goto('/signup')
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Create account', exact: false }).click()
  await expect(page.getByRole('heading', { name: 'Find your class.' })).toBeVisible()
  await expect(page.getByRole('radio', { name: /Class 181/ })).toBeVisible()
  await expect(page.getByRole('radio', { name: /Class 182/ })).toBeVisible()
  await expect(page.getByRole('radio', { name: /Class 180/ })).toHaveCount(0)
  await page.getByRole('radio', { name: /Class 181/ }).check()
  await page.getByRole('button', { name: 'Continue', exact: false }).click()
  await expect(page.getByRole('heading', { name: 'Where do you serve?' })).toBeVisible()
  await page.getByRole('radio').first().check()
  await page.getByRole('button', { name: 'Continue', exact: false }).click()
  await page.getByLabel('First name', { exact: true }).fill('Jordan')
  await page.getByLabel('Last name', { exact: true }).fill(`Test${marker}`)
  await page.locator('input[type=file]').setInputFiles({ name: 'test-avatar.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFfQAAAAASUVORK5CYII=', 'base64') })
  await expect(page.getByAltText('Your profile preview')).toBeVisible()
  await page.getByRole('button', { name: 'Continue', exact: false }).click()
  await expect(page.getByRole('heading', { name: 'Build a routine that lasts.' })).toBeVisible()
  await page.getByRole('radio', { name: /Remember the essentials/ }).check()
  await page.getByRole('button', { name: 'Let’s get started', exact: false }).click()
  await expect(page.locator('.today-dashboard')).toBeVisible({ timeout: 25000 })
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Jordan/ })).toBeVisible()
  await page.reload()
  await expect(page.locator('.today-dashboard')).toBeVisible()
})

test('class request is reviewed from the owner email link, then creator and cadet finish enrollment', async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000)
  const { parse } = await import('dotenv')
  const { createClient } = await import('@supabase/supabase-js')
  const env = parse(readFileSync('.env.staging.local'))
  expect(env.SUPABASE_URL).toBe('http://127.0.0.1:55431')
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const marker = `${Date.now()}${randomBytes(2).toString('hex')}`
  const className = `UI Class ${marker}`
  const email = `ui-request-${marker}@example.invalid`
  const peerEmail = `ui-peer-${marker}@example.invalid`
  const password = `Test-${marker}-A!`
  const start = new Date().toISOString().slice(0, 10)
  const end = new Date(Date.now() + 180 * 86400_000).toISOString().slice(0, 10)
  let requestId = '', classId = '', academyId = '', requesterId = '', peerId = ''
  const ownerContext = await browser.newContext({ viewport: page.viewportSize()!, isMobile: testInfo.project.name === 'mobile', hasTouch: testInfo.project.name === 'mobile' })
  try {
    await page.goto('/classes/request')
    await page.getByLabel('Academy name', { exact: true }).fill(`UI Academy ${marker}`)
    await page.getByLabel('Class number or name', { exact: true }).fill(className)
    await page.getByLabel('Start date', { exact: true }).fill(start)
    await page.getByLabel('Graduation date', { exact: true }).fill(end)
    await page.getByLabel('Department 1', { exact: true }).fill('Test Police')
    await page.getByRole('button', { name: /Add another department/ }).click()
    await page.getByLabel('Department 2', { exact: true }).fill('Test Sheriff')
    await page.getByRole('combobox', { name: 'Your department', exact: true }).selectOption('Test Police')
    await page.getByRole('button', { name: /Continue to your account/ }).click()
    await page.getByLabel('Your full name', { exact: true }).fill(`Sam Request${marker}`)
    await page.getByLabel('Email address', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByLabel('Confirm password', { exact: true }).fill(password)
    await page.getByRole('button', { name: /Create account & submit request/ }).click()
    await expect(page).toHaveURL(/\/signin$/, { timeout: 20000 })
    const request = await admin.from('class_creation_requests').select('id,requester_user_id,status').eq('class_name', className).single().throwOnError()
    requestId = request.data!.id; requesterId = request.data!.requester_user_id
    expect(request.data!.status).toBe('pending')
    await page.getByLabel('Email address', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: false }).click()
    await expect(page.getByRole('alert')).toContainText(/awaiting owner approval/)
    await expect(page.locator('.today-dashboard')).toHaveCount(0)

    const owner = await ownerContext.newPage()
    await owner.goto(`http://127.0.0.1:5176/owner/classes?request=${requestId}`)
    await owner.getByLabel('Email address', { exact: true }).fill(accounts.owner.email)
    await owner.getByLabel('Password', { exact: true }).fill(accounts.owner.password)
    await owner.getByRole('button', { name: 'Sign in', exact: false }).click()
    const card = owner.locator(`#class-request-${requestId}`)
    await expect(card).toBeVisible()
    await expect(card).toHaveClass(/class-request-highlight/)
    await card.getByRole('button', { name: 'Approve class', exact: true }).click()
    await expect(card).toContainText('status: approved')
    const approved = await admin.from('class_creation_requests').select('created_class_id').eq('id', requestId).single().throwOnError()
    classId = approved.data!.created_class_id
    const academy = await admin.from('academy_classes').select('academy_id').eq('id', classId).single().throwOnError()
    academyId = academy.data!.academy_id
    const creator = await admin.from('class_memberships').select('role').eq('class_id', classId).eq('user_id', requesterId).single().throwOnError()
    expect(creator.data!.role).toBe('class_admin')

    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: false }).click()
    await expect(page.getByRole('heading', { name: 'Make yourself at home.' })).toBeVisible()
    await expect(page.getByLabel('First name', { exact: true })).toHaveValue('Sam')
    await page.getByRole('button', { name: 'Continue', exact: false }).click()
    await page.getByRole('radio', { name: '30 min / day', exact: true }).check()
    await page.getByRole('button', { name: 'Let’s get started', exact: false }).click()
    await expect(page.locator('.today-dashboard')).toBeVisible()
    await page.goto('/classes/admin')
    await expect(page.getByText('Require admin approval to join', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByText('Require admin approval to join', { exact: true })).toBeVisible()

    const peerContext = await browser.newContext({ viewport: page.viewportSize()! })
    try {
      const cadet = await peerContext.newPage()
      await cadet.goto('http://127.0.0.1:5176/signup')
      await cadet.getByLabel('Email address', { exact: true }).fill(peerEmail)
      await cadet.getByLabel('Password', { exact: true }).fill(password)
      await cadet.getByLabel('Confirm password', { exact: true }).fill(password)
      await cadet.getByRole('button', { name: 'Create account', exact: false }).click()
      await cadet.getByRole('radio', { name: new RegExp(className) }).check()
      await cadet.getByRole('button', { name: 'Continue', exact: false }).click()
      await expect(cadet.getByRole('radio')).toHaveCount(2)
      await cadet.getByRole('radio', { name: 'Test Sheriff', exact: true }).check()
      await cadet.getByRole('button', { name: 'Continue', exact: false }).click()
      await cadet.getByLabel('First name', { exact: true }).fill('Taylor')
      await cadet.getByLabel('Last name', { exact: true }).fill(`Cadet${marker}`)
      await cadet.getByRole('button', { name: 'Continue', exact: false }).click()
      await cadet.getByRole('button', { name: 'Let’s get started', exact: false }).click()
      await expect(cadet.locator('.today-dashboard')).toBeVisible()
      const member = await admin.from('class_memberships').select('user_id,role,class_departments(name)').eq('class_id', classId).neq('user_id', requesterId).single().throwOnError()
      peerId = member.data!.user_id
      expect(member.data!.role).toBe('cadet')
      await cadet.goto('/classes/admin')
      await expect(cadet.getByText('Class admin or moderator access is required.', { exact: true })).toBeVisible()
    } finally { await peerContext.close() }
    await expect.poll(async () => {
      const inbox = await fetch('http://127.0.0.1:55432/api/v1/messages').then(r => r.json())
      return inbox.messages.filter((message: { Subject?: string }) => message.Subject?.includes(className)).length
    }, { timeout: 35000 }).toBe(2)
  } finally {
    await ownerContext.close()
    if (!requesterId) {
      const profile = await admin.from('profiles').select('user_id').eq('username', `Sam Request${marker}`).maybeSingle()
      requesterId = profile.data?.user_id || ''
    }
    if (requestId && !classId) {
      const row = await admin.from('class_creation_requests').select('created_class_id').eq('id', requestId).maybeSingle()
      classId = row.data?.created_class_id || ''
    }
    if (classId && !academyId) {
      const row = await admin.from('academy_classes').select('academy_id').eq('id', classId).maybeSingle()
      academyId = row.data?.academy_id || ''
    }
    if (requestId) await admin.from('class_creation_requests').delete().eq('id', requestId).throwOnError()
    if (classId) await admin.from('academy_classes').delete().eq('id', classId).throwOnError()
    if (academyId) await admin.from('academies').delete().eq('id', academyId).throwOnError()
    if (requesterId) await admin.auth.admin.deleteUser(requesterId)
    if (peerId) await admin.auth.admin.deleteUser(peerId)
  }
})

test('authentication callback errors stay readable and narrow layouts do not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('/auth/callback?error=access_denied&error_description=Authorization%20was%20cancelled')
  await expect(page.getByText('Authorization was cancelled', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2)
  await login(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2)
})
