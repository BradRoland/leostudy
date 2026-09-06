import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react'
import { getEffectiveProfileDecorationForLevel } from '../lib/profileDecorationData'
import { ProfileAvatarDecoration } from '../lib/profileDecorations'
import { supabase } from '../lib/supabase'

type DuelInviteBannerProps = {
  currentUserId: string
  onJoinRoom: (roomId: string) => void
}

type PendingDuelInvite = {
  inviteId: string
  roomId: string
  senderUserId: string
  senderUsername: string
  senderAvatarUrl: string
  senderLevel: number
  senderHaloClass: string
  senderProfileDecorationKey: string
  gameType: 'quiz' | 'matching' | 'blaster'
  category: 'all' | 'pc' | 'vc' | 'hs' | 'scenarios'
  rounds: number
  expiresAt: string
}

const defaultAvatarUrl = `${import.meta.env.BASE_URL || '/'}default-avatar.svg`

function toPublicAvatarUrl(path: string) {
  const trimmed = path.trim()
  if (!trimmed) return defaultAvatarUrl
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
  if (!supabaseUrl) return defaultAvatarUrl
  return `${supabaseUrl}/storage/v1/object/public/avatars/${trimmed.replace(/^\/+/, '')}`
}

function handleAvatarImageError(event: SyntheticEvent<HTMLImageElement>) {
  const target = event.currentTarget
  if (target.dataset.fallbackApplied === '1') return
  target.dataset.fallbackApplied = '1'
  target.src = defaultAvatarUrl
}

function toCategoryLabel(value: PendingDuelInvite['category']) {
  if (value === 'pc') return 'PC'
  if (value === 'vc') return 'VC'
  if (value === 'hs') return 'HS'
  if (value === 'scenarios') return 'Scenarios'
  return 'ALL'
}

function fallbackLevelHaloClass(level: number) {
  if (level >= 50) return 'level-halo-legend'
  if (level >= 40) return 'level-halo-inferno'
  if (level >= 30) return 'level-halo-diamond'
  if (level >= 20) return 'level-halo-neon'
  if (level >= 15) return 'level-halo-siren'
  if (level >= 10) return 'level-halo-gold'
  if (level >= 5) return 'level-halo-blue'
  if (level >= 2) return 'level-halo-bronze'
  return 'level-halo-recruit'
}

function parseLevelSnapshot(details: Record<string, unknown>) {
  const snapshot = details.levelSnapshot && typeof details.levelSnapshot === 'object'
    ? (details.levelSnapshot as Record<string, unknown>)
    : {}
  const level = Math.max(1, Math.floor(Number(snapshot.level || 1)))
  const haloClass = typeof snapshot.haloClass === 'string' && snapshot.haloClass.trim()
    ? snapshot.haloClass
    : fallbackLevelHaloClass(level)
  return { level, haloClass }
}

