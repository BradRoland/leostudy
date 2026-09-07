import test from 'node:test'
import assert from 'node:assert/strict'
import {createRolandMembershipTest,rolandTestingEnabled,rolandUserId} from './roland-membership-test.mjs'
const env={DISABLE_LIVE_INTEGRATIONS:'true',CLASS_REQUEST_APP_URL:'https://dev.180.academy',SUPABASE_URL:'http://gateway'}
test('Roland testing is disabled outside the exact isolated runtime',()=>{
 assert.equal(rolandTestingEnabled(env),true)
 for(const change of [{DISABLE_LIVE_INTEGRATIONS:'false'},{CLASS_REQUEST_APP_URL:'https://180.academy'},{SUPABASE_URL:'http://production'}])assert.equal(rolandTestingEnabled({...env,...change}),false)
})
test('other accounts, including another owner, are denied before any database mutation',async()=>{
 const service=createRolandMembershipTest({env,supabase:{from(){throw Error('Must not query')}}})
 await assert.rejects(service.set('other-owner','tier10'),e=>e.status===403)
 const prod=createRolandMembershipTest({env:{...env,DISABLE_LIVE_INTEGRATIONS:'false'},supabase:{}})
 await assert.rejects(prod.set(rolandUserId,'tier10'),e=>e.status===404)
})
test('server uses the authenticated Roland ID, validates plans and requires current owner role',async()=>{
 let role=true,current=null,calls=[]
 const supabase={from(table){const query={select(){return query},eq(){return query},then(resolve){resolve({data:role?[{role:'owner'}]:[],error:null})},maybeSingle:async()=>({data:current,error:null})};assert.ok(['user_roles','academy_subscriptions'].includes(table));return query},rpc:async(name,args)=>{calls.push({name,args});current=args.p_tier==='free'?null:{paid_tier:args.p_tier,paid_through:new Date(Date.now()+100000).toISOString()};return{error:null}}}
 const service=createRolandMembershipTest({env,supabase})
 await assert.rejects(service.set(rolandUserId,'lifetime'),e=>e.status===400)
 assert.equal((await service.set(rolandUserId,'tier10')).tier,'tier10')
 assert.deepEqual(calls[0],{name:'set_roland_test_membership',args:{p_user:rolandUserId,p_tier:'tier10'}})
 assert.equal((await service.set(rolandUserId,'free')).tier,'free')
 role=false;await assert.rejects(service.set(rolandUserId,'tier5'),e=>e.status===403)
})
