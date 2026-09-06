import assert from 'node:assert/strict'
import test from 'node:test'
import { buildWeeklyActivity, calendarDayKey, formatDashboardTime, graduationProgress } from './dashboard.ts'

test('weekly activity uses actual completed sessions, Monday start, and excludes future and invalid events', () => {
  const now = new Date(2026, 8, 5, 17).getTime()
  const sessions = [
    { at: new Date(2026, 7, 31, 12).getTime() },
    { at: new Date(2026, 8, 5, 9).getTime() },
    { at: new Date(2026, 8, 5, 11).getTime() },
    { at: new Date(2026, 8, 6, 11).getTime() },
    { at: new Date(2026, 7, 30, 11).getTime() },
    { at: NaN },
  ]
  const days = buildWeeklyActivity(sessions, now)
  assert.deepEqual(days.map((day) => day.count), [1, 0, 0, 0, 0, 2, 0])
  assert.equal(days[0].label, 'Mon')
  assert.equal(days[5].isToday, true)
  assert.equal(days[6].isFuture, true)
})

test('an empty history renders no invented progress', () => {
  assert.equal(buildWeeklyActivity([], Date.now()).every((day) => day.count === 0), true)
  assert.equal(formatDashboardTime(0), '0m')
  assert.equal(graduationProgress(null, null, Date.now()), null)
})

test('class timeline handles upcoming, completed, and invalid dates', () => {
  assert.equal(graduationProgress('2026-09-01', '2026-10-01', new Date(2026, 7, 1).getTime())?.percent, 0)
  const completed = graduationProgress('2026-09-01', '2026-10-01', new Date(2026, 10, 1).getTime())
  assert.equal(completed?.percent, 100)
  assert.equal(completed?.daysRemaining, 0)
  assert.equal(graduationProgress('invalid', '2026-10-01', Date.now()), null)
  assert.equal(graduationProgress('2026-10-02', '2026-10-01', Date.now()), null)
  assert.equal(calendarDayKey(new Date(2026, 0, 2)), '2026-01-02')
  assert.equal(formatDashboardTime(7260), '2h 1m')
})
