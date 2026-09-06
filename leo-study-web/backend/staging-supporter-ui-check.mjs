// Real browser + clone grants, with no Stripe network calls or real charges.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { parse } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { chromium, expect } from '@playwright/test'
const env = parse(await readFile(new URL('../.env.staging.local', import.meta.url)))
assert.equal(env.SUPABASE_URL, 'http://127.0.0.1:55431')
const origin = process.env.SUPPORT_UI_ORIGIN || 'http://127.0.0.1:5176'
assert.ok(['http://127.0.0.1:5176', 'https://dev.180.academy'].includes(origin))
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const check = ({ data, error }) => { assert.ifError(error); return data }
let id, academyId, classId, browser
try {
  const marker = randomUUID().slice(0, 8)
  academyId = check(await admin.from('academies').insert({ name: `Support ${marker}`, city: 'Synthetic', state: 'CA' }).select('id').single()).id
  classId = check(await admin.from('academy_classes').insert({ academy_id: academyId, class_name: `Support ${marker}`, status: 'active', visibility: 'unlisted', join_mode: 'open' }).select('id').single()).id
  const departmentId = check(await admin.from('class_departments').insert({ class_id: classId, name: 'Training Division' }).select('id').single()).id
  const email = `support-ui-${marker}@example.invalid`, password = `Test!${randomUUID()}`
  id = check(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user.id
  check(await admin.from('profiles').upsert({ user_id: id, username: `Support ${marker}`, agency: 'Training Division' }))
  check(await admin.from('class_memberships').insert({ user_id: id, class_id: classId, department_id: departmentId, role: 'cadet', status: 'active', is_active: true }))
  check(await admin.from('app_state').upsert({ user_id: id, profile_details: { firstName: 'Support', lastName: marker, onboardingCompleted: true, displayMode: 'light', themeId: 'midnight', agency: 'Training Division' } }))
  browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.route('**/*', route => (origin.startsWith('https:') ? new URL(route.request().url()).origin === origin : ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)) ? route.continue() : route.abort())
  const page = await context.newPage(), errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(`${origin}/signin`)
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: false }).click()
  await expect(page.locator('.academy-home-support')).toBeVisible()
  await expect(page.locator('.home-class-activity')).not.toHaveAttribute('open')
  await page.getByRole('button', { name: 'Explore supporter benefits' }).click()
  await expect(page.getByText('Development preview — payments are disabled. You will not be charged.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Unavailable in preview' })).toHaveCount(3)
  for (const button of await page.getByRole('button', { name: 'Unavailable in preview' }).all()) await expect(button).toBeDisabled()
  await page.getByRole('button', { name: 'Refresh supporter access' }).click()
  await expect(page.getByText(/No paid tier is confirmed yet/)).toBeVisible()
  const customize = async () => { await page.goto(`${origin}/profile`); await page.getByRole('button', { name: 'Customization', exact: true }).click() }
  await customize()
  await expect(page.getByRole('button', { name: 'Pastel Rose', exact: true })).toBeDisabled()
  for (const [tier, label] of [['tier2', '$2 Supporter'], ['tier5', '$5 Supporter+'], ['tier10', '$10 Pro Supporter']]) {
    await page.goto(`${origin}/support`)
    check(await admin.rpc('fulfill_supporter_checkout', { p_session_id: `cs_test_${randomUUID()}`, p_user_id: id, p_tier: tier, p_livemode: false }))
    // A focus return (as after hosted Stripe checkout) must update access without logging in again.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.getByText(`Current tier: ${label}`, { exact: true })).toBeVisible()
    await customize()
    if (tier === 'tier2') await expect(page.getByRole('button', { name: 'Pastel Rose', exact: true })).toBeDisabled()
    else await expect(page.getByRole('button', { name: 'Pastel Rose', exact: true })).toBeEnabled()
    if (tier === 'tier10') await expect(page.getByLabel('Glow enabled')).toBeVisible()
    else await expect(page.getByText('Locked • $10 Pro Supporter', { exact: true })).toBeVisible()
  }
  await page.goto(`${origin}/profile`)
  await page.getByLabel('About me', { exact: true }).fill('Saved after supporter upgrade')
  const save = page.getByRole('button', { name: 'Save Profile', exact: false })
  if (await save.count()) await save.click()
  else await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(async () => check(await admin.from('profiles').select('bio').eq('user_id', id).single()).bio).toBe('Saved after supporter upgrade')
  assert.equal(check(await admin.from('profiles').select('supporter_tier').eq('user_id', id).single()).supporter_tier, 'tier10')
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport)
    await page.goto(`${origin}/home`)
    await expect(page.locator('.academy-home-support')).toBeVisible()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    await page.getByRole('button', { name: 'Explore supporter benefits' }).click()
    await expect(page.locator('.support-grid')).toBeVisible()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
  }
  await page.screenshot({ path: '/tmp/academy-support-desktop.png', fullPage: true })
  assert.deepEqual(errors, [])
  await context.close()
  console.log('PASS: support discoverability, preview payment lock, all three tier gates, return-to-page entitlement refresh, profile save and responsive layout.')
} finally {
  await browser?.close()
  if (id) check(await admin.auth.admin.deleteUser(id))
  if (classId) check(await admin.from('academy_classes').delete().eq('id', classId))
  if (academyId) check(await admin.from('academies').delete().eq('id', academyId))
}
