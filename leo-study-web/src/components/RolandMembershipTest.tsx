import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import './RolandMembershipTest.css'

type TestAccess = {tier:'free'|'tier5'|'tier10';expiresAt:string|null}
export function RolandMembershipTest({onChange}:{onChange:()=>Promise<unknown>}) {
 const [access,setAccess]=useState<TestAccess|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState(''),[retry,setRetry]=useState(0)
 async function request(tier?:TestAccess['tier']) {
  const {data}=await supabase!.auth.getSession()
  const response=await fetch('/api/membership/roland-test',{method:tier?'POST':'GET',headers:{Authorization:`Bearer ${data.session?.access_token||''}`,'Content-Type':'application/json'},...(tier?{body:JSON.stringify({tier})}:{})})
  const result=await response.json();if(!response.ok)throw Error(result.error||'Testing controls are unavailable.');return result as TestAccess
 }
 useEffect(()=>{let disposed=false;request().then(value=>{if(!disposed){setAccess(value);setError('')}}).catch(e=>{if(!disposed)setError(e.message)});return()=>{disposed=true}},[retry])
 async function change(tier:TestAccess['tier']) {
  if(busy)return;setBusy(true);setError('');setStatus('')
  try{setAccess(await request(tier));await onChange();setStatus(tier==='free'?'Test membership removed.':`${tier==='tier10'?'Pro':'Plus'} test membership is active.`)}catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 return <section className="settings-section-card roland-membership-test" aria-labelledby="roland-testing-title">
  <header><p className="eyebrow">Private · Development only</p><h2 id="roland-testing-title">Roland’s testing space</h2><p>Try the member experience on your own account, then remove test access whenever you’re done.</p></header>
  <div className="roland-test-status"><span>Test membership</span><strong>{access?access.tier==='free'?'Off':access.tier==='tier10'?'Academy Pro':'Academy Plus':'Checking access…'}</strong>{access?.tier!=='free'&&access?.expiresAt?<small>Expires {new Date(access.expiresAt).toLocaleString()} · no renewal</small>:null}</div>
  <div className="roland-test-plans">
   <article><h3>Academy Plus</h3><p>Analytics, T-MAS practice, selected themes and 20 daily coach requests.</p><button className="secondary" disabled={busy||!access||access.tier==='tier5'} onClick={()=>void change('tier5')}>{access?.tier==='tier5'?'Plus is active':'Give me Plus'}</button></article>
   <article><h3>Academy Pro</h3><p>All Plus features, study plans, reports, every theme, name styling and 60 daily coach requests.</p><button className="primary" disabled={busy||!access||access.tier==='tier10'} onClick={()=>void change('tier10')}>{access?.tier==='tier10'?'Pro is active':'Give me Pro'}</button></article>
  </div>
  <div className="roland-test-remove"><button className="secondary" disabled={busy||!access||access.tier==='free'} onClick={()=>void change('free')}>Remove test membership</button><p>Test access lasts seven days. No payment or Stripe subscription is created. Removing it preserves your progress and any separately purchased membership.</p></div>
  {busy?<p role="status">Updating your test access…</p>:status?<p role="status">{status}</p>:null}
  {error?<p role="alert">{error} {!access?<button className="secondary" onClick={()=>setRetry(x=>x+1)}>Try again</button>:null}</p>:null}
 </section>
}
