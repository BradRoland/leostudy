import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { effectiveMembership, freeMembership, type MembershipAccess } from './membership'

export function useMembership(client: SupabaseClient | null, userId: string) {
  const [stored, setStored] = useState<{ userId: string; access: MembershipAccess } | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    if (!client || !userId) return freeMembership
    const { data, error } = await client.rpc('academy_membership_access')
    if (error) { setError('Membership access could not be checked. Please try again.'); throw error }
    const access = effectiveMembership(data as MembershipAccess)
    setStored({ userId, access }); setNow(Date.now()); setError('')
    return access
  }, [client, userId])
  useEffect(() => {
    const check = () => { void refresh().catch(() => {}) }
    check()
    window.addEventListener('focus', check)
    const tick = window.setInterval(() => { setNow(Date.now()); if (document.visibilityState === 'visible') check() }, 15000)
    return () => { window.removeEventListener('focus', check); window.clearInterval(tick) }
  }, [refresh])
  const access = stored?.userId === userId ? effectiveMembership(stored.access, now) : freeMembership
  useEffect(() => {
    if (!access.paidThrough) return
    const delay = Math.max(0, Date.parse(access.paidThrough) - Date.now())
    const timeout = window.setTimeout(() => setNow(Date.now()), Math.min(delay + 10, 2147483647))
    return () => window.clearTimeout(timeout)
  }, [access.paidThrough])
  return { access, refresh, error }
}
