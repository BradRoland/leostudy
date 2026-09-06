// Actual browser regression limited to disposable accounts in the isolated clone.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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
  academyId = check(await service.from('academies').insert({ name: `Theme regression ${marker}`, city: 'Synthetic', state: 'CA' }).select('id').single()).id
  classId = check(await service.from('academy_classes').insert({ academy_id: academyId, class_name: 'Theme Test Class', status: 'active', visibility: 'unlisted', join_mode: 'open' }).select('id').single()).id
  const departmentId = check(await service.from('class_departments').insert({ class_id: classId, name: 'Training Division' }).select('id').single()).id
  for (const tier of ['tier5', 'free']) {
    const email = `theme-ui-${marker}-${tier}@example.invalid`, password = `${randomUUID()}-Test!9`
    const name = `Theme ${tier} ${marker}`
    const user = check(await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username: name, display_name: name } })).user
    users.push({ id: user.id, email, password, tier })
    check(await service.from('profiles').upsert({ user_id: user.id, username: name, supporter_tier: tier, agency: 'Training Division' }))
    check(await service.from('class_memberships').insert({ user_id: user.id, class_id: classId, department_id: departmentId, role: 'cadet', status: 'active', is_active: true }))
    check(await service.from('app_state').upsert({ user_id: user.id, profile_details: { firstName: 'Theme', lastName: tier, dailyGoalMinutes: 15, onboardingCompleted: true, displayMode: 'light', themeId: 'midnight', agency: 'Training Division' } }))
  }
  browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const login = async user => {
    await page.goto('http://127.0.0.1:5176/signin')
    await page.getByLabel('Email address', { exact: true }).fill(user.email)
    await page.getByLabel('Password', { exact: true }).fill(user.password)
    await page.getByRole('button', { name: 'Sign in', exact: false }).click()
    await expect(page.locator('.today-dashboard')).toBeVisible()
  }
  const customize = async () => {
    await page.goto('http://127.0.0.1:5176/profile')
    await page.getByRole('button', { name: 'Customization', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Website Theme', exact: true })).toBeVisible()
  }
  const accent = () => page.locator('.academy-sidebar-brand .academy-logo').evaluate(element => getComputedStyle(element).color)
  const settleTransitions = () => page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter(animation => animation instanceof CSSTransition).map(animation => animation.finished.catch(() => {})))
  })
  const select = async name => {
    await page.getByRole('button', { name, exact: true }).click()
    await expect(page.getByRole('button', { name, exact: true })).toHaveClass(/active/)
    await settleTransitions()
  }
  const save = async themeId => {
    await page.getByRole('button', { name: 'Save Customization', exact: true }).click()
    await expect(page.getByText('All changes saved', { exact: true })).toBeVisible()
    await expect.poll(async () => check(await service.from('app_state').select('profile_details').eq('user_id', users[0].id).single()).profile_details.themeId).toBe(themeId)
  }
  const checkButtonContrast = async () => {
    const ratio = await page.getByRole('button', { name: 'Save Customization', exact: true }).evaluate(element => {
      const style = getComputedStyle(element)
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
      const context = canvas.getContext('2d')
      const luminance = color => {
        context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1)
        const channels = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
        return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
      }
      const foreground = luminance(style.color), background = luminance(style.backgroundColor)
      return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05)
    })
    assert.ok(ratio >= 4.5, `Theme primary-button contrast ${ratio.toFixed(2)} must reach 4.5`)
  }
  const toggle = async name => {
    await page.getByRole('button', { name: 'Open profile menu', exact: true }).click()
    await page.getByRole('button', { name, exact: true }).click()
    await settleTransitions()
  }
  await login(users[0])
  await expect.poll(accent).toBe('rgb(49, 89, 237)')
  await customize()
  await expect(page.getByRole('button', { name: 'Pastel Rose', exact: true })).toBeEnabled()
  await select('Pastel Rose')
  await expect.poll(accent).not.toBe('rgb(49, 89, 237)')
  const roseAccent = await accent()
  await save('pastel-rose')
  await page.reload(); await page.getByRole('button', { name: 'Customization', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pastel Rose', exact: true })).toHaveClass(/active/)
  await expect.poll(accent).toBe(roseAccent)
  await checkButtonContrast()
  await toggle('Switch to Dark Mode')
  await expect(page.locator('.app-shell')).not.toHaveClass(/ui-light-mode/)
  await expect.poll(accent).not.toBe('rgb(128, 155, 255)')
  await save('pastel-rose')
  await page.reload(); await page.getByRole('button', { name: 'Customization', exact: true }).click()
  await expect(page.locator('.app-shell')).not.toHaveClass(/ui-light-mode/)
  await expect(page.getByRole('button', { name: 'Pastel Rose', exact: true })).toHaveClass(/active/)
  await checkButtonContrast()
  await select('Academy Blue')
  await expect.poll(accent).toBe('rgb(128, 155, 255)')
  await toggle('Switch to Light Mode')
  await expect.poll(accent).toBe('rgb(49, 89, 237)')
  await save('midnight')
  await page.reload(); await page.getByRole('button', { name: 'Customization', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Academy Blue', exact: true })).toHaveClass(/active/)
  await expect.poll(accent).toBe('rgb(49, 89, 237)')
  await page.getByRole('button', { name: 'Open profile menu', exact: true }).click()
  await page.getByRole('button', { name: 'Sign Out', exact: true }).click()
  await expect(page).toHaveURL(/\/signin$/)
  await expect(page.getByLabel('Email address', { exact: true })).toBeVisible()
  await login(users[1])
  await customize()
  await expect(page.getByRole('button', { name: 'Pastel Rose', exact: true })).toBeDisabled()
  await expect.poll(accent).toBe('rgb(49, 89, 237)')
  await toggle('Switch to Dark Mode')
  await expect.poll(accent).toBe('rgb(128, 155, 255)')
  assert.deepEqual(errors, [])
  console.log('PASS: paid theme visibly changes, saves, and survives reload in light/dark; primary-button text contrast passes 4.5; default/free retain 180 Academy blue and free themes remain locked. Only disposable fixture preferences changed.')
} finally {
  if (browser) await browser.close()
  if (classId) check(await service.from('academy_classes').delete().eq('id', classId))
  if (academyId) check(await service.from('academies').delete().eq('id', academyId))
  for (const user of users) check(await service.auth.admin.deleteUser(user.id))
}
