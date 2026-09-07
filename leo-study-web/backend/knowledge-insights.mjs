const labels = { penal: 'Penal Code', hs: 'Health & Safety', vehicle: 'Vehicle Code' }
const count = value => Number.isFinite(value) ? Math.max(0, Math.min(10000000, Math.floor(value))) : 0
const accuracy = (correct, attempts) => attempts ? Math.round(correct / attempts * 100) : null
export function buildKnowledgeInsights(state, catalog, now = Date.now()) {
  const performance = state?.performance || {}
  const unique = new Map()
  for (const item of catalog) {
    const codeSet = ({pc:'penal', hs:'hs', vc:'vehicle'})[item.category]
    const sectionNumber = String(item.codeSection || item.answer || '').trim()
    if (!codeSet || !sectionNumber) continue
    const key = `${codeSet}|${sectionNumber.toLowerCase()}`
    if (unique.has(key)) continue
    const source = performance[key] || {}
    const correct = count(source.correctCount), incorrect = count(source.incorrectCount), attempts = correct + incorrect
    const percent = accuracy(correct, attempts)
    const streak = Math.min(count(source.correctStreak), correct)
    const evidence = attempts === 0 ? 'Untested' : attempts < 5 ? 'Early signal' : attempts < 20 ? 'Building evidence' : 'Well practiced'
    const status = !attempts ? 'untested' : streak >= 20 ? 'mastered' : attempts < 5 ? 'early' : percent < 70 ? 'focus' : 'developing'
    unique.set(key, { key, codeSet, sectionNumber, title: item.title, correct, incorrect, attempts, accuracy: percent, streak, evidence, status })
  }
  const stats = state?.profile_details?.stats || {}
  const recent = (Array.isArray(stats.sessionTimeline) ? stats.sessionTimeline : []).filter(row => row && ['study_test','matching','speed','blaster'].includes(row.mode) && Number.isFinite(row.at) && row.at <= now && row.at >= now - 14 * 86400000 && Number.isFinite(row.accuracy) && row.accuracy >= 0 && row.accuracy <= 100).slice(-200)
  const activity = {
    studyMinutes: Math.floor(count(stats.studySeconds) / 60),
    flashcardsReviewed: count(stats.flashcardsReviewed), scenariosReviewed: count(stats.scenariosReviewed),
    recentSessions: recent.length,
    modes: ['study_test','matching','speed','blaster'].map(mode => {
      const rows = recent.filter(row => row.mode === mode)
      return {mode, sessions: rows.length, averageSessionAccuracy: rows.length ? Math.round(rows.reduce((sum,row) => sum + row.accuracy,0) / rows.length) : null}
    }),
    methodology: 'Activity totals are recorded by the app. Recent sessions cover up to 200 saved sessions in the last 14 days. Average session accuracy weights each session equally; it is separate from code answer accuracy. No sessions means no evidence, not zero ability.'
  }
  const codes = [...unique.values()]
  const tested = codes.filter(c => c.attempts)
  const attempts = tested.reduce((n,c) => n+c.attempts,0), correct = tested.reduce((n,c) => n+c.correct,0)
  const subjects = Object.entries(labels).map(([codeSet,label]) => {
    const items = codes.filter(c=>c.codeSet===codeSet), touched=items.filter(c=>c.attempts)
    const total=touched.reduce((n,c)=>n+c.attempts,0), right=touched.reduce((n,c)=>n+c.correct,0)
    return { codeSet,label,totalCodes:items.length,testedCodes:touched.length,coverage:items.length?Math.round(touched.length/items.length*100):0,attempts:total,accuracy:accuracy(right,total),mastered:items.filter(c=>c.status==='mastered').length,needsFocus:items.filter(c=>c.status==='focus').length }
  })
  const priorities = [...tested].filter(c=>c.status!=='mastered').sort((a,b)=>(a.status==='focus'?-1:0)-(b.status==='focus'?-1:0)||a.accuracy-b.accuracy||b.attempts-a.attempts).slice(0,6)
  const strengths = [...tested].filter(c=>c.attempts>=5&&c.accuracy>=80).sort((a,b)=>b.accuracy-a.accuracy||b.attempts-a.attempts).slice(0,6)
  return { generatedAt:new Date(now).toISOString(),totalCodes:codes.length,testedCodes:tested.length,untestedCodes:codes.length-tested.length,coverage:codes.length?Math.round(tested.length/codes.length*100):0,attempts,accuracy:accuracy(correct,attempts),mastered:codes.filter(c=>c.status==='mastered').length,activity,earlySignals:codes.filter(c=>c.status==='early').length,subjects,priorities,strengths,codes,
    methodology:'Coverage means at least one recorded answer, not mastery. Fewer than five answers is an early signal. Focus areas have at least five answers below 70% accuracy. Mastery requires 20 consecutive correct answers. These are practice records, not a prediction of exam readiness.' }
}
export function coachKnowledgeContext(insights) {
  const {codes: _codes,...summary}=insights
  return summary
}
