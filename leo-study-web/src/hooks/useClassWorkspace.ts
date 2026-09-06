import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  loadClassMemberships,
  type ClassMembership,
} from '../lib/classApi'

export function useClassWorkspace(userId: string | null) {
  const [memberships, setMemberships] = useState<ClassMembership[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [settledUserId, setSettledUserId] = useState<string | null>(null)
  const requestVersion = useRef(0)

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current
    if (!userId) {
      setMemberships([])
      setLoading(false)
      setError('')
      setSettledUserId(null)
      return
    }
    setLoading(true)
    setError('')
    try {
      const rows = await loadClassMemberships()
      if (version !== requestVersion.current) return
      setMemberships(rows)
    } catch (err) {
      if (version !== requestVersion.current) return
      setError(err instanceof Error ? err.message : 'Could not load class memberships.')
      setMemberships([])
    } finally {
      if (version === requestVersion.current) {
        setLoading(false)
        setSettledUserId(userId)
      }
    }
  }, [userId])

  useEffect(() => {
    void refresh()
    return () => { requestVersion.current += 1 }
  }, [refresh])

  const activeClass = useMemo(() => {
    if (settledUserId !== userId) return null
    return memberships.find((membership) => membership.isActive) || memberships[0] || null
  }, [memberships, settledUserId, userId])

  const canModerateActiveClass = activeClass?.role === 'class_admin' || activeClass?.role === 'moderator'

  return {
    memberships: settledUserId === userId ? memberships : [],
    activeClass,
    activeClassId: activeClass?.classId || '',
    canModerateActiveClass,
    loading: loading || Boolean(userId && settledUserId !== userId),
    error,
    refresh,
  }
}
