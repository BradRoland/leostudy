// Run from leo-study-web with the isolated local development helper already running.
// Browser HTTP and WebSocket traffic is restricted to localhost; disposable fixtures are removed in finally.
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { parse } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { chromium, expect } from '@playwright/test'
const env = parse(await readFile('.env.staging.local'))
assert.equal(env.SUPABASE_URL, 'http://127.0.0.1:55431', 'Use only the retained localhost development clone.')
assert.equal(env.SMTP_HOST, '127.0.0.1', 'This check requires the isolated local environment.')
const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const check = ({data,error}) => { if(error) throw new Error(error.message); return data }
const marker = randomUUID().slice(0,8), password=`Test-${randomUUID()}-9!`
const email=`multiplayer-visual-${marker}@example.invalid`
let userId, academyId, classId, browser, page
const failures=[]
const directory='artifacts/multiplayer-refresh.local'
async function layout(name,width,height=940) {
  await page.setViewportSize({width,height})
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true)
  const overlayVisible = await page.locator('[role=dialog]:visible,.onevone-bot-quiz-card:visible').count() > 0
  await page.screenshot({path:`${directory}/${name}.png`,fullPage:!overlayVisible,animations:'disabled'})
}
try {
  await mkdir(directory,{recursive:true})
  userId=check(await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{username:`Casey Match ${marker}`}})).user.id
  academyId=check(await service.from('academies').insert({name:`Multiplayer QA ${marker}`,city:'Synthetic',state:'CA'}).select('id').single()).id
  classId=check(await service.from('academy_classes').insert({academy_id:academyId,class_name:`Practice ${marker}`,status:'active',visibility:'unlisted',join_mode:'open'}).select('id').single()).id
  const departmentId=check(await service.from('class_departments').insert({class_id:classId,name:'Practice Department'}).select('id').single()).id
  check(await service.from('profiles').upsert({user_id:userId,username:`Casey Match ${marker}`,agency:'Practice Department',supporter_tier:'free'}))
  check(await service.from('app_state').upsert({user_id:userId,profile_details:{firstName:'Casey',lastName:`Match ${marker}`,onboardingCompleted:true,displayMode:'light',themeId:'midnight',agency:'Practice Department',dailyGoalMinutes:15}}))
  check(await service.from('class_memberships').insert({user_id:userId,class_id:classId,department_id:departmentId,role:'class_admin',status:'active',is_active:true}))
  browser=await chromium.launch()
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
  await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort('blockedbyclient'))
  await context.routeWebSocket('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.url()).hostname)?route.connectToServer():route.close())
  page=await context.newPage();page.on('pageerror',e=>failures.push(e.message))
  page.setDefaultTimeout(20000)
  await page.goto('http://127.0.0.1:5176/signin')
  await page.getByLabel('Email address',{exact:true}).fill(email)
  await page.getByLabel('Password',{exact:true}).fill(password)
  await page.getByRole('button',{name:'Sign in',exact:false}).click()
  await expect(page.locator('.today-dashboard')).toBeVisible()
  await page.goto('http://127.0.0.1:5176/games/duel')
  await expect(page.getByRole('heading',{name:'1v1 Multiplayer',exact:true})).toBeVisible()
  await layout('lobby-desktop',1440)
  await layout('lobby-mobile',390,844)
  await layout('lobby-narrow',320,800)
  await page.getByRole('button',{name:/Create your own room/}).click()
  const create=page.getByRole('dialog',{name:'Create Room',exact:true})
  await expect(create).toBeVisible()
  await page.screenshot({path:`${directory}/create-initial.png`,animations:"disabled"})
  await create.getByRole('button',{name:/1v1 Quiz/}).click()
  await expect(create.getByRole('button',{name:/1v1 Quiz/})).toHaveAttribute('aria-pressed','true')
  await layout('create-narrow',320,800)
  await create.getByRole('button',{name:'Private (Code)',exact:true}).click()
  await create.getByRole('button',{name:'Create Room',exact:true}).click()
  await expect(page.locator('.onevone-waiting-room')).toBeVisible()
  await layout('waiting-narrow',320,800)
  await page.getByRole('button',{name:'Change Mode',exact:true}).click()
  await expect(page.locator('.onevone-change-mode-modal')).toBeVisible()
  await page.locator('.onevone-change-mode-modal').getByRole('button',{name:/1v1 Matching/}).click()
  await page.getByRole('button',{name:'Save Changes',exact:true}).click()
  await expect(page.locator('.onevone-waiting-title h2')).toHaveText('1v1 Matching')
  await page.getByRole('button',{name:'Leave',exact:true}).click()
  await expect(page.getByRole('heading',{name:'1v1 Multiplayer',exact:true})).toBeVisible()
  await page.getByRole('button',{name:/Invite a Classmate/}).click()
  const invite=page.getByRole('dialog',{name:'Invite a Classmate',exact:true})
  await expect(invite).toBeVisible()
  await expect(invite.getByText('No classmates are online right now.',{exact:true})).toBeVisible()
  await layout('invite-narrow',320,800)
  await invite.getByRole('button',{name:'Close',exact:true}).click()
  await page.getByRole('button',{name:/1v1 Versus Bot/}).click()
  const bot=page.getByRole('dialog',{name:'1v1 Versus Bot',exact:true})
  await expect(bot).toBeVisible()
  await bot.getByRole('button',{name:/1v1 Quiz/}).click()
  await layout('bot-setup-narrow',320,800)
  await page.setViewportSize({width:1440,height:1000})
  await bot.getByRole('button',{name:'Cancel',exact:true}).click()
  await page.getByRole('button',{name:'Open profile menu',exact:true}).click()
  await page.getByRole('button',{name:'Switch to Dark Mode',exact:true}).click()
  await expect(page.locator('.app-shell:not(.ui-light-mode)')).toBeVisible()
  await expect.poll(()=>page.locator('.multiplayer-intro h2').evaluate(el=>getComputedStyle(el).color)).toBe('rgb(244, 245, 248)')
  await layout('lobby-dark-desktop',1440)
  await page.getByRole('button',{name:/1v1 Versus Bot/}).click()
  await expect(bot).toBeVisible()
  await bot.getByRole('button',{name:'1v1 Quiz',exact:true}).click()
  await layout('bot-setup-dark-desktop',1440)
  await bot.getByRole('button',{name:/Start Quiz vs Bot/}).click()
  await expect(page.locator('.onevone-bot-quiz-card')).toBeVisible()
  await layout('bot-quiz-narrow',320,800)
  assert.deepEqual(failures,[])
  console.log('PASS: synthetic multiplayer lobby light/dark 1440/390/320px; create private quiz room; host switch to matching; leave; empty invite dialog; bot setup and actual Quiz bot launch; no page errors or document overflow.')
} catch(error) {
  if(page) await page.screenshot({path:`${directory}/failure.png`,animations:'disabled'}).catch(()=>{})
  let message = String(error?.message || error)
  for (const secret of [password, env.SUPABASE_SERVICE_ROLE_KEY, env.VITE_SUPABASE_ANON_KEY]) {
    if (secret) message = message.replaceAll(secret, '[redacted]')
  }
  throw new Error(message)
} finally {
  await browser?.close()
  if(userId) check(await service.from('rooms').delete().eq('host_user_id',userId))
  if(classId) check(await service.from('academy_classes').delete().eq('id',classId))
  if(academyId) check(await service.from('academies').delete().eq('id',academyId))
  if(userId) check(await service.auth.admin.deleteUser(userId))
  console.log('Synthetic multiplayer fixtures cleaned.')
}
