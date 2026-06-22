import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ensureClass180Membership,
  hasClass180LeaderboardData,
  loadClass180FallbackMembership,
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
      let rows = await loadClassMemberships()
      const isChoosingClass =
        typeof window !== 'undefined' && window.localStorage.getItem('pending_class_selection') === '1'
      if (isChoosingClass && rows.length === 0) {
        setMemberships([])
        return
      }
      if (rows.length === 0) {
        try {
          await ensureClass180Membership()
          rows = await loadClassMemberships()
        } catch (err) {
          console.warn('[classes] could not create Class 180 membership, using local fallback:', err)
        }
      }
      if (rows.length === 0) {
        const fallback = await loadClass180FallbackMembership()
        if (fallback) rows = [fallback]
      } else {
        const activeRow = rows.find((membership) => membership.isActive) || rows[0]
        const alreadyOnClass180 = /^class\s*180$/i.test(activeRow?.className || '')
        if (!alreadyOnClass180) {
          const fallback = await loadClass180FallbackMembership()
          if (fallback && await hasClass180LeaderboardData(userId, fallback.classId)) {
            const existingClass180 = rows.find((membership) => membership.classId === fallback.classId)
            const preferredClass180 = existingClass180 || fallback
            rows = [
              { ...preferredClass180, isActive: true },
              ...rows
                .filter((membership) => membership.id !== preferredClass180.id && membership.classId !== preferredClass180.classId)
                .map((membership) => ({ ...membership, isActive: false })),
            ]
          }
        }
      }
      setMemberships(rows)
    } catch (err) {
      try {
        const fallback = await loadClass180FallbackMembership()
        if (fallback) {
          setMemberships([fallback])
          setError('')
          return
        }
      } catch (fallbackError) {
        console.warn('[classes] Class 180 fallback failed:', fallbackError)
      }
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
