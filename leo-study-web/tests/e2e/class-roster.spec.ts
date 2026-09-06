import { test, expect, type Page } from '@playwright/test'
import { readFileSync, mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { parse } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const publicCheck = process.env.CLASS_ROSTER_PUBLIC_CHECK === 'true'
const origin = publicCheck ? 'https://dev.180.academy' : 'http://127.0.0.1:5176'
const env = parse(readFileSync('.env.staging.local'))
if (env.SUPABASE_URL !== 'http://127.0.0.1:55431' || env.SMTP_HOST !== '127.0.0.1') throw new Error('Roster fixtures require the isolated local clone and mail sink.')
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const userIds: string[] = []
const classIds: string[] = []
let academyId = '', departmentId = '', classId = '', email = '', password = '', peerId = ''
const names = { viewer: 'Roster Viewer', peer: 'Casey Classmate', newcomer: 'Morgan Newcomer', outsider: 'Outside Member', removed: 'Removed Member' }

test.beforeAll(async () => {
  if (publicCheck) {
    const expected = process.env.CLASS_ROSTER_EXPECTED_COMMIT || ''
    expect(expected).toMatch(/^[0-9a-f]{40}$/)
    const version = await fetch(`${origin}/app-version.json`).then(response => response.json())
    expect(version.commit).toBe(expected)
  }
  const marker = randomUUID().slice(0, 8)
  academyId = (await admin.from('academies').insert({ name: `Roster QA ${marker}`, city: 'Test', state: 'CA' }).select('id').single().throwOnError()).data!.id
  for (const className of ['Roster Class', 'Other Active Class']) {
    classIds.push((await admin.from('academy_classes').insert({ academy_id: academyId, class_name: className, status: 'active', visibility: 'unlisted', join_mode: 'open' }).select('id').single().throwOnError()).data!.id)
  }
  classId = classIds[0]
  departmentId = (await admin.from('class_departments').insert({ class_id: classId, name: 'Academy Training Department' }).select('id').single().throwOnError()).data!.id
  const otherDepartment = (await admin.from('class_departments').insert({ class_id: classIds[1], name: 'Outside Department' }).select('id').single().throwOnError()).data!.id
  for (const [key, name] of Object.entries(names)) {
    const userEmail = `roster-${key}-${marker}@example.invalid`
    const userPassword = `Roster-${randomUUID()}!`
    const created = await admin.auth.admin.createUser({ email: userEmail, password: userPassword, email_confirm: true })
    if (created.error) throw created.error
    const id = created.data.user.id
    userIds.push(id)
    if (key === 'viewer') { email = userEmail; password = userPassword }
    if (key === 'peer') peerId = id
    await admin.from('profiles').upsert({ user_id: id, username: name, avatar_path: '', supporter_tier: 'free', bio: key === 'peer' ? 'Learning one day at a time.' : '' }).throwOnError()
    await admin.from('class_memberships').insert({ user_id: id, class_id: key === 'outsider' ? classIds[1] : classId, department_id: key === 'outsider' ? otherDepartment : departmentId, role: 'cadet', status: 'active', is_active: true }).throwOnError()
    if (key !== 'newcomer') await admin.from('app_state').upsert({ user_id: id, profile_details: { firstName: name.split(' ')[0], lastName: name.split(' ')[1], onboardingCompleted: true, displayMode: 'light', stats: { studySeconds: key === 'peer' ? 7320 : 0, studyDayStreak: key === 'peer' ? 7 : 0, bestStudyDayStreak: key === 'peer' ? 9 : 0, flashcardsReviewed: key === 'peer' ? 42 : 0, scenariosReviewed: key === 'peer' ? 6 : 0, gamePlays: { matching: 3, speed: 2, blaster: 1 } } }, performance: key === 'peer' ? { '187': { correctStreak: 20, correctCount: 20 }, '211': { correctStreak: 21, correctCount: 21 } } : {} }).throwOnError()
    if (key === 'removed') await admin.from('class_memberships').delete().eq('user_id', id).eq('class_id', classId).throwOnError()
  }
  await admin.from('duel_player_stats').upsert({ user_id: peerId, class_id: classId, game_type: 'all', wins: 4, losses: 2, current_win_streak: 2 }, { onConflict: 'class_id,user_id,game_type' }).throwOnError()
})

test.afterAll(async () => {
  for (const id of userIds) { const result = await admin.auth.admin.deleteUser(id); if (result.error) throw result.error }
  for (const id of classIds) await admin.from('academy_classes').delete().eq('id', id).throwOnError()
  if (academyId) await admin.from('academies').delete().eq('id', academyId).throwOnError()
})
test.beforeEach(async ({ context }) => {
  await context.route('**/*', route => (publicCheck ? new URL(route.request().url()).origin === origin : ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)) ? route.continue() : route.abort('blockedbyclient'))
})
async function openRoster(page: Page) {
  await page.goto(`${origin}/signin`)
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: false }).click()
  await expect(page.locator('.today-dashboard')).toBeVisible()
  await page.goto(`${origin}/classes`)
  await expect(page.getByRole('heading', { name: 'Your Class Workspace', exact: true })).toBeVisible()
}

