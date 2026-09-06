import { test, expect, type Page } from '@playwright/test'
import { readFileSync, mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { parse } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { xpRequiredForLevel } from '../../src/lib/academyProgression'

const env = parse(readFileSync('.env.staging.local'))
if (env.SUPABASE_URL !== 'http://127.0.0.1:55431' || env.SMTP_HOST !== '127.0.0.1') throw new Error('Reward UI tests require the isolated local database and mail sink.')
const accounts = JSON.parse(readFileSync('.test-accounts.local', 'utf8'))
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const initialXp = xpRequiredForLevel(4) - 10
let userId = ''
let email = ''
let password = ''

test.beforeAll(async () => {
  const marker = randomUUID().slice(0, 8)
  email = `rewards-${marker}@example.invalid`
  password = `Rewards-${randomUUID()}!`
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (created.error) throw created.error
  userId = created.data.user.id
  const department = await admin.from('class_departments').select('name').eq('id', accounts.cadet.departmentId).single().throwOnError()
  await admin.from('profiles').upsert({ user_id: userId, username: `Rewards ${marker}`, avatar_path: '', supporter_tier: 'free', agency: department.data!.name }).throwOnError()
  await admin.from('class_memberships').upsert({ user_id: userId, class_id: accounts.cadet.classId, department_id: accounts.cadet.departmentId, role: 'cadet', status: 'active', is_active: true }, { onConflict: 'user_id,class_id' }).throwOnError()
  await admin.from('app_state').upsert({ user_id: userId, profile_details: { firstName: 'Casey', lastName: 'Rewards', agency: department.data!.name, onboardingCompleted: true, displayMode: 'light', dailyGoalMinutes: 15, studyFocus: 'balanced', profileDecorationKey: 'auto', stats: { achievementXp: initialXp } } }, { onConflict: 'user_id' }).throwOnError()
})

test.afterAll(async () => {
  if (!userId) return
  const files = await admin.storage.from('avatars').list(userId)
  if (files.data?.length) await admin.storage.from('avatars').remove(files.data.map(file => `${userId}/${file.name}`))
  await admin.auth.admin.deleteUser(userId)
})

test.beforeEach(async ({ context }) => {
  await context.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort('blockedbyclient'))
})

async function signIn(page: Page) {
  await page.goto('/signin')
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: false }).click()
  await expect(page.locator('.today-dashboard')).toBeVisible()
}

