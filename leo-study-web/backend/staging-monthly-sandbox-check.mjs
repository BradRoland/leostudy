// Opt-in, official Stripe CLI sandbox against disposable users in the local clone.
import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import http from 'node:http'
import Stripe from 'stripe'
import { parse } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { createStripeMembershipService } from './stripe-membership-service.mjs'
const run=promisify(execFile), cli=process.env.STRIPE_TEST_CLI, config=process.env.STRIPE_TEST_CLI_CONFIG
assert.ok(cli&&config)
const catalog=JSON.parse(await readFile(new URL('../.env.stripe-monthly-sandbox.local.json',import.meta.url)))
assert.equal(catalog.livemode,false)
assert.equal((await readFile(config,'utf8')).match(/^account_id\s*=\s*['"]([^'"]+)['"]/m)?.[1],catalog.stripeAccount)
const base=['--config',config,'--project-name','academy-payment-test','--color','off']
const command=async args=>{for(let attempt=0;;attempt++){try{return (await run(cli,[...base,...args],{timeout:90000,maxBuffer:4*1024*1024})).stdout}catch(error){if(args[0]!=='get'||attempt>=2||!/timeout|connection|TLS/i.test(error.message))throw error}}}
function flatten(value,key='') { return value&&typeof value==='object'?Object.entries(value).flatMap(([k,v])=>flatten(v,key?`${key}[${k}]`:k)):[['-d',`${key}=${value}`]].flat() }
async function api(method,path,params={},options={}) {
 const raw=await command([method,path,...flatten(params),...(options.idempotencyKey?['--idempotency',options.idempotencyKey]:[]),...(method==='delete'?['--confirm']:[])])
 const result=JSON.parse(raw); if(result.error)throw Error(result.error.message); if('livemode' in result)assert.equal(result.livemode,false);return result
}
const env=parse(await readFile(new URL('../.env.staging.local',import.meta.url)))
assert.equal(env.SUPABASE_URL,'http://127.0.0.1:55431')
const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const check=({data,error})=>{assert.ifError(error);return data}
const sdk={
 customers:{create:(p,o)=>api('post','/v1/customers',p,o)},
 subscriptions:{list:p=>api('get','/v1/subscriptions',p),retrieve:(id,p)=>api('get',`/v1/subscriptions/${id}`,p)},
 checkout:{sessions:{list:p=>api('get','/v1/checkout/sessions',p),create:(p,o)=>api('post','/v1/checkout/sessions',p,o),retrieve:id=>api('get',`/v1/checkout/sessions/${id}`),expire:id=>api('post',`/v1/checkout/sessions/${id}/expire`)}},
 invoices:{retrieve:id=>api('get',`/v1/invoices/${id}`)},
 billingPortal:{sessions:{create:p=>api('post','/v1/billing_portal/sessions',p)}},
}
const service=createStripeMembershipService({stripe:sdk,supabase:admin,legacyCheckout:async()=>({ignored:true}),env:{STRIPE_MONTHLY_PRICE_TIER5:catalog.tiers.tier5.price,STRIPE_MONTHLY_PRICE_TIER10:catalog.tiers.tier10.price,STRIPE_PORTAL_CONFIGURATION:catalog.portalConfiguration,ACADEMY_PUBLIC_URL:'https://dev.180.academy'}})
const users=[],customers=[],clocks=[],receipts=[],errors=[];let listener,secret,output='',server
const verifier=new Stripe('sk_test_signature_verification_only')
async function waitFor(fn,label,timeout=90000) {const end=Date.now()+timeout;while(Date.now()<end){const value=await fn();if(value)return value;if(errors.length)throw errors[0];await new Promise(resolve=>setTimeout(resolve,500))}throw Error(`Timed out: ${label}`)}
async function user() {
 const email=`monthly-${randomUUID()}@example.invalid`,password=`Test!${randomUUID()}`
 const row=check(await admin.auth.admin.createUser({email,password,email_confirm:true})).user;users.push(row.id)
 check(await admin.from('profiles').insert({user_id:row.id,username:`Monthly Test ${randomUUID()}`,supporter_tier:'free'}))
 const client=createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY||env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false}})
 check(await client.auth.signInWithPassword({email,password}));return {row,client}
}
const access=async client=>check(await client.rpc('academy_membership_access'))
async function paidCheckout(person,tier,clock=false) {
 if(clock) {
  const time=await api('post','/v1/test_helpers/test_clocks',{frozen_time:Math.floor(Date.now()/1000),name:'Academy monthly verification'});clocks.push(time.id)
  const customer=await api('post','/v1/customers',{email:person.row.email,test_clock:time.id,metadata:{academy_user_id:person.row.id}});customers.push(customer.id)
  check(await admin.from('academy_billing_customers').insert({user_id:person.row.id,customer_id:customer.id,livemode:false}))
 }
 const opened=await service.checkout(person.row,tier);assert.equal(opened.kind,'checkout');assert.match(opened.url,/^https:\/\/checkout.stripe.com\//)
 assert.deepEqual(await service.checkout(person.row,tier),opened,'Repeat click reuses Checkout')
 const customer=check(await admin.from('academy_billing_customers').select('customer_id').eq('user_id',person.row.id).single()).customer_id
 if(!customers.includes(customer))customers.push(customer)
 const session=(await sdk.checkout.sessions.list({customer,status:'open'})).data[0]
 assert.equal((await access(person.client)).tier,'free','Opening checkout grants nothing')
 const fixture={_meta:{template_version:0},fixtures:[
  {name:'payment_page',path:`/v1/payment_pages/${session.id}`,method:'get'},
  {name:'payment_method',path:'/v1/payment_methods',method:'post',params:{type:'card',card:{token:'tok_visa'},billing_details:{email:'stripe@example.com',name:'Academy Sandbox Test',address:{line1:'123 Test Street',city:'Sacramento',state:'CA',postal_code:'95814',country:'US'}}}},
  {name:'payment_page_confirm',path:`/v1/payment_pages/${session.id}/confirm`,method:'post',params:{payment_method:'${payment_method:id}',expected_amount:catalog.tiers[tier].amount}},
 ]}
 await command(['trigger','checkout.session.completed','--raw',JSON.stringify(fixture)])
 await waitFor(async()=> (await access(person.client)).tier===tier,`${tier} signed webhook grant`)
 const complete=await sdk.checkout.sessions.retrieve(session.id)
 return {customer,subscription:complete.subscription,session:session.id,clock:clock?clocks.at(-1):null}
}
try {
 for(const entry of Object.values(catalog.tiers)){const price=await api('get',`/v1/prices/${entry.price}`);assert.equal(price.recurring.interval,'month');assert.equal(price.unit_amount,entry.amount)}
 server=http.createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);let event
  try{event=verifier.webhooks.constructEvent(body,req.headers['stripe-signature'],secret)}catch{res.writeHead(400).end();return}
  try{const result=await service.handleEvent(event);receipts.push({event,result,body,signature:req.headers['stripe-signature']});res.writeHead(200).end('ok')}catch(error){errors.push(error);res.writeHead(500).end()}
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const endpoint=`http://127.0.0.1:${server.address().port}/stripe/webhook`
 listener=spawn(cli,[...base,'listen','--events','checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed','--forward-to',endpoint],{stdio:['ignore','pipe','pipe']})
 const collect=chunk=>{output+=chunk.toString();secret=output.match(/whsec_[A-Za-z0-9]+/)?.[0]};listener.stdout.on('data',collect);listener.stderr.on('data',collect)
 await waitFor(()=>secret,'listener authorization');assert.equal((await fetch(endpoint,{method:'POST',body:'{}'})).status,400)
 const plus=await user(),pro=await user(),free=await user()
 const boughtPlus=await paidCheckout(plus,'tier5',true);console.log('PASS: genuine $5 monthly Checkout grants Plus; repeat checkout reuses session; unpaid opening stays free.')
 const boughtPro=await paidCheckout(pro,'tier10');console.log('PASS: genuine $10 monthly Checkout grants Pro through signed Stripe events.')
 assert.equal((await service.checkout(plus.row,'tier10')).kind,'portal','Existing subscription changes use portal')
 const customer=check(await admin.from('academy_billing_customers').select('customer_id').eq('user_id',plus.row.id).single())
 assert.equal(customer.customer_id,boughtPlus.customer)
 assert.equal((await free.client.from('academy_subscriptions').select('*')).data.length,0)
 assert.ok((await free.client.from('academy_subscriptions').insert({subscription_id:'forged'})).error)
 assert.ok((await free.client.rpc('record_subscription_snapshot',{p_snapshot:{}})).error)
 assert.ok((await free.client.rpc('claim_membership_checkout',{p_user:free.row.id,p_token:randomUUID()})).error)
 assert.equal((await access(free.client)).tier,'free')
 const receipt=receipts.find(row=>row.event.type==='checkout.session.completed'&&row.event.data.object.id===boughtPro.session)
 assert.ok(receipt);assert.equal((await fetch(endpoint,{method:'POST',headers:{'stripe-signature':receipt.signature},body:receipt.body})).status,200)
 assert.equal(check(await admin.from('academy_subscriptions').select('*').eq('user_id',pro.row.id)).length,1)
 console.log('PASS: duplicate delivery stays idempotent; clients cannot grant memberships or read another account billing data.')
 const before=await access(plus.client)
 const sub=await sdk.subscriptions.retrieve(boughtPlus.subscription,{expand:['latest_invoice']})
 const boundary=sub.items.data[0].current_period_end
 await api('post',`/v1/test_helpers/test_clocks/${boughtPlus.clock}/advance`,{frozen_time:boundary+3600})
 await waitFor(async()=> (await api('get',`/v1/test_helpers/test_clocks/${boughtPlus.clock}`)).status==='ready','renewal clock')
 // Stripe invoices finalize after the simulated one-hour grace period.
 const clockState=await api('get',`/v1/test_helpers/test_clocks/${boughtPlus.clock}`)
 await api('post',`/v1/test_helpers/test_clocks/${boughtPlus.clock}/advance`,{frozen_time:clockState.frozen_time+7200})
 await waitFor(async()=>Date.parse((await access(plus.client)).paidThrough)>Date.parse(before.paidThrough),'paid renewal')
 console.log('PASS: a genuine sandbox renewal invoice automatically extends paid access.')
 await waitFor(async()=> (await api('get',`/v1/test_helpers/test_clocks/${boughtPlus.clock}`)).status==='ready','completed renewal clock')
 const renewed=await access(plus.client)
 await api('post',`/v1/subscriptions/${boughtPlus.subscription}`,{cancel_at_period_end:true})
 await waitFor(async()=>(await access(plus.client)).cancelAtPeriodEnd,'scheduled cancellation')
 assert.equal((await access(plus.client)).paidThrough,renewed.paidThrough)
 console.log('PASS: scheduled cancellation stops renewal and preserves the entire paid period.')
 const failureMethod=await api('post','/v1/payment_methods/pm_card_chargeCustomerFail/attach',{customer:boughtPlus.customer})
 const failureSub=await api('post',`/v1/subscriptions/${boughtPlus.subscription}`,{cancel_at_period_end:false,default_payment_method:failureMethod.id})
 const nextEnd=failureSub.items.data[0].current_period_end
 await api('post',`/v1/test_helpers/test_clocks/${boughtPlus.clock}/advance`,{frozen_time:nextEnd+3600})
 await waitFor(async()=> (await api('get',`/v1/test_helpers/test_clocks/${boughtPlus.clock}`)).status==='ready','failure clock')
 await api('post',`/v1/test_helpers/test_clocks/${boughtPlus.clock}/advance`,{frozen_time:nextEnd+10800})
 await waitFor(()=>receipts.some(row=>row.event.type==='invoice.payment_failed'&&row.event.data.object.customer===boughtPlus.customer),'failed renewal webhook')
 await waitFor(async()=>check(await admin.from('academy_subscriptions').select('status').eq('subscription_id',boughtPlus.subscription).single()).status==='past_due','failed renewal state')
 assert.equal((await access(plus.client)).paidThrough,renewed.paidThrough,'Failed renewal must not extend the previously paid period')
 console.log('PASS: a genuine declined renewal records past-due billing and grants no additional time.')

 // Paid-through evaluation uses the database clock; test expiry on a separate isolated snapshot.
 const expiry=await user();const cid=`cus_expiry_${randomUUID()}`
 check(await admin.from('academy_billing_customers').insert({user_id:expiry.row.id,customer_id:cid,livemode:false}))
 const expiryTime=new Date(Date.now()+2500).toISOString()
 check(await admin.rpc('record_subscription_snapshot',{p_snapshot:{subscription_id:`sub_expiry_${randomUUID()}`,user_id:expiry.row.id,customer_id:cid,price_id:catalog.tiers.tier10.price,tier:'tier10',status:'canceled',paid_tier:'tier10',paid_through:expiryTime,cancel_at_period_end:true,current_period_end:expiryTime,livemode:false,sync_sequence:check(await admin.rpc('next_subscription_sync'))}}))
 assert.equal((await access(expiry.client)).tier,'tier10');await waitFor(async()=>(await access(expiry.client)).tier==='free','paid-period expiry',10000)
 assert.equal(check(await expiry.client.from('academy_public_profiles').select('membership_tier').eq('user_id',expiry.row.id).single()).membership_tier,'free')
 console.log('PASS: membership and public badge expire at the paid boundary without relying on another webhook.')
 assert.equal(errors.length,0)
} finally {
 listener?.kill('SIGTERM');server?.closeAllConnections();if(server)await new Promise(resolve=>server.close(resolve))
 // Delete only disposable test customers/users created by this run.
 for(const id of clocks){await waitFor(async()=> (await api('get',`/v1/test_helpers/test_clocks/${id}`)).status==='ready','cleanup clock').catch(()=>{});await api('delete',`/v1/test_helpers/test_clocks/${id}`)}
 for(const id of customers)await api('delete',`/v1/customers/${id}`).catch(()=>{})
 for(const id of users)check(await admin.auth.admin.deleteUser(id))
 console.log('Cleanup: disposable monthly test users and sandbox customers removed.')
}
