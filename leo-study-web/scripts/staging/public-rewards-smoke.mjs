// Explicitly run only after the development deployment is declared ready.
// Fixture service access stays on localhost; public requests use anon/user tokens.
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { randomUUID, createHash } from 'node:crypto'
import { parse } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { chromium, expect } from '@playwright/test'

assert.ok(process.argv.includes('--run-approved-dev-check'), 'Deployment must be ready; pass --run-approved-dev-check explicitly.')
const expectedCommit = process.argv.find(value => value.startsWith('--expected-commit='))?.split('=')[1]
if (expectedCommit) assert.match(expectedCommit, /^[0-9a-f]{40}$/)
const appUrl = 'https://dev.180.academy'
const apiUrl = `${appUrl}/supabase`
const env = parse(await readFile(new URL('../../.env.staging.local', import.meta.url)))
const accounts = JSON.parse(await readFile(new URL('../../.test-accounts.local', import.meta.url), 'utf8'))
assert.equal(env.SUPABASE_URL, 'http://127.0.0.1:55431', 'Only the retained isolated clone may create fixtures.')
assert.match(accounts.cadet.email, /@example\.invalid$/)
assert.ok(env.SUPABASE_SERVICE_ROLE_KEY && env.VITE_SUPABASE_ANON_KEY)
const output = new URL('../../artifacts/public-rewards.local/', import.meta.url)
const marker = randomUUID().slice(0, 8)
const email = `public-rewards-${marker}@example.invalid`
const password = `Rewards-${randomUUID()}!`
const result = { appUrl, passed: false, startedAt: new Date().toISOString(), checks: [], cleanupErrors: [] }
const browserErrors = []
let browser, page, userId, academyId, classId, stage = 'clone identity preflight'
const check = ({ data, error }) => { if (error) throw new Error(error.message || 'API request failed'); return data }
const safe = error => String(error?.message || error)
  .replaceAll(env.SUPABASE_SERVICE_ROLE_KEY, '[redacted]')
  .replaceAll(env.VITE_SUPABASE_ANON_KEY, '[redacted]')
  .replaceAll(password, '[redacted]')
  .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted]')
  .slice(0, 1800)
function limitedFetch(origin, prefix = '/') {
  return (input, options) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    assert.equal(url.origin, origin, 'Unexpected API origin refused.')
    assert.ok(url.pathname.startsWith(prefix), 'Unexpected API path refused.')
    return fetch(input, { ...options, redirect: 'error', signal: AbortSignal.timeout(30000) })
  }
}
const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: limitedFetch(env.SUPABASE_URL) } })
const client = createClient(apiUrl, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: limitedFetch(appUrl, '/supabase/') } })
const publicFetch = limitedFetch(appUrl)

