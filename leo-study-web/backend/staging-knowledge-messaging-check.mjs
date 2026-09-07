// Isolated clone fixtures only. Optional real AI calls use a synthetic user's stats.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {parse} from 'dotenv'
import {createClient} from '@supabase/supabase-js'
import {chromium,expect} from '@playwright/test'
const env=parse(await readFile(new URL('../.env.staging.local',import.meta.url)))
assert.equal(env.SUPABASE_URL,'http://127.0.0.1:55431')
const origin=process.env.ACADEMY_CHECK_ORIGIN||'http://127.0.0.1:5176'
assert.ok(['http://127.0.0.1:5176','https://dev.180.academy'].includes(origin))
const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const anonKey=env.SUPABASE_ANON_KEY||env.VITE_SUPABASE_ANON_KEY
const check=r=>{assert.ifError(r.error);return r.data}
const users=[];let academyId,classId,departmentId,browser
try{
 const marker=randomUUID().slice(0,6)
 academyId=check(await admin.from('academies').insert({name:`DM ${marker}`,city:'Synthetic',state:'CA'}).select('id').single()).id
 classId=check(await admin.from('academy_classes').insert({academy_id:academyId,class_name:`DM ${marker}`,status:'active',visibility:'unlisted',join_mode:'open'}).select('id').single()).id
 departmentId=check(await admin.from('class_departments').insert({class_id:classId,name:'Training'}).select('id').single()).id
 for(const name of ['Alex','Blair','Casey']){
  const email=`dm-${name}-${marker}@example.invalid`,password=`Test!${randomUUID()}`
  const id=check(await admin.auth.admin.createUser({email,password,email_confirm:true})).user.id
  const client=createClient(env.SUPABASE_URL,anonKey,{auth:{persistSession:false}})
  const session=check(await client.auth.signInWithPassword({email,password})).session
  users.push({id,email,password,client,token:session.access_token,name})
  check(await admin.from('profiles').upsert({user_id:id,username:name,agency:'Training'}))
  check(await admin.from('app_state').upsert({user_id:id,performance:{'penal|pc 518':{correctCount:2,incorrectCount:8,correctStreak:0}},profile_details:{firstName:name,lastName:marker,onboardingCompleted:true,displayMode:'light',themeId:'midnight',agency:'Training'}}))
  if(name!=='Casey')check(await admin.from('class_memberships').insert({user_id:id,class_id:classId,department_id:departmentId,role:'cadet',status:'active',is_active:true}))
 }
 const [a,b,c]=users
 const start=async(actor,peer)=>actor.client.rpc('start_academy_dm',{p_class:classId,p_peer:peer.id})
 const thread=check(await start(a,b));assert.equal(check(await start(b,a)),thread)
 assert.ok((await start(c,a)).error);assert.ok((await start(a,a)).error)
 const nonce=randomUUID(),body='Synthetic private message'
 const sent=await Promise.all([a.client.rpc('send_academy_dm',{p_thread:thread,p_body:body,p_nonce:nonce}),a.client.rpc('send_academy_dm',{p_thread:thread,p_body:body,p_nonce:nonce})]);assert.equal(check(sent[0]).id,check(sent[1]).id)
 assert.equal(check(await b.client.from('academy_dm_messages').select('*').eq('thread_id',thread)).length,1)
 assert.equal(check(await c.client.from('academy_dm_messages').select('*').eq('thread_id',thread)).length,0)
 assert.equal(check(await c.client.from('academy_dm_threads').select('*').eq('id',thread)).length,0)
 assert.ok((await c.client.rpc('send_academy_dm',{p_thread:thread,p_body:'forged',p_nonce:randomUUID()})).error)
 assert.ok((await a.client.from('academy_dm_messages').insert({thread_id:thread,sender_id:b.id,body:'spoofed',client_nonce:randomUUID()})).error)
 assert.ok((await a.client.rpc('reserve_academy_coach_usage',{p_user:a.id})).error)
 check(await b.client.rpc('set_academy_dm_block',{p_peer:a.id,p_block:true}));assert.ok((await a.client.rpc('send_academy_dm',{p_thread:thread,p_body:'blocked',p_nonce:randomUUID()})).error)
 check(await b.client.rpc('set_academy_dm_block',{p_peer:a.id,p_block:false}))
 const headers={Authorization:`Bearer ${a.token}`}
 assert.equal((await fetch('http://127.0.0.1:8791/api/membership/knowledge')).status,401)
 assert.equal((await fetch('http://127.0.0.1:8791/api/membership/knowledge',{headers})).status,403)
 const customer=`cus_synthetic_${randomUUID()}`
 check(await admin.from('academy_billing_customers').insert({user_id:a.id,customer_id:customer,livemode:false}))
 check(await admin.rpc('record_subscription_snapshot',{p_snapshot:{subscription_id:`sub_synthetic_${randomUUID()}`,user_id:a.id,customer_id:customer,price_id:'price_synthetic',tier:'tier5',paid_tier:'tier5',paid_through:new Date(Date.now()+86400000).toISOString(),current_period_end:new Date(Date.now()+86400000).toISOString(),status:'active',cancel_at_period_end:false,livemode:false,sync_sequence:check(await admin.rpc('next_subscription_sync'))}}))
 const response=await fetch('http://127.0.0.1:8791/api/membership/knowledge',{headers});assert.equal(response.status,200);const knowledge=await response.json();assert.equal(knowledge.accuracy,20);assert.equal(knowledge.priorities[0].sectionNumber,'PC 518');assert.ok(knowledge.untestedCodes>0)
 check(await admin.from('leaderboard').insert([{class_id:classId,user_id:a.id,game:'Matching',score:80,round:2,match_duration:30,match_filter:'all'},{class_id:classId,user_id:b.id,game:'Matching',score:100,round:3,match_duration:30,match_filter:'all'},{class_id:classId,user_id:b.id,game:'Matching',score:150,round:3,match_duration:60,match_filter:'penal'}]))
 assert.equal(check(await c.client.from('leaderboard').select('id').eq('class_id',classId)).length,0)
 const channel=a.client.channel(`dm-probe-${marker}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'academy_dm_messages',filter:`thread_id=eq.${thread}`},()=>{})
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Realtime probe timed out')),15000);channel.subscribe((status,error)=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve()}else if(status==='CHANNEL_ERROR'){clearTimeout(timer);reject(Error('Realtime probe: '+(error?.message||status)))}})})
 await a.client.removeChannel(channel)
 console.log('PASS: participant-only reads, sender spoof prevention, outsider denial, duplicate send, blocking, paid insights and private quota RPC.')
 browser=await chromium.launch()
 const contexts=await Promise.all([browser.newContext({viewport:{width:1440,height:1000}}),browser.newContext({viewport:{width:1440,height:1000}})])
 for(const context of contexts)await context.route('**/*',route=>(origin.startsWith('https:')?new URL(route.request().url()).origin===origin:['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname))?route.continue():route.abort())
 const pages=await Promise.all(contexts.map(x=>x.newPage()));const errors=[]
 for(let i=0;i<2;i++){
  pages[i].on('pageerror',e=>errors.push(e.message))
  await pages[i].goto(`${origin}/signin`)
  await pages[i].getByLabel('Email address',{exact:true}).fill(users[i].email);await pages[i].getByLabel('Password',{exact:true}).fill(users[i].password)
  await pages[i].getByRole('button',{name:'Sign in',exact:false}).click();await expect(pages[i].locator('.today-dashboard')).toBeVisible()
 }
 const [pa,pb]=pages
 await pa.goto(`${origin}/classes`)
 await pa.locator('.classmate-list').getByRole('button').filter({hasText:'Blair'}).first().click()
 await pa.getByRole('button',{name:'Message Blair',exact:true}).click()
 const paneA=pa.getByRole('region',{name:'Direct message with Blair',exact:true})
 await expect(paneA).toBeVisible();await expect(paneA.getByText(body,{exact:true})).toBeVisible()
 await pa.getByRole('button',{name:'Open chat',exact:true}).click();await expect(pa.locator('.global-chat-panel')).toBeVisible()
 await expect(paneA.locator('header')).toContainText('Live updates',{timeout:20000})
 await paneA.getByLabel('Message Blair',{exact:true}).fill('Hello from Alex, real-time test.')
 await paneA.getByRole('button',{name:'Send',exact:true}).click()
 await pb.getByRole('button',{name:/^Messages/}).click()
 await pb.locator('.dm-inbox-list').getByRole('button').filter({hasText:'Alex'}).click()
 const paneB=pb.getByRole('region',{name:'Direct message with Alex',exact:true})
 await expect(paneB.getByText('Hello from Alex, real-time test.',{exact:true})).toBeVisible()
 await paneB.getByLabel('Message Alex',{exact:true}).fill('Reply from Blair, real-time test.')
 await paneB.getByRole('button',{name:'Send',exact:true}).click();await expect(paneA.getByText('Reply from Blair, real-time test.',{exact:true})).toBeVisible()
 await pa.screenshot({path:'/tmp/academy-dm-desktop.png',fullPage:false})
 await paneA.getByRole('button',{name:'Minimize Blair conversation'}).click();await expect(paneA.getByLabel('Message Blair',{exact:true})).toHaveCount(0)
 await paneA.getByRole('button',{name:'Restore Blair conversation'}).click()
 await pa.setViewportSize({width:390,height:844});await expect(paneA).toBeVisible();assert.ok(await pa.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await pa.screenshot({path:'/tmp/academy-dm-mobile.png'})
 await paneA.getByRole('button',{name:'Close Blair conversation'}).click()
 await pa.getByRole('button',{name:'Close chat',exact:true}).click()
 await pa.goto(`${origin}/stats`);await expect(pa.locator('.knowledge-insights')).toBeVisible()
 await pa.getByLabel('Practice status',{exact:true}).selectOption('untested');await expect(pa.locator('.knowledge-table-wrap tbody tr')).toHaveCount(12)
 await pa.getByRole('button',{name:'Open study coach',exact:true}).click()
 if(process.env.ACADEMY_REAL_AI==='true'){
  await pa.getByRole('button',{name:'Explain my results',exact:true}).click();await expect(pa.locator('.coach-response')).toBeVisible({timeout:60000});await expect(pa.locator('.coach-response')).toContainText('20%')
 }
 await pa.screenshot({path:'/tmp/academy-knowledge-mobile.png',fullPage:true})
 await pa.setViewportSize({width:1440,height:1000});await pa.screenshot({path:'/tmp/academy-knowledge-desktop.png',fullPage:true})
 for(const route of ['/leaderboards','/games/matching','/games/speed','/games/blaster','/chat']){await pa.goto(`${origin}${route}`);await expect(pa.locator('#main-content')).toBeVisible();assert.ok(await pa.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),route);await pa.screenshot({path:`/tmp/academy-polish-${route.replaceAll('/','-')}.png`,fullPage:true})}
 await pa.goto(`${origin}/leaderboards`)
 await pa.getByRole('button',{name:'All-Time',exact:true}).click()
 const board=pa.locator('.leaderboards-mode-list')
 await pa.getByLabel('Code set & round length',{exact:true}).selectOption('30|all')
 await expect(board.locator('.is-current-user')).toContainText('Alex')
 await expect(board).toContainText('100 pts')
 check(await admin.from('leaderboard').update({score:220}).eq('class_id',classId).eq('user_id',b.id).eq('match_duration',30))
 await expect(board).toContainText('220 pts',{timeout:15000})
 await pa.getByLabel('Code set & round length',{exact:true}).selectOption('60|penal');await expect(board).toContainText('150 pts')
 await pa.screenshot({path:'/tmp/academy-leaderboard-populated.png',fullPage:true})
 await pa.getByRole('button',{name:'Switch to dark mode',exact:true}).click();await pa.waitForTimeout(700);await pa.screenshot({path:'/tmp/academy-leaderboard-dark.png',fullPage:true})
 await pa.getByRole('button',{name:'Switch to light mode',exact:true}).click();await pa.waitForTimeout(700)
 console.log('PASS: class-scoped leaderboard filters, own rank highlight and live score refresh.')
 // Complete timed rounds and inspect the actual results UI.
 await pa.clock.install()
 for(const game of [{path:'matching',start:'Start Matching',title:'Matching Settings'},{path:'speed',start:'Start Speed Test',title:'Speed Test Settings'}]){
  await pa.goto(`${origin}/games/${game.path}`)
  await pa.getByRole('button',{name:game.start,exact:true}).click()
  const dialog=pa.getByRole('dialog',{name:game.title,exact:true})
  await dialog.getByRole('button',{name:/30 seconds/}).click()
  await dialog.getByRole('button',{name:'Start',exact:true}).click()
  await pa.clock.runFor(31000)
  await expect(pa.locator('.session-result-card')).toBeVisible()
  await expect(pa.locator('.session-report-card')).toContainText('recap')
  await pa.screenshot({path:`/tmp/academy-result-${game.path}.png`})
  await pa.setViewportSize({width:390,height:844});assert.ok(await pa.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2))
  await pa.screenshot({path:`/tmp/academy-result-${game.path}-mobile.png`})
  await pa.setViewportSize({width:1440,height:1000})
 }
 // Quotas are enforced in the database without spending model tokens.
 let reservations=0,limitHit=false
 for(let n=0;n<21;n++){const result=await admin.rpc('reserve_academy_coach_usage',{p_user:a.id});if(result.error){limitHit=true;break}reservations++;assert.equal(result.data.limit,20)}
 assert.ok(limitHit);assert.ok(reservations<=20)
 const proCustomer=`cus_synthetic_${randomUUID()}`
 check(await admin.from('academy_billing_customers').insert({user_id:b.id,customer_id:proCustomer,livemode:false}))
 check(await admin.rpc('record_subscription_snapshot',{p_snapshot:{subscription_id:`sub_synthetic_${randomUUID()}`,user_id:b.id,customer_id:proCustomer,price_id:'price_synthetic_pro',tier:'tier10',paid_tier:'tier10',paid_through:new Date(Date.now()+86400000).toISOString(),current_period_end:new Date(Date.now()+86400000).toISOString(),status:'active',cancel_at_period_end:false,livemode:false,sync_sequence:check(await admin.rpc('next_subscription_sync'))}}))
 for(let n=0;n<60;n++){const usage=check(await admin.rpc('reserve_academy_coach_usage',{p_user:b.id}));assert.equal(usage.limit,60);assert.equal(usage.remaining,59-n)}
 assert.ok((await admin.rpc('reserve_academy_coach_usage',{p_user:b.id})).error)

 check(await admin.from('academy_subscriptions').update({paid_through:new Date(Date.now()-1000).toISOString()}).eq('user_id',a.id))
 for(const endpoint of ['knowledge','coach'])assert.equal((await fetch(`http://127.0.0.1:8791/api/membership/${endpoint}`,{method:endpoint==='coach'?'POST':'GET',headers,...(endpoint==='coach'?{body:'{}'}:{})})).status,403)
 console.log('PASS: completed game results, mobile summaries, persistent daily quota and expiry protection.')
 // Removing class access immediately prevents old-session history reads and sends.
 check(await admin.from('class_memberships').update({status:'removed',is_active:false}).eq('user_id',b.id).eq('class_id',classId))
 assert.equal(check(await b.client.from('academy_dm_messages').select('*').eq('thread_id',thread)).length,0)
 assert.ok((await b.client.rpc('send_academy_dm',{p_thread:thread,p_body:'after removal',p_nonce:randomUUID()})).error)
 assert.deepEqual(errors,[])
 console.log('PASS: profile-to-DM flow, real-time two-user send/reply, adjacent class chat, minimize/restore, mobile layout, paid knowledge map, coach and refreshed screens.')
}finally{
 await browser?.close()
 for(const user of users)check(await admin.auth.admin.deleteUser(user.id))
 if(classId)check(await admin.from('academy_classes').delete().eq('id',classId))
 if(academyId)check(await admin.from('academies').delete().eq('id',academyId))
}
