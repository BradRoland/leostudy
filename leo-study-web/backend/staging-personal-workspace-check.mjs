// Personal workspace must remain scoped even when RLS permits roster access.
// All mutations below are confined to disposable accounts in the test clone.
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
const users = [], classes = []
let academyId, browser

try {
  academyId = check(await service.from('academies').insert({ name: `Workspace regression ${marker}`, city: 'Synthetic', state: 'CA' }).select('id').single()).id
  for (const name of ['Owner', 'Admin', 'Other']) {
    const row = check(await service.from('academy_classes').insert({ academy_id: academyId, class_name: `${name} Workspace ${marker}`, status: 'active', visibility: 'unlisted', join_mode: 'open' }).select('id,class_name').single())
    const departments = check(await service.from('class_departments').insert([
      { class_id: row.id, name: `${name} Primary Department` },
      { class_id: row.id, name: `${name} Other Department` },
    ]).select('id,name'))
    classes.push({ ...row, departments })
  }
  for (const [kind, classIndex, departmentIndex, role] of [
    ['owner', 0, 0, 'cadet'],
    ['admin', 1, 0, 'class_admin'],
    ['peer', 1, 1, 'cadet'],
    ['other', 2, 1, 'cadet'],
  ]) {
    const email = `workspace-${kind}-${marker}@example.invalid`, password = `${randomUUID()}-Test!9`
    const name = `Workspace ${kind} ${marker}`
    const authUser = check(await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username: name, display_name: name } })).user
    const workspace = classes[classIndex], department = workspace.departments[departmentIndex]
    const user = { id: authUser.id, email, password, kind, workspace, department }
    users.push(user)
    check(await service.from('profiles').upsert({ user_id: user.id, username: name, agency: department.name, supporter_tier: 'tier5' }))
    check(await service.from('class_memberships').insert({ user_id: user.id, class_id: workspace.id, department_id: department.id, role, status: 'active', is_active: true, joined_at: ['owner', 'admin'].includes(kind) ? '2020-01-01T00:00:00Z' : new Date().toISOString() }))
    check(await service.from('app_state').upsert({ user_id: user.id, profile_details: { firstName: 'Workspace', lastName: kind, dailyGoalMinutes: 15, onboardingCompleted: true, displayMode: 'light', themeId: 'pastel-lavender', agency: department.name } }))
    if (kind === 'owner') check(await service.from('user_roles').insert({ user_id: user.id, role: 'owner' }))
  }

  // Establish the regression precondition using actual authenticated RLS.
  for (const user of users.slice(0, 2)) {
    const client = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    check(await client.auth.signInWithPassword({ email: user.email, password: user.password }))
    const visible = check(await client.from('class_memberships').select('user_id,class_id,department_id,role').eq('status', 'active').in('user_id', users.map(item => item.id)).order('joined_at', { ascending: false }))
    assert.ok(visible.length > 1, `${user.kind} must retain broader roster visibility`)
    assert.notEqual(visible[0].user_id, user.id, 'The previously unscoped query would choose another member')
    const personal = check(await client.from('class_memberships').select('user_id,class_id,department_id,role').eq('user_id', user.id).eq('status', 'active'))
    assert.equal(personal.length, 1)
    assert.equal(personal[0].class_id, user.workspace.id)
    await client.auth.signOut()
  }

  browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
  const page = await context.newPage()
  const errors = [], personalQueries = [], departmentCalls = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => {
    const url = new URL(request.url())
    if (url.pathname === '/rest/v1/class_memberships' && url.searchParams.get('select')?.includes('academy_classes')) personalQueries.push(url.searchParams.get('user_id'))
    if (url.pathname === '/rest/v1/rpc/update_own_class_department') departmentCalls.push(request.postDataJSON())
  })

  // Use the same browser for owner -> admin so identity changes cannot reuse
  // the previous person's personal workspace or privilege-derived membership.
  for (const user of users.slice(0, 2)) {
    console.log(`Checking ${user.kind} personal workspace in the browser.`)
    await page.goto('http://127.0.0.1:5176/signin')
    await expect(page.getByLabel('Email address', { exact: true }), `Sign-in form for ${user.kind} at ${page.url()}`).toBeVisible()
    await page.getByLabel('Email address', { exact: true }).fill(user.email)
    await page.getByLabel('Password', { exact: true }).fill(user.password)
    await page.getByRole('button', { name: 'Sign in', exact: false }).click()
    await expect(page.locator('.today-dashboard')).toBeVisible()
    await expect(page.locator('.academy-workspace-class')).toContainText(user.workspace.class_name)
    assert.ok(personalQueries.includes(`eq.${user.id}`))
    assert.ok(personalQueries.every(value => users.slice(0, 2).some(item => value === `eq.${item.id}`)), 'Every personal workspace query must carry an explicit identity')
    await page.goto('http://127.0.0.1:5176/profile')
    await expect(page.getByLabel(/^Agency/)).toHaveValue(user.department.name)
    await page.getByRole('button', { name: 'Customization', exact: true }).click()
    await page.getByRole('button', { name: 'Academy Blue', exact: true }).click()
    await page.getByRole('button', { name: 'Save Customization', exact: true }).click()
    await expect(page.getByText('All changes saved', { exact: true })).toBeVisible()
    assert.equal(departmentCalls.length, 0, 'Saving a theme must not rewrite an unchanged class department')
    const savedState = check(await service.from('app_state').select('profile_details').eq('user_id', user.id).single())
    assert.equal(savedState.profile_details.themeId, 'midnight')
    assert.equal(savedState.profile_details.agency, user.department.name)
    await page.reload()
    await expect(page.locator('.academy-workspace-class')).toContainText(user.workspace.class_name)
    if (user.kind === 'admin') {
      await page.goto('http://127.0.0.1:5176/classes/admin')
      await expect(page.getByRole('heading', { name: 'Class Access', exact: true }).first()).toBeVisible()
      await page.goto('http://127.0.0.1:5176/profile')
      await page.getByLabel(/^Agency/).selectOption(user.workspace.departments[1].name)
      // Exercise the PostgREST plain-object error path and actual retry without
      // changing any real account or weakening server-side authorization.
      await page.route('**/rest/v1/rpc/update_own_class_department', route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'Department update test: try again.' }) }), { times: 1 })
      await page.getByRole('button', { name: 'Save Profile Details', exact: true }).click()
      await expect(page.getByText('Department update test: try again.', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Save Profile Details', exact: true }).click()
      await expect(page.getByText('All changes saved', { exact: true })).toBeVisible()
      const membership = check(await service.from('class_memberships').select('department_id,role').eq('user_id', user.id).single())
      assert.equal(membership.department_id, user.workspace.departments[1].id)
      assert.equal(membership.role, 'class_admin')
      assert.equal(departmentCalls.length, 2)
      assert.ok(departmentCalls.every(body => body.p_class_id === user.workspace.id))
    }
    await page.getByRole('button', { name: 'Open profile menu', exact: true }).click()
    await page.getByRole('button', { name: 'Sign Out', exact: true }).click()
    await expect(page).toHaveURL(/\/signin$/)
    await expect(page.getByLabel('Email address', { exact: true })).toBeVisible()
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some(key => /^sb-.+-auth-token$/.test(key)))).toBe(false)
  }
  assert.deepEqual(errors, [])
  console.log('PASS: actual owner/admin RLS retains roster access while personal workspace, department and permissions stay scoped; theme save skips unchanged membership; owner-to-admin identity switch, readable department error and successful retry all pass.')
} finally {
  if (browser) await browser.close()
  for (const user of users) check(await service.auth.admin.deleteUser(user.id))
  for (const workspace of classes) check(await service.from('academy_classes').delete().eq('id', workspace.id))
  if (academyId) check(await service.from('academies').delete().eq('id', academyId))
}
