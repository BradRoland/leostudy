import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  loadClassMemberships,
  type ClassMembership,
} from '../lib/classApi'

export function useClassWorkspace(userId: string | null) {
  const [memberships, setMemberships] = useState<ClassMembership[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!userId) {
      setMemberships([])
      setLoading(false)
      setError('')
      return
    }
    setLoading(true)
    setError('')
    try {
      const rows = await loadClassMemberships()
      setMemberships(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load class memberships.')
      setMemberships([])
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const activeClass = useMemo(() => {
    return memberships.find((membership) => membership.isActive) || memberships[0] || null
  }, [memberships])

  const canModerateActiveClass = activeClass?.role === 'class_admin' || activeClass?.role === 'moderator'

  return {
    memberships,
    activeClass,
    activeClassId: activeClass?.classId || '',
    canModerateActiveClass,
    loading,
    error,
    refresh,
  }
}
