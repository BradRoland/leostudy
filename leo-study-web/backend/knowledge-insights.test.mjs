import test from 'node:test'
import assert from 'node:assert/strict'
import {buildKnowledgeInsights,coachKnowledgeContext} from './knowledge-insights.mjs'
import {createStudyCoach} from './study-coach.mjs'
const catalog=[{category:'pc',codeSection:'PC 1',title:'First'},{category:'pc',codeSection:'PC 2',title:'Second'},{category:'vc',codeSection:'VC 3',title:'Third'}]
test('untested topics are not weaknesses or claimed mastery',()=>{const r=buildKnowledgeInsights({},catalog);assert.equal(r.accuracy,null);assert.equal(r.coverage,0);assert.equal(r.untestedCodes,3);assert.deepEqual(r.priorities,[]);assert.deepEqual(r.strengths,[])})
test('accuracy uses weighted answers and evidence distinguishes early and weak signals',()=>{const r=buildKnowledgeInsights({performance:{'penal|pc 1':{correctCount:1,incorrectCount:0},'penal|pc 2':{correctCount:2,incorrectCount:8},'vehicle|vc 3':{correctCount:20,incorrectCount:0,correctStreak:20}}},catalog);assert.equal(r.accuracy,74);assert.equal(r.priorities[0].sectionNumber,'PC 2');assert.equal(r.earlySignals,1);assert.equal(r.mastered,1);assert.equal(r.subjects[0].accuracy,27);assert.equal(r.strengths[0].sectionNumber,'VC 3')})
test('invalid counters, duplicate catalog and unknown keys cannot inflate coverage',()=>{const r=buildKnowledgeInsights({performance:{'penal|pc 1':{correctCount:-5,incorrectCount:Infinity},'forged':{correctCount:10000}},profile_details:{email:'private@example.invalid'}},[...catalog,catalog[0]]);assert.equal(r.totalCodes,3);assert.equal(r.attempts,0);assert.ok(!JSON.stringify(coachKnowledgeContext(r)).includes('private@'));assert.ok(!Object.hasOwn(coachKnowledgeContext(r),'codes'))})
const insights=buildKnowledgeInsights({performance:{'penal|pc 1':{correctCount:2,incorrectCount:8}}},catalog)
const reply={summary:'Practice PC 1 again.',steps:[{title:'Review',detail:'A short review.',codeKey:'foreign|code'}],caveat:'This is practice evidence.'}
test('coach enforces structured result, strips invented code links, caches only within account and uses bounded non-stored API calls',async()=>{
 let calls=0,used=0
 const coach=createStudyCoach({enabled:true,apiKey:'test-key',reserve:async()=>{used++;return{limit:20,remaining:19}},fetchImpl:async(url,request)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');const b=JSON.parse(request.body);assert.equal(b.store,false);assert.ok(b.max_output_tokens<=1600);assert.equal(b.text.format.strict,true);return{ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(reply)}]}]})}}})
 assert.equal((await coach.respond('alice','tier5',insights,{})).steps[0].codeKey,null)
 assert.equal((await coach.respond('alice','tier5',insights,{})).cached,true)
 await coach.respond('bob','tier5',insights,{});assert.equal(calls,2);assert.equal(used,2)
 await assert.rejects(coach.respond('alice','tier5',insights,{mode:'ask',question:'x'.repeat(1001)}),e=>e.status===400)
})
test('missing configuration, quota failures and incomplete responses fail honestly',async()=>{
 await assert.rejects(createStudyCoach({reserve:async()=>{}}).respond('a','tier5',insights,{}),e=>e.status===503)
 let calls=0
 await assert.rejects(createStudyCoach({enabled:true,apiKey:'test',reserve:async()=>{throw Error('quota')},fetchImpl:async()=>{calls++}}).respond('a','tier5',insights,{}));assert.equal(calls,0)
 const c=createStudyCoach({enabled:true,apiKey:'test',reserve:async()=>({}),fetchImpl:async()=>({ok:true,json:async()=>({status:'incomplete'})})});await assert.rejects(c.respond('a','tier5',insights,{}),e=>e.status===503)
})

test('coach activity includes only aggregate study evidence and ignores invalid sessions',()=>{
 const now=Date.now();const r=buildKnowledgeInsights({profile_details:{email:'private@example.invalid',stats:{studySeconds:620,flashcardsReviewed:12,sessionTimeline:[{mode:'matching',accuracy:80,at:now},{mode:'matching',accuracy:40,at:now},{mode:'speed',accuracy:100,at:now+1},{mode:'unknown',accuracy:100,at:now}]}}},catalog,now)
 assert.equal(r.activity.studyMinutes,10);assert.equal(r.activity.recentSessions,2);assert.equal(r.activity.modes[1].averageSessionAccuracy,60);assert.equal(r.activity.modes[2].averageSessionAccuracy,null);assert.ok(!JSON.stringify(coachKnowledgeContext(r)).includes('private@'))
})
