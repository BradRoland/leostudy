import { type CSSProperties, type SyntheticEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

type DuelGameType = 'quiz' | 'matching'
type DuelCategory = 'all' | 'pc' | 'vc' | 'hs' | 'scenarios'
type DuelRoomStatus = 'waiting' | 'in_progress' | 'completed' | 'cancelled'

type DuelRoomRow = {
  id: string
  host_user_id: string
  game_type: DuelGameType
  category: DuelCategory
  is_public: boolean
  join_code: string | null
  rounds: number
  question_set: unknown
  status: DuelRoomStatus
  current_round: number
  winner_user_id: string | null
  created_at: string
  started_at: string | null
}

type DuelRoomPlayerRow = {
  id: string
  room_id: string
  user_id: string
  slot_no: number
  is_ready: boolean
  score: number
  total_time_ms: number
  current_round: number
  last_seen: string
}

type DuelRoomResultRow = {
  id: string
  room_id: string
  user_id: string
  score: number
  total_time_ms: number
  placement: number
  is_winner: boolean
}

type LobbyRoomItem = {
  id: string
  game_type: DuelGameType
  category: DuelCategory
  rounds: number
  created_at: string
  host_user_id: string
  player_count: number
}

type QuizRoundPayload = {
  round: number
  prompt: string
  choices: string[]
  correctIndex: number
  explanation?: string
  sourceLabel?: string
}

type MatchingPairPayload = {
  pairId: string
  left: string
  right: string
}

type MatchingRoundPayload = {
  round: number
  pairs: MatchingPairPayload[]
}

type DuelMatchCard = {
  id: string
  pairId: string
  text: string
  kind: 'code' | 'definition'
}

type DuelRoomActivity = {
  id: string
  text: string
  createdAt: number
}

type DuelStatsMode = 'all' | DuelGameType

type SupporterTier = 'free' | 'tier2' | 'tier5' | 'tier10'

type NameStyle = {
  color: string
  fontFamily: string
  fontWeight: number
  fontStyle: 'normal' | 'italic'
  glowEnabled: boolean
  glowIntensity: number
}

type DuelStatsRow = {
  user_id: string
  game_type: DuelStatsMode
  wins: number
  losses: number
  matches_played: number
  current_win_streak: number
  best_win_streak: number
}

type DuelStatsLeaderboardEntry = {
  user_id: string
  username: string
  avatarUrl: string
  supporterTier: SupporterTier
  nameStyle: NameStyle
  wins: number
  losses: number
  matches_played: number
  current_win_streak: number
  best_win_streak: number
}

type DuelProfileSnapshot = {
  user_id: string
  username: string
  avatarUrl: string
  supporterTier: SupporterTier
  nameStyle: NameStyle
  agency: string
  bio: string
  all: {
    wins: number
    losses: number
    matches: number
    currentStreak: number
    bestStreak: number
  }
  matching: {
    wins: number
    losses: number
    matches: number
  }
  quiz: {
    wins: number
    losses: number
    matches: number
  }
}

const supporterTierLabel: Record<SupporterTier, string> = {
  free: 'Free',
  tier2: '$2 Supporter',
  tier5: '$5 Supporter',
  tier10: '$10 Supporter',
}

const duelQuizRoundOptions = [5, 10, 20, 30]

const duelCategoryOptions: Array<{ value: DuelCategory; label: string; quizOnly?: boolean }> = [
  { value: 'all', label: 'ALL' },
  { value: 'pc', label: 'PC' },
  { value: 'vc', label: 'VC' },
  { value: 'hs', label: 'HS' },
  { value: 'scenarios', label: 'SCENARIOS', quizOnly: true },
]

const defaultAvatarUrl = `${import.meta.env.BASE_URL || '/'}default-avatar.svg`
const defaultNameStyle: NameStyle = {
  color: '#f5fbff',
  fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  fontWeight: 700,
  fontStyle: 'normal',
  glowEnabled: true,
  glowIntensity: 32,
}

function sanitizeSupporterTier(input: unknown): SupporterTier {
  const value = String(input || '').trim()
  if (value === 'tier2' || value === 'tier5' || value === 'tier10') return value
  return 'free'
}

function sanitizeNameStyle(input: unknown): NameStyle {
  if (!input || typeof input !== 'object') return { ...defaultNameStyle }
  const value = input as Partial<NameStyle>
  const rawColor = String(value.color || '').trim()
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor : defaultNameStyle.color
  const rawFamily = String(value.fontFamily || '').trim()
  const safeFamily = rawFamily.length > 0 ? rawFamily.slice(0, 80) : defaultNameStyle.fontFamily
  const safeWeight = Number(value.fontWeight) >= 700 ? 700 : 600
  const safeStyle: 'normal' | 'italic' = value.fontStyle === 'italic' ? 'italic' : 'normal'
  const rawGlow = Number(value.glowIntensity)
  const safeGlow = Number.isFinite(rawGlow) ? Math.max(0, Math.min(100, Math.round(rawGlow))) : defaultNameStyle.glowIntensity
  return {
    color: safeColor,
    fontFamily: safeFamily,
    fontWeight: safeWeight,
    fontStyle: safeStyle,
    glowEnabled: value.glowEnabled !== false,
    glowIntensity: safeGlow,
  }
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '')
  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function displayNameStyle(nameStyle: NameStyle | undefined, tier: SupporterTier): CSSProperties | undefined {
  if (!nameStyle || tier !== 'tier10') return undefined
  const style = sanitizeNameStyle(nameStyle)
  const glowAlpha = Math.min(0.95, 0.12 + style.glowIntensity / 140)
  const glowRadius = 4 + style.glowIntensity / 2.4
  const glowColor = hexToRgba(style.color, glowAlpha)
  return {
    color: style.color,
    fontFamily: style.fontFamily,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    textShadow: style.glowEnabled ? `0 0 ${glowRadius}px ${glowColor}, 0 0 ${Math.max(2, glowRadius * 0.45)}px ${glowColor}` : undefined,
  }
}

function tierNameClass(tier: SupporterTier) {
  if (tier === 'tier2') return 'tier-name tier-name-red'
  if (tier === 'tier5') return 'tier-name tier-name-green'
  if (tier === 'tier10') return 'tier-name tier-name-gold'
  return 'tier-name'
}

function displayNameClass(tier: SupporterTier, hasStyle: boolean) {
  if (tier === 'tier10' && hasStyle) return 'tier-name'
  return tierNameClass(tier)
}

function hashStringToInt(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash || 1
}

function seededShuffle<T>(items: T[], seedInput: string) {
  const copy = [...items]
  let seed = hashStringToInt(seedInput)
  const nextRandom = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(nextRandom() * (index + 1))
    ;[copy[index], copy[swap]] = [copy[swap], copy[index]]
  }
  return copy
}

function formatElapsed(ms: number) {
  const safe = Math.max(0, Number.isFinite(ms) ? ms : 0)
  const seconds = Math.round(safe / 1000)
  return `${seconds}s`
}