test('daily reward retries safely, crosses a level boundary once, and persists across reload', async ({ page }, info) => {
  await signIn(page)
  const rewards = page.locator('.academy-rewards')
  await expect(rewards.getByRole('button', { name: 'Collect 25 XP' })).toBeEnabled()
  await expect(rewards.getByLabel('Level 3, Rising', { exact: true })).toBeVisible()
  let failNext = true
  let release: (() => void) | undefined
  const held = new Promise<void>(resolve => { release = resolve })
  await page.route('**/rest/v1/rpc/claim_daily_reward', async route => {
    if (failNext) { failNext = false; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic temporary failure' }) }) }
    await held
    return route.continue()
  })
  await rewards.getByRole('button', { name: 'Collect 25 XP' }).click()
  await expect(rewards.getByRole('alert')).toContainText('We could not confirm your reward')
  await rewards.getByRole('button', { name: 'Collect 25 XP' }).click()
  await expect(rewards.getByRole('button', { name: 'Collecting…' })).toBeDisabled()
  release!()
  await expect(rewards.getByRole('status')).toContainText('You earned 25 XP')
  await expect(rewards.getByLabel('Level 4, Rising', { exact: true })).toBeVisible()
  await expect(rewards).toContainText('25 bonus XP collected')
  await expect(rewards.getByRole('button', { name: /Collect \d+ XP/ })).toHaveCount(0)
  await page.reload()
  await expect(rewards).toContainText('Collected today')
  await expect(rewards).toContainText('25 bonus XP collected')
  await expect(rewards.getByLabel('Level 4, Rising', { exact: true })).toBeVisible()
  const state = await admin.from('app_state').select('profile_details').eq('user_id', userId).single().throwOnError()
  expect(state.data!.profile_details.stats.achievementXp).toBe(initialXp)
  expect(state.data!.profile_details.dailyRewardXp).toBeUndefined()
  mkdirSync('.artifacts/rewards-refresh.local', { recursive: true })
  await page.screenshot({ path: `.artifacts/rewards-refresh.local/home-${info.project.name}.png`, fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
})

test('earned avatars and frames save while locked rewards stay unavailable', async ({ page }, info) => {
  await signIn(page)
  const claim = page.getByRole('button', { name: 'Collect 25 XP' })
  if (await claim.count()) { await expect(claim).toBeEnabled(); await claim.click(); await expect(page.locator('.academy-rewards')).toContainText('Collected today') }
  await expect(page.locator('.taskbar-profile-image')).toHaveAttribute('src', /default-avatar\.svg/)
  await page.goto('/profile')
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Locked Summit avatar, level 5' })).toBeDisabled()
  await page.getByRole('button', { name: 'Select Orbit avatar', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Select Orbit avatar', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Save profile', exact: true }).click()
  await expect(page.locator('.settings-panel .saved-pill')).toContainText(/saved/i)
  const row = await admin.from('profiles').select('avatar_path').eq('user_id', userId).single().throwOnError()
  expect(row.data!.avatar_path).toMatch(new RegExp(`^${userId}/`))
  const image = await admin.storage.from('avatars').download(row.data!.avatar_path)
  if (image.error) throw image.error
  expect(Buffer.from(await image.data.arrayBuffer()).equals(readFileSync('public/reward-avatars/orbit.png'))).toBe(true)
  await page.reload()
  await expect(page.locator('.settings-panel .avatar').first()).toHaveAttribute('src', /storage\/v1\/object\/public\/avatars\//)
  await page.getByRole('button', { name: 'Level & Rewards', exact: true }).click()
  const frame = page.locator('.profile-decoration-card').filter({ hasText: 'Silverline' })
  await expect(frame).toBeEnabled()
  await frame.click()
  await page.getByRole('button', { name: 'Save frame', exact: true }).click()
  await expect.poll(async () => (await admin.from('app_state').select('profile_details').eq('user_id', userId).single()).data?.profile_details.profileDecorationKey).toBe('rank_03')
  await expect(page.locator('.profile-decoration-card').filter({ hasText: 'Academy Legend' })).toBeDisabled()
  await page.screenshot({ path: `.artifacts/rewards-refresh.local/collection-${info.project.name}.png`, fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
})

test('games and settings refresh works at narrow widths and in both themes', async ({ page }, info) => {
  const crashes: string[] = []
  page.on('pageerror', error => crashes.push(error.message))
  await signIn(page)
  for (const mode of ['light', 'dark']) {
    await page.goto('/profile')
    await expect(page.locator('.academy-profile-settings')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Account settings', exact: true })).toBeVisible()
    const toggle = page.getByRole('button', { name: `Switch to ${mode} mode`, exact: true })
    if (await toggle.count()) {
      await toggle.click()
      await expect.poll(async () => (await admin.from('app_state').select('profile_details').eq('user_id', userId).single()).data?.profile_details.displayMode).toBe(mode)
    }
    for (const path of ['/games', '/profile']) {
      await page.goto(path)
      await expect(page.locator(path === '/games' ? '.academy-games-hub' : '.academy-profile-settings')).toBeVisible()
      if (mode === 'light') await expect(page.locator('.app-shell')).toHaveClass(/ui-light-mode/)
      else await expect(page.locator('.app-shell')).not.toHaveClass(/ui-light-mode/)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `.artifacts/rewards-refresh.local/${path.slice(1)}-${mode}-${info.project.name}.png`, fullPage: true })
    }
  }
  await page.goto('/games')
  await page.locator('.academy-game-card').filter({ hasText: 'Matching' }).click()
  await expect(page).toHaveURL(/\/games\/matching$/)
  await page.goto('/games')
  await page.locator('.academy-game-card').filter({ hasText: 'Speed Test' }).click()
  await expect(page).toHaveURL(/\/games\/speed$/)
  await page.goto('/games')
  await page.locator('.academy-game-card').filter({ hasText: 'Code Blaster' }).click()
  await expect(page).toHaveURL(/\/games\/blaster$/)
  await page.goto('/games')
  await page.locator('.academy-game-card').filter({ hasText: '1v1' }).click()
  await expect(page).toHaveURL(/\/games\/duel$/)
  expect(crashes).toEqual([])
})

test('a delayed daily reward status preserves earned level snapshots during unrelated saves', async ({ page }) => {
  await signIn(page)
  const rewards = page.locator('.academy-rewards')
  await expect(rewards).toContainText(/Reward [1-7] of 7|Added to your progress/)
  const collect = rewards.getByRole('button', { name: 'Collect 25 XP', exact: false })
  if (await collect.count()) { await expect(collect).toBeEnabled(); await collect.click() }
  await expect(rewards).toContainText('25 bonus XP collected')
  const expectedXp = initialXp + 25
  await expect.poll(async () => (await admin.from('app_state').select('profile_details').eq('user_id', userId).single()).data?.profile_details.levelSnapshot?.totalXp).toBe(expectedXp)

  let release: () => void = () => {}
  const gate = new Promise<void>(resolve => { release = resolve })
  let markHeld: () => void = () => {}
  const held = new Promise<void>(resolve => { markHeld = resolve })
  let holding = true
  const persistedTotals: number[] = []
  page.on('request', request => {
    if (!holding || !request.url().includes('/rest/v1/app_state') || !['POST', 'PATCH'].includes(request.method())) return
    const body = request.postDataJSON()
    for (const row of Array.isArray(body) ? body : [body]) {
      const total = row?.profile_details?.levelSnapshot?.totalXp
      if (typeof total === 'number') persistedTotals.push(total)
    }
  })
  await page.route('**/rest/v1/rpc/get_daily_reward_status', async route => {
    if (holding) { markHeld(); await gate }
    await route.continue()
  })
  try {
    await page.reload()
    await held
    await expect(page.locator('.today-dashboard')).toBeVisible()
    await expect(rewards.getByLabel('Level 4, Rising', { exact: true })).toBeVisible()
    await expect(rewards).toContainText('Checking your rewards')

    // Make a real unrelated autosave while the reward RPC is unavailable. The
    // persisted level must stay earned, rather than briefly saving a zero bonus.
    await page.getByRole('button', { name: 'Account settings', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
    const darkToggle = page.getByRole('button', { name: 'Switch to dark mode', exact: true })
    const nextMode = await darkToggle.count() ? 'dark' : 'light'
    await page.getByRole('button', { name: `Switch to ${nextMode} mode`, exact: true }).click()
    await expect.poll(async () => (await admin.from('app_state').select('profile_details').eq('user_id', userId).single()).data?.profile_details.displayMode).toBe(nextMode)
    const pending = await admin.from('app_state').select('profile_details').eq('user_id', userId).single().throwOnError()
    expect(pending.data!.profile_details.levelSnapshot.totalXp).toBe(expectedXp)
    expect(pending.data!.profile_details.stats.achievementXp).toBe(initialXp)
    expect(persistedTotals.length).toBeGreaterThan(0)
    expect(persistedTotals.every(total => total >= expectedXp)).toBe(true)

    holding = false
    release()
    await page.goto('/home')
    await expect(rewards).toContainText('25 bonus XP collected')
    await expect(rewards.getByLabel('Level 4, Rising', { exact: true })).toBeVisible()
    await expect.poll(async () => (await admin.from('app_state').select('profile_details').eq('user_id', userId).single()).data?.profile_details.levelSnapshot?.totalXp).toBe(expectedXp)
  } finally {
    holding = false
    release()
  }
})
