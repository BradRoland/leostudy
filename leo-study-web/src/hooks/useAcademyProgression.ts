import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export type AcademyChallenge = { id: string; cadence: 'daily' | 'weekly'; title: string; target: number; progress: number; xp: number; claimed: boolean; resetsAt: string }
export type AcademyProgression = { totalXp: number; level: number; challenges: AcademyChallenge[]; awardedXp?: number }
export function useAcademyProgression(userId: string, classId: string | null) {
  const identity = `${userId}:${classId || ''}`
  const current = useRef(identity)
  current.current = identity
  const request = useRef(0)
  const busy = useRef(false)
  const [value, setValue] = useState<{ identity: string; data: AcademyProgression } | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [claiming, setClaiming] = useState('')
  const status = value?.identity === identity ? value.data : null
  const run = useCallback(async (challenge?: string) => {
    if (!supabase || !userId || !classId || busy.current) return
    if (challenge) { busy.current = true; setClaiming(challenge) }
    const ticket = ++request.current
    try {
      const response = challenge
        ? await supabase.rpc('claim_academy_challenge', { p_challenge: challenge })
        : await supabase.rpc('get_academy_progression')
      if (current.current !== identity || ticket !== request.current) return
      if (response.error) throw response.error
      const data = response.data as AcademyProgression
      if (!Number.isSafeInteger(data?.totalXp) || !Array.isArray(data?.challenges)) throw new Error('Invalid progression')
      setValue({ identity, data }); setError('')
      if (challenge) setMessage(data.awardedXp ? `+${data.awardedXp} XP earned. Your progress is saved.` : 'This reward is already in your account.')
    } catch {
      if (current.current === identity && ticket === request.current) setError(challenge ? 'Could not confirm this reward. Try again; you will only receive it once.' : 'Your challenges could not be loaded. Try again.')
    } finally {
      if (current.current === identity && ticket === request.current && challenge) { busy.current = false; setClaiming('') }
    }
  }, [identity, userId, classId])
  const refresh = useCallback(() => run(), [run])
  useEffect(() => {
    busy.current = false; setClaiming(''); setError(''); setMessage('')
    void refresh()
    const visible = () => { if (document.visibilityState === 'visible') void refresh() }
    const timer = window.setInterval(visible, 30000)
    window.addEventListener('focus', visible)
    window.addEventListener('academy-practice-saved', visible)
    document.addEventListener('visibilitychange', visible)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', visible); window.removeEventListener('academy-practice-saved', visible); document.removeEventListener('visibilitychange', visible) }
  }, [refresh])
  return { status, error, message, claiming, refresh, claim: (id: string) => run(id) }
}
