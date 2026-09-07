// Development clone only. Does not send email or change Stripe billing.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {parse} from 'dotenv'
import {createClient} from '@supabase/supabase-js'
import {chromium,expect} from '@playwright/test'
import {rolandUserId} from './roland-membership-test.mjs'
const env=parse(await readFile(new URL('../.env.staging.local',import.meta.url)))
assert.equal(env.SUPABASE_URL,'http://127.0.0.1:55431')
const origin=process.env.ACADEMY_CHECK_ORIGIN||'http://127.0.0.1:5176'
assert.ok(['http://127.0.0.1:5176','https://dev.180.academy'].includes(origin))
const api=origin.startsWith('https:')?origin:'http://127.0.0.1:8791'
const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const check=r=>{assert.ifError(r.error);return r.data}
const testId=`academy_test_${rolandUserId}`
const before=check(await admin.from('academy_subscriptions').select('*').eq('subscription_id',testId).maybeSingle())
const beforeBadge=check(await admin.from('academy_membership_badges').select('*').eq('user_id',rolandUserId).maybeSingle())
let browser,client
try{
 const account=check(await admin.auth.admin.getUserById(rolandUserId)).user
 assert.ok(account.email)
 const generated=check(await admin.auth.admin.generateLink({type:'magiclink',email:account.email}))
 client=createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY,{auth:{persistSession:false}})
 const session=check(await client.auth.verifyOtp({token_hash:generated.properties.hashed_token,type:'magiclink'})).session
 const headers={Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'}
 assert.equal((await fetch(`${api}/api/membership/roland-test`)).status,401)
 assert.ok((await client.rpc('set_roland_test_membership',{p_user:rolandUserId,p_tier:'tier10'})).error)
 const accounts=JSON.parse(await readFile(new URL('../.test-accounts.local',import.meta.url)))
 for(const fixture of [accounts.owner,accounts.cadet]){
  const other=createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY,{auth:{persistSession:false}})
  const token=check(await other.auth.signInWithPassword({email:fixture.email,password:fixture.password})).session.access_token
  for(const method of ['GET','POST'])assert.equal((await fetch(`${api}/api/membership/roland-test`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify({tier:'tier10',userId:rolandUserId})}:{})})).status,403)
  check(await other.auth.signOut({scope:'local'}))
 }
 assert.equal((await fetch(`${api}/api/membership/roland-test`,{method:'POST',headers,body:JSON.stringify({tier:'lifetime'})})).status,400)
 check(await admin.rpc('set_roland_test_membership',{p_user:rolandUserId,p_tier:'free'}))
 browser=await chromium.launch()
 const context=await browser.newContext({viewport:{width:1440,height:1000}})
 await context.route('**/*',route=>(origin.startsWith('https:')?new URL(route.request().url()).origin===origin:['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname))?route.continue():route.abort())
 const storageKey=origin.startsWith('https:')?'sb-dev-auth-token':client.auth.storageKey
 await context.addInitScript(({storageKey,session})=>localStorage.setItem(storageKey,JSON.stringify(session)),{storageKey,session})
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto(`${origin}/profile`)
 await page.getByRole('button',{name:'Roland',exact:true}).click()
 const panel=page.getByRole('region',{name:'Roland’s testing space'})
 await expect(panel).toBeVisible();await expect(panel.getByText('Off',{exact:true})).toBeVisible()
 await panel.getByRole('button',{name:'Give me Plus',exact:true}).click()
 await expect(panel.getByRole('status')).toContainText('Plus test membership is active.')
 assert.equal(check(await client.rpc('academy_membership_access')).tier,'tier5')
 assert.equal((await fetch(`${api}/api/membership/knowledge`,{headers})).status,200)
 await panel.getByRole('button',{name:'Give me Pro',exact:true}).click()
 await expect(panel.getByRole('status')).toContainText('Pro test membership is active.')
 assert.equal(check(await client.rpc('academy_membership_access')).tier,'tier10')
 assert.equal((await fetch(`${api}/api/membership/analytics`,{headers})).status,200)
 await page.reload();await page.getByRole('button',{name:'Roland',exact:true}).click();await expect(panel.getByRole('button',{name:'Pro is active'})).toBeDisabled()
 await page.screenshot({path:'/tmp/academy-roland-settings.png'})
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2))
 await panel.getByRole('button',{name:'Give me Plus',exact:true}).click();await expect(panel.getByRole('status')).toContainText('Plus test membership is active.')
 assert.equal(check(await client.rpc('academy_membership_access')).tier,'tier5')
 assert.equal((await fetch(`${api}/api/membership/analytics`,{headers})).status,403)
 await panel.getByRole('button',{name:'Remove test membership',exact:true}).click();await expect(panel.getByRole('status')).toContainText('Test membership removed.')
 assert.equal(check(await client.rpc('academy_membership_access')).tier,'free')
 assert.equal((await fetch(`${api}/api/membership/knowledge`,{headers})).status,403)
 await page.screenshot({path:'/tmp/academy-roland-mobile.png'})
 assert.deepEqual(errors,[])
 console.log('PASS: Roland-only controls, anonymous/other-owner/cadet denial, client RPC denial, Plus/Pro grants, reload persistence, downgrade/removal, paid API access and mobile layout.')
}finally{
 await browser?.close()
 check(await admin.rpc('set_roland_test_membership',{p_user:rolandUserId,p_tier:'free'}))
 if(before)check(await admin.from('academy_subscriptions').upsert(before))
 if(beforeBadge)check(await admin.from('academy_membership_badges').upsert(beforeBadge));else check(await admin.from('academy_membership_badges').delete().eq('user_id',rolandUserId))
 if(client)await client.auth.signOut({scope:'local'})
}