try {
  const known = check(await service.auth.admin.getUserById(accounts.cadet.userId)).user
  assert.equal(known.email, accounts.cadet.email, 'Local API must be the known isolated clone.')
  stage = 'published build and assets'
  const health = await publicFetch(`${appUrl}/api/health`)
  assert.equal(health.status, 200)
  assert.equal((await health.json()).ok, true)
  const version = await publicFetch(`${appUrl}/app-version.json`).then(response => response.json())
  assert.match(version.commit, /^[0-9a-f]{40}$/)
  if (expectedCommit) assert.equal(version.commit, expectedCommit, 'Wait for the expected development commit.')
  result.commit = version.commit
  for (const extension of ['svg', 'png']) {
    const filename = `default-avatar-academy-v1.${extension}`
    const defaultAvatar = await publicFetch(`${appUrl}/${filename}`)
    assert.equal(defaultAvatar.status, 200)
    const actualHash = createHash('sha256').update(Buffer.from(await defaultAvatar.arrayBuffer())).digest('hex')
    const expectedHash = createHash('sha256').update(await readFile(new URL(`../../public/${filename}`, import.meta.url))).digest('hex')
    assert.equal(actualHash, expectedHash, `Published default avatar ${extension} must match the reviewed versioned asset.`)
  }
  result.checks.push('Public health, exact source commit, and both versioned default avatar SVG/PNG bytes')

  stage = 'synthetic fixtures'
  academyId = check(await service.from('academies').insert({ name: `Reward QA ${marker}`, city: 'Synthetic', state: 'CA' }).select('id').single()).id
  classId = check(await service.from('academy_classes').insert({ academy_id: academyId, class_name: `Reward QA ${marker}`, status: 'active', visibility: 'unlisted', join_mode: 'open' }).select('id').single()).id
  const departmentId = check(await service.from('class_departments').insert({ class_id: classId, name: 'Synthetic Reward Department' }).select('id').single()).id
  const username = `Casey Rewards QA ${marker}`
  userId = check(await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username, display_name: username } })).user.id
  check(await service.from('profiles').upsert({ user_id: userId, username, avatar_path: '', supporter_tier: 'free', agency: 'Synthetic Reward Department' }))
  check(await service.from('class_memberships').insert({ user_id: userId, class_id: classId, department_id: departmentId, role: 'cadet', status: 'active', is_active: true }))
  check(await service.from('app_state').upsert({ user_id: userId, profile_details: { firstName: 'Casey', lastName: 'Rewards QA', onboardingCompleted: true, displayMode: 'light', themeId: 'midnight', dailyGoalMinutes: 15, studyFocus: 'balanced', agency: 'Synthetic Reward Department', stats: { achievementXp: 0 } } }))
  check(await client.auth.signInWithPassword({ email, password }))
  const before = check(await client.rpc('get_daily_reward_status'))
  assert.equal(before.totalClaims, 0)
  assert.equal(before.canClaim, true)

  stage = 'public browser claim'
  browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  context.setDefaultTimeout(20000)
  await context.route('**/*', route => new URL(route.request().url()).origin === appUrl ? route.continue() : route.abort('blockedbyclient'))
  await context.routeWebSocket('**/*', route => {
    const url = new URL(route.url())
    if (url.origin === 'wss://dev.180.academy' && url.pathname.startsWith('/supabase/realtime/')) route.connectToServer()
    else route.close({ code: 1008, reason: 'Development origin only' })
  })
  page = await context.newPage()
  page.on('pageerror', error => browserErrors.push(safe(error)))
  await page.goto(`${appUrl}/signin`)
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: false }).click()
  await expect(page.locator('.today-dashboard')).toBeVisible()
  const avatar = page.locator('.taskbar-profile-image')
  await expect(avatar).toHaveAttribute('src', /default-avatar-academy-v1\.svg$/)
  await expect.poll(() => avatar.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true)
  const rewards = page.locator('.academy-rewards')
  await expect(rewards.getByRole('button', { name: 'Collect 25 XP', exact: true })).toBeEnabled()
  await rewards.getByRole('button', { name: 'Collect 25 XP', exact: true }).click()
  await expect(rewards.getByRole('status')).toContainText('You earned 25 XP')
  await expect(rewards).toContainText('25 bonus XP collected')
  await page.reload()
  await expect(rewards).toContainText('Collected today')
  await expect(rewards).toContainText('25 bonus XP collected')
  await expect(rewards.getByRole('button', { name: /Collect \d+ XP/ })).toHaveCount(0)
  const after = check(await client.rpc('get_daily_reward_status'))
  assert.equal(after.totalBonusXp, 25)
  assert.equal(after.totalClaims, 1)
  const replay = check(await client.rpc('claim_daily_reward'))
  assert.equal(replay.claimed, false)
  assert.equal(replay.awardedXp, 0)
  assert.equal(replay.totalBonusXp, 25)
  const state = check(await service.from('app_state').select('profile_details').eq('user_id', userId).single()).profile_details
  assert.equal(state.stats.achievementXp, 0)
  assert.equal(state.dailyRewardXp, undefined)
  result.checks.push('Public browser collected 25 XP once; reload and user-token replay preserve one award; raw achievement XP unchanged')

  stage = 'games, settings, collections and responsive themes'
  await mkdir(output, { recursive: true })
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844], ['narrow', 320, 720]]) {
    await page.setViewportSize({ width, height })
    for (const mode of ['light', 'dark']) {
      await expect(page.getByRole('button', { name: /^Switch to (light|dark) mode$/, exact: true })).toBeVisible()
      const toggle = page.getByRole('button', { name: `Switch to ${mode} mode`, exact: true })
      if (await toggle.count()) {
        await toggle.click()
        await expect.poll(async () => check(await service.from('app_state').select('profile_details').eq('user_id', userId).single()).profile_details.displayMode).toBe(mode)
      }
      await expect.poll(() => page.locator('.app-shell').evaluate(element => element.classList.contains('ui-light-mode'))).toBe(mode === 'light')
      for (const [path, selector] of [['/home', '.academy-rewards'], ['/games', '.academy-games-hub'], ['/profile', '.reward-avatar-collection']]) {
        await page.goto(`${appUrl}${path}`)
        await expect(page.locator(selector)).toBeVisible()
        await expect.poll(() => page.locator('.app-shell').evaluate(element => element.classList.contains('ui-light-mode'))).toBe(mode === 'light')
        await expect.poll(() => page.locator('.app-shell').evaluate(element => getComputedStyle(element).colorScheme)).toBe(mode)
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${path} overflow at ${width}px in ${mode}`)
        if (path === '/games') await expect(page.locator('.academy-game-card')).toHaveCount(4)
        if (path === '/profile') {
          await expect(page.getByRole('button', { name: 'Select Academy avatar', exact: true })).toBeEnabled()
          await expect(page.getByRole('button', { name: 'Select Academy avatar', exact: true }).locator('img')).toHaveAttribute('src', /default-avatar-academy-v1\.png$/)
          await expect(page.getByRole('button', { name: 'Locked Summit avatar, level 5', exact: true })).toBeDisabled()
        }
        await page.screenshot({ path: new URL(`${path.slice(1)}-${mode}-${name}.png`, output).pathname, fullPage: true, animations: 'disabled' })
      }
      await page.getByRole('button', { name: 'Level & Rewards', exact: true }).click()
      await expect(page.locator('.profile-decoration-grid')).toBeVisible()
      await expect(page.locator('.profile-decoration-card.locked')).toHaveCount(0)
      for (const card of await page.locator('.profile-decoration-card').all()) {
        const box = await card.boundingBox()
        const title = await card.locator('.profile-decoration-copy strong').boundingBox()
        assert.ok(title.x >= box.x && title.x + title.width <= box.x + box.width && title.y + title.height <= box.y + box.height, 'Frame names must fit inside their visible cards.')
      }
      await page.screenshot({ path: new URL(`earned-frames-${mode}-${name}.png`, output).pathname, fullPage: true, animations: 'disabled' })
      await page.getByRole('button', { name: 'All frames', exact: true }).click()
      await expect(page.locator('.profile-decoration-card').filter({ hasText: 'Academy Legend' })).toBeDisabled()
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Frame collection overflow at ${width}px in ${mode}`)
      await page.getByRole('button', { name: 'Account Security', exact: true }).click()
      await expect(page.getByRole('region', { name: 'Change your password' })).toBeVisible()
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Security overflow at ${width}px in ${mode}`)
      for (const [path, opener, title] of [['matching', 'Start Matching', 'Matching Settings'], ['speed', 'Start Speed Test', 'Speed Test Settings']]) {
        await page.goto(`${appUrl}/games/${path}`)
        const start = page.getByRole('button', { name: opener, exact: true })
        await start.click()
        const dialog = page.getByRole('dialog', { name: title, exact: true })
        await expect(dialog).toBeVisible()
        await expect(dialog.getByRole('button', { name: 'Start', exact: true })).toBeInViewport({ ratio: 1 })
        await page.screenshot({ path: new URL(`setup-${path}-${mode}-${name}.png`, output).pathname, animations: 'disabled' })
        await page.keyboard.press('Escape')
        await expect(dialog).toHaveCount(0)
        await expect(start).toBeFocused()
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  for (const [name, path] of [['Matching', '/games/matching'], ['Speed Test', '/games/speed'], ['Code Blaster', '/games/blaster'], ['1v1', '/games/duel']]) {
    await page.goto(`${appUrl}/games`)
    await page.locator('.academy-game-card').filter({ hasText: name }).click()
    await expect(page).toHaveURL(`${appUrl}${path}`)
  }
  assert.deepEqual(browserErrors, [])
  result.checks.push('All four game routes; default/locked avatar and frame controls; light/dark home, games, settings and collections at 1440/390/320px; no browser crashes')
  result.passed = true
} catch (error) {
  result.failedStage = stage
  result.error = safe(error)
  process.exitCode = 1
  if (page) {
    await mkdir(output, { recursive: true })
    await page.screenshot({ path: new URL('failure.png', output).pathname, fullPage: true, animations: 'disabled' }).catch(() => {})
  }
} finally {
  await browser?.close()
  await client.auth.signOut({ scope: 'local' }).catch(error => result.cleanupErrors.push(safe(error)))
  if (userId) try { check(await service.auth.admin.deleteUser(userId)) } catch (error) { result.cleanupErrors.push(safe(error)) }
  for (const [table, id] of [['academy_classes', classId], ['academies', academyId]]) {
    if (id) try { check(await service.from(table).delete().eq('id', id)) } catch (error) { result.cleanupErrors.push(safe(error)) }
  }
  if (result.cleanupErrors.length) { result.passed = false; process.exitCode = 1 }
  result.completedAt = new Date().toISOString()
  await mkdir(output, { recursive: true })
  await writeFile(new URL('result.json', output), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
}
