// Adversarial checks use only disposable users in the explicitly isolated clone.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {parse} from 'dotenv'
import {createClient} from '@supabase/supabase-js'
const env=parse(await readFile(new URL('../.env.staging.local',import.meta.url)))
assert.equal(env.SUPABASE_URL,'http://127.0.0.1:55431')
const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}),users=[]
const check=({data,error})=>{assert.ifError(error);return data}
try{
 const email=`access-${randomUUID()}@example.invalid`,password=`Test!${randomUUID()}`
 const user=check(await admin.auth.admin.createUser({email,password,email_confirm:true})).user;users.push(user.id)
 check(await admin.from('profiles').insert({user_id:user.id,username:`Membership Access ${randomUUID()}`,supporter_tier:'free'}))
 const client=createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY||env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false}})
 check(await client.auth.signInWithPassword({email,password}))
 const anon=createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY||env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false}})
 assert.ok((await anon.rpc('academy_membership_access')).error)
 assert.ok((await client.rpc('save_academy_pro_preferences',{p_preferences:{weeklySessions:5,setups:[]}})).error)
 for(const table of ['academy_billing_customers','academy_subscriptions','academy_membership_badges','academy_checkout_leases'])assert.ok((await client.from(table).insert({user_id:user.id})).error,`${table} denies forged writes`)
 assert.equal(check(await client.from('content_items').select('id').eq('type','scenario')).length,0)
 assert.equal(check(await anon.from('content_items').select('id').eq('type','scenario')).length,0)
 const customer=`cus_access_${randomUUID()}`,subscription=`sub_access_${randomUUID()}`
 check(await admin.from('academy_billing_customers').insert({user_id:user.id,customer_id:customer,livemode:false}))
 const sequence=()=>admin.rpc('next_subscription_sync').then(check)
 const base={subscription_id:subscription,user_id:user.id,customer_id:customer,price_id:'price_plus',tier:'tier5',status:'active',paid_tier:'tier5',paid_through:new Date(Date.now()+86400000).toISOString(),cancel_at_period_end:false,current_period_end:new Date(Date.now()+86400000).toISOString(),livemode:false}
 const apply=async data=>check(await admin.rpc('record_subscription_snapshot',{p_snapshot:{...base,sync_sequence:await sequence(),...data}}))
 const first=await sequence();await apply({sync_sequence:first})
 const second=await sequence();await apply({sync_sequence:second,tier:'tier10',paid_tier:'tier10',price_id:'price_pro'})
 assert.equal((await apply({sync_sequence:first})).stale,true)
 assert.equal(check(await client.rpc('academy_membership_access')).tier,'tier10')
 await apply({tier:'tier10',paid_tier:null,paid_through:null,status:'past_due'})
 assert.equal(check(await client.rpc('academy_membership_access')).tier,'tier10')
 assert.equal(Date.parse(check(await client.rpc('academy_membership_access')).paidThrough),Date.parse(base.paid_through))
 assert.ok((await admin.rpc('record_subscription_snapshot',{p_snapshot:{...base,customer_id:'cus_unrelated',sync_sequence:await sequence()}})).error)
 const lock=randomUUID(),other=randomUUID()
 assert.equal(check(await admin.rpc('claim_membership_checkout',{p_user:user.id,p_token:lock})),true)
 assert.equal(check(await admin.rpc('claim_membership_checkout',{p_user:user.id,p_token:other})),false)
 check(await admin.rpc('release_membership_checkout',{p_user:user.id,p_token:other}))
 assert.equal(check(await admin.rpc('claim_membership_checkout',{p_user:user.id,p_token:other})),false,'Unrelated token cannot release lease')
 check(await admin.rpc('release_membership_checkout',{p_user:user.id,p_token:lock}))
 assert.equal(check(await admin.rpc('claim_membership_checkout',{p_user:user.id,p_token:other})),true)
 check(await client.rpc('save_academy_pro_preferences',{p_preferences:{weeklySessions:7,setups:[{id:'saved',name:'Private study plan',module:'tmas1',length:20}]}}))
 const state=check(await client.from('app_state').select('profile_details').eq('user_id',user.id).single())
 assert.equal(state.profile_details.proStudyPreferences.weeklySessions,7)
 const publicState=check(await client.from('public_study_profiles').select('profile_details').eq('user_id',user.id).single())
 assert.equal(publicState.profile_details.proStudyPreferences,undefined)
 console.log('PASS: anonymous/free question access denied; forged grants blocked; stale events ignored; paid time preserved after failed renewal; checkout leases serialize requests; private Pro preferences persist without leaking into public profiles.')
}finally{for(const id of users)check(await admin.auth.admin.deleteUser(id))}
