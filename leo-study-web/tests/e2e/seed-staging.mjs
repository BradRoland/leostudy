import fs from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

if (process.env.SUPABASE_URL !== 'http://127.0.0.1:55431') throw new Error('Refusing to seed anything except the isolated localhost test API.')
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const check = ({ data, error }) => { if (error) throw error; return data }
const suffix=Date.now()
const accounts={}
const classes=check(await admin.from('academy_classes').select('id,class_name').eq('class_name','Class 181'))
const classId=classes[0].id
const departments=check(await admin.from('class_departments').select('id,name').eq('class_id',classId))
const department=departments[0]
const now=Date.now()
for(const kind of ['cadet','owner']){
 const email=`class180.${kind}.${suffix}@example.invalid`
 const password=`Test-${randomBytes(18).toString('base64url')}-9a!`
 const user=check(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{username:kind==='cadet'?'Alex Morgan':'Test Owner',display_name:kind==='cadet'?'Alex Morgan':'Test Owner'}})).user
 const username=kind==='cadet'?'Alex Morgan':'Test Owner'
 check(await admin.from('profiles').upsert({user_id:user.id,username,avatar_path:'',supporter_tier:'free',agency:department.name,bio:'Synthetic test account for the UI overhaul.'}))
 check(await admin.from('class_memberships').upsert({user_id:user.id,class_id:classId,role:'cadet',status:'active',is_active:true,department_id:department.id},{onConflict:'user_id,class_id'}))
 if(kind==='owner')check(await admin.from('user_roles').insert({user_id:user.id,role:'owner'}))
 const contents=JSON.parse(await fs.readFile(new URL('../../src/content/pc.json',import.meta.url),'utf8'))
 const performance=Object.fromEntries(contents.slice(0,32).map((c,i)=>[`penal|${c.codeSection.trim().toLowerCase()}`,{correctCount:i<20?12:3,incorrectCount:i<20?1:6,lastSeenAt:now-i*30000,correctStreak:i<20?6:0}]))
 check(await admin.from('app_state').upsert({user_id:user.id,performance,high_scores:{matching:430,speed:640,blaster:920},best_streak:14,profile_details:{firstName:kind==='cadet'?'Alex':'Test',lastName:kind==='cadet'?'Morgan':'Owner',dailyGoalMinutes:15,studyFocus:'balanced',onboardingCompleted:true,agency:department.name,displayMode:'light',systemNoticesSeen:[],stats:{studySeconds:29100,studyDayStreak:7,bestStudyDayStreak:12,lastStudyDay:new Date(now).toLocaleDateString('en-CA'),gamePlays:{matching:12,speed:9,blaster:5},flashcardsReviewed:186,scenariosReviewed:21,lifetimeMasteredCodes:20,sessionTimeline:[0,0,1,2,2,3,4,5].map((days,i)=>({mode:i%2?'matching':'study_test',filter:'all',accuracy:70+i*3,score:100+i*30,at:now-days*86400000})),achievementXp:1400}}},{onConflict:'user_id'}))
 accounts[kind]={email,password,userId:user.id,classId,departmentId:department.id}
}
await fs.writeFile('.test-accounts.local',JSON.stringify(accounts,null,2),{mode:0o600})
console.log('Synthetic cadet and owner created in test clone. Private logins saved to .test-accounts.local.')
