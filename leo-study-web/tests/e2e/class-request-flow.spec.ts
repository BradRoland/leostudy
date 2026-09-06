import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { parse } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const env = parse(readFileSync('.env.staging.local'))
if (env.SUPABASE_URL !== 'http://127.0.0.1:55431' || env.SMTP_HOST !== '127.0.0.1') throw new Error('These tests only run against the isolated localhost database and mail sink.')
const accounts = JSON.parse(readFileSync('.test-accounts.local', 'utf8')) as { cadet: { email: string; password: string; classId: string; departmentId: string } }
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const unique = () => `${Date.now()}${randomBytes(3).toString('hex')}`
async function localOnly(context: BrowserContext) {
  await context.route('**/*', async route => {
    if (!['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)) return route.abort('blockedbyclient')
    return route.continue()
  })
}
async function fillClassDetails(page: Page, marker: string) {
  const start = new Date().toISOString().slice(0, 10)
  const graduation = new Date(Date.now() + 190 * 86400000).toISOString().slice(0, 10)
  await page.getByLabel('Academy name', { exact: true }).fill(`Recovery Academy ${marker}`)
  await page.getByLabel('City', { exact: false }).fill('Test City')
  await page.getByLabel('State', { exact: false }).fill('California')
  await page.getByLabel('Class number or name', { exact: true }).fill(`Recovery Class ${marker}`)
  await page.getByLabel('Start date', { exact: true }).fill(start)
  await page.getByLabel('Graduation date', { exact: true }).fill(graduation)
  await page.getByLabel('Department 1', { exact: true }).fill('Example Police')
  await page.getByRole('button', { name: /Add another department/ }).click()
  await page.getByLabel('Department 2', { exact: true }).fill('Example Sheriff')
  await page.getByRole('combobox').selectOption('Example Sheriff')
  await page.getByLabel(/Anything else we should know/).fill('Synthetic request for isolated error recovery verification.')
  return { start, graduation }
}
async function signIn(page: Page, email: string, password: string) {
  await page.goto('/signin')
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: false }).click()
}

test.beforeEach(async ({ context }) => localOnly(context))

test('class request validates dates and preserves academy, departments, and dates when editing a saved draft', async ({ page }) => {
  const marker = unique()
  await page.goto('/classes/request')
  const dates = await fillClassDetails(page, marker)
  await page.getByLabel('Start date', { exact: true }).fill('2026-01-01')
  await page.getByLabel('Graduation date', { exact: true }).fill('2026-01-02')
  await page.getByRole('button', { name: /Continue to your account/ }).click()
  await expect(page.getByRole('alert')).toContainText('Graduation must be today or in the future.')
  await expect(page).toHaveURL(/\/classes\/request$/)
  await page.getByLabel('Start date', { exact: true }).fill(dates.start)
  await page.getByLabel('Graduation date', { exact: true }).fill(dates.graduation)
  await page.getByRole('button', { name: /Continue to your account/ }).click()
  await expect(page).toHaveURL(/\/signup\/class-request$/)
  await expect(page.locator('.academy-selection-summary')).toContainText(`Recovery Academy ${marker}`)
  await expect(page.locator('.academy-selection-summary')).toContainText(dates.graduation)
  await page.reload()
  await page.getByRole('link', { name: 'Edit class details', exact: true }).click()
  await expect(page.getByLabel('Academy name', { exact: true })).toHaveValue(`Recovery Academy ${marker}`)
  await expect(page.getByLabel('City', { exact: false })).toHaveValue('Test City')
  await expect(page.getByLabel('State', { exact: false })).toHaveValue('California')
  await expect(page.getByLabel('Graduation date', { exact: true })).toHaveValue(dates.graduation)
  await expect(page.getByLabel('Department 1', { exact: true })).toHaveValue('Example Police')
  await expect(page.getByLabel('Department 2', { exact: true })).toHaveValue('Example Sheriff')
  await expect(page.getByRole('combobox')).toHaveValue('Example Sheriff')
})

