import fs from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

if (process.env.SUPABASE_URL !== 'http://127.0.0.1:55431') throw new Error('Demo progress can only be written to the isolated test API.')
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const accounts = JSON.parse(await fs.readFile('.test-accounts.local', 'utf8'))
const ids = [accounts.cadet.userId]
const review = await admin.from('profiles').select('user_id').eq('username', 'Jordan Review').maybeSingle()
if (review.data?.user_id) ids.push(review.data.user_id)
const performance = {}
for (const [file, codeSet] of [['pc', 'penal'], ['hs', 'hs'], ['vc', 'vehicle']]) {
  const rows = JSON.parse(await fs.readFile(new URL(`../../src/content/${file}.json`, import.meta.url), 'utf8'))
  rows.slice(0, 22).forEach((row, index) => {
    performance[`${codeSet}|${row.codeSection.trim().toLowerCase()}`] = { correctCount: index < 6 ? 24 : index < 14 ? 9 : 3, incorrectCount: index < 6 ? 0 : index < 14 ? 2 : 5, correctStreak: index < 6 ? 24 : index < 14 ? 5 : 1 }
  })
}
for (const userId of ids) {
  const { data, error } = await admin.from('app_state').select('profile_details').eq('user_id', userId).single()
  if (error) throw error
  const profile = data.profile_details
  const { error: updateError } = await admin.from('app_state').update({ performance, profile_details: { ...profile, displayMode: 'light', stats: { ...profile.stats, studySeconds: 29100, studyDayStreak: 7, bestStudyDayStreak: 12, lastStudyDay: new Date().toLocaleDateString('en-CA'), flashcardsReviewed: 186, scenariosReviewed: 21, sessionTimeline: [0, 0, 1, 2, 2, 3, 4, 5].map((days, index) => ({ mode: index % 2 ? 'matching' : 'study_test', filter: 'all', accuracy: 70 + index * 3, score: 100 + index * 30, at: Date.now() - days * 86400000 })) } } }).eq('user_id', userId)
  if (updateError) throw updateError
}
console.log(`Synthetic progress added to ${ids.length} isolated test accounts.`)
