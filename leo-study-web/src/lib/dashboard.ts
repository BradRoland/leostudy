export type DashboardSession = { at: number }

export function calendarDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function buildWeeklyActivity(sessions: DashboardSession[], now: number) {
  const today = new Date(now)
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7)
  const counts = new Map<string, number>()
  for (const session of sessions) {
    if (!Number.isFinite(session.at) || session.at > now) continue
    const key = calendarDayKey(new Date(session.at))
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(date.getDate() + index)
    const key = calendarDayKey(date)
    return {
      key,
      label: date.toLocaleDateString('en-US', { weekday: 'short' }),
      dateLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count: counts.get(key) || 0,
      isToday: key === calendarDayKey(today),
      isFuture: date.getTime() > now,
    }
  })
}

export function graduationProgress(startDate: string | null | undefined, endDate: string | null | undefined, now: number) {
  if (!startDate || !endDate) return null
  const start = new Date(`${startDate}T00:00:00`).getTime()
  const end = new Date(`${endDate}T00:00:00`).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
  return {
    percent: Math.min(100, Math.max(0, Math.round((now - start) / (end - start) * 100))),
    daysRemaining: Math.max(0, Math.ceil((end - now) / 86_400_000)),
    hasStarted: now >= start,
  }
}

export function formatDashboardTime(seconds: number) {
  const minutes = Math.floor(Math.max(0, Number.isFinite(seconds) ? seconds : 0) / 60)
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}
