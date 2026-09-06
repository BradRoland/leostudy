import { useCallback, useEffect, useRef, useState } from 'react'
import { claimDailyReward, loadDailyRewardStatus, type DailyRewardStatus } from '../lib/dailyRewards'

/** Rewards stay separate from autosaved study state. Responses belong to one account. */
export function useDailyRewards(userId: string, classId: string | null) {
  const [value, setValue] = useState<{ owner: string; status: DailyRewardStatus } | null>(null)
  const [loading, setLoading] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const epoch = useRef(0)
  const busy = useRef(false)
  const account = useRef(userId)
  account.current = userId
  const status = value?.owner === userId ? value.status : null

  const refresh = useCallback(async () => {
    if (!userId || !classId || busy.current) return
    const request = ++epoch.current
    setLoading(true)
    try {
      const next = await loadDailyRewardStatus()
      if (request !== epoch.current || account.current !== userId) return
      setValue({ owner: userId, status: next })
      setError('')
    } catch {
      if (request === epoch.current && account.current === userId) setError('Your rewards could not be loaded. Please try again.')
    } finally {
      if (request === epoch.current) setLoading(false)
    }
  }, [userId, classId])

  useEffect(() => {
    epoch.current += 1
    busy.current = false
    setValue(previous => previous?.owner === userId ? previous : null)
    setError('')
    setMessage('')
    setClaiming(false)
    setLoading(false)
    void refresh()
    const visible = () => { if (document.visibilityState === 'visible') void refresh() }
    window.addEventListener('focus', visible)
    document.addEventListener('visibilitychange', visible)
    return () => {
      epoch.current += 1
      window.removeEventListener('focus', visible)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [refresh, userId])

  useEffect(() => {
    if (!status?.resetsAt) return
    // The server decides eligibility. This timer only refreshes the display.
    const delay = Math.max(1000, Date.parse(status.resetsAt) - Date.now() + 1000)
    const timer = window.setTimeout(() => { void refresh() }, Math.min(delay, 86_401_000))
    return () => window.clearTimeout(timer)
  }, [status?.resetsAt, refresh])

  const claim = useCallback(async () => {
    if (!userId || !classId || busy.current) return
    busy.current = true
    const request = ++epoch.current
    setClaiming(true)
    setLoading(false)
    setError('')
    setMessage('')
    try {
      const result = await claimDailyReward()
      if (request !== epoch.current || account.current !== userId) return
      setValue({ owner: userId, status: result })
      setMessage(result.claimed ? `You earned ${result.awardedXp} XP. A little momentum for your next session!` : 'Today’s reward is already in your account.')
    } catch {
      if (request === epoch.current && account.current === userId) setError('We could not confirm your reward. Try again — a reward can only be added once.')
    } finally {
      if (request === epoch.current) { busy.current = false; setClaiming(false) }
    }
  }, [userId, classId])

  return { status, loading, claiming, error, message, refresh, claim }
}
