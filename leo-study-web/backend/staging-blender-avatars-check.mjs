import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {parse} from 'dotenv'
import {createClient} from '@supabase/supabase-js'
import {chromium,expect} from '@playwright/test'
import {xpRequiredForLevel} from '../src/lib/academyProgression.ts'
const env=parse(await readFile(new URL('../.env.staging.local',import.meta.url)))
assert.equal(env.SUPABASE_URL,'http://127.0.0.1:55431')
const origin=process.env.ACADEMY_CHECK_ORIGIN||'http://127.0.0.1:5176'
assert.ok(['http://127.0.0.1:5176','https://dev.180.academy'].includes(origin))
const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const check=r=>{assert.ifError(r.error);return r.data}
const catalog=JSON.parse(await readFile(new URL('../src/data/dailyChallengeCatalog.json',import.meta.url)))
const users=[],marker=randomUUID().slice(0,8),errors=[];let academy,classId,browser
try{
 academy=check(await admin.from('academies').insert({name:`Blender QA ${marker}`}).select('id').single()).id
 classId=check(await admin.from('academy_classes').insert({academy_id:academy,class_name:`Collectibles ${marker}`,status:'active',visibility:'unlisted',join_mode:'open'}).select('id').single()).id
 const department=check(await admin.from('class_departments').insert({class_id:classId,name:'Training'}).select('id').single()).id
 for(let i=0;i<2;i++){
  const email=`blender-${marker}-${i}@example.test`,password=`${randomUUID()}-Test!9`,id=check(await admin.auth.admin.createUser({email,password,email_confirm:true})).user.id
  users.push({id});check(await admin.from('profiles').upsert({user_id:id,username:`Collectible ${marker} ${i}`,agency:'Training'}))
  check(await admin.from('class_memberships').insert({user_id:id,class_id:classId,department_id:department,role:'cadet',status:'active',is_active:true}))
  check(await admin.from('app_state').upsert({user_id:id,profile_details:{firstName:'Collectible',lastName:'Tester',onboardingCompleted:true,agency:'Training',displayMode:'light',stats:{achievementXp:i===0?xpRequiredForLevel(50):0}}}))
  const client=createClient(env.SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false}})
  users[i].session=check(await client.auth.signInWithPassword({email,password})).session;users[i].key=client.auth.storageKey
 }
 browser=await chromium.launch()
 for(let i=0;i<2;i++){
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
  await context.route('**/*',r=>(origin.startsWith('https:')?new URL(r.request().url()).origin===origin:['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname))?r.continue():r.abort())
  await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:origin.startsWith('https:')?'sb-dev-auth-token':users[i].key,session:users[i].session})
  const page=await context.newPage();page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message))
  await page.goto(`${origin}/profile`)
  const collection=page.getByRole('region',{name:'Earned avatars'})
  await expect(collection).toBeVisible();await expect(collection.locator('img')).toHaveCount(7)
  await collection.scrollIntoViewIfNeeded()
  await expect.poll(()=>collection.locator('img').evaluateAll(imgs=>imgs.every(img=>img.complete&&img.naturalWidth===512))).toBe(true)
  if(i===1){await expect(collection.getByRole('button',{name:'Locked Guardian avatar, level 50'})).toBeDisabled();await expect(collection.getByRole('button',{name:'Select Patrol Cadet avatar'})).toBeEnabled();continue}
  await collection.screenshot({path:'/tmp/academy-blender-collection-desktop.png',animations:'disabled'})
  await collection.getByRole('button',{name:'Select K9 Partner avatar',exact:true}).click()
  await expect(collection.getByRole('button',{name:'Select K9 Partner avatar',exact:true})).toHaveAttribute('aria-pressed','true')
  await page.getByRole('button',{name:'Save profile',exact:true}).click()
  await expect(page.locator('.saved-pill')).toContainText('All changes saved')
  const saved=check(await admin.from('profiles').select('avatar_path').eq('user_id',users[i].id).single()).avatar_path
  assert.match(saved,/\.webp$/)
  await page.reload();await expect(collection).toBeVisible()
  const avatar=page.locator('.academy-profile-settings .avatar-frame>img').first()
  await expect.poll(()=>avatar.evaluate(img=>img.complete&&img.naturalWidth===512)).toBe(true)
  await expect(avatar).toHaveAttribute('src',new RegExp(saved.split('/').pop().replaceAll('.','\\.')))
  await page.setViewportSize({width:390,height:844});await collection.scrollIntoViewIfNeeded()
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2))
  await collection.screenshot({path:'/tmp/academy-blender-collection-mobile.png',animations:'disabled'})
  await page.goto(`${origin}/home`)
  const challenges=page.getByRole('region',{name:'Practice challenges'})
  await expect(challenges.getByText('100 daily challenges',{exact:true})).toBeVisible()
  // The transition notice expires at the first daily reset after migration.
  await challenges.screenshot({path:'/tmp/academy-rotation-home-mobile.png',animations:'disabled'})
  // UI-only future-day preview. Real progress and awards for all 100 definitions are tested in SQL.
  const previewGoals=[catalog.find(c=>c.game_mode==='matching'&&c.code_filter==='vehicle'&&c.metric==='accurate'),catalog.find(c=>c.metric==='improve')]
  await page.route('**/rpc/get_academy_progression',async route=>{
   const response=await route.fetch(),status=await response.json()
   await route.fulfill({response,json:{...status,dailyRotationStartsAt:status.serverDate,challenges:previewGoals.map(goal=>({...goal,cadence:'daily',progress:0,claimed:false,resetsAt:new Date(Date.now()+86400000).toISOString(),practicePath:goal.practice_path,codeFilter:goal.code_filter}))}})
  })
  await page.reload();await expect(challenges.getByRole('heading',{name:previewGoals[0].title,exact:true})).toBeVisible()
  await expect(challenges.getByText(previewGoals[0].description,{exact:true})).toBeVisible()
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2))
  await challenges.screenshot({path:'/tmp/academy-rotation-preview-mobile.png',animations:'disabled'})
  await challenges.locator('article').filter({has:page.getByRole('heading',{name:previewGoals[0].title,exact:true})}).getByRole('button',{name:'Continue practice'}).click()
  await expect(page).toHaveURL(`${origin}/games/matching`)
  await expect(page.getByRole('button',{name:/^Vehicle/}).first()).toHaveClass(/active/)
  await page.unroute('**/rpc/get_academy_progression')

 }
 assert.deepEqual(errors,[])
 console.log('PASS: all seven Blender artworks load, selected state, WebP avatar upload, saved profile reload, mobile layout, level lock, 100-challenge catalog, future-day card layout and matching Vehicle Code practice routing.')
}finally{
 await browser?.close()
 for(const u of users){const files=check(await admin.storage.from('avatars').list(u.id));if(files?.length)check(await admin.storage.from('avatars').remove(files.map(f=>`${u.id}/${f.name}`)))}
 if(classId)check(await admin.from('academy_classes').delete().eq('id',classId))
 if(academy)check(await admin.from('academies').delete().eq('id',academy))
 for(const u of users)check(await admin.auth.admin.deleteUser(u.id))
}
