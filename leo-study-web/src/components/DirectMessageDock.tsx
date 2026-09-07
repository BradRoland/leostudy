import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import './DirectMessageDock.css'

type Thread={id:string;class_id:string;user_low:string;user_high:string;updated_at:string;last_sender:string|null}
type Message={id:string;thread_id:string;sender_id:string;body:string;client_nonce:string;created_at:string}
type ReadMarker={thread_id:string;user_id:string;read_at:string}
const db=supabase!
export function DirectMessageDock({userId,classId,children}:{userId:string;classId:string;children?:ReactNode}) {
 const [threads,setThreads]=useState<Thread[]>([]),[names,setNames]=useState<Record<string,string>>({}),[reads,setReads]=useState<ReadMarker[]>([])
 const [open,setOpen]=useState<string[]>([]),[minimized,setMinimized]=useState<string[]>([]),[active,setActive]=useState(''),[inbox,setInbox]=useState(false),[error,setError]=useState(''),[live,setLive]=useState(false)
 const [blocked,setBlocked]=useState<string[]>([])
 const mounted=useRef(true)
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 const load=useCallback(async()=>{
  const [a,b,c]=await Promise.all([db.from('academy_dm_threads').select('*').eq('class_id',classId).order('updated_at',{ascending:false}).limit(100),db.from('academy_dm_reads').select('*').eq('user_id',userId),db.from('academy_dm_blocks').select('blocked_id').eq('user_id',userId)])
  if(!mounted.current)return
  if(a.error||b.error||c.error){setError('Messages could not refresh. Please try again.');return}
  setThreads(a.data||[]);setReads(b.data||[]);setBlocked((c.data||[]).map(x=>x.blocked_id));setError('')
  const peers=[...new Set((a.data||[]).map(t=>t.user_low===userId?t.user_high:t.user_low))]
  if(peers.length){const p=await db.from('academy_public_profiles').select('user_id,username').in('user_id',peers);if(mounted.current&&!p.error)setNames(prev=>({...prev,...Object.fromEntries((p.data||[]).map(x=>[x.user_id,x.username||'Classmate']))}))}
 },[classId,userId])
 useEffect(()=>{
  void load()
  let disposed=false
  const channel=db.channel(`academy-dm-inbox:${userId}:${classId}:${crypto.randomUUID()}`).on('postgres_changes',{event:'*',schema:'public',table:'academy_dm_threads',filter:`class_id=eq.${classId}`},()=>void load()).on('postgres_changes',{event:'*',schema:'public',table:'academy_dm_reads',filter:`user_id=eq.${userId}`},()=>void load()).subscribe(status=>{if(disposed)return;setLive(status==='SUBSCRIBED');if(status==='SUBSCRIBED')void load()})
  const focus=()=>void load();window.addEventListener('focus',focus);const timer=setInterval(()=>{if(document.visibilityState==='visible')void load()},20000)
  return()=>{disposed=true;void db.removeChannel(channel);window.removeEventListener('focus',focus);clearInterval(timer)}
 },[load,userId,classId])
 const show=useCallback((id:string)=>{setOpen(prev=>[...prev.filter(x=>x!==id),id].slice(-3));setMinimized(prev=>prev.filter(x=>x!==id));setActive(id);setInbox(false)},[])
 useEffect(()=>{
  const listener=async(event:Event)=>{
   const {userId:peer,name}=(event as CustomEvent).detail||{}
   if(typeof peer!=='string'||peer===userId)return
   setError('')
   const r=await db.rpc('start_academy_dm',{p_class:classId,p_peer:peer})
   if(!mounted.current)return
   if(r.error){setError(r.error.message);setInbox(true);return}
   setNames(prev=>({...prev,[peer]:typeof name==='string'?name:'Classmate'}));await load();show(r.data)
  }
  window.addEventListener('academy:dm-open',listener);return()=>window.removeEventListener('academy:dm-open',listener)
 },[classId,userId,load,show])
 const unread=(t:Thread)=>t.last_sender&&t.last_sender!==userId&&(!reads.find(r=>r.thread_id===t.id)||new Date(reads.find(r=>r.thread_id===t.id)!.read_at)<new Date(t.updated_at))
 const count=threads.filter(unread).length
 const close=(id:string)=>{setOpen(prev=>prev.filter(x=>x!==id));setMinimized(prev=>prev.filter(x=>x!==id));setActive(prev=>prev===id?'':prev)}
 return <aside className="messaging-dock" aria-label="Your conversations">
  <div className="dm-dock-tools"><button className="dm-inbox-toggle" onClick={()=>setInbox(x=>!x)} aria-expanded={inbox}>Messages{count?<span>{count}</span>:null}</button>{open.map(id=>{const t=threads.find(x=>x.id===id);return t?<button key={id} className="dm-thread-tab" onClick={()=>show(id)}>{names[t.user_low===userId?t.user_high:t.user_low]||'Classmate'}{unread(t)?' •':''}</button>:null})}<button className="dm-class-tab" onClick={()=>{setMinimized(open);setActive('');window.dispatchEvent(new Event('academy:open-class-chat'))}}>Class chat</button></div>
  {inbox?<section className="dm-inbox" aria-label="Direct message inbox"><header><div><strong>Your messages</strong><small>{live?'Live updates':'Reconnecting · checking for messages'}</small></div><button onClick={()=>setInbox(false)} aria-label="Close inbox">×</button></header>{error?<p role="alert">{error}<button onClick={()=>void load()}>Retry</button></p>:null}<div className="dm-inbox-list">{threads.length?threads.map(t=><button key={t.id} onClick={()=>show(t.id)}><span className="dm-peer-avatar">{(names[t.user_low===userId?t.user_high:t.user_low]||'?').slice(0,1)}</span><span><strong>{names[t.user_low===userId?t.user_high:t.user_low]||'Classmate'}</strong><small>{unread(t)?'New message':t.last_sender?'Open conversation':'Start a conversation'}</small></span>{unread(t)?<i aria-label="Unread"/>:null}</button>):<p>Open a classmate’s profile and choose Message to start a private conversation.</p>}</div><footer>Private conversations with active classmates.</footer></section>:null}
  <div className="dm-dock-windows">{open.map(id=>{const thread=threads.find(x=>x.id===id);if(!thread)return null;const peer=thread.user_low===userId?thread.user_high:thread.user_low;return <DirectConversation key={id} thread={thread} userId={userId} name={names[peer]||'Classmate'} active={id===active} minimized={minimized.includes(id)} blocked={blocked.includes(peer)} onActivate={()=>setActive(id)} onMinimize={()=>setMinimized(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id])} onClose={()=>close(id)} onRead={load} onBlock={async()=>{const r=await db.rpc('set_academy_dm_block',{p_peer:peer,p_block:!blocked.includes(peer)});if(r.error)throw Error(r.error.message);await load()}}/>})}{children}</div>
 </aside>
}
function DirectConversation({thread,userId,name,active,minimized,blocked,onActivate,onMinimize,onClose,onRead,onBlock}:{thread:Thread;userId:string;name:string;active:boolean;minimized:boolean;blocked:boolean;onActivate:()=>void;onMinimize:()=>void;onClose:()=>void;onRead:()=>void;onBlock:()=>Promise<void>}) {
 const [messages,setMessages]=useState<Message[]>([]),[draft,setDraft]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[live,setLive]=useState(false),[older,setOlder]=useState(true),[hasNew,setHasNew]=useState(false)
 const scroll=useRef<HTMLDivElement>(null),nonce=useRef<{body:string;id:string}|null>(null),mounted=useRef(true),nearBottom=useRef(true),lastRead=useRef('')
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 const fetchMessages=useCallback(async()=>{
  const r=await db.from('academy_dm_messages').select('*').eq('thread_id',thread.id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(50)
  if(!mounted.current)return
  setLoading(false)
  if(r.error){setError('Conversation could not load. Please try again.');return}
  setMessages(prev=>{const all=new Map([...prev,...(r.data||[])].map(m=>[m.id,m]));return [...all.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id))})
  if(!nearBottom.current)setHasNew(true)
 },[thread.id])
 useEffect(()=>{
  void fetchMessages()
  let disposed=false
  const channel=db.channel(`dm:${thread.id}:${crypto.randomUUID()}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'academy_dm_messages',filter:`thread_id=eq.${thread.id}`},()=>void fetchMessages()).subscribe(status=>{if(disposed)return;setLive(status==='SUBSCRIBED');if(status==='SUBSCRIBED')void fetchMessages()})
  const focus=()=>void fetchMessages();window.addEventListener('focus',focus);const timer=setInterval(()=>{if(document.visibilityState==='visible')void fetchMessages()},15000)
  return()=>{disposed=true;void db.removeChannel(channel);window.removeEventListener('focus',focus);clearInterval(timer)}
 },[fetchMessages,thread.id])
 useEffect(()=>{if(nearBottom.current&&!minimized)scroll.current?.scrollTo({top:scroll.current.scrollHeight})},[messages,minimized])
 useEffect(()=>{
  const last=messages.at(-1)
  const mark=()=>{const el=scroll.current;if(!last||lastRead.current===last.created_at||minimized||document.visibilityState!=='visible'||!el||!el.getClientRects().length||!nearBottom.current||document.querySelector('dialog[open],.profile-modal-overlay'))return;void db.rpc('mark_academy_dm_read',{p_thread:thread.id,p_through:last.created_at}).then(r=>{if(!r.error){lastRead.current=last.created_at;onRead()}})}
  mark();window.addEventListener('focus',mark);document.addEventListener('visibilitychange',mark)
  return()=>{window.removeEventListener('focus',mark);document.removeEventListener('visibilitychange',mark)}
 },[messages,thread.id,minimized,active,onRead])
 async function send(){if(busy||blocked||!draft.trim())return;setBusy(true);setError('');const body=draft.trim();if(nonce.current?.body!==body)nonce.current={body,id:crypto.randomUUID()};try{const r=await db.rpc('send_academy_dm',{p_thread:thread.id,p_body:body,p_nonce:nonce.current!.id});if(r.error)throw Error(r.error.message);nonce.current=null;setDraft('');nearBottom.current=true;await fetchMessages()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function loadOlder(){const first=messages[0];if(!first)return;const r=await db.from('academy_dm_messages').select('*').eq('thread_id',thread.id).or(`created_at.lt.${first.created_at},and(created_at.eq.${first.created_at},id.lt.${first.id})`).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(50);if(r.error){setError('Earlier messages could not load.');return}setOlder((r.data||[]).length===50);nearBottom.current=false;setMessages(prev=>[...(r.data||[]).reverse(),...prev])}
 return <section className={`dm-window${active?' is-active':''}${minimized?' is-minimized':''}`} aria-label={`Direct message with ${name}`} onFocus={onActivate}><header><span className="dm-peer-avatar">{name.slice(0,1)}</span><div><h2>{name}</h2><small>{blocked?'Messages blocked':live?'Private · Live updates':'Private · Reconnecting'}</small></div><button onClick={onMinimize} aria-label={`${minimized?'Restore':'Minimize'} ${name} conversation`}>{minimized?'+':'−'}</button><button onClick={onClose} aria-label={`Close ${name} conversation`}>×</button></header>{!minimized?<><div className="dm-history" ref={scroll} role="log" aria-label={`Messages with ${name}`} aria-live="polite" onScroll={()=>{const el=scroll.current;if(el){nearBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<60;if(nearBottom.current)setHasNew(false)}}}>{messages.length>=50&&older?<button className="dm-earlier" onClick={()=>void loadOlder()}>Load earlier messages</button>:null}{loading?<p role="status">Loading your conversation…</p>:!messages.length?<div className="dm-empty"><strong>A conversation just for you two.</strong><p>Ask a question or share a study tip with {name}.</p></div>:null}{messages.map(m=><article key={m.id} className={`dm-message${m.sender_id===userId?' is-own':''}`}><p>{m.body}</p><time dateTime={m.created_at} title={new Date(m.created_at).toLocaleString()}>{new Date(m.created_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}{m.sender_id===userId?' · Sent':''}</time></article>)}</div>{hasNew?<button className="dm-new" onClick={()=>{nearBottom.current=true;scroll.current?.scrollTo({top:scroll.current.scrollHeight});setHasNew(false)}}>New messages ↓</button>:null}{error?<p className="dm-error" role="alert">{error}</p>:null}<form onSubmit={e=>{e.preventDefault();void send()}}><label className="sr-only" htmlFor={`dm-draft-${thread.id}`}>Message {name}</label><textarea id={`dm-draft-${thread.id}`} value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send()}}} disabled={blocked} maxLength={2000} rows={2} placeholder={blocked?'Unblock to send messages':`Message ${name}…`}/><div><small>{draft.length}/2,000 · Shift + Enter for a new line</small><button disabled={busy||blocked||!draft.trim()}>{busy?'Sending…':'Send'}</button></div></form><footer><button onClick={()=>void onBlock().catch(e=>setError(e.message))}>{blocked?'Unblock messages':'Block messages'}</button><span>Only participants can read this chat</span></footer></>:null}</section>
}