test('My Class lists all classmates and opens correct stats without class discovery', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openRoster(page)
  const roster = page.locator('.academy-class-roster')
  await expect(roster.getByRole('status')).toHaveText('3 members in your class')
  await expect(page.locator('.classmate-row')).toHaveCount(3)
  await expect(roster.getByText(names.outsider, { exact: true })).toHaveCount(0)
  await expect(roster.getByText(names.removed, { exact: true })).toHaveCount(0)
  await expect(roster.getByText('Other Active Class', { exact: true })).toHaveCount(0)
  await expect(roster.getByRole('button', { name: /join|request|set active|select/i })).toHaveCount(0)
  const newcomer = page.locator('.classmate-row').filter({ hasText: names.newcomer })
  await expect(newcomer).toContainText('0 min')
  const peer = page.locator('.classmate-row').filter({ hasText: names.peer })
  await expect(peer).toContainText('2h 2m')
  await expect(peer).toContainText('7 days')
  await expect(peer.locator('.classmate-stats div').filter({ hasText: '1v1 wins' }).locator('dd')).toHaveText('4')
  const opener = peer.getByRole('button', { name: `View ${names.peer}'s stats`, exact: true })
  await opener.click()
  const dialog = page.getByRole('dialog', { name: names.peer, exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Learning one day at a time.')
  for (const [label, value] of [['Study time', '2h 2m'], ['Codes mastered', '2'], ['Best study streak', '9 days'], ['Flashcards reviewed', '42'], ['Solo games played', '6'], ['1v1 wins', '4'], ['1v1 losses', '2']]) {
    await expect(dialog.locator('.classmate-stats div').filter({ has: page.getByText(label, { exact: true }) }).locator('dd')).toHaveText(value)
  }
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
  await page.getByLabel('Find a classmate', { exact: true }).fill('morgan')
  await expect(page.locator('.classmate-row')).toHaveCount(1)
  await page.getByLabel('Find a classmate', { exact: true }).fill('not a classmate')
  await expect(roster).toContainText('No classmates match your search.')
  await page.getByLabel('Find a classmate', { exact: true }).fill('')
  const discovery: string[] = []
  page.on('request', request => { if (request.url().includes('/rest/v1/academy_classes')) discovery.push(request.url()) })
  await page.getByRole('button', { name: 'Refresh roster' }).click()
  await expect(roster.getByRole('status')).toHaveText('3 members in your class')
  expect(discovery).toEqual([])
  mkdirSync('.artifacts/class-roster.local', { recursive: true })
  await page.screenshot({ path: `.artifacts/class-roster.local/roster-${info.project.name}.png`, fullPage: true })
  await opener.click()
  await page.screenshot({ path: `.artifacts/class-roster.local/profile-${info.project.name}.png` })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  expect(errors).toEqual([])
})

test('roster failure stays explicit and retries without showing another class', async ({ page }) => {
  await openRoster(page)
  await expect(page.locator('.classmate-row')).toHaveCount(3)
  await page.route('**/rest/v1/rpc/list_class_member_departments*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic retry check' }) }))
  await page.getByRole('button', { name: 'Refresh roster' }).click()
  await expect(page.getByRole('alert')).toContainText('We could not load your classmates')
  await expect(page.locator('.classmate-row')).toHaveCount(0)
  await page.unroute('**/rest/v1/rpc/list_class_member_departments*')
  await page.getByRole('button', { name: 'Refresh roster' }).click()
  await expect(page.locator('.classmate-row')).toHaveCount(3)
  const client = createClient(publicCheck ? `${origin}/supabase` : env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const login = await client.auth.signInWithPassword({ email, password })
  if (login.error) throw login.error
  const denied = await client.rpc('list_class_member_departments', { p_class_id: classIds[1] })
  expect(denied.error?.message).toContain('not a member')
  await client.auth.signOut()
})

test('roster reads beyond the first membership page', async ({ page }) => {
  await openRoster(page)
  await expect(page.locator('.classmate-row')).toHaveCount(3)
  const firstPage = Array.from({ length: 100 }, () => ({ user_id: randomUUID(), department_id: departmentId, department_name: 'Pagination fixture' }))
  const offsets: number[] = []
  await page.route('**/rest/v1/rpc/list_class_member_departments*', route => {
    const offset = Number(new URL(route.request().url()).searchParams.get('offset') || 0)
    offsets.push(offset)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(offset === 0 ? firstPage : [{ user_id: peerId, department_id: departmentId, department_name: 'Academy Training Department' }]) })
  })
  await page.getByRole('button', { name: 'Refresh roster' }).click()
  await expect(page.locator('.academy-class-roster').getByRole('status')).toHaveText('101 members in your class')
  expect(offsets).toEqual([0, 100])
  await page.getByLabel('Find a classmate', { exact: true }).fill(names.peer)
  await expect(page.locator('.classmate-row')).toHaveCount(1)
  await expect(page.locator('.classmate-row')).toContainText('2h 2m')
})


test('class roster and profiles stay readable in both themes and at narrow widths', async ({ page }, info) => {
  await openRoster(page)
  await expect(page.locator('.classmate-row')).toHaveCount(3)
  for (const mode of ['light', 'dark']) {
    const toggle = page.getByRole('button', { name: `Switch to ${mode} mode`, exact: true })
    if (await toggle.count()) await toggle.click()
    await expect.poll(() => page.locator('.app-shell').evaluate(element => element.classList.contains('ui-light-mode'))).toBe(mode === 'light')
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 850 })
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your Class Workspace')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      mkdirSync('.artifacts/class-roster.local', { recursive: true })
      await page.screenshot({ path: `.artifacts/class-roster.local/${publicCheck ? 'public' : 'local'}-${mode}-${width}-${info.project.name}.png`, fullPage: true })
      await page.getByRole('button', { name: `View ${names.peer}'s stats`, exact: true }).click()
      const dialog = page.getByRole('dialog', { name: names.peer })
      await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeInViewport({ ratio: 1 })
      await page.keyboard.press('Tab')
      await expect(dialog.getByRole('region', { name: 'Classmate study and game statistics' })).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
      const box = await dialog.boundingBox()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(width)
      await page.screenshot({ path: `.artifacts/class-roster.local/${publicCheck ? 'public' : 'local'}-profile-${mode}-${width}-${info.project.name}.png` })
      await page.keyboard.press('Escape')
    }
  }
})
