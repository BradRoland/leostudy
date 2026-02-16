import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type OwnerState = {
  isOwner: boolean
  loading: boolean
  error: string
  refresh: () => Promise<void>
}

const CACHE_TTL_MS = 60_000

function cacheKey(userId: string) {
  return `leo-owner-role:${userId}`
}

function readCachedOwner(userId: string): boolean | null {
  try {
    const raw = window.sessionStorage.getItem(cacheKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { isOwner: boolean; at: number }
    if (!parsed || typeof parsed.at !== 'number') return null
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null
    return Boolean(parsed.isOwner)
  } catch {
    return null
  }
}

function writeCachedOwner(userId: string, isOwner: boolean) {
  try {
    window.sessionStorage.setItem(cacheKey(userId), JSON.stringify({ isOwner, at: Date.now() }))
  } catch {
    // ignore cache write issues
  }
}

export function useOwner(userId: string | null): OwnerState {
  const [isOwner, setIsOwner] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = async () => {
    if (!supabase || !userId) {
      setIsOwner(false)
      setLoading(false)
      setError('')
      return
    }

    setLoading(true)
    setError('')

    const cached = readCachedOwner(userId)
    if (cached !== null) {
      setIsOwner(cached)
      setLoading(false)
      return
    }

    const { data, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'owner')
      .limit(1)

    if (roleError) {
      setIsOwner(false)
      setError(roleError.message || 'Could not load owner role.')
      setLoading(false)
      return
    }

    const value = (data || []).length > 0
    setIsOwner(value)
    writeCachedOwner(userId, value)
    setLoading(false)
  }

  useEffect(() => {
    if (!userId) {
      setIsOwner(false)
      setLoading(false)
      setError('')
      return
    }
    void refresh()
  }, [userId])

  return { isOwner, loading, error, refresh }
}