function formatClock(ms: number) {
  const safe = Math.max(0, Number.isFinite(ms) ? ms : 0)
  const totalSeconds = Math.floor(safe / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function formatActivityTime(value: number) {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

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

function formatRoomName(username: string) {
  const cleanName = username.trim() || 'Host'
  const suffix = cleanName.toLowerCase().endsWith('s') ? "'" : "'s"
  return `${cleanName}${suffix} Room`
}

function isQuizRound(value: unknown): value is QuizRoundPayload {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<QuizRoundPayload>
  return typeof row.round === 'number' && typeof row.prompt === 'string' && Array.isArray(row.choices) && typeof row.correctIndex === 'number'
}

function isMatchingRound(value: unknown): value is MatchingRoundPayload {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<MatchingRoundPayload>
  return typeof row.round === 'number' && Array.isArray(row.pairs)
}

export function OneVsOnePanel(props: { currentUserId: string; currentUsername: string }) {
  const { currentUserId, currentUsername } = props

  const [selectedGameType, setSelectedGameType] = useState<DuelGameType>('quiz')
  const [selectedCategory, setSelectedCategory] = useState<DuelCategory>('all')
  const [isPublicRoom, setIsPublicRoom] = useState(true)

  const [publicRooms, setPublicRooms] = useState<LobbyRoomItem[]>([])
  const [joinCodeInput, setJoinCodeInput] = useState('')
  const [roomId, setRoomId] = useState<string | null>(null)
  const [showCreateRoomModal, setShowCreateRoomModal] = useState(false)
  const [activityLog, setActivityLog] = useState<DuelRoomActivity[]>([])
  const [selectedQuizRounds, setSelectedQuizRounds] = useState(10)
  const [duelStatsMode, setDuelStatsMode] = useState<DuelStatsMode>('all')
  const [winsLeaderboard, setWinsLeaderboard] = useState<DuelStatsLeaderboardEntry[]>([])
  const [streakLeaderboard, setStreakLeaderboard] = useState<DuelStatsLeaderboardEntry[]>([])
  const [myDuelStats, setMyDuelStats] = useState<DuelStatsLeaderboardEntry | null>(null)
  const [publicRoomHostNames, setPublicRoomHostNames] = useState<Record<string, string>>({})
  const [duelProfileByUserId, setDuelProfileByUserId] = useState<Record<string, DuelProfileSnapshot>>({})
  const [selectedDuelProfileUserId, setSelectedDuelProfileUserId] = useState<string | null>(null)

  const [room, setRoom] = useState<DuelRoomRow | null>(null)
  const [players, setPlayers] = useState<DuelRoomPlayerRow[]>([])
  const [results, setResults] = useState<DuelRoomResultRow[]>([])
  const [usernameByUserId, setUsernameByUserId] = useState<Record<string, string>>({})
  const [presenceUserIds, setPresenceUserIds] = useState<string[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [roundStartedAt, setRoundStartedAt] = useState<number>(0)
  const [hudNow, setHudNow] = useState<number>(() => Date.now())
  const [submittingRound, setSubmittingRound] = useState(false)
  const [quizChoice, setQuizChoice] = useState<number | null>(null)
  const [quizLocked, setQuizLocked] = useState(false)

  const [matchingCards, setMatchingCards] = useState<DuelMatchCard[]>([])
  const [selectedMatchingCards, setSelectedMatchingCards] = useState<string[]>([])
  const [wrongMatchingCardIds, setWrongMatchingCardIds] = useState<string[]>([])
  const [matchedPairIds, setMatchedPairIds] = useState<string[]>([])
  const [matchingMistakes, setMatchingMistakes] = useState(0)
  const [matchingRoundPoints, setMatchingRoundPoints] = useState(0)
  const [matchingSubmitted, setMatchingSubmitted] = useState(false)
  const previousPlayersRef = useRef<DuelRoomPlayerRow[]>([])
  const previousRoomStatusRef = useRef<DuelRoomStatus | null>(null)
  const activityBootstrappedRef = useRef(false)

  const isSignedIn = currentUserId.trim().length > 0

  const loadPublicRooms = useCallback(async () => {
    if (!supabase || !isSignedIn) return
    const { data, error: rpcError } = await supabase.rpc('list_public_1v1_rooms')
    if (rpcError) {
      setError(rpcError.message || 'Could not load public rooms.')
      return
    }
    const mapped = (Array.isArray(data) ? data : []).map((row) => ({
      id: String((row as Record<string, unknown>).id || ''),
      game_type: String((row as Record<string, unknown>).game_type || 'quiz') as DuelGameType,
      category: String((row as Record<string, unknown>).category || 'all') as DuelCategory,
      rounds: Number((row as Record<string, unknown>).rounds || 5),
      created_at: String((row as Record<string, unknown>).created_at || ''),
      host_user_id: String((row as Record<string, unknown>).host_user_id || ''),
      player_count: Number((row as Record<string, unknown>).player_count || 0),
    }))
      .filter((row) => row.id)
    setPublicRooms(mapped)

    const hostUserIds = [...new Set(mapped.map((row) => row.host_user_id).filter((value) => value.trim().length > 0))]
    if (hostUserIds.length === 0) {
      setPublicRoomHostNames({})
      return
    }

    const { data: hostProfiles } = await supabase
      .from('profiles')
      .select('user_id,username')
      .in('user_id', hostUserIds)

    const hostMap: Record<string, string> = {}
    ;(Array.isArray(hostProfiles) ? hostProfiles : []).forEach((entry) => {
      const value = entry as Record<string, unknown>
      const userId = String(value.user_id || '')
      if (!userId) return
      const username = String(value.username || '').trim()
      hostMap[userId] = username || `User ${userId.slice(0, 8)}`
    })
    setPublicRoomHostNames(hostMap)
  }, [isSignedIn])

  const loadDuelLeaderboards = useCallback(async () => {
    if (!supabase || !isSignedIn) return
    const { data, error: statsError } = await supabase
      .from('duel_player_stats')
      .select('user_id,game_type,wins,losses,matches_played,current_win_streak,best_win_streak')
      .eq('game_type', duelStatsMode)
      .order('wins', { ascending: false })
      .limit(200)
    if (statsError) {
      const errorCode = String((statsError as unknown as { code?: string }).code || '')
      if (errorCode === '42P01') {
        setWinsLeaderboard([])
        setStreakLeaderboard([])
        setMyDuelStats(null)
        return
      }
      setError(statsError.message || 'Could not load 1v1 leaderboard.')
      return
    }

    const mappedStats: DuelStatsRow[] = (Array.isArray(data) ? data : []).map((row) => ({
      user_id: String((row as Record<string, unknown>).user_id || ''),
      game_type: String((row as Record<string, unknown>).game_type || 'all') as DuelStatsMode,
      wins: Number((row as Record<string, unknown>).wins || 0),
      losses: Number((row as Record<string, unknown>).losses || 0),
      matches_played: Number((row as Record<string, unknown>).matches_played || 0),
      current_win_streak: Number((row as Record<string, unknown>).current_win_streak || 0),
      best_win_streak: Number((row as Record<string, unknown>).best_win_streak || 0),
    })).filter((row) => row.user_id)

    const userIds = [...new Set(mappedStats.map((row) => row.user_id))]
    if (userIds.length === 0) {
      setWinsLeaderboard([])
      setStreakLeaderboard([])
      setMyDuelStats(null)
      setDuelProfileByUserId({})
      return
    }

    const [{ data: allStatsRows }, { data: profileRows }, { data: appStateRows }] = await Promise.all([
      supabase
        .from('duel_player_stats')
        .select('user_id,game_type,wins,losses,matches_played,current_win_streak,best_win_streak')
        .in('user_id', userIds),
      supabase
        .from('profiles')
        .select('user_id,username,avatar_path,supporter_tier')
        .in('user_id', userIds),
      supabase
        .from('app_state')
        .select('user_id,profile_details')
        .in('user_id', userIds),
    ])

    const allStatsByKey = new Map<string, DuelStatsRow>()
    ;(Array.isArray(allStatsRows) ? allStatsRows : []).forEach((row) => {
      const value = row as Record<string, unknown>
      const userId = String(value.user_id || '')
      const gameType = String(value.game_type || 'all') as DuelStatsMode
      if (!userId || !['all', 'quiz', 'matching'].includes(gameType)) return
      allStatsByKey.set(`${userId}:${gameType}`, {
        user_id: userId,
        game_type: gameType,
        wins: Number(value.wins || 0),
        losses: Number(value.losses || 0),
        matches_played: Number(value.matches_played || 0),
        current_win_streak: Number(value.current_win_streak || 0),
        best_win_streak: Number(value.best_win_streak || 0),
      })
    })

    const profileMap = (Array.isArray(profileRows) ? profileRows : []).reduce<Record<string, { username: string; avatarUrl: string; supporterTier: SupporterTier }>>((accumulator, row) => {
      const value = row as Record<string, unknown>
      const userId = String(value.user_id || '')
      if (!userId) return accumulator
      accumulator[userId] = {
        username: String(value.username || '').trim() || `User ${userId.slice(0, 8)}`,
        avatarUrl: toPublicAvatarUrl(String(value.avatar_path || '')),
        supporterTier: sanitizeSupporterTier(value.supporter_tier),
      }
      return accumulator
    }, {})

    const detailsMap = (Array.isArray(appStateRows) ? appStateRows : []).reduce<Record<string, { bio: string; agency: string; nameStyle: NameStyle }>>((accumulator, row) => {
      const value = row as Record<string, unknown>
      const userId = String(value.user_id || '')
      if (!userId) return accumulator
      const details = value.profile_details && typeof value.profile_details === 'object'
        ? (value.profile_details as Record<string, unknown>)
        : {}
      accumulator[userId] = {
        bio: String(details.bio || '').trim(),
        agency: String(details.agency || '').trim(),
        nameStyle: sanitizeNameStyle(details.nameStyle),
      }
      return accumulator
    }, {})

    const profileSnapshotByUserId: Record<string, DuelProfileSnapshot> = {}
    userIds.forEach((userId) => {
      const all = allStatsByKey.get(`${userId}:all`)
      const matching = allStatsByKey.get(`${userId}:matching`)
      const quiz = allStatsByKey.get(`${userId}:quiz`)
      const profile = profileMap[userId]
      const details = detailsMap[userId]
      profileSnapshotByUserId[userId] = {
        user_id: userId,
        username: profile?.username || `User ${userId.slice(0, 8)}`,
        avatarUrl: profile?.avatarUrl || defaultAvatarUrl,
        supporterTier: profile?.supporterTier || 'free',
        nameStyle: details?.nameStyle || { ...defaultNameStyle },
        agency: details?.agency || '',
        bio: details?.bio || '',
        all: {
          wins: all?.wins || 0,
          losses: all?.losses || 0,
          matches: all?.matches_played || 0,
          currentStreak: all?.current_win_streak || 0,
          bestStreak: all?.best_win_streak || 0,
        },
        matching: {
          wins: matching?.wins || 0,
          losses: matching?.losses || 0,
          matches: matching?.matches_played || 0,
        },
        quiz: {
          wins: quiz?.wins || 0,
          losses: quiz?.losses || 0,
          matches: quiz?.matches_played || 0,
        },
      }
    })
    setDuelProfileByUserId(profileSnapshotByUserId)

    const entries: DuelStatsLeaderboardEntry[] = mappedStats.map((row) => {
      const profile = profileSnapshotByUserId[row.user_id]
      return {
        user_id: row.user_id,
        username: profile?.username || `User ${row.user_id.slice(0, 8)}`,
        avatarUrl: profile?.avatarUrl || defaultAvatarUrl,
        supporterTier: profile?.supporterTier || 'free',
        nameStyle: profile?.nameStyle || { ...defaultNameStyle },
        wins: row.wins,
        losses: row.losses,
        matches_played: row.matches_played,
        current_win_streak: row.current_win_streak,
        best_win_streak: row.best_win_streak,
      }
    })

    const winsRows = [...entries]
      .filter((entry) => entry.wins > 0)
      .sort((left, right) => {
        if (right.wins !== left.wins) return right.wins - left.wins
        if (right.current_win_streak !== left.current_win_streak) return right.current_win_streak - left.current_win_streak
        if (right.matches_played !== left.matches_played) return right.matches_played - left.matches_played
        return left.username.localeCompare(right.username)
      })
      .slice(0, 8)

    const streakRows = [...entries]
      .filter((entry) => entry.current_win_streak > 1)
      .sort((left, right) => {
        if (right.current_win_streak !== left.current_win_streak) return right.current_win_streak - left.current_win_streak
        if (right.wins !== left.wins) return right.wins - left.wins
        return left.username.localeCompare(right.username)
      })
      .slice(0, 8)

    setWinsLeaderboard(winsRows)
    setStreakLeaderboard(streakRows)
    setMyDuelStats(entries.find((entry) => entry.user_id === currentUserId) || null)
  }, [currentUserId, duelStatsMode, isSignedIn])

  const refreshRoomSnapshot = useCallback(async () => {
    if (!supabase || !roomId || !isSignedIn) return

    const [{ data: roomRow, error: roomError }, { data: playerRows, error: playersError }, { data: resultRows, error: resultsError }] = await Promise.all([
      supabase.from('rooms').select('*').eq('id', roomId).maybeSingle(),
      supabase.from('room_players').select('*').eq('room_id', roomId).order('slot_no', { ascending: true }),
      supabase.from('room_results').select('*').eq('room_id', roomId).order('placement', { ascending: true }),
    ])

    if (roomError) {
      setError(roomError.message || 'Could not load room.')
      return
    }
    if (playersError) {
      setError(playersError.message || 'Could not load players.')
      return
    }
    if (resultsError) {
      setError(resultsError.message || 'Could not load results.')
      return
    }

    if (!roomRow) {
      setRoom(null)
      setPlayers([])
      setResults([])
      return
    }

    const mappedRoom: DuelRoomRow = {
      id: String((roomRow as Record<string, unknown>).id || ''),
      host_user_id: String((roomRow as Record<string, unknown>).host_user_id || ''),
      game_type: String((roomRow as Record<string, unknown>).game_type || 'quiz') as DuelGameType,
      category: String((roomRow as Record<string, unknown>).category || 'all') as DuelCategory,
      is_public: Boolean((roomRow as Record<string, unknown>).is_public),
      join_code: (roomRow as Record<string, unknown>).join_code ? String((roomRow as Record<string, unknown>).join_code) : null,
      rounds: Number((roomRow as Record<string, unknown>).rounds || 5),
      question_set: (roomRow as Record<string, unknown>).question_set,
      status: String((roomRow as Record<string, unknown>).status || 'waiting') as DuelRoomStatus,
      current_round: Number((roomRow as Record<string, unknown>).current_round || 1),
      winner_user_id: (roomRow as Record<string, unknown>).winner_user_id ? String((roomRow as Record<string, unknown>).winner_user_id) : null,
      created_at: String((roomRow as Record<string, unknown>).created_at || ''),
      started_at: (roomRow as Record<string, unknown>).started_at ? String((roomRow as Record<string, unknown>).started_at) : null,
    }

    const mappedPlayers: DuelRoomPlayerRow[] = (Array.isArray(playerRows) ? playerRows : []).map((row) => ({
      id: String((row as Record<string, unknown>).id || ''),
      room_id: String((row as Record<string, unknown>).room_id || ''),
      user_id: String((row as Record<string, unknown>).user_id || ''),
      slot_no: Number((row as Record<string, unknown>).slot_no || 1),
      is_ready: Boolean((row as Record<string, unknown>).is_ready),
      score: Number((row as Record<string, unknown>).score || 0),
      total_time_ms: Number((row as Record<string, unknown>).total_time_ms || 0),
      current_round: Number((row as Record<string, unknown>).current_round || 1),
      last_seen: String((row as Record<string, unknown>).last_seen || ''),
    }))

    const mappedResults: DuelRoomResultRow[] = (Array.isArray(resultRows) ? resultRows : []).map((row) => ({
      id: String((row as Record<string, unknown>).id || ''),
      room_id: String((row as Record<string, unknown>).room_id || ''),
      user_id: String((row as Record<string, unknown>).user_id || ''),
      score: Number((row as Record<string, unknown>).score || 0),
      total_time_ms: Number((row as Record<string, unknown>).total_time_ms || 0),
      placement: Number((row as Record<string, unknown>).placement || 2),
      is_winner: Boolean((row as Record<string, unknown>).is_winner),
    }))

    setRoom(mappedRoom)
    setPlayers(mappedPlayers)
    setResults(mappedResults)

    const userIds = mappedPlayers.map((player) => player.user_id)
    if (userIds.length > 0) {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('user_id,username')
        .in('user_id', userIds)

      const nameMap: Record<string, string> = {}
      ;(Array.isArray(profileRows) ? profileRows : []).forEach((row) => {
        const value = row as Record<string, unknown>
        const userId = String(value.user_id || '')
        const username = String(value.username || '').trim()
        if (userId) nameMap[userId] = username || `User ${userId.slice(0, 8)}`
      })
      setUsernameByUserId(nameMap)
    }
  }, [isSignedIn, roomId])

  useEffect(() => {
    if (!isSignedIn) return
    void loadPublicRooms()
    const timer = window.setInterval(() => {
      void loadPublicRooms()
    }, 12000)
    return () => window.clearInterval(timer)
  }, [isSignedIn, loadPublicRooms])

  useEffect(() => {
    if (!isSignedIn) return
    void loadDuelLeaderboards()
    const timer = window.setInterval(() => {
      void loadDuelLeaderboards()
    }, 18000)
    return () => window.clearInterval(timer)
  }, [isSignedIn, loadDuelLeaderboards])

  useEffect(() => {
    const client = supabase
    if (!client || !roomId || !isSignedIn) return
    void refreshRoomSnapshot()

    const channel = client
      .channel(`room-${roomId}`, {
        config: {
          presence: {
            key: currentUserId,
          },
        },
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, () => {
        void refreshRoomSnapshot()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` }, () => {
        void refreshRoomSnapshot()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_results', filter: `room_id=eq.${roomId}` }, () => {
        void refreshRoomSnapshot()
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const ids = Object.keys(state)
        setPresenceUserIds(ids)
      })

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void channel.track({
          user_id: currentUserId,
          online_at: new Date().toISOString(),
        })
      }
    })

    return () => {
      void client.removeChannel(channel)
      setPresenceUserIds([])
    }
  }, [currentUserId, isSignedIn, refreshRoomSnapshot, roomId])

  useEffect(() => {
    const client = supabase
    if (!client || !roomId || !isSignedIn) return
    const timer = window.setInterval(() => {
      void client
        .from('room_players')
        .update({ last_seen: new Date().toISOString() })
        .eq('room_id', roomId)
        .eq('user_id', currentUserId)
    }, 10000)
    return () => window.clearInterval(timer)
  }, [currentUserId, isSignedIn, roomId])

  useEffect(() => {
    if (!room || room.status !== 'in_progress') return
    setHudNow(Date.now())
    const timer = window.setInterval(() => {
      setHudNow(Date.now())
    }, 500)
    return () => window.clearInterval(timer)
  }, [room])

  const roundList = useMemo(() => {
    if (!room || !Array.isArray(room.question_set)) return []
    return room.question_set
  }, [room])

  const myPlayer = useMemo(() => players.find((player) => player.user_id === currentUserId) || null, [players, currentUserId])
  const opponentPlayer = useMemo(() => players.find((player) => player.user_id !== currentUserId) || null, [players, currentUserId])

  const currentRoundNumber = useMemo(() => {
    if (!room || !myPlayer) return 1
    return Math.max(1, Math.min(room.rounds, myPlayer.current_round))
  }, [myPlayer, room])

  const roundIndex = Math.max(0, currentRoundNumber - 1)
  const currentRound = roundList[roundIndex]

  const canStartRound = Boolean(room && myPlayer && room.status === 'in_progress' && myPlayer.current_round <= room.rounds)

  useEffect(() => {
    if (!room || !myPlayer || !canStartRound) return
    setRoundStartedAt(Date.now())
    setQuizChoice(null)
    setQuizLocked(false)
    setSelectedMatchingCards([])
    setWrongMatchingCardIds([])
    setMatchedPairIds([])
    setMatchingMistakes(0)
    setMatchingRoundPoints(0)
    setMatchingSubmitted(false)
    setMatchingCards([])

    if (room.game_type === 'matching' && isMatchingRound(currentRound)) {
      const cards = currentRound.pairs.flatMap((pair) => ([
        {
          id: `${pair.pairId}-code`,
          pairId: pair.pairId,
          text: pair.left,
          kind: 'code' as const,
        },
        {
          id: `${pair.pairId}-definition`,
          pairId: pair.pairId,
          text: pair.right,
          kind: 'definition' as const,
        },
      ]))
      const deterministicCards = seededShuffle(cards, `${room.id}-${currentRound.round}`)
      setMatchingCards(deterministicCards)
    }
  }, [canStartRound, currentRound, myPlayer, room])

  const createRoom = async () => {
    if (!supabase || !isSignedIn) return
    setLoading(true)
    setError('')
    setNotice('')
    const { data, error: rpcError } = await supabase.rpc('create_1v1_room', {
      p_game_type: selectedGameType,
      p_category: selectedCategory,
      p_is_public: isPublicRoom,
      p_rounds: selectedGameType === 'quiz' ? selectedQuizRounds : 5,
    })
    setLoading(false)
    if (rpcError) {
      setError(rpcError.message || 'Could not create room.')
      return
    }
    const nextRoomId = String(data || '')
    if (!nextRoomId) {
      setError('Room was created but no id was returned.')
      return
    }
    setShowCreateRoomModal(false)
    setRoomId(nextRoomId)
    setNotice('Room created. Waiting for opponent.')
  }

  const joinByCode = async () => {
    if (!supabase || !isSignedIn) return
    const code = joinCodeInput.trim()
    if (!/^[0-9]{6}$/.test(code)) {
      setError('Enter a valid 6-digit room code.')
      return
    }
    setLoading(true)
    setError('')
    const { data, error: rpcError } = await supabase.rpc('join_1v1_room', { p_join_code: code })
    setLoading(false)
    if (rpcError) {
      setError(rpcError.message || 'Could not join room.')
      return
    }
    setRoomId(String(data || ''))
    setJoinCodeInput('')
    setNotice('Joined room.')
  }

  const joinPublicRoom = async (targetRoomId: string) => {
    if (!supabase || !isSignedIn) return
    setLoading(true)
    setError('')
    const { data, error: rpcError } = await supabase.rpc('join_1v1_room', { p_room_id: targetRoomId })
    setLoading(false)
    if (rpcError) {
      setError(rpcError.message || 'Could not join room.')
      return
    }
    setRoomId(String(data || ''))
    setNotice('Joined room.')
  }

  const setReady = async (ready: boolean) => {
    if (!supabase || !roomId) return
    setError('')
    const { error: rpcError } = await supabase.rpc('set_1v1_ready', { p_room_id: roomId, p_ready: ready })
    if (rpcError) {
      setError(rpcError.message || 'Could not update ready status.')
    }
  }

  const submitRound = async (params: { round: number; correct: boolean; elapsedMs: number; points?: number }) => {
    if (!supabase || !roomId || submittingRound) return
    setSubmittingRound(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('submit_1v1_round', {
      p_room_id: roomId,
      p_round: params.round,
      p_correct: params.correct,
      p_elapsed_ms: params.elapsedMs,
      p_points: typeof params.points === 'number' ? params.points : null,
    })
    setSubmittingRound(false)
    if (rpcError) {
      setError(rpcError.message || 'Could not submit round.')
      return
    }
    await refreshRoomSnapshot()
  }

  const submitQuizRound = async () => {
    if (!room || !isQuizRound(currentRound) || quizChoice === null || quizLocked) return
    const correct = quizChoice === currentRound.correctIndex
    setQuizLocked(true)
    const elapsedMs = Math.max(0, Date.now() - roundStartedAt)
    await submitRound({ round: currentRound.round, correct, elapsedMs })
  }

  const handleMatchingCardClick = (cardId: string) => {
    if (!canStartRound || !room || room.game_type !== 'matching' || matchingSubmitted) return
    const card = matchingCards.find((item) => item.id === cardId)
    if (!card || matchedPairIds.includes(card.pairId)) return
    setSelectedMatchingCards((previous) => {
      if (previous.includes(cardId)) return previous
      if (previous.length >= 2) return previous
      return [...previous, cardId]
    })
  }

  useEffect(() => {
    if (selectedMatchingCards.length !== 2 || matchingSubmitted) return
    const selected = matchingCards.filter((card) => selectedMatchingCards.includes(card.id))
    if (selected.length !== 2) return

    const isMatch = selected[0].pairId === selected[1].pairId && selected[0].kind !== selected[1].kind
    if (isMatch) {
      if (!matchedPairIds.includes(selected[0].pairId)) {
        setMatchedPairIds((previous) => [...previous, selected[0].pairId])
        setMatchingRoundPoints((previous) => previous + 30)
      }
      setSelectedMatchingCards([])
      setWrongMatchingCardIds([])
      return
    }

    setMatchingMistakes((previous) => previous + 1)
    setMatchingRoundPoints((previous) => Math.max(0, previous - 10))
    setWrongMatchingCardIds(selected.map((card) => card.id))
    const timeout = window.setTimeout(() => {
      setSelectedMatchingCards([])
      setWrongMatchingCardIds([])
    }, 240)
    return () => window.clearTimeout(timeout)
  }, [matchingCards, matchedPairIds, matchingSubmitted, selectedMatchingCards])

  useEffect(() => {
    if (!room || room.game_type !== 'matching' || !isMatchingRound(currentRound)) return
    if (matchingSubmitted || submittingRound) return
    if (matchedPairIds.length !== currentRound.pairs.length) return

    setMatchingSubmitted(true)
    const elapsedMs = Math.max(0, Date.now() - roundStartedAt)
    const completionBonus = 20
    const roundPoints = Math.max(0, matchingRoundPoints + completionBonus)
    void submitRound({
      round: currentRound.round,
      correct: true,
      elapsedMs,
      points: roundPoints,
    })
  }, [currentRound, matchedPairIds.length, matchingRoundPoints, matchingSubmitted, room, roundStartedAt, submitRound, submittingRound])

  const leaveRoom = () => {
    setRoomId(null)
    setRoom(null)
    setPlayers([])
    setResults([])
    setPresenceUserIds([])
    setRoundStartedAt(0)
    setQuizChoice(null)
    setQuizLocked(false)
    setMatchingCards([])
    setSelectedMatchingCards([])
    setWrongMatchingCardIds([])
    setMatchedPairIds([])
    setMatchingMistakes(0)
    setMatchingRoundPoints(0)
    setMatchingSubmitted(false)
    setActivityLog([])
    previousPlayersRef.current = []
    previousRoomStatusRef.current = null
    activityBootstrappedRef.current = false
    setError('')
    setNotice('')
  }

  const confirmLeaveMatch = async () => {
    if (!room || room.status !== 'in_progress') {
      leaveRoom()
      return
    }
    const confirmed = window.confirm('Leave this match? Leaving now will count as a forfeit.')
    if (!confirmed) return
    if (supabase && roomId) {
      const { error: rpcError } = await supabase.rpc('forfeit_1v1_match', { p_room_id: roomId })
      if (rpcError) {
        setError(rpcError.message || 'Could not forfeit match.')
      }
    }
    leaveRoom()
  }

  const roomPlayerRowsSorted = useMemo(() => {
    if (results.length > 0) {
      return [...results].sort((left, right) => left.placement - right.placement)
    }
    return [...players].sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      if (left.total_time_ms !== right.total_time_ms) return left.total_time_ms - right.total_time_ms
      return left.slot_no - right.slot_no
    })
  }, [players, results])

  const myResultRow = useMemo(() => roomPlayerRowsSorted.find((entry) => entry.user_id === currentUserId) || null, [currentUserId, roomPlayerRowsSorted])
  const opponentResultRow = useMemo(() => roomPlayerRowsSorted.find((entry) => entry.user_id !== currentUserId) || null, [currentUserId, roomPlayerRowsSorted])

  const lobbyReadyCount = players.filter((player) => player.is_ready).length
  const inRoom = Boolean(room && roomId)
  const waitingPlayersCount = players.length
  const waitingStatusMessage = waitingPlayersCount < 2
    ? `Waiting for ${2 - waitingPlayersCount} more player${2 - waitingPlayersCount === 1 ? '' : 's'} to join.`
    : lobbyReadyCount < 2
      ? 'Both players joined. Waiting for both players to ready up.'
      : 'Both players are ready. Match starting now.'

  const matchingPairCount = room?.game_type === 'matching' && isMatchingRound(currentRound) ? currentRound.pairs.length : 0
  const matchingProgressText = matchingPairCount > 0 ? `${matchedPairIds.length}/${matchingPairCount} pairs` : '0/0 pairs'
  const matchingStatusText = matchingSubmitted
    ? 'Set complete. Waiting for next set…'
    : 'Match all 3 pairs to auto-submit this set.'

  const myRoundHud = useMemo(() => {
    if (!room) return 1
    const raw = myPlayer?.current_round ?? currentRoundNumber
    return Math.max(1, Math.min(room.rounds, raw))
  }, [currentRoundNumber, myPlayer?.current_round, room])

  const opponentRoundHud = useMemo(() => {
    if (!room) return 1
    const raw = opponentPlayer?.current_round ?? currentRoundNumber
    return Math.max(1, Math.min(room.rounds, raw))
  }, [currentRoundNumber, opponentPlayer?.current_round, room])

  const elapsedMs = useMemo(() => {
    if (!room || room.status !== 'in_progress') return 0
    const startedAtMs = room.started_at ? Date.parse(room.started_at) : NaN
    if (Number.isFinite(startedAtMs)) {
      return Math.max(0, hudNow - startedAtMs)
    }
    if (roundStartedAt > 0) {
      return Math.max(0, hudNow - roundStartedAt)
    }
    return 0
  }, [hudNow, room, roundStartedAt])

  const myDisplayName = usernameByUserId[currentUserId] || currentUsername || 'You'
  const opponentDisplayName = opponentResultRow
    ? usernameByUserId[opponentResultRow.user_id] || `User ${opponentResultRow.user_id.slice(0, 8)}`
    : opponentPlayer
      ? usernameByUserId[opponentPlayer.user_id] || `User ${opponentPlayer.user_id.slice(0, 8)}`
      : 'Opponent'
  const roomHostDisplayName = room
    ? usernameByUserId[room.host_user_id]
      || publicRoomHostNames[room.host_user_id]
      || (room.host_user_id === currentUserId ? (currentUsername || 'Host') : `User ${room.host_user_id.slice(0, 8)}`)
    : 'Host'
  const roomDisplayName = formatRoomName(roomHostDisplayName)
  const topCurrentStreakUserId = streakLeaderboard.length > 0 ? streakLeaderboard[0].user_id : null
  const topCurrentStreakValue = streakLeaderboard.length > 0 ? streakLeaderboard[0].current_win_streak : 0
  const selectedDuelProfile = selectedDuelProfileUserId ? duelProfileByUserId[selectedDuelProfileUserId] || null : null
  const selectedProfileHasTopCurrentStreak = Boolean(
    selectedDuelProfile
    && topCurrentStreakUserId
    && selectedDuelProfile.user_id === topCurrentStreakUserId
    && selectedDuelProfile.all.currentStreak > 1
    && selectedDuelProfile.all.currentStreak === topCurrentStreakValue,
  )

  const myRoundsCompleted = useMemo(() => {
    if (!room) return 0
    const row = players.find((entry) => entry.user_id === currentUserId)
    const raw = (row?.current_round ?? 1) - 1
    return Math.max(0, Math.min(room.rounds, raw))
  }, [currentUserId, players, room])

  const opponentRoundsCompleted = useMemo(() => {
    if (!room) return 0
    const row = players.find((entry) => entry.user_id !== currentUserId)
    const raw = (row?.current_round ?? 1) - 1
    return Math.max(0, Math.min(room.rounds, raw))
  }, [currentUserId, players, room])

  useEffect(() => {
    if (!inRoom || !room) {
      setActivityLog([])
      previousPlayersRef.current = []
      previousRoomStatusRef.current = null
      activityBootstrappedRef.current = false
      return
    }

    const previousPlayers = previousPlayersRef.current
    const previousByUserId = new Map(previousPlayers.map((player) => [player.user_id, player]))
    const nextByUserId = new Map(players.map((player) => [player.user_id, player]))
    const updates: string[] = []

    if (!activityBootstrappedRef.current) {
      previousPlayersRef.current = players
      previousRoomStatusRef.current = room.status
      activityBootstrappedRef.current = true
      return
    }

    players.forEach((player) => {
      const username = usernameByUserId[player.user_id] || `User ${player.user_id.slice(0, 8)}`
      const previous = previousByUserId.get(player.user_id)
      if (!previous) {
        updates.push(`${username} joined the room.`)
        return
      }
      if (!previous.is_ready && player.is_ready) {
        updates.push(`${username} is ready.`)
        return
      }
      if (previous.is_ready && !player.is_ready) {
        updates.push(`${username} is no longer ready.`)
      }
    })

    previousPlayers.forEach((player) => {
      if (nextByUserId.has(player.user_id)) return
      const username = usernameByUserId[player.user_id] || `User ${player.user_id.slice(0, 8)}`
      updates.push(`${username} left the room.`)
    })

    if (previousRoomStatusRef.current === 'waiting' && room.status === 'in_progress') {
      updates.push('Both players ready. Match started.')
    }

    if (updates.length > 0) {
      const now = Date.now()
      const nextEntries = updates.map((text, index) => ({
        id: `${now}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        text,
        createdAt: now + index,
      }))
      setActivityLog((previous) => [...nextEntries, ...previous].slice(0, 8))
      setNotice(updates[0])
    }

    previousPlayersRef.current = players
    previousRoomStatusRef.current = room.status
  }, [inRoom, players, room, usernameByUserId])

  useEffect(() => {
    if (!room || room.status !== 'completed') return
    void loadDuelLeaderboards()
    void loadPublicRooms()
  }, [loadDuelLeaderboards, loadPublicRooms, room])

  useEffect(() => {
    if (!selectedDuelProfileUserId) return
    if (duelProfileByUserId[selectedDuelProfileUserId]) return
    setSelectedDuelProfileUserId(null)
  }, [duelProfileByUserId, selectedDuelProfileUserId])

  if (!isSignedIn) {
    return (
      <div className="card onevone-card">
        <h2>1v1</h2>
        <p className="muted">Sign in to create or join realtime rooms.</p>
      </div>
    )
  }

  return (
    <div className="onevone-wrap">
      {!inRoom ? (
        <>
          <h2>1v1 Multiplayer</h2>
          <div className="onevone-lobby-layout">
            <aside className="onevone-leaderboard-rail">
              <div className="card onevone-card onevone-rail-card">
                <div className="onevone-rail-head">
                  <h3>1v1 Leaderboard</h3>
                  <div className="segmented compact-segmented onevone-rail-mode">
                    <button
                      type="button"
                      className={duelStatsMode === 'all' ? 'seg active compact-seg' : 'seg compact-seg'}
                      onClick={() => setDuelStatsMode('all')}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className={duelStatsMode === 'matching' ? 'seg active compact-seg' : 'seg compact-seg'}
                      onClick={() => setDuelStatsMode('matching')}
                    >
                      Matching
                    </button>
                    <button
                      type="button"
                      className={duelStatsMode === 'quiz' ? 'seg active compact-seg' : 'seg compact-seg'}
                      onClick={() => setDuelStatsMode('quiz')}
                    >
                      Quiz
                    </button>
                  </div>
                </div>

                <div className="onevone-rail-section">
                  <p className="muted tiny">Most Wins</p>
                  {winsLeaderboard.length === 0 ? <p className="muted tiny">No wins yet.</p> : (
                    <div className="onevone-rail-list">
                      {winsLeaderboard.map((entry, index) => (
                        <button
                          type="button"
                          key={`duel-win-${entry.user_id}`}
                          className="onevone-rail-row onevone-rail-button"
                          aria-label={`View ${entry.username} profile`}
                          onClick={() => setSelectedDuelProfileUserId(entry.user_id)}
                        >
                          <span className="onevone-rail-rank">#{index + 1}</span>
                          <img src={entry.avatarUrl} alt={entry.username} className="onevone-rail-avatar" onError={handleAvatarImageError} />
                          <span
                            className={`onevone-rail-name ${displayNameClass(entry.supporterTier, true)}`}
                            style={displayNameStyle(entry.nameStyle, entry.supporterTier)}
                          >
                            {entry.username}
                          </span>
                          <strong>{entry.wins}</strong>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="onevone-rail-section">
                  <p className="muted tiny">Biggest Current Streak</p>
                  {streakLeaderboard.length === 0 ? <p className="muted tiny">Win two in a row to appear here.</p> : (
                    <div className="onevone-rail-list">
                      {streakLeaderboard.map((entry, index) => (
                        <button
                          type="button"
                          key={`duel-streak-${entry.user_id}`}
                          className="onevone-rail-row onevone-rail-button"
                          aria-label={`View ${entry.username} profile`}
                          onClick={() => setSelectedDuelProfileUserId(entry.user_id)}
                        >
                          <span className="onevone-rail-rank">#{index + 1}</span>
                          <img src={entry.avatarUrl} alt={entry.username} className="onevone-rail-avatar" onError={handleAvatarImageError} />
                          <span
                            className={`onevone-rail-name ${displayNameClass(entry.supporterTier, true)}`}
                            style={displayNameStyle(entry.nameStyle, entry.supporterTier)}
                          >
                            {entry.username}
                          </span>
                          <span className="onevone-streak-chip">
                            <span className="onevone-streak-fire" aria-hidden>🔥</span>
                            {entry.current_win_streak}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {myDuelStats ? (
                  <div className="onevone-my-summary">
                    <p className="muted tiny">Your 1v1 Summary</p>
                    <div className="onevone-my-summary-grid">
                      <span>Wins: <strong>{myDuelStats.wins}</strong></span>
                      <span>Matches: <strong>{myDuelStats.matches_played}</strong></span>
                      <span>Current streak: <strong>{myDuelStats.current_win_streak}</strong></span>
                      <span>Best streak: <strong>{myDuelStats.best_win_streak}</strong></span>
                    </div>
                  </div>
                ) : null}
              </div>
            </aside>

            <div className="onevone-lobby-main">
              <div className="card onevone-card onevone-entry-card">
                <div className="onevone-entry-top">
                  <h3>Start a Match</h3>
                  <p className="muted">Create your own room or join with a private code.</p>
                </div>
                <div className="onevone-entry-grid">
                  <button
                    className="primary onevone-create-button"
                    type="button"
                    onClick={() => setShowCreateRoomModal(true)}
                    disabled={loading || !supabase}
                  >
                    <span>Create your own room</span>
                    <small>Choose game mode, category, privacy, and question count.</small>
                  </button>
                  <div className="onevone-join-block">
                    <p className="muted tiny">Join Private Room</p>
                    <div className="onevone-join-row">
                      <input
                        value={joinCodeInput}
                        maxLength={6}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        onChange={(event) => setJoinCodeInput(event.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="6-digit code"
                      />
                      <button className="primary" onClick={joinByCode} disabled={loading || !supabase}>
                        Join
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card onevone-card">
                <div className="onevone-list-head">
                  <h3>Public Rooms {publicRooms.length > 0 ? `(${publicRooms.length})` : ''}</h3>
                  <button className="secondary" onClick={() => void loadPublicRooms()} disabled={loading || !supabase}>
                    Refresh
                  </button>
                </div>
                {publicRooms.length === 0 ? <p className="muted">No public rooms waiting right now.</p> : null}
                <div className="onevone-public-list">
                  {publicRooms.map((item) => {
                    const hostName = publicRoomHostNames[item.host_user_id]
                      || (item.host_user_id === currentUserId ? (currentUsername || 'Host') : `User ${item.host_user_id.slice(0, 8)}`)
                    const roomName = formatRoomName(hostName)
                    return (
                      <div key={item.id} className="onevone-public-item">
                        <div>
                          <strong>{roomName}</strong>
                          <p className="muted tiny">
                            {item.game_type === 'quiz' ? '1v1 Quiz' : '1v1 Matching'} • Category: {item.category.toUpperCase()} • Players: {item.player_count}/2 • Questions: {item.rounds}
                          </p>
                        </div>
                        <button className="primary" onClick={() => void joinPublicRoom(item.id)} disabled={loading || item.player_count >= 2}>
                          Join
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {!inRoom && showCreateRoomModal ? (
        <div
          className="profile-modal-overlay game-setup-overlay"
          onClick={() => setShowCreateRoomModal(false)}
        >
          <div className="card game-settings-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Create Room</h3>
            <label className="game-control">
              Game Mode
              <div className="segmented">
                <button
                  type="button"
                  className={selectedGameType === 'quiz' ? 'seg active' : 'seg'}
                  onClick={() => {
                    setSelectedGameType('quiz')
                  }}
                >
                  1v1 Quiz
                </button>
                <button
                  type="button"
                  className={selectedGameType === 'matching' ? 'seg active' : 'seg'}
                  onClick={() => {
                    setSelectedGameType('matching')
                    if (selectedCategory === 'scenarios') setSelectedCategory('all')
                  }}
                >
                  1v1 Matching
                </button>
              </div>
            </label>
            <label className="game-control">
              Visibility
              <div className="segmented">
                <button type="button" className={isPublicRoom ? 'seg active' : 'seg'} onClick={() => setIsPublicRoom(true)}>
                  Public
                </button>
                <button type="button" className={!isPublicRoom ? 'seg active' : 'seg'} onClick={() => setIsPublicRoom(false)}>
                  Private (Code)
                </button>
              </div>
            </label>
            <label className="game-control">
              Category
              <div className="segmented">
                {duelCategoryOptions
                  .filter((option) => !(selectedGameType === 'matching' && option.quizOnly))
                  .map((option) => (
                    <button
                      key={`duel-category-${option.value}`}
                      type="button"
                      className={selectedCategory === option.value ? 'seg active' : 'seg'}
                      onClick={() => setSelectedCategory(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
              </div>
            </label>
            {selectedGameType === 'quiz' ? (
              <label className="game-control">
                Questions
                <div className="segmented">
                  {duelQuizRoundOptions.map((count) => (
                    <button
                      key={`duel-rounds-${count}`}
                      type="button"
                      className={selectedQuizRounds === count ? 'seg active' : 'seg'}
                      onClick={() => setSelectedQuizRounds(count)}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </label>
            ) : null}
            <div className="actions-row">
              <button className="secondary" type="button" onClick={() => setShowCreateRoomModal(false)} disabled={loading}>
                Cancel
              </button>
              <button className="primary" type="button" onClick={createRoom} disabled={loading || !supabase}>
                Create Room
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {inRoom && room ? (
        <>
          {room.status !== 'completed' ? (
            <>
              <h2>{roomDisplayName} · {room.game_type === 'quiz' ? '1v1 Quiz' : '1v1 Matching'}</h2>
              {activityLog.length > 0 ? (
                <div className="card onevone-card onevone-activity-card">
                  <h3>Room Activity</h3>
                  <div className="onevone-activity-list">
                    {activityLog.map((entry) => (
                      <div key={entry.id} className="onevone-activity-item">
                        <span>{entry.text}</span>
                        <small className="muted">{formatActivityTime(entry.createdAt)}</small>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {room.status === 'waiting' ? (
            <div className="card onevone-card">
              <div className="onevone-lobby-head">
                <div>
                  <p className="muted tiny">Room Name</p>
                  <strong>{roomDisplayName}</strong>
                  <p className="muted tiny">ID: {room.id.slice(0, 8)}</p>
                </div>
                {!room.is_public ? (
                  <div>
                    <p className="muted tiny">Private Code</p>
                    <strong>{room.join_code || '------'}</strong>
                  </div>
                ) : null}
                <div>
                  <p className="muted tiny">Ready</p>
                  <strong>{lobbyReadyCount}/2</strong>
                </div>
              </div>

              <div className="onevone-slots">
                {[1, 2].map((slot) => {
                  const player = players.find((entry) => entry.slot_no === slot)
                  const isOnline = player ? presenceUserIds.includes(player.user_id) : false
                  const name = player ? usernameByUserId[player.user_id] || `User ${player.user_id.slice(0, 8)}` : 'Waiting...'
                  return (
                    <article key={`duel-slot-${slot}`} className="onevone-slot">
                      <p className="muted tiny">Player {slot}</p>
                      <strong>{name}</strong>
                      {player ? <p className={player.is_ready ? 'good' : 'muted'}>{player.is_ready ? 'Ready' : 'Not ready'}</p> : null}
                      {player ? <p className="muted tiny">{isOnline ? 'Online' : 'Offline'}</p> : null}
                    </article>
                  )
                })}
              </div>

              <div className="actions-row">
                <button className="primary" onClick={() => void setReady(true)} disabled={!myPlayer}>
                  Ready
                </button>
                <button className="secondary" onClick={() => void setReady(false)} disabled={!myPlayer}>
                  Unready
                </button>
                <button className="secondary" onClick={leaveRoom}>Leave</button>
              </div>
              <p className="muted tiny">{waitingStatusMessage}</p>
            </div>
          ) : null}

          {room.status === 'in_progress' && room.game_type === 'quiz' ? (
            <div className="speed-session-overlay onevone-quiz-overlay">
              <div className="speed-session-shell onevone-quiz-shell">
                <div className="speed-session-controls onevone-session-controls">
                  <button className="secondary speed-exit-button onevone-leave-button" onClick={() => void confirmLeaveMatch()}>
                    Leave Match
                  </button>
                </div>
                <div className="onevone-hud-grid">
                  <div className="onevone-hud-chip">
                    <small className="muted">Rounds</small>
                    <strong>You {myRoundHud}/{room.rounds} • Opponent {opponentRoundHud}/{room.rounds}</strong>
                  </div>
                  <div className="onevone-hud-chip">
                    <small className="muted">Score</small>
                    <strong>{myDisplayName}: {myPlayer?.score ?? 0} • {opponentDisplayName}: {opponentPlayer?.score ?? 0}</strong>
                  </div>
                  <div className="onevone-hud-chip">
                    <small className="muted">Elapsed</small>
                    <strong>{formatClock(elapsedMs)}</strong>
                  </div>
                </div>

                {!canStartRound ? (
                  <p className="muted">Waiting for round sync...</p>
                ) : null}

                {canStartRound && isQuizRound(currentRound) ? (
                  <div className="card quiz-card speed-session-card onevone-quiz-card">
                    <h3>{currentRound.prompt}</h3>
                    {currentRound.sourceLabel ? <p className="muted tiny">{currentRound.sourceLabel}</p> : null}
                    <div className="choices">
                      {currentRound.choices.map((choice, index) => (
                        <button
                          key={`duel-quiz-choice-${currentRound.round}-${index}`}
                          className={quizChoice === index ? 'choice active' : 'choice'}
                          onClick={() => setQuizChoice(index)}
                          disabled={quizLocked || submittingRound}
                        >
                          {choice}
                        </button>
                      ))}
                    </div>
                    <div className="actions-row">
                      <button className="primary" onClick={() => void submitQuizRound()} disabled={quizChoice === null || quizLocked || submittingRound}>
                        Submit Round
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {room.status === 'in_progress' && room.game_type === 'matching' ? (
            <div className="match-session-overlay onevone-match-overlay">
              <div className="match-session-shell onevone-match-shell">
                <div className="onevone-hud-grid">
                  <div className="onevone-hud-chip">
                    <small className="muted">Rounds</small>
                    <strong>You {myRoundHud}/{room.rounds} • Opponent {opponentRoundHud}/{room.rounds}</strong>
                  </div>
                  <div className="onevone-hud-chip">
                    <small className="muted">Score</small>
                    <strong>{myDisplayName}: {myPlayer?.score ?? 0} • {opponentDisplayName}: {opponentPlayer?.score ?? 0}</strong>
                  </div>
                  <div className="onevone-hud-chip">
                    <small className="muted">Elapsed</small>
                    <strong>{formatClock(elapsedMs)}</strong>
                  </div>
                </div>
                <div className="match-session-controls onevone-session-controls onevone-match-controls">
                  <button className="secondary match-exit-button onevone-leave-button" onClick={() => void confirmLeaveMatch()}>
                    Leave Match
                  </button>
                </div>
                {canStartRound && isMatchingRound(currentRound) ? (
                  <div className="onevone-round">
                    <div className="onevone-match-meta">
                      <p className="muted">Both players get the exact same 6 tiles each set. First to complete all 5 sets wins.</p>
                      <div className="onevone-hud">
                        <span>Matched: {matchingProgressText}</span>
                        <span>Mistakes: {matchingMistakes}</span>
                        <span>Round Points: {matchingRoundPoints}</span>
                      </div>
                    </div>
                    <div className="match-grid match-grid-session">
                      {matchingCards.map((card) => {
                        const selected = selectedMatchingCards.includes(card.id)
                        const matched = matchedPairIds.includes(card.pairId)
                        const wrong = wrongMatchingCardIds.includes(card.id)
                        return (
                          <button
                            key={`duel-match-card-${currentRound.round}-${card.id}`}
                            className={`match-card${selected ? ' match-selected' : ''}${matched ? ' match-done' : ''}${wrong ? ' match-wrong' : ''}`}
                            disabled={matchingSubmitted || submittingRound || matched || (!selected && selectedMatchingCards.length >= 2)}
                            onClick={() => handleMatchingCardClick(card.id)}
                          >
                            <small>{card.kind === 'code' ? 'Code section' : 'Definition'}</small>
                            <strong>{card.text}</strong>
                          </button>
                        )
                      })}
                    </div>
                    <p className="muted tiny">{matchingStatusText}</p>
                  </div>
                ) : (
                  <p className="muted">Waiting for round sync...</p>
                )}
              </div>
            </div>
          ) : null}

          {room.status === 'completed' ? (
            <div className="onevone-result-overlay">
              <div className="card onevone-card onevone-result-shell">
                <h3>Match Results</h3>
                <p className="muted">
                  {room.game_type === 'matching'
                    ? 'First to complete all 5 sets wins (fastest total time decides ties).'
                    : 'Winner is determined by highest score, then fastest total time.'}
                </p>
                <div className={room.winner_user_id === currentUserId ? 'onevone-winner-banner good' : 'onevone-winner-banner'}>
                  {room.winner_user_id === currentUserId
                    ? `Winner: ${myDisplayName}`
                    : `Winner: ${usernameByUserId[room.winner_user_id || ''] || opponentDisplayName}`}
                </div>
                <div className="onevone-results-list">
                  {roomPlayerRowsSorted.map((entry) => {
                    const userId = entry.user_id
                    const name = usernameByUserId[userId] || `User ${userId.slice(0, 8)}`
                    const isWinner = 'is_winner' in entry
                      ? Boolean((entry as DuelRoomResultRow).is_winner)
                      : room.winner_user_id === userId
                    return (
                      <article key={`room-result-${userId}`} className={isWinner ? 'onevone-result-item winner' : 'onevone-result-item'}>
                        <strong>{name}</strong>
                        <span>{entry.score} pts</span>
                        <span>{formatElapsed(entry.total_time_ms)} total</span>
                        {isWinner ? <span className="good">Winner</span> : null}
                      </article>
                    )
                  })}
                </div>
                {myResultRow && opponentResultRow ? (
                  <div className="onevone-compare-grid">
                    <article className="onevone-compare-card">
                      <p className="muted tiny">Your Score</p>
                      <strong>{myResultRow.score} pts</strong>
                      <p className="muted tiny">Rounds completed: {myRoundsCompleted}/{room.rounds}</p>
                    </article>
                    <article className="onevone-compare-card">
                      <p className="muted tiny">Opponent Score</p>
                      <strong>{opponentResultRow.score} pts</strong>
                      <p className="muted tiny">Rounds completed: {opponentRoundsCompleted}/{room.rounds}</p>
                    </article>
                    <article className="onevone-compare-card">
                      <p className="muted tiny">Your Total Time</p>
                      <strong>{formatClock(myResultRow.total_time_ms)}</strong>
                      <p className="muted tiny">
                        {myResultRow.score - opponentResultRow.score >= 0
                          ? `Score gap +${myResultRow.score - opponentResultRow.score}`
                          : `Score gap ${myResultRow.score - opponentResultRow.score}`}
                      </p>
                    </article>
                    <article className="onevone-compare-card">
                      <p className="muted tiny">Opponent Time</p>
                      <strong>{formatClock(opponentResultRow.total_time_ms)}</strong>
                      <p className="muted tiny">
                        {myResultRow.total_time_ms === opponentResultRow.total_time_ms
                          ? 'Same total time'
                          : myResultRow.total_time_ms < opponentResultRow.total_time_ms
                          ? `${formatClock(opponentResultRow.total_time_ms - myResultRow.total_time_ms)} faster`
                          : `${formatClock(myResultRow.total_time_ms - opponentResultRow.total_time_ms)} slower`}
                      </p>
                    </article>
                  </div>
                ) : null}
                {myDuelStats ? (
                  <div className="onevone-result-summary">
                    <article className="onevone-result-summary-chip">
                      <small className="muted">Total Wins</small>
                      <strong>{myDuelStats.wins}</strong>
                    </article>
                    <article className="onevone-result-summary-chip">
                      <small className="muted">Current Streak</small>
                      <strong>
                        {myDuelStats.current_win_streak}
                        {myDuelStats.current_win_streak > 1 ? <span className="onevone-streak-fire" aria-hidden>🔥</span> : null}
                      </strong>
                    </article>
                    <article className="onevone-result-summary-chip">
                      <small className="muted">Best Streak</small>
                      <strong>{myDuelStats.best_win_streak}</strong>
                    </article>
                  </div>
                ) : null}
                <div className="actions-row">
                  <button className="primary" onClick={leaveRoom}>Back to 1v1 Lobby</button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {selectedDuelProfile ? (
        <div className="profile-modal-overlay leaderboard-profile-overlay" onClick={() => setSelectedDuelProfileUserId(null)}>
          <div className="card profile-modal-card onevone-profile-modal" onClick={(event) => event.stopPropagation()}>
            <div className="onevone-profile-head">
              <div className="onevone-profile-identity">
                <span className="leader-avatar-wrap">
                  <span className="leader-avatar-frame">
                    <img
                      src={selectedDuelProfile.avatarUrl}
                      alt={selectedDuelProfile.username}
                      className="leader-avatar"
                      onError={handleAvatarImageError}
                    />
                  </span>
                </span>
                <div className="onevone-profile-name-wrap">
                  <h3
                    className={`leader-profile-name ${displayNameClass(selectedDuelProfile.supporterTier, true)}`}
                    style={displayNameStyle(selectedDuelProfile.nameStyle, selectedDuelProfile.supporterTier)}
                  >
                    {selectedDuelProfile.username}
                  </h3>
                  <div className="leader-profile-pills">
                    <p className="leader-theme-pill">Tier: {supporterTierLabel[selectedDuelProfile.supporterTier]}</p>
                    {selectedProfileHasTopCurrentStreak ? (
                      <p className="leader-theme-pill onevone-top-streak-pill">
                        Biggest current streak
                        <span className="onevone-streak-fire" aria-hidden> 🔥</span>
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
              <button className="secondary" type="button" onClick={() => setSelectedDuelProfileUserId(null)}>Close</button>
            </div>

            <div className="onevone-profile-grid">
              <div className="leader-profile-item">
                <p className="leader-profile-label">Agency</p>
                <p>{selectedDuelProfile.agency || 'Not provided'}</p>
              </div>
              <div className="leader-profile-item">
                <p className="leader-profile-label">Current Win Streak</p>
                <p>
                  {selectedDuelProfile.all.currentStreak}
                  {selectedDuelProfile.all.currentStreak > 1 ? <span className="onevone-streak-fire" aria-hidden> 🔥</span> : null}
                </p>
              </div>
              <div className="leader-profile-item leader-profile-item-wide">
                <p className="leader-profile-label">About Me</p>
                <p>{selectedDuelProfile.bio || 'Not provided'}</p>
              </div>
            </div>

            <div className="onevone-profile-record">
              <article className="leader-profile-stat">
                <p className="leader-profile-label">1v1 Record</p>
                <strong>{selectedDuelProfile.all.wins}-{selectedDuelProfile.all.losses}</strong>
              </article>
              <article className="leader-profile-stat">
                <p className="leader-profile-label">Total Matches</p>
                <strong>{selectedDuelProfile.all.matches}</strong>
              </article>
              <article className="leader-profile-stat">
                <p className="leader-profile-label">Best Win Streak</p>
                <strong>{selectedDuelProfile.all.bestStreak}</strong>
              </article>
              <article className="leader-profile-stat">
                <p className="leader-profile-label">Matching W-L</p>
                <strong>{selectedDuelProfile.matching.wins}-{selectedDuelProfile.matching.losses}</strong>
              </article>
              <article className="leader-profile-stat">
                <p className="leader-profile-label">Quiz W-L</p>
                <strong>{selectedDuelProfile.quiz.wins}-{selectedDuelProfile.quiz.losses}</strong>
              </article>
            </div>

            {selectedProfileHasTopCurrentStreak ? (
              <div className="onevone-current-streak-banner">
                Current Biggest Streak: {selectedDuelProfile.all.currentStreak}
                <span className="onevone-streak-fire" aria-hidden> 🔥</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? <p className="bad">{error}</p> : null}
      {!error && notice ? <p className="good">{notice}</p> : null}
    </div>
  )
}