export function DuelInviteBanner(props: DuelInviteBannerProps) {
  const { currentUserId, onJoinRoom } = props
  const [pendingInvites, setPendingInvites] = useState<PendingDuelInvite[]>([])
  const [freshInviteIds, setFreshInviteIds] = useState<string[]>([])
  const [inviteActionId, setInviteActionId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [nowMs, setNowMs] = useState<number>(() => Date.now())
  const previousInviteIdsRef = useRef<string[]>([])

  const isSignedIn = currentUserId.trim().length > 0

  const loadPendingInvites = useCallback(async () => {
    if (!supabase || !isSignedIn) return
    const { data, error: rpcError } = await supabase.rpc('list_pending_1v1_invites')
    if (rpcError) {
      // Keep this silent for passive polling/realtime refresh to avoid noisy mid-match banners.
      return
    }
    const mappedBase: PendingDuelInvite[] = (Array.isArray(data) ? data : []).map((row) => {
      const value = row as Record<string, unknown>
      const gameTypeRaw = String(value.game_type || 'quiz')
      const categoryRaw = String(value.category || 'all')
      const gameType: PendingDuelInvite['gameType'] =
        gameTypeRaw === 'blaster' ? 'blaster' : gameTypeRaw === 'matching' ? 'matching' : 'quiz'
      const category: PendingDuelInvite['category'] = (
        categoryRaw === 'pc' || categoryRaw === 'vc' || categoryRaw === 'hs' || categoryRaw === 'scenarios'
          ? categoryRaw
          : 'all'
      )
      return {
        inviteId: String(value.invite_id || ''),
        roomId: String(value.room_id || ''),
        senderUserId: String(value.sender_user_id || ''),
        senderUsername: String(value.sender_username || '').trim() || 'User',
        senderAvatarUrl: toPublicAvatarUrl(String(value.sender_avatar_path || '')),
        senderLevel: 1,
        senderHaloClass: 'level-halo-recruit',
        senderProfileDecorationKey: 'auto',
        gameType,
        category,
        rounds: Number(value.rounds || 10),
        expiresAt: String(value.expires_at || ''),
      }
    }).filter((invite) => invite.inviteId && invite.roomId)

    const senderIds = [...new Set(mappedBase.map((invite) => invite.senderUserId).filter(Boolean))]
    const { data: appStateRows } = senderIds.length > 0
      ? await supabase
        .from('public_study_profiles')
        .select('user_id,profile_details')
        .in('user_id', senderIds)
      : { data: [] }

    const detailsMap = (Array.isArray(appStateRows) ? appStateRows : []).reduce<Record<string, {
      level: number
      haloClass: string
      profileDecorationKey: string
    }>>((accumulator, row) => {
      const value = row as Record<string, unknown>
      const userId = String(value.user_id || '')
      if (!userId) return accumulator
      const details = value.profile_details && typeof value.profile_details === 'object'
        ? (value.profile_details as Record<string, unknown>)
        : {}
      const levelSnapshot = parseLevelSnapshot(details)
      accumulator[userId] = {
        level: levelSnapshot.level,
        haloClass: levelSnapshot.haloClass,
        profileDecorationKey: typeof details.profileDecorationKey === 'string' ? details.profileDecorationKey : 'auto',
      }
      return accumulator
    }, {})

    const mapped = mappedBase.map((invite) => ({
      ...invite,
      senderLevel: detailsMap[invite.senderUserId]?.level || invite.senderLevel,
      senderHaloClass: detailsMap[invite.senderUserId]?.haloClass || invite.senderHaloClass,
      senderProfileDecorationKey: detailsMap[invite.senderUserId]?.profileDecorationKey || invite.senderProfileDecorationKey,
    }))

    const nextIds = mapped.map((invite) => invite.inviteId)
    const previousIds = new Set(previousInviteIdsRef.current)
    const newlyAdded = nextIds.filter((inviteId) => !previousIds.has(inviteId))
    previousInviteIdsRef.current = nextIds

    setPendingInvites(mapped)
    setError((previous) => (previous ? '' : previous))
    if (newlyAdded.length > 0) {
      setFreshInviteIds((previous) => [...new Set([...previous, ...newlyAdded])])
      window.setTimeout(() => {
        setFreshInviteIds((previous) => previous.filter((inviteId) => !newlyAdded.includes(inviteId)))
      }, 950)
    }
  }, [isSignedIn])

  const respondInvite = async (inviteId: string, accept: boolean) => {
    if (!supabase) return
    setInviteActionId(inviteId)
    setError('')
    const { data, error: rpcError } = await supabase.rpc('respond_1v1_invite', {
      p_invite_id: inviteId,
      p_accept: accept,
    })
    setInviteActionId(null)
    if (rpcError) {
      setError(rpcError.message || 'Could not update invite.')
      void loadPendingInvites()
      return
    }
    if (accept) {
      const payload = Array.isArray(data) ? data[0] : data
      const roomId = payload && typeof payload === 'object'
        ? String((payload as Record<string, unknown>).room_id || '')
        : ''
      if (roomId) onJoinRoom(roomId)
    }
    void loadPendingInvites()
  }

  useEffect(() => {
    if (!isSignedIn) {
      previousInviteIdsRef.current = []
      return
    }
    void loadPendingInvites()
    const timer = window.setInterval(() => {
      void loadPendingInvites()
    }, 2500)
    return () => window.clearInterval(timer)
  }, [isSignedIn, loadPendingInvites])

  useEffect(() => {
    if (!isSignedIn) return

    const refreshInvites = () => {
      if (document.visibilityState === 'hidden') return
      void loadPendingInvites()
    }

    const refreshOnFocus = () => {
      void loadPendingInvites()
    }

    window.addEventListener('focus', refreshOnFocus)
    window.addEventListener('pageshow', refreshOnFocus)
    document.addEventListener('visibilitychange', refreshInvites)

    return () => {
      window.removeEventListener('focus', refreshOnFocus)
      window.removeEventListener('pageshow', refreshOnFocus)
      document.removeEventListener('visibilitychange', refreshInvites)
    }
  }, [isSignedIn, loadPendingInvites])

  useEffect(() => {
    if (!isSignedIn || pendingInvites.length === 0) return
    const timer = window.setInterval(() => {
      setNowMs(Date.now())
    }, 1000)
    return () => window.clearInterval(timer)
  }, [isSignedIn, pendingInvites.length])

  useEffect(() => {
    const client = supabase
    if (!client || !isSignedIn) return
    const postgresChannel = client
      .channel(`duel-invites-${currentUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'duel_invites', filter: `recipient_user_id=eq.${currentUserId}` },
        () => {
          void loadPendingInvites()
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          void loadPendingInvites()
        }
      })

    const broadcastChannel = client
      .channel('duel-invite-broadcast')
      .on('broadcast', { event: 'duel-invite-created' }, (payload) => {
        const value = (payload as { payload?: Record<string, unknown> }).payload || {}
        const targetUserId = String(value.target_user_id || '')
        if (targetUserId && targetUserId === currentUserId) {
          void loadPendingInvites()
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          void loadPendingInvites()
        }
      })

    return () => {
      void client.removeChannel(postgresChannel)
      void client.removeChannel(broadcastChannel)
    }
  }, [currentUserId, isSignedIn, loadPendingInvites])

  const inviteCards = useMemo(() => pendingInvites.slice(0, 3), [pendingInvites])
  if (!isSignedIn || (inviteCards.length === 0 && !error)) return null

  return (
    <div className="duel-invite-stack">
      {inviteCards.map((invite) => {
        const expiresMs = Date.parse(invite.expiresAt)
        const secondsLeft = Number.isFinite(expiresMs) ? Math.max(0, Math.ceil((expiresMs - nowMs) / 1000)) : null
        return (
          <article
            key={`duel-invite-${invite.inviteId}`}
            className={freshInviteIds.includes(invite.inviteId) ? 'duel-invite-card duel-invite-card-fresh' : 'duel-invite-card'}
          >
            <div className="duel-invite-head">
              <div className="duel-invite-sender">
                <span className={`duel-invite-avatar-frame avatar-decoration-wrap level-halo-frame ${invite.senderHaloClass}`}>
                  <img
                    src={invite.senderAvatarUrl}
                    alt={invite.senderUsername}
                    className="duel-invite-avatar"
                    onError={handleAvatarImageError}
                  />
                  <ProfileAvatarDecoration
                    decoration={getEffectiveProfileDecorationForLevel(invite.senderLevel, invite.senderProfileDecorationKey)}
                  />
                </span>
                <div className="duel-invite-copy">
                  <strong>{invite.senderUsername} invited you to 1v1</strong>
                  <span className="muted tiny">
                    {invite.gameType === 'blaster' ? 'Code Blaster' : invite.gameType === 'quiz' ? 'Quiz' : 'Matching'} • {toCategoryLabel(invite.category)}
                    {invite.gameType === 'quiz' ? ` • ${invite.rounds} questions` : ''}
                  </span>
                </div>
              </div>
              {secondsLeft !== null ? <span className="duel-invite-time">{secondsLeft}s</span> : null}
            </div>
            <div className="duel-invite-actions">
              <button
                type="button"
                className="primary"
                onClick={() => void respondInvite(invite.inviteId, true)}
                disabled={Boolean(inviteActionId)}
              >
                {inviteActionId === invite.inviteId ? 'Joining…' : 'Join'}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => void respondInvite(invite.inviteId, false)}
                disabled={Boolean(inviteActionId)}
              >
                Decline
              </button>
            </div>
          </article>
        )
      })}
      {error ? (
        <article className="duel-invite-card duel-invite-card-error">
          <strong>Invite Error</strong>
          <p className="muted tiny">{error}</p>
        </article>
      ) : null}
    </div>
  )
}
