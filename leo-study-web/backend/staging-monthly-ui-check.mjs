// Real browser + clone grants, with no Stripe network calls or real charges.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { parse } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { chromium, expect } from '@playwright/test'
const env = parse(await readFile(new URL('../.env.staging.local', import.meta.url)))
assert.equal(env.SUPABASE_URL, 'http://127.0.0.1:55431')
const origin = process.env.MEMBERSHIP_UI_ORIGIN || 'http://127.0.0.1:5176'
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
  check(await admin.from('app_state').upsert({ user_id: id, performance: {'penal|pc 518':{correctCount:1,incorrectCount:3,correctStreak:0}}, profile_details: { firstName: 'Support', lastName: marker, onboardingCompleted: true, displayMode: 'light', themeId: 'midnight', agency: 'Training Division' } }))
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
  const sessionClient=createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY||env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false}})
  const session=check(await sessionClient.auth.signInWithPassword({email,password})).session
  const headers={Authorization:`Bearer ${session.access_token}`}
  assert.equal((await fetch('http://127.0.0.1:8791/api/membership/content')).status,401)
  assert.equal((await fetch('http://127.0.0.1:8791/api/membership/content',{headers})).status,403)
  assert.equal((await fetch('http://127.0.0.1:8791/api/membership/analytics',{headers})).status,403)
  await page.goto(`${origin}/support`)
  await expect(page.getByRole('heading',{name:'Academy Plus',exact:true})).toBeVisible()
  await expect(page.getByRole('heading',{name:'Academy Pro',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Available after testing'})).toHaveCount(2)
  await page.getByRole('tab',{name:'Free',exact:true}).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab',{name:'Plus',exact:true})).toHaveAttribute('aria-selected','true')
  await expect(page.getByRole('tabpanel')).toContainText('Selected collection')
  await page.getByRole('tab',{name:'Pro',exact:true}).click()
  await expect(page.getByRole('tabpanel')).toContainText('Full collection')
  await page.screenshot({path:'/tmp/academy-monthly-pricing-desktop.png',fullPage:true})
  for(const route of ['/stats','/study/practice-test','/scenarios']) {
   await page.goto(`${origin}${route}`);await expect(page.locator('.membership-gate')).toBeVisible()
  }
  const customize=async()=>{await page.goto(`${origin}/profile`);await page.getByRole('button',{name:'Customization',exact:true}).click()}
  await customize();await expect(page.getByRole('button',{name:'Pastel Rose',exact:true})).toBeDisabled()
  const customer=`cus_ui_${randomUUID()}`,subscription=`sub_ui_${randomUUID()}`
  check(await admin.from('academy_billing_customers').insert({user_id:id,customer_id:customer,livemode:false}))
  const grant=async(tier,end=new Date(Date.now()+86400000).toISOString())=>check(await admin.rpc('record_subscription_snapshot',{p_snapshot:{subscription_id:subscription,user_id:id,customer_id:customer,price_id:`price_${tier}`,tier,status:'active',paid_tier:tier,paid_through:end,cancel_at_period_end:false,current_period_end:end,livemode:false,sync_sequence:check(await admin.rpc('next_subscription_sync'))}}))
  await grant('tier5')
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('button',{name:'Pastel Sky',exact:true})).toBeEnabled()
  await expect(page.getByRole('button',{name:'Pastel Rose',exact:true})).toBeDisabled()
  await page.getByRole('button',{name:'Pastel Sky',exact:true}).click()
  await expect(page.getByText('Locked • Academy Pro',{exact:true})).toBeVisible()
  const content=await fetch('http://127.0.0.1:8791/api/membership/content',{headers});assert.equal(content.status,200)
  assert.equal((await content.json()).modules.length,4)
  assert.equal((await fetch('http://127.0.0.1:8791/api/membership/analytics',{headers})).status,403)
  await page.goto(`${origin}/study/practice-test`)
  await expect(page.getByText('Loading your practice toolkit…')).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Start 20-Question Practice Test',exact:true})).toBeVisible()
  await grant('tier10',new Date(Date.now()+172800000).toISOString())
  await customize();await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('button',{name:'Pastel Rose',exact:true})).toBeEnabled()
  await expect(page.getByLabel('Glow enabled')).toBeVisible()
  for(const dark of [false,true]) {
   if(dark){await page.getByRole('button',{name:'Open profile menu',exact:true}).click();await page.getByRole('button',{name:'Switch to Dark Mode',exact:true}).click()}
   const themeNames=await page.locator('.theme-card .theme-name').allTextContents()
   assert.equal(themeNames.length,10)
   for(const themeName of themeNames) {
    await page.getByRole('button',{name:themeName,exact:true}).click()
    await expect(page.getByRole('button',{name:themeName,exact:true})).toHaveClass(/active/)
    await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a instanceof CSSTransition).map(a=>a.finished.catch(()=>{})))})
    const colors=await page.getByRole('button',{name:'Save Customization',exact:true}).evaluate(button=>{const style=getComputedStyle(button);return {text:style.color,bg:style.backgroundColor}})
    const luminance=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0)
    const values=[luminance(colors.text),luminance(colors.bg)].sort((a,b)=>b-a)
    assert.ok((values[0]+.05)/(values[1]+.05)>=4.5,`${themeName} primary contrast`)
   }
   await page.screenshot({path:`/tmp/academy-monthly-themes-${dark?'dark':'light'}.png`,fullPage:true})
  }
  await page.getByRole('button',{name:'Save Customization',exact:true}).click()
  await expect(page.getByText('All changes saved',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Level & Rewards',exact:true}).click()
  await page.getByRole('button',{name:/^Pro Crest/}).click()
  await page.getByRole('button',{name:'Save frame',exact:true}).click()
  await expect.poll(async()=>check(await admin.from('app_state').select('profile_details').eq('user_id',id).single()).profile_details.profileDecorationKey).toBe('pro_crest')
  await page.goto(`${origin}/profile`)
  await expect(page.locator('.academy-profile-settings img[src="/avatar-decorations/academy-pro-crest.svg"]')).toBeVisible()
  await expect(page.locator('.academy-profile-settings').getByLabel('Academy Pro member')).toBeVisible()
  await page.goto(`${origin}/classes`)
  await expect(page.locator('.classmate-list').getByLabel('Academy Pro member')).toBeVisible()
  await page.goto(`${origin}/stats`)
  await expect(page.getByRole('heading',{name:'Your personal weekly plan',exact:true})).toBeVisible()
  await expect(page.getByRole('heading',{name:'Your 28-day study calendar',exact:true})).toBeVisible()
  const report=await fetch('http://127.0.0.1:8791/api/membership/analytics',{headers});assert.equal(report.status,200)
  await expect(page.getByRole('button',{name:'Start focused drill',exact:true}).first()).toBeVisible()
  await page.getByRole('button',{name:'Start focused drill',exact:true}).first().click()
  await expect(page).toHaveURL(/\/study\/flashcards$/)
  await page.goto(`${origin}/stats`)
  await page.locator('.pro-setup-form').getByLabel('Name',{exact:true}).fill('Morning review')
  await page.getByRole('button',{name:'Save setup',exact:true}).click()
  await expect(page.getByText('Study settings saved',{exact:true})).toBeVisible()
  await expect(page.getByText('Morning review',{exact:true})).toBeVisible()
  await page.reload();await expect(page.getByText('Morning review',{exact:true})).toBeVisible()
  const downloaded=page.waitForEvent('download')
  await page.getByRole('button',{name:/Download.*report/i}).click()
  assert.match((await downloaded).suggestedFilename(),/\.csv$/)
  await page.getByRole('button',{name:'Start practice',exact:true}).click()
  await expect(page).toHaveURL(/\/study\/practice-test$/)
  await expect(page.getByRole('button',{name:'Start 20-Question Practice Test',exact:true})).toBeVisible()
  for(const viewport of [{width:390,height:844},{width:1440,height:1000}]) {
   await page.setViewportSize(viewport)
   for(const route of ['/support','/profile','/stats','/classes','/games','/games/duel']) {
    await page.goto(`${origin}${route}`);await expect(page.locator('.app-shell.professional-ui')).toBeVisible();await expect(page.locator('#main-content')).toBeVisible()
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),`overflow ${route}`)
   }
   await page.goto(`${origin}/support`)
   await expect(page.locator('.membership-plans')).toBeVisible()
   await page.screenshot({path:`/tmp/academy-monthly-pricing-${viewport.width}.png`,fullPage:true})
  }
  // End this disposable membership to exercise client and server revocation together.
  const expired=new Date(Date.now()-1000).toISOString()
  check(await admin.from('academy_subscriptions').update({paid_through:expired}).eq('user_id',id))
  check(await admin.from('academy_membership_badges').update({plus_until:expired,pro_until:expired}).eq('user_id',id))
  await page.goto(`${origin}/stats`);await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await expect(page.locator('.membership-gate')).toBeVisible()
  assert.equal((await fetch('http://127.0.0.1:8791/api/membership/content',{headers})).status,403)
  assert.equal((await fetch('http://127.0.0.1:8791/api/membership/analytics',{headers})).status,403)
  await customize();await expect(page.getByRole('button',{name:'Pastel Rose',exact:true})).toBeDisabled()
  await page.goto(`${origin}/support`);await expect(page.getByRole('button',{name:'Manage membership',exact:true})).toBeVisible()
  assert.deepEqual(errors,[])
  console.log('PASS: monthly pricing, keyboard comparison tabs, Plus/Pro theme split, paid practice and analytics, Pro report/presets, responsive routes, and expired access.')
} finally {
  await browser?.close()
  if (id) check(await admin.auth.admin.deleteUser(id))
  if (classId) check(await admin.from('academy_classes').delete().eq('id', classId))
  if (academyId) check(await admin.from('academies').delete().eq('id', academyId))
}
