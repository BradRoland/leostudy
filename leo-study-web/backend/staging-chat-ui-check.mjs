// Browser-only regression against the isolated clone; every message belongs to our synthetic class.
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { parse } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { chromium, expect } from '@playwright/test'

const env = parse(await readFile(new URL('../.env.staging.local', import.meta.url)))
assert.equal(env.SUPABASE_URL, 'http://127.0.0.1:55431')
const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const check = ({ data, error }) => { assert.ifError(error); return data }
const marker = randomUUID().slice(0, 8)
const users = []
let academyId, classId, browser
try {
  academyId = check(await service.from('academies').insert({ name: `Chat UI regression ${marker}`, city: 'Synthetic', state: 'CA' }).select('id').single()).id
  classId = check(await service.from('academy_classes').insert({ academy_id: academyId, class_name: 'Class 184', status: 'active', visibility: 'unlisted', join_mode: 'open' }).select('id').single()).id
  for (const [index, name] of ['Alex Morgan', 'Casey Rivera'].entries()) {
    const email = `chat-ui-${marker}-${index}@example.invalid`, password = `${randomUUID()}-Test!9`
    const user = check(await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username: name, display_name: name } })).user
    users.push({ id: user.id, email, password, name })
    check(await service.from('profiles').upsert({ user_id: user.id, username: `${name} ${marker}`, agency: 'Training Division' }))
    check(await service.from('class_memberships').insert({ user_id: user.id, class_id: classId, role: index === 0 ? 'class_admin' : 'cadet', status: 'active', is_active: true }))
    check(await service.from('app_state').upsert({ user_id: user.id, profile_details: { firstName: name.split(' ')[0], lastName: name.split(' ')[1], dailyGoalMinutes: 15, onboardingCompleted: true, displayMode: 'light', agency: 'Training Division' } }))
  }
  const members = check(await service.from('class_memberships').select('user_id').eq('class_id', classId))
  assert.deepEqual(new Set(members.map((row) => row.user_id)), new Set(users.map((row) => row.id)), 'No real recipients')
  check(await service.from('class_messages').insert({ class_id: classId, user_id: users[1].id, display_name: users[1].name, department_name: 'Training Division', message: 'Anyone reviewing search and seizure before tomorrow’s practice test?', created_at: new Date(Date.now() - 86400000).toISOString() }))
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } })
  await context.route('**/*', (route) => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
  const page = await context.newPage()
  const errors = []
  const realtimeErrors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.text().startsWith('Chat realtime subscription:')) realtimeErrors.push(message.text()) })
  page.on('websocket', (socket) => socket.on('framereceived', ({ payload }) => {
    try {
      const message = JSON.parse(String(payload))
      const body = Array.isArray(message) ? message[4] : message.payload
      const reason = body?.response?.reason || body?.message
      if (typeof reason === 'string') realtimeErrors.push(reason)
    } catch { /* Binary/heartbeat frames contain no diagnostic text. */ }
  }))
  await page.goto('http://127.0.0.1:5176/signin')
  await page.getByLabel('Email address', { exact: true }).fill(users[0].email)
  await page.getByLabel('Password', { exact: true }).fill(users[0].password)
  await page.getByRole('button', { name: 'Sign in', exact: false }).click()
  await expect(page.locator('.today-dashboard')).toBeVisible({ timeout: 20000 })
  await page.goto('http://127.0.0.1:5176/chat')
  const panel = page.locator('.global-chat-panel-full')
  await expect(panel).toBeVisible()
  await expect(panel.getByText('Yesterday', { exact: true })).toBeVisible()
  await expect(panel.getByText('Live updates', { exact: true })).toBeVisible({ timeout: 15000 }).catch((error) => { console.log('Realtime diagnostics:', realtimeErrors); throw error })
  await page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase.ts')
    const chat = supabase.getChannels().find((channel) => channel.topic.includes('class_chat_'))
    if (!chat) throw new Error('Expected an active synthetic class channel')
    await supabase.removeChannel(chat)
  })
  await expect(panel.getByText('Reconnecting', { exact: true })).toBeVisible()
  await expect(panel.getByText('Live updates', { exact: true })).toBeVisible({ timeout: 15000 })
  const outgoing = 'Absolutely. I’m reviewing the key exceptions now.\nLet’s compare notes after a quick practice round.'
  await panel.getByLabel('Message', { exact: true }).fill(outgoing)
  await panel.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(panel.getByText(outgoing, { exact: true })).toBeVisible()
  await expect(panel.getByText('Today', { exact: true })).toBeVisible()
  await expect(panel.getByLabel('Message', { exact: true })).toHaveValue('')
  const persisted = check(await service.from('class_messages').select('id,message').eq('class_id', classId).eq('user_id', users[0].id))
  assert.equal(persisted.length, 1)
  assert.equal(persisted[0].message, outgoing)
  const incoming = 'That sounds good. A little practice every day adds up.'
  check(await service.from('class_messages').insert({ class_id: classId, user_id: users[1].id, display_name: users[1].name, department_name: 'Training Division', message: incoming }))
  await expect(panel.getByText(incoming, { exact: true })).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(400) // Let the incoming-message scroll settle before opening its anchored picker.
  const incomingMessage = panel.locator('.global-chat-message', { hasText: incoming })
  await incomingMessage.hover()
  await incomingMessage.getByRole('button', { name: 'Add reaction', exact: true }).click()
  await panel.locator('.global-chat-reaction-picker-row .global-chat-reaction-option').first().click()
  await expect(incomingMessage.locator('.global-chat-reaction.active')).toContainText('1')
  await incomingMessage.getByRole('button', { name: 'Report message' }).click()
  await expect(page.getByRole('dialog', { name: 'Report a message' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await panel.getByRole('button', { name: 'Insert an emoji' }).click()
  await panel.getByRole('button', { name: 'Insert 📚', exact: true }).click()
  await expect(panel.getByLabel('Message', { exact: true })).toHaveValue('📚')
  await panel.getByLabel('Message', { exact: true }).fill('A draft that must survive a failed send.')
  await page.route('**/rest/v1/class_messages*', (route) => route.request().method() === 'POST' ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic failure' }) }) : route.continue())
  await page.waitForTimeout(2100)
  await panel.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(panel.getByRole('alert')).toContainText('Your message wasn’t sent')
  await expect(panel.getByLabel('Message', { exact: true })).toHaveValue('A draft that must survive a failed send.')
  await page.unroute('**/rest/v1/class_messages*')
  await panel.getByLabel('Message', { exact: true }).fill('')
  await panel.getByRole('button', { name: 'Insert an emoji' }).click()
  await panel.locator('.global-chat-title').click()
  await mkdir('docs/screenshots', { recursive: true })
  await page.screenshot({ path: 'docs/screenshots/chat-desktop-refresh.png', fullPage: true })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2))
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(panel.getByLabel('Message', { exact: true })).toBeVisible()
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2))
  await page.screenshot({ path: 'docs/screenshots/chat-mobile-refresh.png', fullPage: true })
  const composerBottom = await panel.locator('.global-chat-composer').evaluate((element) => element.getBoundingClientRect().bottom)
  assert.ok(composerBottom <= 844 - 78, 'Mobile composer stays above the bottom navigation')
  await page.setViewportSize({ width: 320, height: 720 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2))
  await page.setViewportSize({ width: 1440, height: 1080 })
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click()
  await expect(page.locator('.app-shell')).not.toHaveClass(/ui-light-mode/)
  await page.waitForTimeout(200) // Capture the settled theme after the shared color transition.
  const darkName = await panel.locator('.global-chat-name').first().evaluate((element) => getComputedStyle(element).color)
  assert.equal(darkName, 'rgb(244, 245, 248)', 'Sender names use the readable dark-theme ink token')
  await page.screenshot({ path: 'docs/screenshots/chat-desktop-dark-refresh.png', fullPage: true })
  await page.goto('http://127.0.0.1:5176/home')
  await page.getByRole('button', { name: 'Open chat', exact: true }).click()
  const popup = page.locator('.global-chat-widget:not(.global-chat-widget-full) .global-chat-panel')
  await expect(popup).toBeVisible()
  await expect(popup.getByText(outgoing, { exact: true })).toBeVisible()
  await popup.getByRole('button', { name: 'Close chat' }).click()
  await expect(popup).toHaveCount(0)
  assert.deepEqual(errors, [])
  console.log('PASS: real browser class chat loads, groups days, recovers an unexpectedly closed channel, sends/persists multiline text, receives updates, adds reactions, opens/cancels reporting, inserts emoji, preserves a failed-send draft, adapts to desktop/390px/320px without overflow, keeps the composer above mobile navigation, uses readable dark-theme sender text, and opens/closes the popup. No real class recipients.')
} finally {
  if (browser) await browser.close()
  if (classId) check(await service.from('academy_classes').delete().eq('id', classId))
  if (academyId) check(await service.from('academies').delete().eq('id', academyId))
  for (const user of users) check(await service.auth.admin.deleteUser(user.id))
}