test('a failed class request submission keeps the new account and class details and retries exactly once', async ({ page }) => {
  test.setTimeout(90000)
  const marker = unique()
  const email = `ui-retry-${marker}@example.invalid`
  const password = `Test-${marker}-A!`
  let failed = false
  let requesterId = ''
  let requestId = ''
  await page.route('**/api/class-requests', async route => {
    if (route.request().method() === 'POST' && !failed) {
      failed = true
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Temporary test service interruption. Please retry.' }) })
    }
    return route.continue()
  })
  try {
    await page.goto('/classes/request')
    const dates = await fillClassDetails(page, marker)
    await page.getByRole('button', { name: /Continue to your account/ }).click()
    await page.getByLabel('Your full name', { exact: true }).fill(`Casey Retry${marker}`)
    await page.getByLabel('Email address', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByLabel('Confirm password', { exact: true }).fill(password)
    await page.getByRole('button', { name: /Create account & submit request/ }).click()
    await expect(page).toHaveURL(/\/classes\/request$/, { timeout: 25000 })
    await expect(page.getByRole('alert')).toContainText('Temporary test service interruption')
    await expect(page.getByLabel('Academy name', { exact: true })).toHaveValue(`Recovery Academy ${marker}`)
    await expect(page.getByRole('button', { name: 'Submit for approval', exact: false })).toBeEnabled()
    await page.getByRole('button', { name: 'Submit for approval', exact: false }).click()
    await expect(page).toHaveURL(/\/signin$/, { timeout: 20000 })
    await expect(page.getByRole('status')).toContainText('Your request is saved.')
    await expect(page.getByRole('alert')).toHaveCount(0)
    const saved = await admin.from('class_creation_requests').select('*').eq('class_name', `Recovery Class ${marker}`).throwOnError()
    expect(saved.data).toHaveLength(1)
    const request = saved.data![0]
    requesterId = request.requester_user_id
    requestId = request.id
    expect(request.academy_name).toBe(`Recovery Academy ${marker}`)
    expect(request.academy_city).toBe('Test City')
    expect(request.academy_state.toLowerCase()).toBe('california')
    expect(request.start_date).toBe(dates.start)
    expect(request.end_date).toBe(dates.graduation)
    expect(request.departments).toEqual(['Example Police', 'Example Sheriff'])
    expect(request.requester_department).toBe('Example Sheriff')
    const queue = await admin.from('class_request_email_outbox').select('id').eq('request_id', requestId).eq('event_type', 'owner_review').throwOnError()
    expect(queue.data).toHaveLength(1)
    const membership = await admin.from('class_memberships').select('id').eq('user_id', requesterId).throwOnError()
    expect(membership.data).toHaveLength(0)
  } finally {
    const requests = await admin.from('class_creation_requests').select('id,requester_user_id').eq('class_name', `Recovery Class ${marker}`)
    for (const row of requests.data || []) { requestId = row.id; requesterId = row.requester_user_id; await admin.from('class_creation_requests').delete().eq('id', row.id) }
    if (!requesterId) { const row = await admin.from('profiles').select('user_id').eq('username', `Casey Retry${marker}`).maybeSingle(); requesterId = row.data?.user_id || '' }
    if (requesterId) await admin.auth.admin.deleteUser(requesterId)
  }
})

test('a cadet cannot see owner approval controls from a direct owner review link', async ({ page }) => {
  await signIn(page, accounts.cadet.email, accounts.cadet.password)
  await expect(page.locator('.today-dashboard')).toBeVisible()
  await page.goto('/owner/classes?request=00000000-0000-0000-0000-000000000000')
  await expect(page.getByText('Owner access is required.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Approve class', exact: true })).toHaveCount(0)
})

test('password recovery delivers to the local sink and saves a working new password', async ({ page, browser }) => {
  test.setTimeout(120000)
  const marker = unique()
  const email = `ui-recovery-${marker}@example.invalid`
  const originalPassword = `Original-${marker}-A!`
  const replacementPassword = `Replacement-${marker}-A!`
  let userId = ''
  try {
    const created = await admin.auth.admin.createUser({ email, password: originalPassword, email_confirm: true, user_metadata: { username: `Recovery ${marker}`, display_name: `Recovery ${marker}` } })
    if (created.error) throw created.error
    userId = created.data.user!.id
    await admin.from('profiles').upsert({ user_id: userId, username: `Recovery ${marker}`, supporter_tier: 'free', agency: 'Test Police' }).throwOnError()
    await admin.from('class_memberships').upsert({ user_id: userId, class_id: accounts.cadet.classId, department_id: accounts.cadet.departmentId, role: 'cadet', status: 'active', is_active: true }, { onConflict: 'user_id,class_id' }).throwOnError()
    await admin.from('app_state').upsert({ user_id: userId, profile_details: { firstName: 'Recovery', lastName: marker, onboardingCompleted: true, displayMode: 'light', dailyGoalMinutes: 15, studyFocus: 'balanced' } }, { onConflict: 'user_id' }).throwOnError()
    await page.goto('/signin')
    await page.getByRole('button', { name: 'Forgot password?', exact: true }).click()
    await page.getByLabel('Email address', { exact: true }).fill(email)
    await page.getByRole('button', { name: 'Send reset link', exact: false }).click()
    await expect(page.getByRole('status')).toContainText('password reset link')
    let messageId = ''
    await expect.poll(async () => {
      const inbox = await fetch('http://127.0.0.1:55432/api/v1/messages').then(response => response.json())
      const message = inbox.messages.find((entry: { To?: { Address: string }[]; Subject?: string; ID: string }) => entry.To?.some(recipient => recipient.Address === email) && /reset/i.test(entry.Subject || ''))
      messageId = message?.ID || ''
      return Boolean(messageId)
    }, { timeout: 30000 }).toBe(true)
    const message = await fetch(`http://127.0.0.1:55432/api/v1/message/${messageId}`).then(response => response.json())
    const links = [...String(message.HTML || '').matchAll(/href=["']([^"']+)["']/g)].map(match => match[1].replaceAll('&amp;', '&'))
    const recoveryLink = links.find(link => link.includes('/auth/v1/verify'))
    expect(recoveryLink).toBeTruthy()
    const recoveryUrl = new URL(recoveryLink!)
    expect(['localhost', '127.0.0.1']).toContain(recoveryUrl.hostname)
    await page.goto(recoveryUrl.toString())
    await expect(page.getByRole('heading', { name: 'Choose a fresh password.', exact: true })).toBeVisible({ timeout: 30000 })
    await page.getByLabel('New password', { exact: true }).fill(replacementPassword)
    await page.getByLabel('Confirm new password', { exact: true }).fill(replacementPassword)
    await page.getByRole('button', { name: 'Save password & continue', exact: true }).click()
    await expect(page.locator('.today-dashboard')).toBeVisible()
    const freshContext = await browser.newContext({ baseURL: 'http://127.0.0.1:5176' })
    try {
      await localOnly(freshContext)
      const fresh = await freshContext.newPage()
      await signIn(fresh, email, originalPassword)
      await expect(fresh.getByRole('alert')).toContainText(/invalid|incorrect|credentials/i)
      await fresh.getByLabel('Password', { exact: true }).fill(replacementPassword)
      await fresh.getByRole('button', { name: 'Sign in', exact: false }).click()
      await expect(fresh.locator('.today-dashboard')).toBeVisible()
    } finally { await freshContext.close() }
  } finally { if (userId) await admin.auth.admin.deleteUser(userId) }
})
