// Disposable members in an unlisted class, against the retained development clone only.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { parse } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { chromium, expect } from '@playwright/test'
import { xpRequiredForLevel } from '../src/lib/academyProgression.ts'
const env = parse(await readFile(new URL('../.env.staging.local', import.meta.url)))
assert.equal(env.SUPABASE_URL, 'http://127.0.0.1:55431')
const origin = process.env.ACADEMY_CHECK_ORIGIN || 'http://127.0.0.1:5176'
assert.ok(['http://127.0.0.1:5176', 'https://dev.180.academy'].includes(origin))
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options)
const check = r => { assert.ifError(r.error); return r.data }
const rpc = async (c, name, args) => check(await c.rpc(name, args))
const marker = randomUUID().slice(0,8), users = [], classes = [], rooms = []
let academy, browser
const errors=[]
async function setXp(index, xp) {
  const u=users[index]
  check(await service.from('app_state').upsert({user_id:u.id,profile_details:{firstName:'Practice',lastName:`Member ${index}`,onboardingCompleted:true,agency:'Training',displayMode:'light',themeId:'midnight',stats:{achievementXp:xp}}}))
  return rpc(u.client,'get_academy_progression')
}
async function create(args={}) {
  const id=await rpc(users[0].client,'create_1v1_room_v2',{p_game_type:'quiz',p_category:'all',p_is_public:false,p_rounds:10,...args});rooms.push(id);return id
}
async function denied(c,name,args,pattern) { const r=await c.rpc(name,args);assert.ok(r.error,`${name} must reject`);if(pattern)assert.match(r.error.message,pattern) }
async function attempt(index, correct=10, incorrect=0, at=new Date().toISOString()) {
 return check(await users[index].client.from('game_attempt_history').insert({user_id:users[index].id,class_id:classes[0],mode:'study_test',track_key:`study_test_all_${randomUUID()}`,filter:'all',duration:60,score:correct,correct,incorrect,accuracy:Math.round(correct/Math.max(1,correct+incorrect)*100),created_at:at}).select('id').single())
}
try {
 academy=check(await service.from('academies').insert({name:`Progression QA ${marker}`,city:'Synthetic',state:'CA'}).select('id').single()).id
 for(let i=0;i<2;i++)classes.push(check(await service.from('academy_classes').insert({academy_id:academy,class_name:`Progression ${marker} ${i}`,status:'active',visibility:'unlisted',join_mode:'open'}).select('id').single()).id)
 const dept=check(await service.from('class_departments').insert({class_id:classes[0],name:'Training'}).select('id').single()).id
 for(let i=0;i<4;i++) {
  const email=`progression-${marker}-${i}@example.test`,password=`${randomUUID()}-Test!9`
  const id=check(await service.auth.admin.createUser({email,password,email_confirm:true})).user.id
  const client=createClient(env.SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,options)
  users.push({id,client})
  check(await service.from('profiles').upsert({user_id:id,username:`Practice ${marker} ${i}`,agency:'Training',last_active:new Date().toISOString()}))
  check(await service.from('class_memberships').insert({user_id:id,class_id:classes[i===3?1:0],department_id:i===3?null:dept,role:i===0?'class_admin':'cadet',status:'active',is_active:true}))
  users[i].session=check(await client.auth.signInWithPassword({email,password})).session
  await setXp(i,0)
 }
 await denied(users[0].client,'create_1v1_room_v2',{p_game_type:'quiz',p_category:'all'},/Level 10/)
 await denied(users[0].client,'create_1v1_room',{p_game_type:'quiz',p_category:'all',p_is_public:true,p_rounds:10,p_powerups_enabled:false,p_blaster_duration_seconds:30,p_blaster_sudden_death:false,p_blaster_rope_limit:900},/Level 10/)
 // Editing the display snapshot alone cannot grant a level.
 check(await service.from('app_state').update({profile_details:{levelSnapshot:{level:100,totalXp:999999}}}).eq('user_id',users[0].id))
 assert.equal((await rpc(users[0].client,'get_academy_progression')).level,1)
 await setXp(0,xpRequiredForLevel(10)-1)
 await denied(users[0].client,'create_1v1_room_v2',{p_game_type:'quiz',p_category:'all'},/Level 10/)
 assert.equal((await setXp(0,xpRequiredForLevel(10))).level,10)
 await denied(users[0].client,'create_1v1_room_v2',{p_game_type:'blaster',p_category:'all',p_blaster_sudden_death:true},/Level 12/)
 const privateId=await create()
 const room=check(await service.from('rooms').select('*').eq('id',privateId).single())
 assert.match(room.join_code,/^[0-9]{6}$/)
 assert.ok(!(await rpc(users[1].client,'list_public_1v1_rooms')).some(r=>r.id===privateId))
 assert.equal((await rpc(users[1].client,'get_1v1_room_details',{p_room_id:privateId})).length,0)
 assert.ok((await users[1].client.from('room_players').insert({room_id:privateId,user_id:users[1].id,slot_no:2,is_ready:false})).error)
 assert.ok((await users[0].client.from('rooms').update({is_public:true}).eq('id',privateId)).error)
 await denied(users[1].client,'join_1v1_room',{p_room_id:privateId,p_join_code:room.join_code==='000000'?'999999':'000000'},/incorrect/)
 await denied(users[1].client,'join_1v1_room',{p_room_id:privateId},/incorrect/)
 await denied(users[3].client,'join_1v1_room',{p_room_id:privateId,p_join_code:room.join_code},/another class/)
 // Preserve leading zeros and normalize common paste separators.
 const leading=`0${String(Math.floor(Math.random()*100000)).padStart(5,'0')}`
 check(await service.from('rooms').update({join_code:leading}).eq('id',privateId))
 assert.equal(await rpc(users[1].client,'join_1v1_room',{p_join_code:` ${leading.slice(0,3)}-${leading.slice(3)} `}),privateId)
 assert.equal(await rpc(users[1].client,'join_1v1_room',{p_room_id:privateId}),privateId)
 await denied(users[2].client,'join_1v1_room',{p_join_code:leading},/full/)
 assert.equal((await rpc(users[1].client,'get_1v1_room_details',{p_room_id:privateId}))[0].room.join_code,leading)
 check(await users[1].client.from('room_players').update({last_seen:new Date().toISOString()}).eq('room_id',privateId).eq('user_id',users[1].id))
 console.log('PASS: level-10 boundary, legacy RPC denial, forged snapshot denial, wrong/missing code, leading zero/paste, hidden room, private detail denial, direct-write denial, class isolation, retry and full-room handling.')
 const raceId=await create(), raceRoom=check(await service.from('rooms').select('join_code').eq('id',raceId).single())
 const race=await Promise.all([users[1],users[2]].map(u=>u.client.rpc('join_1v1_room',{p_join_code:raceRoom.join_code})))
 assert.equal(race.filter(r=>!r.error).length,1)
 assert.equal(check(await service.from('room_players').select('id').eq('room_id',raceId)).length,2)
 const closedId=await create();check(await service.from('rooms').update({status:'cancelled'}).eq('id',closedId))
 await denied(users[1].client,'join_1v1_room',{p_room_id:closedId},/closed/)
 const connectId=await create({p_game_type:'connect4'})
 await denied(users[1].client,'join_1v1_room',{p_room_id:connectId,p_join_code:check(await service.from('rooms').select('join_code').eq('id',connectId).single()).join_code},/Level 5/)
 await setXp(1,xpRequiredForLevel(5))
 await rpc(users[1].client,'join_1v1_room',{p_join_code:check(await service.from('rooms').select('join_code').eq('id',connectId).single()).join_code})
 await setXp(0,xpRequiredForLevel(12))
 await create({p_game_type:'blaster',p_blaster_sudden_death:true,p_powerups_enabled:true})
 const peak=(await rpc(users[0].client,'get_academy_progression')).totalXp
 assert.equal((await setXp(0,0)).totalXp,peak,'Earned unlocks remain after old stats are saved')
 const beforeReward=(await rpc(users[0].client,'get_academy_progression')).totalXp
 const reward=await rpc(users[0].client,'claim_daily_reward')
 assert.equal((await rpc(users[0].client,'get_academy_progression')).totalXp,beforeReward+reward.awardedXp)
 console.log('PASS: concurrent final-seat join, closed rooms, Connect Four unlock, Level 12 knockout, permanent earned unlocks and additive daily rewards.')
 await denied(users[2].client,'claim_academy_challenge',{p_challenge:'daily_sessions'},/Complete/)
 await denied(users[2].client,'claim_academy_challenge',{p_challenge:'invented'},/Unknown/)
 await attempt(2,0,0)
 assert.ok((await rpc(users[2].client,'get_academy_progression')).challenges.every(c=>c.progress===0))
 await attempt(2,10,0,'2000-01-01T00:00:00Z')
 await attempt(2,10,0,'2099-01-01T00:00:00Z')
 const ready=await rpc(users[2].client,'get_academy_progression')
 assert.equal(ready.challenges.find(c=>c.id==='daily_sessions').progress,2)
 const claims=await Promise.all([1,2,3].map(()=>rpc(users[2].client,'claim_academy_challenge',{p_challenge:'daily_sessions'})))
 assert.equal(claims.reduce((sum,c)=>sum+c.awardedXp,0),60)
 assert.equal((await rpc(users[2].client,'claim_academy_challenge',{p_challenge:'daily_correct'})).awardedXp,80)
 for(let i=0;i<8;i++)await attempt(2)
 assert.equal((await rpc(users[2].client,'claim_academy_challenge',{p_challenge:'weekly_sessions'})).awardedXp,250)
 assert.equal((await rpc(users[2].client,'get_academy_progression')).totalXp,390)
 assert.equal((await rpc(users[1].client,'get_academy_progression')).challenges.find(c=>c.id==='daily_sessions').progress,0)
 await denied(users[2].client,'claim_academy_challenge',{p_challenge:'weekly_days'},/Complete/)
 console.log('PASS: empty attempt excluded, server-date periods despite forged timestamps, premature/unknown claims denied, concurrent claims award once, daily/weekly XP added exactly once and account isolation.')
 if(process.env.ACADEMY_SKIP_BROWSER==='1')process.exitCode=0
 else {
  browser=await chromium.launch()
  const pages=[]
  for(const i of [0,2]) {
   const c=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
   await c.route('**/*',r=>(origin.startsWith('https:')?new URL(r.request().url()).origin===origin:['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname))?r.continue():r.abort())
   const storageKey=origin.startsWith('https:')?'sb-dev-auth-token':users[i].client.auth.storageKey
   await c.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:storageKey,session:users[i].session})
   const page=await c.newPage();page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message));pages.push(page)
  }
  const [host,guest]=pages
  await host.goto(`${origin}/home`)
  const panel=host.getByRole('region',{name:'Practice challenges'})
  await expect(panel).toBeVisible();await expect(panel.getByRole('button',{name:'Continue practice'}).first()).toBeVisible()
  await panel.getByRole('button',{name:'Continue practice'}).first().click();await expect(host).toHaveURL(`${origin}/study/test`)
  await attempt(0);await attempt(0)
  const claimBefore=(await rpc(users[0].client,'get_academy_progression')).totalXp
  await host.goto(`${origin}/home`)
  await panel.getByRole('button',{name:'Claim 60 XP',exact:true}).click()
  await expect(panel.getByRole('status')).toContainText('+60 XP earned')
  assert.equal((await rpc(users[0].client,'get_academy_progression')).totalXp,claimBefore+60)
  await host.reload();await expect(panel.getByRole('button',{name:'XP added ✓',exact:true})).toBeDisabled()
  await panel.getByRole('button',{name:'Weekly challenges',exact:true}).click();await expect(panel.getByRole('heading',{name:'Complete ten practice sessions'})).toBeVisible()
  await host.screenshot({path:'/tmp/academy-challenges-desktop.png'})
  await host.setViewportSize({width:390,height:844});assert.ok(await host.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await host.screenshot({path:'/tmp/academy-challenges-mobile.png'})
  await guest.goto(`${origin}/games/duel`)
  await expect(guest.getByRole('button',{name:/Custom rooms · Level 10/})).toBeDisabled()
  await guest.getByRole('button',{name:/1v1 Versus Bot/}).click()
  const bot=guest.getByRole('dialog',{name:'1v1 Versus Bot',exact:true})
  await expect(bot.getByRole('button',{name:'Connect 4',exact:true})).toBeDisabled()
  await bot.getByRole('button',{name:'Rope Blaster',exact:true}).click()
  await expect(bot.getByRole('checkbox',{name:'Enable power-ups'})).toBeDisabled()
  await expect(bot.getByRole('checkbox',{name:'Enable overtime'})).toBeDisabled()
  await expect(bot.getByRole('button',{name:'To the Death · Level 12',exact:true})).toBeDisabled()
  await bot.getByRole('button',{name:'Cancel',exact:true}).click()
  await host.goto(`${origin}/games/duel`)
  await host.getByRole('button',{name:/Create your own room/}).click()
  const dialog=host.getByRole('dialog',{name:'Create Room',exact:true})
  await dialog.getByRole('button',{name:'Private (Code)',exact:true}).click()
  await dialog.getByRole('button',{name:'Create Room',exact:true}).click()
  const codePanel=host.getByRole('region',{name:'Private room code'})
  await expect(codePanel).toBeVisible()
  const code=(await codePanel.getByLabel('Your room code').innerText()).trim()
  await host.context().grantPermissions(['clipboard-read','clipboard-write'])
  await codePanel.getByRole('button',{name:'Copy code',exact:true}).click()
  await expect.poll(()=>host.evaluate(()=>navigator.clipboard.readText())).toBe(code)
  const created=check(await service.from('rooms').select('id').eq('host_user_id',users[0].id).eq('join_code',code).single());rooms.push(created.id)
  await host.screenshot({path:'/tmp/academy-private-room-mobile.png'})
  await guest.getByLabel('Have a room code?').fill(code==='000000'?'999999':'000000')
  await guest.getByRole('button',{name:'Join',exact:true}).click();await expect(guest.locator('.onevone-waiting-room')).toHaveCount(0)
  await guest.getByLabel('Have a room code?').fill(`${code.slice(0,3)}-${code.slice(3)}`)
  await guest.getByRole('button',{name:'Join',exact:true}).click()
  await expect(guest.locator('.onevone-waiting-room')).toBeVisible()
  await expect(host.locator('.onevone-waiting-players')).toContainText(`Practice ${marker} 2`)
  await host.getByRole('button',{name:'Ready Up',exact:true}).click();await guest.getByRole('button',{name:'Ready Up',exact:true}).click()
  await expect.poll(async()=>check(await service.from('rooms').select('status').eq('id',created.id).single()).status).toBe('in_progress')
  assert.deepEqual(errors,[])
  console.log('PASS: Home practice link, real challenge claim/reload, daily/weekly cards, copy-code clipboard, mobile layout, low-level locked bot controls, two-browser private create/code/paste/join, realtime opponent arrival and both players ready into a real match.')
 }
} finally {
 await browser?.close()
 for(const u of users)await u.client.removeAllChannels()
 if(users.length)check(await service.from('rooms').delete().in('host_user_id',users.map(u=>u.id)))
 if(classes.length)check(await service.from('duel_player_stats').delete().in('class_id',classes))
 if(classes.length)check(await service.from('academy_classes').delete().in('id',classes))
 if(academy)check(await service.from('academies').delete().eq('id',academy))
 for(const u of users)check(await service.auth.admin.deleteUser(u.id))
 console.log('Synthetic progression fixtures removed.')
}
