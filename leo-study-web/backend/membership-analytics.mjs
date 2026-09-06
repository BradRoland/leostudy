const dayMs = 86400000
const validNumber = value => typeof value === 'number' && Number.isFinite(value)
export function buildMembershipAnalytics(state, now = Date.now()) {
  const details = state?.profile_details || {}
  const stats = details.stats || {}
  const sessions = (Array.isArray(stats.sessionTimeline) ? stats.sessionTimeline : []).filter(row => validNumber(row.at) && row.at <= now && row.at > 0)
  const today = new Date(now); today.setUTCHours(0,0,0,0)
  const weekStart = today.getTime() - ((today.getUTCDay() + 6) % 7) * dayMs
  const period = (start, end) => {
    const rows = sessions.filter(row => row.at >= start && row.at < end)
    const accuracy = rows.filter(row => validNumber(row.accuracy) && row.accuracy >= 0 && row.accuracy <= 100)
    return { sessions: rows.length, accuracy: accuracy.length ? Math.round(accuracy.reduce((sum,row) => sum + row.accuracy,0) / accuracy.length) : null }
  }
  const current = period(weekStart, now + 1), previous = period(weekStart - 7 * dayMs, weekStart)
  const snapshot = details.algorithmSnapshot || {}
  const weaknesses = Object.values(snapshot).filter(row => row && ['penal','hs','vehicle'].includes(row.codeSet) && row.attempts > 0)
    .map(row => ({ codeSet: row.codeSet, sectionNumber: String(row.sectionNumber || ''), title: String(row.title || 'Code review'), attempts: Math.max(0,Number(row.attempts)||0), accuracy: Math.max(0,Math.min(100,Number(row.accuracy)||0)) }))
    .sort((a,b) => a.accuracy - b.accuracy || b.attempts - a.attempts).slice(0,8)
  const calendar = Array.from({length:28},(_,index) => {
    const start = today.getTime() - (27-index)*dayMs
    const count = sessions.filter(row => row.at >= start && row.at < start + dayMs).length
    return { date: new Date(start).toISOString().slice(0,10), count }
  })
  return { current, previous, sessionDelta: current.sessions - previous.sessions,
    accuracyDelta: current.accuracy !== null && previous.accuracy !== null ? current.accuracy - previous.accuracy : null,
    calendar, weaknesses, trackedSessions: sessions.length, weekStart: new Date(weekStart).toISOString().slice(0,10), generatedAt: new Date(now).toISOString() }
}
