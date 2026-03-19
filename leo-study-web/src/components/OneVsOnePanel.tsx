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
  rematch_room_id: string | null
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
  fastest_round_ms: number
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
  status?: DuelRoomStatus
  players?: Array<{
    user_id: string
    display_name: string
    is_host: boolean
    ready: boolean
    score: number
  }>
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

type ReadyRpcState = {
  status?: DuelRoomStatus
  ready_count?: number
  player_count?: number
  rematch_started?: boolean
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

type DuelLeaderboardCacheSnapshot = {
  version: number
  saved_at: number
  wins: DuelStatsLeaderboardEntry[]
  streak: DuelStatsLeaderboardEntry[]
  my_stats: DuelStatsLeaderboardEntry | null
}

type DuelProfileSnapshot = {
  user_id: string
  username: string
  avatarUrl: string
  supporterTier: SupporterTier
  nameStyle: NameStyle
  agency: string
  bio: string
  currentActivity: {
    label: string
    updatedAt: string
  } | null
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

type OnlineInviteUser = {
  user_id: string
  username: string
  avatarUrl: string
  supporterTier: SupporterTier
  last_active: string
}

type WaitingRoomMessage = {
  id: string
  room_id: string
  user_id: string
  display_name: string
  message: string
  created_at: string
}

type QuizSpamSample = {
  round: number
  choiceIndex: number
  correct: boolean
  elapsedMs: number
}

const supporterTierLabel: Record<SupporterTier, string> = {
  free: 'Free',
  tier2: '$2 Supporter',
  tier5: '$5 Supporter',
  tier10: '$10 Supporter',
}

const duelQuizRoundOptions = [5, 10, 20, 30]
const duelQuizRoundTimeLimitMs = 30_000
const duelScenarioQuizRoundTimeLimitMs = 120_000
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
const duelLeaderboardCacheVersion = 2
const duelLeaderboardCacheMaxAgeMs = 1000 * 60 * 60 * 12

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
  if (!Number.isFinite(value)) return '--'
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

function fallbackUsername(userId: string) {
  return `User ${userId.slice(0, 8)}`
}

function isFallbackUsername(username: string, userId: string) {
  return username.trim().toLowerCase() === fallbackUsername(userId).toLowerCase()
}

function emptyDuelProfileSnapshot(userId: string): DuelProfileSnapshot {
  return {
    user_id: userId,
    username: fallbackUsername(userId),
    avatarUrl: defaultAvatarUrl,
    supporterTier: 'free',
    nameStyle: { ...defaultNameStyle },
    agency: '',
    bio: '',
    currentActivity: null,
    all: { wins: 0, losses: 0, matches: 0, currentStreak: 0, bestStreak: 0 },
    matching: { wins: 0, losses: 0, matches: 0 },
    quiz: { wins: 0, losses: 0, matches: 0 },
  }
}

function formatDuelProfileCurrentActivity(activity: DuelProfileSnapshot['currentActivity']) {
  if (!activity?.label) return 'Unavailable'
  const updatedAtMs = Date.parse(activity.updatedAt || '')
  if (!Number.isFinite(updatedAtMs)) return activity.label
  const elapsedMs = Math.max(0, Date.now() - updatedAtMs)
  if (elapsedMs <= 90_000) return activity.label
  if (elapsedMs <= 15 * 60 * 1000) return `Recently: ${activity.label}`
  return 'Offline'
}

function duelLeaderboardCacheKey(userId: string, mode: DuelStatsMode) {
  return `leo-study:duel-leaderboard:v${duelLeaderboardCacheVersion}:${userId}:${mode}`
}

function parseDuelLeaderboardEntry(value: unknown): DuelStatsLeaderboardEntry | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const userId = String(row.user_id || '').trim()
  if (!userId) return null
  const rawAvatar = String(row.avatarUrl || '').trim()
  const avatarUrl = !rawAvatar || rawAvatar === defaultAvatarUrl
    ? defaultAvatarUrl
    : toPublicAvatarUrl(rawAvatar)
  return {
    user_id: userId,
    username: String(row.username || '').trim() || fallbackUsername(userId),
    avatarUrl,
    supporterTier: sanitizeSupporterTier(row.supporterTier),
    nameStyle: sanitizeNameStyle(row.nameStyle),
    wins: Math.max(0, Number(row.wins || 0)),
    losses: Math.max(0, Number(row.losses || 0)),
    matches_played: Math.max(0, Number(row.matches_played || 0)),
    current_win_streak: Math.max(0, Number(row.current_win_streak || 0)),
    best_win_streak: Math.max(0, Number(row.best_win_streak || 0)),
  }
}

function readDuelLeaderboardCache(userId: string, mode: DuelStatsMode): DuelLeaderboardCacheSnapshot | null {
  if (typeof window === 'undefined') return null
  const trimmedUserId = userId.trim()
  if (!trimmedUserId) return null
  try {
    const raw = window.localStorage.getItem(duelLeaderboardCacheKey(trimmedUserId, mode))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<DuelLeaderboardCacheSnapshot>
    if (!parsed || typeof parsed !== 'object') return null
    const version = Number(parsed.version || 0)
    const savedAt = Number(parsed.saved_at || 0)
    if (version !== duelLeaderboardCacheVersion || !Number.isFinite(savedAt)) return null
    if (Date.now() - savedAt > duelLeaderboardCacheMaxAgeMs) return null
    const wins = (Array.isArray(parsed.wins) ? parsed.wins : [])
      .map((entry) => parseDuelLeaderboardEntry(entry))
      .filter((entry): entry is DuelStatsLeaderboardEntry => entry !== null)
      .slice(0, 8)
    const streak = (Array.isArray(parsed.streak) ? parsed.streak : [])
      .map((entry) => parseDuelLeaderboardEntry(entry))
      .filter((entry): entry is DuelStatsLeaderboardEntry => entry !== null)
      .slice(0, 8)
    const myStats = parseDuelLeaderboardEntry(parsed.my_stats || null)
    return {
      version: duelLeaderboardCacheVersion,
      saved_at: savedAt,
      wins,
      streak,
      my_stats: myStats,
    }
  } catch {
    return null
  }
}

function writeDuelLeaderboardCache(
  userId: string,
  mode: DuelStatsMode,
  snapshot: {
    wins: DuelStatsLeaderboardEntry[]
    streak: DuelStatsLeaderboardEntry[]
    myStats: DuelStatsLeaderboardEntry | null
  },
) {
  if (typeof window === 'undefined') return
  const trimmedUserId = userId.trim()
  if (!trimmedUserId) return
  const payload: DuelLeaderboardCacheSnapshot = {
    version: duelLeaderboardCacheVersion,
    saved_at: Date.now(),
    wins: snapshot.wins.slice(0, 8),
    streak: snapshot.streak.slice(0, 8),
    my_stats: snapshot.myStats,
  }
  try {
    window.localStorage.setItem(duelLeaderboardCacheKey(trimmedUserId, mode), JSON.stringify(payload))
  } catch {
    // ignore storage write failures
  }
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

function parseReadyRpcState(value: unknown): ReadyRpcState {
  if (typeof value === 'string') {
    const rawStatus = value.trim()
    const validStatuses: DuelRoomStatus[] = ['waiting', 'in_progress', 'completed', 'cancelled']
    if (validStatuses.includes(rawStatus as DuelRoomStatus)) {
      return { status: rawStatus as DuelRoomStatus }
    }
    return {}
  }
  const payload = Array.isArray(value) ? value[0] : value
  if (!payload || typeof payload !== 'object') return {}
  const row = payload as Record<string, unknown>
  const rawStatus = String(row.status || '').trim()
  const validStatuses: DuelRoomStatus[] = ['waiting', 'in_progress', 'completed', 'cancelled']
  return {
    status: validStatuses.includes(rawStatus as DuelRoomStatus) ? (rawStatus as DuelRoomStatus) : undefined,
    ready_count: typeof row.ready_count === 'number' ? Number(row.ready_count) : undefined,
    player_count: typeof row.player_count === 'number' ? Number(row.player_count) : undefined,
    rematch_started: Boolean(row.rematch_started),
  }
}

function parseWaitingRoomMessage(value: unknown): WaitingRoomMessage | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const id = String(row.id || '').trim()
  const roomId = String(row.room_id || '').trim()
  const userId = String(row.user_id || '').trim()
  const displayName = String(row.display_name || '').trim()
  const message = String(row.message || '').trim()
  const createdAt = String(row.created_at || '').trim()
  if (!id || !roomId || !userId || !message || !createdAt) return null
  return {
    id,
    room_id: roomId,
    user_id: userId,
    display_name: displayName || `User ${userId.slice(0, 8)}`,
    message,
    created_at: createdAt,
  }
}

export function OneVsOnePanel(props: {
  currentUserId: string
  currentUsername: string
  isOwner?: boolean
  externalJoinRoomId?: string | null
  onExternalJoinHandled?: () => void
  onStudyActivity?: () => void
}) {
  const {
    currentUserId,
    currentUsername,
    isOwner = false,
    externalJoinRoomId = null,
    onExternalJoinHandled,
    onStudyActivity,
  } = props

  const [selectedGameType, setSelectedGameType] = useState<DuelGameType>('quiz')
  const [selectedCategory, setSelectedCategory] = useState<DuelCategory>('all')
  const [isPublicRoom, setIsPublicRoom] = useState(true)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteGameType, setInviteGameType] = useState<DuelGameType>('quiz')
  const [inviteCategory, setInviteCategory] = useState<DuelCategory>('all')
  const [inviteQuizRounds, setInviteQuizRounds] = useState(10)
  const [onlineInviteUsers, setOnlineInviteUsers] = useState<OnlineInviteUser[]>([])
  const [onlineInviteLoading, setOnlineInviteLoading] = useState(false)
  const [inviteSendingUserId, setInviteSendingUserId] = useState<string | null>(null)

  const [publicRooms, setPublicRooms] = useState<LobbyRoomItem[]>([])
  const [joinCodeInput, setJoinCodeInput] = useState('')
  const [roomId, setRoomId] = useState<string | null>(null)
  const [showCreateRoomModal, setShowCreateRoomModal] = useState(false)
  const [activityLog, setActivityLog] = useState<DuelRoomActivity[]>([])
  const [selectedQuizRounds, setSelectedQuizRounds] = useState(10)
  const [duelStatsMode, setDuelStatsMode] = useState<DuelStatsMode>('all')
  const [initialDuelLeaderboardCache] = useState(() => readDuelLeaderboardCache(currentUserId, 'all'))
  const [winsLeaderboard, setWinsLeaderboard] = useState<DuelStatsLeaderboardEntry[]>(() => initialDuelLeaderboardCache?.wins || [])
  const [streakLeaderboard, setStreakLeaderboard] = useState<DuelStatsLeaderboardEntry[]>(() => initialDuelLeaderboardCache?.streak || [])
  const [myDuelStats, setMyDuelStats] = useState<DuelStatsLeaderboardEntry | null>(() => initialDuelLeaderboardCache?.my_stats || null)
  const [publicRoomHostNames, setPublicRoomHostNames] = useState<Record<string, string>>({})
  const [duelProfileByUserId, setDuelProfileByUserId] = useState<Record<string, DuelProfileSnapshot>>({})
  const [selectedDuelProfileUserId, setSelectedDuelProfileUserId] = useState<string | null>(null)

  const [room, setRoom] = useState<DuelRoomRow | null>(null)
  const [players, setPlayers] = useState<DuelRoomPlayerRow[]>([])
  const [results, setResults] = useState<DuelRoomResultRow[]>([])
  const [usernameByUserId, setUsernameByUserId] = useState<Record<string, string>>({})
  const [spectatorCount, setSpectatorCount] = useState(0)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null)
  const [rematchLoading, setRematchLoading] = useState(false)
  const [waitingChatMessages, setWaitingChatMessages] = useState<WaitingRoomMessage[]>([])
  const [waitingChatInput, setWaitingChatInput] = useState('')
  const [waitingChatSending, setWaitingChatSending] = useState(false)

  const [roundStartedAt, setRoundStartedAt] = useState<number>(0)
  const [hudNow, setHudNow] = useState<number>(() => Date.now())
  const [submittingRound, setSubmittingRound] = useState(false)
  const [quizChoice, setQuizChoice] = useState<number | null>(null)
  const [quizLocked, setQuizLocked] = useState(false)

  const [matchingCards, setMatchingCards] = useState<DuelMatchCard[]>([])
  const [selectedMatchingCards, setSelectedMatchingCards] = useState<string[]>([])
  const [wrongMatchingCardIds, setWrongMatchingCardIds] = useState<string[]>([])
  const [matchedPairIds, setMatchedPairIds] = useState<string[]>([])
  const [, setMatchingMistakes] = useState(0)
  const [matchingRoundPoints, setMatchingRoundPoints] = useState(0)
  const [matchingSubmitted, setMatchingSubmitted] = useState(false)
  const previousPlayersRef = useRef<DuelRoomPlayerRow[]>([])
  const previousRoomStatusRef = useRef<DuelRoomStatus | null>(null)
  const activityBootstrappedRef = useRef(false)
  const initializedRoundKeyRef = useRef('')
  const livePlayersRef = useRef<DuelRoomPlayerRow[]>([])
  const refreshInFlightRef = useRef(false)
  const refreshQueuedRef = useRef(false)
  const waitingChatEndRef = useRef<HTMLDivElement | null>(null)
  const duelProfileCacheRef = useRef<Record<string, DuelProfileSnapshot>>({})
  const duelLeaderboardRequestRef = useRef(0)
  const winsLeaderboardRef = useRef<DuelStatsLeaderboardEntry[]>(winsLeaderboard)
  const streakLeaderboardRef = useRef<DuelStatsLeaderboardEntry[]>(streakLeaderboard)
  const myDuelStatsRef = useRef<DuelStatsLeaderboardEntry | null>(myDuelStats)
  const autoForfeitRoundKeyRef = useRef('')
  const quizSpamHistoryRef = useRef<QuizSpamSample[]>([])
  const quizSpamStrikeRef = useRef(0)

  const isSignedIn = currentUserId.trim().length > 0
  const markStudyActivity = useCallback(() => {
    onStudyActivity?.()
  }, [onStudyActivity])

  useEffect(() => {
    livePlayersRef.current = players
  }, [players])

  useEffect(() => {
    duelProfileCacheRef.current = duelProfileByUserId
  }, [duelProfileByUserId])

  useEffect(() => {
    winsLeaderboardRef.current = winsLeaderboard
  }, [winsLeaderboard])

  useEffect(() => {
    streakLeaderboardRef.current = streakLeaderboard
  }, [streakLeaderboard])

  useEffect(() => {
    myDuelStatsRef.current = myDuelStats
  }, [myDuelStats])

  useEffect(() => {
    if (!isSignedIn) return
    const cached = readDuelLeaderboardCache(currentUserId, duelStatsMode)
    if (!cached) {
      setWinsLeaderboard([])
      setStreakLeaderboard([])
      setMyDuelStats(null)
      return
    }
    setWinsLeaderboard(cached.wins)
    setStreakLeaderboard(cached.streak)
    setMyDuelStats(cached.my_stats)
  }, [currentUserId, duelStatsMode, isSignedIn])

  const loadPublicRooms = useCallback(async () => {
    if (!supabase || !isSignedIn) return
    const { data, error: rpcError } = await supabase.rpc('list_public_1v1_rooms')
    if (rpcError) {
      setError(rpcError.message || 'Could not load public rooms.')
      return
    }
    const mapped = (Array.isArray(data) ? data : []).map((row) => {
      const players = (row as Record<string, unknown>).players as Array<Record<string, unknown>> || []
      return {
        id: String((row as Record<string, unknown>).id || ''),
        game_type: String((row as Record<string, unknown>).game_type || 'quiz') as DuelGameType,
        category: String((row as Record<string, unknown>).category || 'all') as DuelCategory,
        rounds: Number((row as Record<string, unknown>).rounds || 5),
        created_at: String((row as Record<string, unknown>).created_at || ''),
        host_user_id: String((row as Record<string, unknown>).host_user_id || ''),
        status: String((row as Record<string, unknown>).status || 'waiting') as DuelRoomStatus,
        player_count: Number((row as Record<string, unknown>).player_count || 0),
        players: players.map(p => ({
          user_id: String(p.user_id || ''),
          display_name: String(p.display_name || ''),
          is_host: Boolean(p.is_host),
          ready: Boolean(p.ready),
          score: Number(p.score || 0)
        }))
      }
    }).filter((row) => row.id)
    setPublicRooms(mapped)

    // Build host map from player data
    const hostMap: Record<string, string> = {}
    mapped.forEach(row => {
      const hostPlayer = row.players?.find(p => p.is_host)
      if (hostPlayer && row.host_user_id) {
        hostMap[row.host_user_id] = hostPlayer.display_name
      }
    })
    setPublicRoomHostNames(hostMap)
  }, [isSignedIn])

  const loadOnlineInviteUsers = useCallback(async () => {
    if (!supabase || !isSignedIn) return
    setOnlineInviteLoading(true)
    const { data, error: rpcError } = await supabase.rpc('list_online_1v1_users', { p_minutes_interval: 5 })
    setOnlineInviteLoading(false)
    if (rpcError) {
      setError(rpcError.message || 'Could not load online users.')
      return
    }
    const mapped: OnlineInviteUser[] = (Array.isArray(data) ? data : []).map((row) => {
      const value = row as Record<string, unknown>
      const userId = String(value.user_id || '')
      const username = String(value.username || '').trim()
      const avatarPath = String(value.avatar_path || '')
      const lastActive = String(value.last_active || '')
      return {
        user_id: userId,
        username: username || `User ${userId.slice(0, 8)}`,
        avatarUrl: toPublicAvatarUrl(avatarPath),
        supporterTier: sanitizeSupporterTier(value.supporter_tier),
        last_active: lastActive,
      }
    }).filter((row) => row.user_id)
    setOnlineInviteUsers(mapped)
  }, [isSignedIn])

  const loadDuelLeaderboards = useCallback(async () => {
    if (!supabase || !isSignedIn) return
    const requestId = ++duelLeaderboardRequestRef.current
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

    const sortWinsRows = (rows: DuelStatsLeaderboardEntry[]) =>
      [...rows]
        .filter((entry) => entry.wins > 0)
        .sort((left, right) => {
          if (right.wins !== left.wins) return right.wins - left.wins
          if (right.current_win_streak !== left.current_win_streak) return right.current_win_streak - left.current_win_streak
          if (right.matches_played !== left.matches_played) return right.matches_played - left.matches_played
          return left.username.localeCompare(right.username)
        })
        .slice(0, 8)

    const sortStreakRows = (rows: DuelStatsLeaderboardEntry[]) =>
      [...rows]
        .filter((entry) => entry.current_win_streak > 1)
        .sort((left, right) => {
          if (right.current_win_streak !== left.current_win_streak) return right.current_win_streak - left.current_win_streak
          if (right.wins !== left.wins) return right.wins - left.wins
          return left.username.localeCompare(right.username)
        })
        .slice(0, 8)

    const mappedStats: DuelStatsRow[] = (Array.isArray(data) ? data : []).map((row) => ({
      user_id: String((row as Record<string, unknown>).user_id || ''),
      game_type: String((row as Record<string, unknown>).game_type || 'all') as DuelStatsMode,
      wins: Number((row as Record<string, unknown>).wins || 0),
      losses: Number((row as Record<string, unknown>).losses || 0),
      matches_played: Number((row as Record<string, unknown>).matches_played || 0),
      current_win_streak: Number((row as Record<string, unknown>).current_win_streak || 0),
      best_win_streak: Number((row as Record<string, unknown>).best_win_streak || 0),
    })).filter((row) => row.user_id)

    const toLeaderboardEntry = (
      row: DuelStatsRow,
      profileSnapshots: Record<string, DuelProfileSnapshot>,
    ): DuelStatsLeaderboardEntry => {
      const profile = profileSnapshots[row.user_id]
      return {
        user_id: row.user_id,
        username: profile?.username || fallbackUsername(row.user_id),
        avatarUrl: profile?.avatarUrl || defaultAvatarUrl,
        supporterTier: profile?.supporterTier || 'free',
        nameStyle: profile?.nameStyle || { ...defaultNameStyle },
        wins: row.wins,
        losses: row.losses,
        matches_played: row.matches_played,
        current_win_streak: row.current_win_streak,
        best_win_streak: row.best_win_streak,
      }
    }

    if (mappedStats.length === 0) {
      if (duelLeaderboardRequestRef.current !== requestId) return
      setWinsLeaderboard([])
      setStreakLeaderboard([])
      setMyDuelStats(null)
      setDuelProfileByUserId({})
      duelProfileCacheRef.current = {}
      writeDuelLeaderboardCache(currentUserId, duelStatsMode, {
        wins: [],
        streak: [],
        myStats: null,
      })
      return
    }

    const cachedProfiles: Record<string, DuelProfileSnapshot> = { ...duelProfileCacheRef.current }
    const knownEntries = [
      ...winsLeaderboardRef.current,
      ...streakLeaderboardRef.current,
      ...(myDuelStatsRef.current ? [myDuelStatsRef.current] : []),
    ]
    knownEntries.forEach((entry) => {
      const existing = cachedProfiles[entry.user_id]
      const next = existing ? { ...existing } : emptyDuelProfileSnapshot(entry.user_id)
      const hasRealName = entry.username.trim().length > 0 && !isFallbackUsername(entry.username, entry.user_id)
      if (hasRealName || isFallbackUsername(next.username, entry.user_id)) {
        next.username = hasRealName ? entry.username : next.username
      }
      if (entry.avatarUrl && entry.avatarUrl !== defaultAvatarUrl) {
        next.avatarUrl = entry.avatarUrl
      }
      next.supporterTier = entry.supporterTier || next.supporterTier
      next.nameStyle = entry.nameStyle || next.nameStyle
      cachedProfiles[entry.user_id] = next
    })
    const quickEntries = mappedStats.map((row) => toLeaderboardEntry(row, cachedProfiles))
    const quickWinsRows = sortWinsRows(quickEntries)
    const quickStreakRows = sortStreakRows(quickEntries)
    const quickMyStats = quickEntries.find((entry) => entry.user_id === currentUserId) || null
    const quickHasFallbackNames = [...quickWinsRows, ...quickStreakRows, ...(quickMyStats ? [quickMyStats] : [])]
      .some((entry) => isFallbackUsername(entry.username, entry.user_id))
    if (duelLeaderboardRequestRef.current !== requestId) return
    if (!quickHasFallbackNames) {
      setWinsLeaderboard(quickWinsRows)
      setStreakLeaderboard(quickStreakRows)
      setMyDuelStats(quickMyStats)
      writeDuelLeaderboardCache(currentUserId, duelStatsMode, {
        wins: quickWinsRows,
        streak: quickStreakRows,
        myStats: quickMyStats,
      })
    }

    const spotlightUserIds = [...new Set([
      ...quickWinsRows.map((entry) => entry.user_id),
      ...quickStreakRows.map((entry) => entry.user_id),
      currentUserId,
    ])]

    if (spotlightUserIds.length === 0) return

    const [{ data: allStatsRows }, { data: profileRows }, { data: appStateRows }] = await Promise.all([
      supabase
        .from('duel_player_stats')
        .select('user_id,game_type,wins,losses,matches_played,current_win_streak,best_win_streak')
        .in('user_id', spotlightUserIds),
      supabase
        .from('profiles')
        .select('user_id,username,avatar_path,supporter_tier')
        .in('user_id', spotlightUserIds),
      supabase
        .from('app_state')
        .select('user_id,profile_details')
        .in('user_id', spotlightUserIds),
    ])

    if (duelLeaderboardRequestRef.current !== requestId) return

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

    const detailsMap = (Array.isArray(appStateRows) ? appStateRows : []).reduce<Record<string, {
      bio: string
      agency: string
      nameStyle: NameStyle
      currentActivity: DuelProfileSnapshot['currentActivity']
    }>>((accumulator, row) => {
      const value = row as Record<string, unknown>
      const userId = String(value.user_id || '')
      if (!userId) return accumulator
      const details = value.profile_details && typeof value.profile_details === 'object'
        ? (value.profile_details as Record<string, unknown>)
        : {}
      const rawCurrentActivity = details.currentActivity && typeof details.currentActivity === 'object'
        ? (details.currentActivity as Record<string, unknown>)
        : null
      accumulator[userId] = {
        bio: String(details.bio || '').trim(),
        agency: String(details.agency || '').trim(),
        nameStyle: sanitizeNameStyle(details.nameStyle),
        currentActivity:
          rawCurrentActivity && typeof rawCurrentActivity.label === 'string' && rawCurrentActivity.label.trim().length > 0
            ? {
              label: String(rawCurrentActivity.label || '').trim(),
              updatedAt: String(rawCurrentActivity.updatedAt || ''),
            }
            : null,
      }
      return accumulator
    }, {})

    const nextProfileSnapshotByUserId: Record<string, DuelProfileSnapshot> = { ...duelProfileCacheRef.current }
    spotlightUserIds.forEach((userId) => {
      const all = allStatsByKey.get(`${userId}:all`)
      const matching = allStatsByKey.get(`${userId}:matching`)
      const quiz = allStatsByKey.get(`${userId}:quiz`)
      const profile = profileMap[userId]
      const details = detailsMap[userId]
      const fallbackProfile = nextProfileSnapshotByUserId[userId] || emptyDuelProfileSnapshot(userId)
      nextProfileSnapshotByUserId[userId] = {
        user_id: userId,
        username: profile?.username || fallbackProfile.username,
        avatarUrl: profile?.avatarUrl || fallbackProfile.avatarUrl,
        supporterTier: profile?.supporterTier || fallbackProfile.supporterTier,
        nameStyle: details?.nameStyle || fallbackProfile.nameStyle,
        agency: details?.agency || fallbackProfile.agency,
        bio: details?.bio || fallbackProfile.bio,
        currentActivity: details?.currentActivity || fallbackProfile.currentActivity,
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
    duelProfileCacheRef.current = nextProfileSnapshotByUserId
    setDuelProfileByUserId(nextProfileSnapshotByUserId)

    const enrichedEntries = mappedStats.map((row) => toLeaderboardEntry(row, nextProfileSnapshotByUserId))
    if (duelLeaderboardRequestRef.current !== requestId) return
    const enrichedWinsRows = sortWinsRows(enrichedEntries)
    const enrichedStreakRows = sortStreakRows(enrichedEntries)
    const enrichedMyStats = enrichedEntries.find((entry) => entry.user_id === currentUserId) || null
    setWinsLeaderboard(enrichedWinsRows)
    setStreakLeaderboard(enrichedStreakRows)
    setMyDuelStats(enrichedMyStats)
    writeDuelLeaderboardCache(currentUserId, duelStatsMode, {
      wins: enrichedWinsRows,
      streak: enrichedStreakRows,
      myStats: enrichedMyStats,
    })
  }, [currentUserId, duelStatsMode, isSignedIn])

  const loadWaitingChatMessages = useCallback(async (targetRoomId: string) => {
    if (!supabase || !isSignedIn) return
    const cleanRoomId = targetRoomId.trim()
    if (!cleanRoomId) return
    const { data, error: rpcError } = await supabase.rpc('list_1v1_waiting_chat_messages', {
      p_room_id: cleanRoomId,
      p_limit: 80,
    })
    if (rpcError) {
      const errorCode = String((rpcError as unknown as { code?: string }).code || '')
      if (errorCode === '42P01' || errorCode === '42883') {
        return
      }
      setError(rpcError.message || 'Could not load waiting-room chat.')
      return
    }
    const parsed = (Array.isArray(data) ? data : [])
      .map((row) => parseWaitingRoomMessage(row))
      .filter((row): row is WaitingRoomMessage => row !== null)
    setWaitingChatMessages(parsed)
  }, [isSignedIn])

  const sendWaitingChatMessage = useCallback(async () => {
    if (!supabase || !room || room.status !== 'waiting') return
    const nextMessage = waitingChatInput.trim()
    if (!nextMessage || waitingChatSending) return
    setWaitingChatSending(true)
    const { data, error: rpcError } = await supabase.rpc('send_1v1_waiting_chat_message', {
      p_room_id: room.id,
      p_message: nextMessage,
    })
    setWaitingChatSending(false)
    if (rpcError) {
      setError(rpcError.message || 'Could not send waiting-room message.')
      return
    }

    setWaitingChatInput('')
    const inserted = parseWaitingRoomMessage(Array.isArray(data) ? data[0] : data)
    if (!inserted) return
    setWaitingChatMessages((previous) => {
      const byId = new Map(previous.map((row) => [row.id, row]))
      byId.set(inserted.id, inserted)
      return Array.from(byId.values())
        .sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at))
        .slice(-120)
    })
  }, [room, waitingChatInput, waitingChatSending])

  const refreshRoomSnapshot = useCallback(async () => {
    if (!supabase || !roomId || !isSignedIn) return
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true
      return
    }
    refreshInFlightRef.current = true

    try {
      // First try direct queries (works when user is a player in the room)
      const [{ data: roomRow, error: roomError }, { data: playerRows, error: playersError }, { data: resultRows, error: resultsError }] = await Promise.all([
        supabase.from('rooms').select('*').eq('id', roomId).maybeSingle(),
        supabase.from('room_players').select('*').eq('room_id', roomId).order('slot_no', { ascending: true }),
        supabase.from('room_results').select('*').eq('room_id', roomId).order('placement', { ascending: true }),
      ])

      // If room not found via direct query, try RPC (for spectators)
      if (!roomRow) {
        const { data: roomData, error: rpcError } = await supabase.rpc('get_1v1_room_details', { p_room_id: roomId })
        const rpcResult = Array.isArray(roomData) ? roomData[0] : roomData
        if (rpcError || !rpcResult || !rpcResult.room) {
          setError('Could not load room.')
          setRoomId(null)
          setRoom(null)
          setPlayers([])
          setResults([])
          return
        }
        const r = rpcResult.room
        const mappedRoom: DuelRoomRow = {
          id: String(r.id || ''),
          host_user_id: String(r.host_user_id || ''),
          game_type: String(r.game_type || 'quiz') as DuelGameType,
          category: String(r.category || 'all') as DuelCategory,
          is_public: Boolean(r.is_public),
          join_code: r.join_code ? String(r.join_code) : null,
          rounds: Number(r.rounds || 5),
          question_set: r.question_set,
          status: String(r.status || 'waiting') as DuelRoomStatus,
          current_round: Number(r.current_round || 1),
          winner_user_id: r.winner_user_id ? String(r.winner_user_id) : null,
          rematch_room_id: r.rematch_room_id ? String(r.rematch_room_id) : null,
          created_at: String(r.created_at || ''),
          started_at: r.started_at ? String(r.started_at) : null,
        }
        const mappedPlayers: DuelRoomPlayerRow[] = (rpcResult.players || []).map((row: Record<string, unknown>) => ({
          id: String(row.id || ''),
          room_id: String(row.room_id || ''),
          user_id: String(row.user_id || ''),
          slot_no: Number(row.slot_no || 1),
          is_ready: Boolean(row.is_ready),
          score: Number(row.score || 0),
          total_time_ms: Number(row.total_time_ms || 0),
          fastest_round_ms: Number(row.fastest_round_ms || 0),
          current_round: Number(row.current_round || 1),
          last_seen: String(row.last_seen || ''),
        }))
        const mappedResults: DuelRoomResultRow[] = (rpcResult.results || []).map((row: Record<string, unknown>) => ({
          id: String(row.id || ''),
          room_id: String(row.room_id || ''),
          user_id: String(row.user_id || ''),
          score: Number(row.score || 0),
          total_time_ms: Number(row.total_time_ms || 0),
          placement: Number(row.placement || 2),
          is_winner: Boolean(row.is_winner),
        }))
        setRoom(mappedRoom)
        setPlayers(mappedPlayers)
        setResults(mappedResults)
        const userIds = mappedPlayers.map((p) => p.user_id)
        if (userIds.length > 0) {
          const { data: profileRows } = await supabase.from('profiles').select('user_id,username').in('user_id', userIds)
          const nameMap: Record<string, string> = {}
          ;(profileRows || []).forEach((row) => {
            const uid = String(row.user_id || '')
            nameMap[uid] = row.username || `User ${uid.slice(0, 8)}`
          })
          setUsernameByUserId(nameMap)
        }
        return
      }

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
        setRoomId(null)
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
        rematch_room_id: (roomRow as Record<string, unknown>).rematch_room_id ? String((roomRow as Record<string, unknown>).rematch_room_id) : null,
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
        fastest_round_ms: Number((row as Record<string, unknown>).fastest_round_ms || 0),
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
    } finally {
      refreshInFlightRef.current = false
      if (refreshQueuedRef.current) {
        refreshQueuedRef.current = false
        window.setTimeout(() => {
          void refreshRoomSnapshot()
        }, 60)
      }
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
    if (!isSignedIn || !showInviteModal) return
    void loadOnlineInviteUsers()
    const timer = window.setInterval(() => {
      void loadOnlineInviteUsers()
    }, 15000)
    return () => window.clearInterval(timer)
  }, [isSignedIn, loadOnlineInviteUsers, showInviteModal])

  useEffect(() => {
    if (inviteGameType === 'matching' && inviteCategory === 'scenarios') {
      setInviteCategory('all')
    }
  }, [inviteCategory, inviteGameType])

  useEffect(() => {
    if (!externalJoinRoomId) return
    if (roomId === externalJoinRoomId) {
      onExternalJoinHandled?.()
      return
    }
    setRoomId(externalJoinRoomId)
    setNotice('Invite accepted. Joined 1v1 room.')
    onExternalJoinHandled?.()
  }, [externalJoinRoomId, onExternalJoinHandled, roomId])

  useEffect(() => {
    if (!isSignedIn) return
    void loadDuelLeaderboards()
    const timer = window.setInterval(() => {
      void loadDuelLeaderboards()
    }, 18000)
    return () => window.clearInterval(timer)
  }, [isSignedIn, loadDuelLeaderboards])

  useEffect(() => {
    if (!roomId || !room || room.status !== 'waiting') {
      setWaitingChatMessages([])
      setWaitingChatInput('')
      return
    }
    void loadWaitingChatMessages(roomId)
  }, [loadWaitingChatMessages, room, roomId])

  useEffect(() => {
    if (!roomId || !room || room.status !== 'waiting') return
    const timer = window.setInterval(() => {
      void loadWaitingChatMessages(roomId)
    }, 6000)
    return () => window.clearInterval(timer)
  }, [loadWaitingChatMessages, room, roomId])

  useEffect(() => {
    if (waitingChatMessages.length === 0) return
    waitingChatEndRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [waitingChatMessages])

  useEffect(() => {
    const client = supabase
    if (!client || !roomId || !isSignedIn) {
        return
    }
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'duel_room_messages', filter: `room_id=eq.${roomId}` }, () => {
        void loadWaitingChatMessages(roomId)
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const ids = Object.keys(state)
        // Count spectators: users in presence but NOT in the player list
        const playerUserIds = livePlayersRef.current.map((player) => player.user_id)
        const spectatorIds = ids.filter(id => !playerUserIds.includes(id))
        setSpectatorCount(spectatorIds.length)
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
    }
  }, [currentUserId, isSignedIn, loadWaitingChatMessages, refreshRoomSnapshot, roomId])

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
  const isSpectator = useMemo(() => !myPlayer && players.length > 0 && room?.status === 'in_progress', [myPlayer, players, room])

  // Poll for updates when spectating (since realtime may not work due to RLS)
  useEffect(() => {
    if (!isSpectator || !roomId) return
    
    const pollInterval = window.setInterval(() => {
      void refreshRoomSnapshot()
    }, 3000) // Poll every 3 seconds
    
    return () => window.clearInterval(pollInterval)
  }, [isSpectator, roomId, refreshRoomSnapshot])

  // Helper to get player name from usernameByUserId lookup
  const getPlayerName = (userId: string, fallback: string) => usernameByUserId[userId] || fallback

  const currentRoundNumber = useMemo(() => {
    if (!room) return 1
    // For spectators, show the current round based on the room's current_round
    if (isSpectator) {
      return Math.max(1, Math.min(room.rounds, room.current_round))
    }
    return Math.max(1, Math.min(room.rounds, (myPlayer?.current_round || 1)))
  }, [isSpectator, myPlayer, room])

  const roundIndex = Math.max(0, currentRoundNumber - 1)
  const currentRound = roundList[roundIndex]
  const currentRoundPayloadNumber = isQuizRound(currentRound) || isMatchingRound(currentRound)
    ? currentRound.round
    : currentRoundNumber
  const initializedRoundKey = room && myPlayer
    ? `${room.id}:${room.game_type}:${room.status}:${room.started_at || ''}:${myPlayer.current_round}:${currentRoundPayloadNumber}`
    : ''
  const countdownSeconds = 3
  const countdownRemaining = useMemo(() => {
    if (!room || room.status !== 'in_progress') return 0
    const startedAtMs = room.started_at ? Date.parse(room.started_at) : NaN
    if (!Number.isFinite(startedAtMs)) return 0
    const remainingMs = countdownSeconds * 1000 - Math.max(0, hudNow - startedAtMs)
    if (remainingMs <= 0) return 0
    return Math.ceil(remainingMs / 1000)
  }, [hudNow, room])
  const countdownActive = countdownRemaining > 0

  const canStartRound = Boolean(
    room
    && myPlayer
    && room.status === 'in_progress'
    && myPlayer.current_round <= room.rounds
    && !countdownActive,
  )
  const quizRoundTimeLimitMs = useMemo(() => {
    if (!room || room.game_type !== 'quiz') return duelQuizRoundTimeLimitMs
    return room.category === 'scenarios' ? duelScenarioQuizRoundTimeLimitMs : duelQuizRoundTimeLimitMs
  }, [room])
  const quizRoundTimeLimitLabel = `${Math.round(quizRoundTimeLimitMs / 1000)}-second`

  const submitRound = useCallback(async (params: { round: number; correct: boolean; elapsedMs: number; points?: number }) => {
    if (!supabase || !roomId || submittingRound) return
    setSubmittingRound(true)
    setError('')
    try {
      const { error: rpcError } = await supabase.rpc('submit_1v1_round', {
        p_room_id: roomId,
        p_round: params.round,
        p_correct: params.correct,
        p_elapsed_ms: params.elapsedMs,
        p_points: typeof params.points === 'number' ? params.points : null,
      })

      if (rpcError) {
        setError(rpcError.message || 'Could not submit round.')
        if (room?.status === 'in_progress' && room.game_type === 'quiz') {
          setQuizLocked(false)
          setQuizChoice(null)
        }
        if (room?.status === 'in_progress' && room.game_type === 'matching') {
          setMatchingSubmitted(false)
        }
        return
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not submit round.'
      setError(message)
      if (room?.status === 'in_progress' && room.game_type === 'quiz') {
        setQuizLocked(false)
        setQuizChoice(null)
      }
      if (room?.status === 'in_progress' && room.game_type === 'matching') {
        setMatchingSubmitted(false)
      }
    } finally {
      setSubmittingRound(false)
    }
  }, [room?.game_type, room?.status, roomId, submittingRound])

  const triggerAutoForfeit = useCallback(async (roundKey: string, reason: 'question' | 'matching' = 'question') => {
    if (!supabase || !roomId || !roundKey) return
    if (autoForfeitRoundKeyRef.current === roundKey) return
    autoForfeitRoundKeyRef.current = roundKey
    setQuizLocked(true)
    setNotice(
      reason === 'matching'
        ? '30-second round limit reached. You forfeited the match.'
        : `${quizRoundTimeLimitLabel} question limit reached. You forfeited the match.`,
    )

    const { error: rpcError } = await supabase.rpc('forfeit_1v1_match', { p_room_id: roomId })
    if (rpcError) {
      const normalized = String(rpcError.message || '').toLowerCase()
      if (!normalized.includes('already') && !normalized.includes('completed') && !normalized.includes('not found')) {
        setError(rpcError.message || 'Could not auto-forfeit match.')
      }
      return
    }

    void refreshRoomSnapshot()
  }, [quizRoundTimeLimitLabel, refreshRoomSnapshot, roomId])

  const submitQuizAnswer = useCallback((choiceIndex: number) => {
    if (!room || room.status !== 'in_progress' || room.game_type !== 'quiz') return
    if (!canStartRound || !isQuizRound(currentRound) || quizLocked || submittingRound) return

    const correct = choiceIndex === currentRound.correctIndex
    const elapsedMs = Math.max(0, Date.now() - roundStartedAt)
    const nextSample: QuizSpamSample = {
      round: currentRound.round,
      choiceIndex,
      correct,
      elapsedMs,
    }

    const updatedHistory = [...quizSpamHistoryRef.current, nextSample].slice(-8)
    quizSpamHistoryRef.current = updatedHistory

    const spamWindow = updatedHistory.slice(-5)
    const hasSpamWindow = spamWindow.length === 5
    const repeatedSingleChoice = hasSpamWindow && spamWindow.every((sample) => sample.choiceIndex === spamWindow[0].choiceIndex)
    const wrongCount = hasSpamWindow ? spamWindow.filter((sample) => !sample.correct).length : 0
    const avgElapsedMs = hasSpamWindow
      ? spamWindow.reduce((sum, sample) => sum + sample.elapsedMs, 0) / spamWindow.length
      : 0
    const looksLikeSpam = Boolean(
      hasSpamWindow
      && repeatedSingleChoice
      && wrongCount >= 3
      && avgElapsedMs <= 1300,
    )

    markStudyActivity()
    setQuizChoice(choiceIndex)
    setQuizLocked(true)

    if (looksLikeSpam) {
      quizSpamStrikeRef.current += 1
      if (quizSpamStrikeRef.current >= 2) {
        setNotice('Spam detected twice. You forfeited this 1v1 match.')
        void triggerAutoForfeit(`${room.id}:${currentRound.round}:spam:${quizSpamStrikeRef.current}`)
        return
      }
      setNotice('Spam pattern detected. This answer is penalized as incorrect. Another trigger will forfeit.')
      void submitRound({ round: currentRound.round, correct: false, elapsedMs })
      return
    }

    void submitRound({ round: currentRound.round, correct, elapsedMs })
  }, [
    canStartRound,
    currentRound,
    markStudyActivity,
    quizLocked,
    room,
    roundStartedAt,
    submitRound,
    submittingRound,
    triggerAutoForfeit,
  ])

  useEffect(() => {
    if (!room || !myPlayer || !canStartRound) return
    if (!initializedRoundKey) return
    if (initializedRoundKeyRef.current === initializedRoundKey) return
    initializedRoundKeyRef.current = initializedRoundKey

    setRoundStartedAt(Date.now())
    autoForfeitRoundKeyRef.current = ''
    if (room.game_type === 'quiz' && myPlayer.current_round <= 1) {
      quizSpamHistoryRef.current = []
      quizSpamStrikeRef.current = 0
    }
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
  }, [canStartRound, currentRound, initializedRoundKey, myPlayer, room])

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

  const openInviteModal = () => {
    setInviteGameType(selectedGameType)
    setInviteCategory(selectedCategory)
    setInviteQuizRounds(selectedQuizRounds)
    setShowInviteModal(true)
    setError('')
    setNotice('')
  }

  const sendInvite = async (targetUser: OnlineInviteUser) => {
    if (!supabase || !isSignedIn) return
    setInviteSendingUserId(targetUser.user_id)
    setError('')
    setNotice('')
    const inviteRounds = inviteGameType === 'quiz' ? inviteQuizRounds : 5
    const { data, error: rpcError } = await supabase.rpc('create_1v1_invite', {
      p_target_user_id: targetUser.user_id,
      p_game_type: inviteGameType,
      p_category: inviteCategory,
      p_rounds: inviteRounds,
    })
    setInviteSendingUserId(null)
    if (rpcError) {
      setError(rpcError.message || 'Could not send invite.')
      return
    }
    const payload = Array.isArray(data) ? data[0] : data
    const nextRoomId = payload && typeof payload === 'object'
      ? String((payload as Record<string, unknown>).room_id || '')
      : ''
    const nextInviteId = payload && typeof payload === 'object'
      ? String((payload as Record<string, unknown>).invite_id || '')
      : ''
    if (!nextRoomId) {
      setError('Invite was sent but room id was missing.')
      return
    }

    if (supabase) {
      const broadcastChannel = supabase.channel('duel-invite-broadcast')
      await new Promise<void>((resolve) => {
        let done = false
        const finish = () => {
          if (done) return
          done = true
          resolve()
        }
        broadcastChannel.subscribe((status) => {
          if (status === 'SUBSCRIBED' || status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
            finish()
          }
        })
        window.setTimeout(finish, 350)
      })

      void broadcastChannel.send({
        type: 'broadcast',
        event: 'duel-invite-created',
        payload: {
          target_user_id: targetUser.user_id,
          sender_user_id: currentUserId,
          invite_id: nextInviteId || null,
          room_id: nextRoomId,
          sent_at: new Date().toISOString(),
        },
      })
      void supabase.removeChannel(broadcastChannel)
    }

    setShowInviteModal(false)
    setRoomId(nextRoomId)
    setNotice(`Invite sent to ${targetUser.username}. Waiting for response.`)
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

  const joinPublicRoom = async (targetRoomId: string, asSpectator: boolean = false) => {
    if (!supabase || !isSignedIn) return
    
    // For spectators, just enter the room directly without joining as a player
    if (asSpectator) {
      setRoomId(targetRoomId)
      setNotice('Spectating room.')
      return
    }
    
    // Regular join - try to become a player
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
    const previousRoomStatus = room?.status
    const { data, error: rpcError } = await supabase.rpc('set_1v1_ready', { p_room_id: roomId, p_ready: ready })
    if (rpcError) {
      setError(rpcError.message || 'Could not update ready status.')
      return
    }

    const state = parseReadyRpcState(data)
    void refreshRoomSnapshot()

    if (state.rematch_started) {
      setNotice('2/2 agreed. Starting rematch in 3…')
      return
    }

    if (previousRoomStatus === 'completed' || state.status === 'completed') {
      if (ready) {
        const readyCount = state.ready_count ?? 1
        setNotice(`${Math.min(2, Math.max(0, readyCount))}/2 agreed. Waiting for opponent…`)
      } else {
        setNotice('Rematch vote removed.')
      }
      return
    }

    if ((previousRoomStatus === 'waiting' || state.status === 'waiting') && ready && state.player_count === 2 && state.ready_count === 2) {
      setNotice('2/2 ready. Match starts in 3…')
    }
  }

  const handleMatchingCardClick = (cardId: string) => {
    if (!canStartRound || !room || room.game_type !== 'matching' || matchingSubmitted) return
    if (selectedMatchingCards.length >= 2) return  // Guard against selecting more than 2
    const card = matchingCards.find((item) => item.id === cardId)
    if (!card || matchedPairIds.includes(card.pairId)) return
    // Prevent unchecking by checking if already selected - just ignore
    if (selectedMatchingCards.includes(cardId)) return
    markStudyActivity()
    setSelectedMatchingCards((previous) => {
      if (previous.includes(cardId)) return previous
      if (previous.length >= 2) return previous
      return [...previous, cardId]
    })
  }

  // Keyboard shortcuts for 1v1 quiz (1-4 keys to answer)
  useEffect(() => {
    if (!room || room.status !== 'in_progress' || room.game_type !== 'quiz') return
    if (!canStartRound || !isQuizRound(currentRound) || quizLocked || submittingRound) return

    const handleQuizKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      const key = event.key
      if (key >= '1' && key <= '4') {
        const index = parseInt(key) - 1
        if (currentRound.choices && index < currentRound.choices.length) {
          event.preventDefault()
          submitQuizAnswer(index)
        }
      }
    }

    window.addEventListener('keydown', handleQuizKeyDown)
    return () => window.removeEventListener('keydown', handleQuizKeyDown)
  }, [room, currentRound, canStartRound, quizLocked, submittingRound, submitQuizAnswer])

  useEffect(() => {
    if (!room || !myPlayer || room.status !== 'in_progress' || room.game_type !== 'quiz') return
    if (isSpectator || !canStartRound || !isQuizRound(currentRound) || quizLocked || submittingRound) return
    if (roundStartedAt <= 0) return

    const roundKey = `${room.id}:${myPlayer.user_id}:${currentRound.round}`
    const elapsedMs = Math.max(0, Date.now() - roundStartedAt)
    const remainingMs = quizRoundTimeLimitMs - elapsedMs

    if (remainingMs <= 0) {
      void triggerAutoForfeit(roundKey, 'question')
      return
    }

    const timer = window.setTimeout(() => {
      void triggerAutoForfeit(roundKey, 'question')
    }, remainingMs)

    return () => window.clearTimeout(timer)
  }, [
    canStartRound,
    currentRound,
    isSpectator,
    myPlayer,
    quizLocked,
    room,
    roundStartedAt,
    submittingRound,
    triggerAutoForfeit,
    quizRoundTimeLimitMs,
  ])

  useEffect(() => {
    if (!room || !myPlayer || room.status !== 'in_progress' || room.game_type !== 'matching') return
    if (isSpectator || !canStartRound || !isMatchingRound(currentRound) || matchingSubmitted || submittingRound) return
    if (roundStartedAt <= 0) return

    const roundKey = `${room.id}:${myPlayer.user_id}:${currentRound.round}:matching`
    const elapsedMs = Math.max(0, Date.now() - roundStartedAt)
    const remainingMs = duelQuizRoundTimeLimitMs - elapsedMs

    if (remainingMs <= 0) {
      void triggerAutoForfeit(roundKey, 'matching')
      return
    }

    const timer = window.setTimeout(() => {
      void triggerAutoForfeit(roundKey, 'matching')
    }, remainingMs)

    return () => window.clearTimeout(timer)
  }, [
    canStartRound,
    currentRound,
    isSpectator,
    matchingSubmitted,
    myPlayer,
    room,
    roundStartedAt,
    submittingRound,
    triggerAutoForfeit,
  ])

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

  const leaveRoom = useCallback(() => {
    initializedRoundKeyRef.current = ''
    autoForfeitRoundKeyRef.current = ''
    quizSpamHistoryRef.current = []
    quizSpamStrikeRef.current = 0
    setRoomId(null)
    setRoom(null)
    setPlayers([])
    setResults([])
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
    setRematchLoading(false)
    setWaitingChatMessages([])
    setWaitingChatInput('')
    setWaitingChatSending(false)
    setActivityLog([])
    previousPlayersRef.current = []
    previousRoomStatusRef.current = null
    activityBootstrappedRef.current = false
    setError('')
    setNotice('')
  }, [])

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

  const cancelOutgoingPendingInviteForRoom = useCallback(async (targetRoomId: string) => {
    if (!supabase || !targetRoomId || !currentUserId) return
    const { error: inviteCancelError } = await supabase
      .from('duel_invites')
      .update({
        status: 'cancelled',
        responded_at: new Date().toISOString(),
      })
      .eq('room_id', targetRoomId)
      .eq('sender_user_id', currentUserId)
      .eq('status', 'pending')

    if (inviteCancelError) {
      console.warn('[1v1] Could not cancel pending invites for room leave:', inviteCancelError.message)
    }
  }, [currentUserId])

  const leaveCurrentRoom = async () => {
    if (!room || !roomId) {
      leaveRoom()
      return
    }

    if (room.status === 'in_progress') {
      await confirmLeaveMatch()
      return
    }

    await cancelOutgoingPendingInviteForRoom(roomId)

    if (supabase) {
      const { error: rpcError } = await supabase.rpc('leave_1v1_room', { p_room_id: roomId })
      if (rpcError) {
        setError(rpcError.message || 'Could not leave room.')
        return
      }
    }

    leaveRoom()
    await loadPublicRooms()
    setNotice('Left room.')
  }

  const deleteRoomById = useCallback(async (targetRoomId: string, options?: { skipConfirm?: boolean; quiet?: boolean }) => {
    if (!supabase || !targetRoomId) return
    if (!options?.skipConfirm) {
      const confirmed = window.confirm('Delete this room? This cannot be undone.')
      if (!confirmed) return
    }

    setDeletingRoomId(targetRoomId)
    setError('')
    const { error: rpcError } = await supabase.rpc('delete_1v1_room', { p_room_id: targetRoomId })
    setDeletingRoomId(null)

    if (rpcError) {
      const normalizedMessage = String(rpcError.message || '').toLowerCase()
      if (options?.quiet && normalizedMessage.includes('room not found')) {
        if (roomId === targetRoomId) {
          leaveRoom()
        }
        return
      }
      setError(rpcError.message || 'Could not delete room.')
      return
    }

    if (roomId === targetRoomId) {
      leaveRoom()
    }

    await loadPublicRooms()
    if (!options?.quiet) {
      setNotice('Room deleted.')
    }
  }, [leaveRoom, loadPublicRooms, roomId])

  const toggleRematchVote = async () => {
    if (!room || room.status !== 'completed') return
    const nextReadyState = !myPlayer?.is_ready
    setRematchLoading(true)
    await setReady(nextReadyState)
    setRematchLoading(false)
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
  const rematchReadyCount = room?.status === 'completed' ? players.filter((player) => player.is_ready).length : 0
  const myRematchRequested = room?.status === 'completed' ? Boolean(myPlayer?.is_ready) : false
  const rematchStatusText = room?.status === 'completed'
    ? rematchReadyCount >= 2
      ? '2/2 agreed. Starting rematch…'
      : rematchReadyCount === 1
        ? '1/2 agreed. Waiting for opponent…'
        : 'Both players must agree to start a rematch.'
    : ''
  const waitingChatSendDisabled = waitingChatSending || !waitingChatInput.trim() || !room || room.status !== 'waiting'
  const inviteGameLabel = inviteGameType === 'quiz' ? 'Quiz' : 'Matching'
  const inviteCategoryLabel = inviteCategory === 'all'
    ? 'ALL'
    : inviteCategory === 'pc'
      ? 'PC'
      : inviteCategory === 'vc'
        ? 'VC'
        : inviteCategory === 'hs'
          ? 'HS'
          : 'Scenarios'
  const inRoom = Boolean(room && roomId)
  // const waitingPlayersCount = players.length
  // const waitingStatusMessage = waitingPlayersCount < 2
  //   ? `Waiting for ${2 - waitingPlayersCount} more player${2 - waitingPlayersCount === 1 ? '' : 's'} to join.`
  //   : lobbyReadyCount < 2
  //     ? 'Both players joined. Waiting for both players to ready up.'
  //     : 'Both players are ready. Match countdown starting…'

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

  const quizRoundRemainingMs = useMemo(() => {
    if (!room || room.status !== 'in_progress' || room.game_type !== 'quiz') return 0
    if (!canStartRound || !isQuizRound(currentRound) || roundStartedAt <= 0) return 0
    return Math.max(0, quizRoundTimeLimitMs - Math.max(0, hudNow - roundStartedAt))
  }, [canStartRound, currentRound, hudNow, room, roundStartedAt, quizRoundTimeLimitMs])

  const quizRoundRemainingSeconds = quizRoundRemainingMs > 0 ? Math.ceil(quizRoundRemainingMs / 1000) : 0
  const matchingRoundRemainingMs = useMemo(() => {
    if (!room || room.status !== 'in_progress' || room.game_type !== 'matching') return 0
    if (!canStartRound || !isMatchingRound(currentRound) || matchingSubmitted || roundStartedAt <= 0) return 0
    return Math.max(0, duelQuizRoundTimeLimitMs - Math.max(0, hudNow - roundStartedAt))
  }, [canStartRound, currentRound, hudNow, matchingSubmitted, room, roundStartedAt])
  const matchingRoundRemainingSeconds = matchingRoundRemainingMs > 0 ? Math.ceil(matchingRoundRemainingMs / 1000) : 0

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
  // const canDeleteCurrentRoom = Boolean(room && (room.host_user_id === currentUserId || isOwner))
  const topCurrentStreakEntry = streakLeaderboard.length > 0 ? streakLeaderboard[0] : null
  const topCurrentStreakUserId = topCurrentStreakEntry ? topCurrentStreakEntry.user_id : null
  const topCurrentStreakValue = topCurrentStreakEntry ? topCurrentStreakEntry.current_win_streak : 0
  const remainingStreakLeaderboard = topCurrentStreakEntry
    ? streakLeaderboard.filter((entry) => entry.user_id !== topCurrentStreakEntry.user_id)
    : streakLeaderboard
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

  const opponentProgressPercent = useMemo(() => {
    if (!room || room.rounds <= 0) return 0
    const ratio = Math.max(0, Math.min(1, opponentRoundsCompleted / room.rounds))
    return Math.round(ratio * 100)
  }, [opponentRoundsCompleted, room])

  const opponentRoundStatus = useMemo(() => {
    if (!room || !opponentPlayer) return 'Waiting for opponent'
    if (opponentRoundsCompleted >= room.rounds) return 'Answered'
    if (opponentRoundsCompleted > myRoundsCompleted) return 'Answered'
    if (opponentRoundHud > myRoundHud) return 'Answered'
    return 'Not answered'
  }, [myRoundHud, myRoundsCompleted, opponentPlayer, opponentRoundHud, opponentRoundsCompleted, room])

  const playerByUserId = useMemo(() => {
    const map = new Map<string, DuelRoomPlayerRow>()
    players.forEach((player) => map.set(player.user_id, player))
    return map
  }, [players])

  const tieBreakerDecision = useMemo(() => {
    if (!myResultRow || !opponentResultRow) return null
    if (myResultRow.score !== opponentResultRow.score) {
      return {
        rule: 'Score',
        summary: myResultRow.score > opponentResultRow.score ? 'You win by score.' : 'Opponent wins by score.',
      }
    }
    if (myResultRow.total_time_ms !== opponentResultRow.total_time_ms) {
      return {
        rule: 'Total Time',
        summary: myResultRow.total_time_ms < opponentResultRow.total_time_ms ? 'You win on lower total time.' : 'Opponent wins on lower total time.',
      }
    }

    const myFastest = playerByUserId.get(myResultRow.user_id)?.fastest_round_ms || 0
    const opponentFastest = playerByUserId.get(opponentResultRow.user_id)?.fastest_round_ms || 0
    const normalizedMine = myFastest > 0 ? myFastest : Number.MAX_SAFE_INTEGER
    const normalizedOpponent = opponentFastest > 0 ? opponentFastest : Number.MAX_SAFE_INTEGER
    if (normalizedMine !== normalizedOpponent) {
      return {
        rule: 'Fastest Single Round',
        summary: normalizedMine < normalizedOpponent ? 'You win on fastest single round.' : 'Opponent wins on fastest single round.',
      }
    }

    return {
      rule: 'Draw',
      summary: 'Draw after all tie-breakers.',
    }
  }, [myResultRow, opponentResultRow, playerByUserId])

  const myFastestRoundMs = myResultRow ? playerByUserId.get(myResultRow.user_id)?.fastest_round_ms || 0 : 0
  const opponentFastestRoundMs = opponentResultRow ? playerByUserId.get(opponentResultRow.user_id)?.fastest_round_ms || 0 : 0

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
    // Refresh room to get updated player states (is_ready reset after game ends)
    void refreshRoomSnapshot()
  }, [loadDuelLeaderboards, loadPublicRooms, room, refreshRoomSnapshot])

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

	                <div className="onevone-rail-spotlight">
	                  <p className="muted tiny">Biggest Current Streak</p>
	                  {topCurrentStreakEntry ? (
	                    <button
	                      type="button"
	                      className="onevone-rail-button onevone-spotlight-row"
	                      aria-label={`View ${topCurrentStreakEntry.username} profile`}
	                      onClick={() => setSelectedDuelProfileUserId(topCurrentStreakEntry.user_id)}
	                    >
	                      <div className="onevone-spotlight-user">
	                        <img
	                          src={topCurrentStreakEntry.avatarUrl}
	                          alt={topCurrentStreakEntry.username}
	                          className="onevone-spotlight-avatar"
	                          onError={handleAvatarImageError}
	                        />
	                        <div className="onevone-spotlight-copy">
	                          <span
	                            className={`onevone-rail-name ${displayNameClass(topCurrentStreakEntry.supporterTier, true)}`}
	                            style={displayNameStyle(topCurrentStreakEntry.nameStyle, topCurrentStreakEntry.supporterTier)}
	                          >
	                            {topCurrentStreakEntry.username}
	                          </span>
	                          <small>{topCurrentStreakEntry.wins} wins • {topCurrentStreakEntry.losses} losses</small>
	                        </div>
	                      </div>
	                      <span className="onevone-streak-chip">
	                        <span className="onevone-streak-fire" aria-hidden>🔥</span>
	                        {topCurrentStreakEntry.current_win_streak}
	                      </span>
	                    </button>
	                  ) : (
	                    <p className="muted tiny onevone-spotlight-empty">Win two in a row to appear here.</p>
	                  )}
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
                          <span className="onevone-rail-name-wrap">
                            <span
                              className={`onevone-rail-name ${displayNameClass(entry.supporterTier, true)}`}
                              style={displayNameStyle(entry.nameStyle, entry.supporterTier)}
                            >
                              {entry.username}
                            </span>
                            {entry.current_win_streak > 0 ? (
                              <span className="onevone-inline-streak" aria-label={`Current win streak ${entry.current_win_streak}`}>
                                <span className="onevone-streak-fire" aria-hidden>🔥</span>
                                {entry.current_win_streak}
                              </span>
                            ) : null}
                          </span>
                          <strong>{entry.wins}</strong>
                        </button>
                      ))}
                    </div>
                  )}
	                </div>

	                <div className="onevone-rail-section">
	                  <p className="muted tiny">Streak Board</p>
	                  {remainingStreakLeaderboard.length === 0 ? <p className="muted tiny">No additional streaks yet.</p> : (
	                    <div className="onevone-rail-list">
	                      {remainingStreakLeaderboard.map((entry, index) => (
	                        <button
	                          type="button"
	                          key={`duel-streak-${entry.user_id}`}
	                          className="onevone-rail-row onevone-rail-button"
	                          aria-label={`View ${entry.username} profile`}
                          onClick={() => setSelectedDuelProfileUserId(entry.user_id)}
                        >
	                          <span className="onevone-rail-rank">#{index + 2}</span>
                          <img src={entry.avatarUrl} alt={entry.username} className="onevone-rail-avatar" onError={handleAvatarImageError} />
                          <span className="onevone-rail-name-wrap">
                            <span
	                              className={`onevone-rail-name ${displayNameClass(entry.supporterTier, true)}`}
	                              style={displayNameStyle(entry.nameStyle, entry.supporterTier)}
	                            >
	                              {entry.username}
	                            </span>
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
                  <button
                    className="secondary onevone-invite-cta"
                    type="button"
                    onClick={openInviteModal}
                    disabled={loading || !supabase}
                  >
                    <span>Invite a Friend</span>
                    <small>Send a direct 1v1 invite to someone online now.</small>
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
                {publicRooms.length === 0 ? <p className="muted">No public rooms available right now.</p> : null}
                <div className="onevone-public-list">
                  {publicRooms.map((item) => {
                    const isActive = item.status === 'in_progress'
                    const hasPlayers = item.player_count > 0
                    const playersList = item.players || []
                    const canDeleteRoom = item.host_user_id === currentUserId || isOwner
                    const canJoin = item.player_count < 2 && !isActive
                    const canSpectate = hasPlayers && isActive

                    // Build player display
                    const playerDisplay = playersList.map(p => p.display_name).join(' vs ') || 'Waiting for players'
                    const statusLabel = isActive ? '🔴 Live' : '🟢 Waiting'

                    return (
                      <div key={item.id} className={`onevone-public-item ${isActive ? 'active-room' : ''}`}>
                        <div>
                          <strong>{playerDisplay}</strong>
                          <p className="muted tiny">
                            {statusLabel} • {item.game_type === 'quiz' ? 'Quiz' : 'Matching'} • {item.category.toUpperCase()} • {item.rounds} questions
                          </p>
                        </div>
                        <div className="onevone-public-actions">
                          {canSpectate ? (
                            <button className="primary" onClick={() => void joinPublicRoom(item.id, true)} disabled={loading}>
                              Spectate
                            </button>
                          ) : (
                            <button className="primary" onClick={() => void joinPublicRoom(item.id)} disabled={loading || !canJoin}>
                              Join
                            </button>
                          )}
                          {canDeleteRoom ? (
                            <button
                              className="secondary"
                              onClick={() => void deleteRoomById(item.id)}
                              disabled={loading || deletingRoomId === item.id}
                            >
                              Delete
                            </button>
                          ) : null}
                        </div>
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
              <button className="secondary cancel-button" type="button" onClick={() => setShowCreateRoomModal(false)} disabled={loading}>
                Cancel
              </button>
              <button className="primary" type="button" onClick={createRoom} disabled={loading || !supabase}>
                Create Room
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!inRoom && showInviteModal ? (
        <div
          className="profile-modal-overlay game-setup-overlay"
          onClick={() => setShowInviteModal(false)}
        >
          <div className="card game-settings-modal onevone-invite-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Invite a Friend</h3>
            <div className="onevone-invite-modal-body">
              <div className="onevone-online-list-wrap">
                <div className="onevone-online-list-head">
                  <p className="muted tiny">Online Now ({onlineInviteUsers.length})</p>
                  <button className="secondary" type="button" onClick={() => void loadOnlineInviteUsers()} disabled={onlineInviteLoading}>
                    Refresh
                  </button>
                </div>

                <div className="onevone-online-list">
                  {onlineInviteUsers.length === 0 ? (
                    <p className="muted tiny onevone-online-empty">
                      {onlineInviteLoading ? 'Loading online users…' : 'No one is online right now.'}
                    </p>
                  ) : (
                    <>
                    {onlineInviteUsers.map((user) => (
                      <article key={`online-user-${user.user_id}`} className="onevone-online-row">
                        <div className="onevone-online-user">
                          <img src={user.avatarUrl} alt={user.username} className="onevone-online-avatar" onError={handleAvatarImageError} />
                          <div className="onevone-online-copy">
                            <strong>{user.username}</strong>
                            <span className="muted tiny">
                              Invite: {inviteGameLabel} • {inviteCategoryLabel}
                              {inviteGameType === 'quiz' ? ` • ${inviteQuizRounds} questions` : ''}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="primary"
                          onClick={() => void sendInvite(user)}
                          disabled={Boolean(inviteSendingUserId)}
                        >
                          {inviteSendingUserId === user.user_id ? 'Sending…' : 'Send Invite'}
                        </button>
                      </article>
                    ))}
                    </>
                  )}
                </div>
              </div>

              <div className="onevone-invite-settings">
                <p className="muted tiny">
                  Pick game settings, then send an invite to someone currently online.
                </p>
                <label className="game-control">
                  Game Mode
                  <div className="segmented">
                    <button
                      type="button"
                      className={inviteGameType === 'quiz' ? 'seg active' : 'seg'}
                      onClick={() => setInviteGameType('quiz')}
                    >
                      1v1 Quiz
                    </button>
                    <button
                      type="button"
                      className={inviteGameType === 'matching' ? 'seg active' : 'seg'}
                      onClick={() => {
                        setInviteGameType('matching')
                        if (inviteCategory === 'scenarios') setInviteCategory('all')
                      }}
                    >
                      1v1 Matching
                    </button>
                  </div>
                </label>
                <label className="game-control">
                  Category
                  <div className="segmented">
                    {duelCategoryOptions
                      .filter((option) => !(inviteGameType === 'matching' && option.quizOnly))
                      .map((option) => (
                        <button
                          key={`invite-category-${option.value}`}
                          type="button"
                          className={inviteCategory === option.value ? 'seg active' : 'seg'}
                          onClick={() => setInviteCategory(option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                  </div>
                </label>
                {inviteGameType === 'quiz' ? (
                  <label className="game-control">
                    Questions
                    <div className="segmented">
                      {duelQuizRoundOptions.map((count) => (
                        <button
                          key={`invite-rounds-${count}`}
                          type="button"
                          className={inviteQuizRounds === count ? 'seg active' : 'seg'}
                          onClick={() => setInviteQuizRounds(count)}
                        >
                          {count}
                        </button>
                      ))}
                    </div>
                  </label>
                ) : null}
              </div>
            </div>

            <div className="actions-row">
              <button className="secondary" type="button" onClick={() => setShowInviteModal(false)} disabled={Boolean(inviteSendingUserId)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {inRoom && room ? (
        <>
          {room.status !== 'completed' && room.status !== 'waiting' ? (
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
            <div className="onevone-waiting-room">
              <div className="onevone-waiting-title">
                <h2>{room.game_type === 'quiz' ? '1v1 Quiz' : '1v1 Matching'}</h2>
                <p className="muted">{room.rounds} rounds · {room.category.toUpperCase()}</p>
              </div>

              <div className="onevone-waiting-players">
                <div className={`onevone-player-slot ${myPlayer ? 'filled' : ''}`}>
                  <span className="onevone-player-slot-label">You</span>
                  {myPlayer ? (
                    <>
                      <span className="onevone-player-slot-name">{currentUsername}</span>
                      <span className={`onevone-player-slot-status ${myPlayer.is_ready ? 'ready' : ''}`}>
                        {myPlayer.is_ready ? 'Ready' : 'Waiting'}
                      </span>
                    </>
                  ) : (
                    <span className="onevone-player-slot-empty">Waiting...</span>
                  )}
                </div>

                <div className="onevone-waiting-vs">VS</div>

                <div className={`onevone-player-slot ${opponentPlayer ? 'filled' : ''}`}>
                  <span className="onevone-player-slot-label">Opponent</span>
                  {opponentPlayer ? (
                    <>
                      <span className="onevone-player-slot-name">
                        {usernameByUserId[opponentPlayer.user_id] || 'Player'}
                      </span>
                      <span className={`onevone-player-slot-status ${opponentPlayer.is_ready ? 'ready' : ''}`}>
                        {opponentPlayer.is_ready ? 'Ready' : 'Waiting'}
                      </span>
                    </>
                  ) : (
                    <span className="onevone-player-slot-empty">Waiting...</span>
                  )}
                </div>
              </div>

              <div className="onevone-waiting-footer">
                {lobbyReadyCount < 2 ? (
                  <p className="muted">Waiting for both players to ready up...</p>
                ) : (
                  <p className="good">Match starting soon!</p>
                )}
                <div className="onevone-waiting-buttons">
                  <button 
                    className={`primary ${myPlayer?.is_ready ? 'ready' : ''}`}
                    onClick={() => void setReady(!myPlayer?.is_ready)}
                  >
                    {myPlayer?.is_ready ? 'Ready!' : 'Ready Up'}
                  </button>
                  <button className="secondary" onClick={() => void leaveCurrentRoom()}>Leave</button>
                </div>
                <div className="onevone-waiting-chat">
                  <div className="onevone-waiting-chat-head">
                    <strong>Room Chat</strong>
                    <span className="muted tiny">Only you and your opponent can see this.</span>
                  </div>
                  <div className="onevone-waiting-chat-list">
                    {waitingChatMessages.length === 0 ? (
                      <p className="onevone-waiting-chat-empty muted tiny">No messages yet. Say hi before the match starts.</p>
                    ) : waitingChatMessages.map((entry) => {
                      const isMine = entry.user_id === currentUserId
                      return (
                        <article key={entry.id} className={`onevone-waiting-chat-message ${isMine ? 'own' : ''}`}>
                          <div className="onevone-waiting-chat-meta">
                            <span>{isMine ? 'You' : entry.display_name}</span>
                            <small className="muted">{formatActivityTime(Date.parse(entry.created_at))}</small>
                          </div>
                          <p>{entry.message}</p>
                        </article>
                      )
                    })}
                    <div ref={waitingChatEndRef} />
                  </div>
                  <div className="onevone-waiting-chat-input">
                    <input
                      type="text"
                      value={waitingChatInput}
                      onChange={(event) => setWaitingChatInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return
                        event.preventDefault()
                        void sendWaitingChatMessage()
                      }}
                      maxLength={240}
                      placeholder="Send a message..."
                    />
                    <button
                      type="button"
                      className="primary"
                      disabled={waitingChatSendDisabled}
                      onClick={() => void sendWaitingChatMessage()}
                    >
                      {waitingChatSending ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {room.status === 'in_progress' && room.game_type === 'quiz' ? (
            <div className="speed-session-overlay onevone-quiz-overlay">
              <div className="speed-session-shell onevone-quiz-shell">
                {isSpectator && (
                  <div className="onevone-spectator-banner">
                    <span>👁️ You are spectating</span>
                    <span className="muted tiny">{players[0] ? usernameByUserId[players[0].user_id] || 'Player 1' : 'Player 1'} vs {players[1] ? usernameByUserId[players[1].user_id] || 'Player 2' : 'Player 2'}</span>
                  </div>
                )}
                {/* Dual player live view for spectators */}
                {isSpectator && players.length === 2 && (
                  <div className="onevone-dual-player-view">
                    <div className="onevone-player-live-card">
                      <div className="onevone-player-live-header">
                        <strong>{getPlayerName(players[0]?.user_id, 'Player 1')}</strong>
                        <span className="muted tiny">Round {players[0]?.current_round || 1}/{room.rounds}</span>
                      </div>
                      <div className="onevone-player-live-score">
                        <span>{players[0]?.score ?? 0} pts</span>
                      </div>
                    </div>
                    <div className="onevone-player-live-card">
                      <div className="onevone-player-live-header">
                        <strong>{getPlayerName(players[1]?.user_id, 'Player 2')}</strong>
                        <span className="muted tiny">Round {players[1]?.current_round || 1}/{room.rounds}</span>
                      </div>
                      <div className="onevone-player-live-score">
                        <span>{players[1]?.score ?? 0} pts</span>
                      </div>
                    </div>
                  </div>
                )}
                <div className="speed-session-controls onevone-session-controls">
                  <button className="secondary speed-exit-button onevone-leave-button" onClick={() => void confirmLeaveMatch()}>
                    {isSpectator ? 'Stop Spectating' : 'Leave Match'}
                  </button>
                </div>
                <div className="onevone-hud-grid">
                  <div className="onevone-hud-chip">
                    <small className="muted">Round</small>
                    <strong>{isSpectator ? `Round ${room.current_round}` : `${myRoundHud}/${room.rounds}`} / {room.rounds}</strong>
                  </div>
                  <div className="onevone-hud-chip">
                    <small className="muted">Scores</small>
                    <strong>{getPlayerName(players[0]?.user_id, 'P1')}: {players[0]?.score ?? 0} • {getPlayerName(players[1]?.user_id, 'P2')}: {players[1]?.score ?? 0}</strong>
                  </div>
                  <div className="onevone-hud-chip">
                    <small className="muted">Elapsed</small>
                    <strong>{formatClock(elapsedMs)}</strong>
                  </div>
                  {!isSpectator ? (
                    <div className="onevone-hud-chip">
                      <small className="muted">Question Timer</small>
                      <strong>{quizRoundRemainingSeconds > 0 ? `${quizRoundRemainingSeconds}s` : '0s'}</strong>
                    </div>
                  ) : null}
                  {!isSpectator && spectatorCount > 0 && (
                    <div className="onevone-hud-chip spectator-count">
                      <small className="muted">Watchers</small>
                      <strong>👁 {spectatorCount}</strong>
                    </div>
                  )}
                  {isSpectator ? (
                    <div className="onevone-hud-chip">
                      <small className="muted">Progress</small>
                      <div className="onevone-progress-row">
                        <strong>{players[0]?.current_round || 1}/{room.rounds}</strong>
                        <span className="muted tiny">vs</span>
                        <strong>{players[1]?.current_round || 1}/{room.rounds}</strong>
                      </div>
                    </div>
                  ) : (
                  <div className="onevone-hud-chip">
                    <small className="muted">Opponent Progress</small>
                    <div className="onevone-progress-row">
                      <strong>{opponentRoundsCompleted}/{room.rounds}</strong>
                      <span className="muted tiny">{opponentRoundStatus}</span>
                    </div>
                    <div className="onevone-progress-track" aria-hidden>
                      <span style={{ width: `${opponentProgressPercent}%` }} />
                    </div>
                  </div>
                  )}
                </div>

                {countdownActive ? (
                  <div className="onevone-countdown">
                    <small className="muted">Both players ready</small>
                    <strong>{countdownRemaining}</strong>
                    <p className="muted tiny">Match starts in…</p>
                  </div>
                ) : null}

                {!countdownActive && !canStartRound ? (
                  <p className="muted">Waiting for round sync...</p>
                ) : null}

                {canStartRound && isQuizRound(currentRound) ? (
                  isSpectator ? (
                    <div className="card quiz-card speed-session-card onevone-quiz-card spectating-card">
                      <h3>{currentRound.prompt}</h3>
                      {currentRound.sourceLabel ? <p className="muted tiny">{currentRound.sourceLabel}</p> : null}
                      <div className="choices spectating-choices">
                        {currentRound.choices.map((choice, index) => (
                          <div key={`spectate-choice-${currentRound.round}-${index}`} className="choice spectating-choice">
                            <span className="choice-key">{index + 1}</span> {choice}
                          </div>
                        ))}
                      </div>
                      <p className="muted tiny" style={{ marginTop: '12px' }}>👁️ Watching {getPlayerName(players[0]?.user_id, 'Player')} and {getPlayerName(players[1]?.user_id, 'Player')} compete</p>
                    </div>
                  ) : (
                  <div className="card quiz-card speed-session-card onevone-quiz-card">
                    <h3>{currentRound.prompt}</h3>
                    {currentRound.sourceLabel ? <p className="muted tiny">{currentRound.sourceLabel}</p> : null}
                    <div className="choices">
                      {currentRound.choices.map((choice, index) => (
                        <button
                          key={`duel-quiz-choice-${currentRound.round}-${index}`}
                          className={quizChoice === index ? 'choice active' : 'choice'}
                          onClick={() => {
                            submitQuizAnswer(index)
                          }}
                          disabled={quizLocked || submittingRound}
                        >
                          <span className="choice-key">{index + 1}</span> {choice}
                        </button>
                      ))}
                    </div>
                  </div>
                  )
                ) : null}
              </div>
            </div>
          ) : null}

          {room.status === 'in_progress' && room.game_type === 'matching' ? (
            <div className="match-session-overlay onevone-match-overlay">
              <div className="match-session-shell onevone-match-shell">
                {isSpectator && (
                  <div className="onevone-spectator-banner">
                    <span>👁️ You are spectating</span>
                    <span className="muted tiny">{players[0] ? usernameByUserId[players[0].user_id] || 'Player 1' : 'Player 1'} vs {players[1] ? usernameByUserId[players[1].user_id] || 'Player 2' : 'Player 2'}</span>
                  </div>
                )}
                {/* Dual player live view for spectators */}
                {isSpectator && players.length === 2 && (
                  <div className="onevone-dual-player-view">
                    <div className="onevone-player-live-card">
                      <div className="onevone-player-live-header">
                        <strong>{getPlayerName(players[0]?.user_id, 'Player 1')}</strong>
                        <span className="muted tiny">Round {players[0]?.current_round || 1}/{room.rounds}</span>
                      </div>
                      <div className="onevone-player-live-score">
                        <span>{players[0]?.score ?? 0} pts</span>
                      </div>
                    </div>
                    <div className="onevone-player-live-card">
                      <div className="onevone-player-live-header">
                        <strong>{getPlayerName(players[1]?.user_id, 'Player 2')}</strong>
                        <span className="muted tiny">Round {players[1]?.current_round || 1}/{room.rounds}</span>
                      </div>
                      <div className="onevone-player-live-score">
                        <span>{players[1]?.score ?? 0} pts</span>
                      </div>
                    </div>
                  </div>
                )}
                <div className="onevone-hud-grid">
                  <div className="onevone-hud-chip">
                    <small className="muted">Round</small>
                    <strong>{isSpectator ? `Round ${room.current_round}` : `${myRoundHud}/${room.rounds}`} / {room.rounds}</strong>
                  </div>
                  <div className="onevone-hud-chip">
                    <small className="muted">Scores</small>
                    <strong>{getPlayerName(players[0]?.user_id, 'P1')}: {players[0]?.score ?? 0} • {getPlayerName(players[1]?.user_id, 'P2')}: {players[1]?.score ?? 0}</strong>
                  </div>
                  <div className="onevone-hud-chip">
                    <small className="muted">Elapsed</small>
                    <strong>{formatClock(elapsedMs)}</strong>
                  </div>
                  {!isSpectator ? (
                    <div className="onevone-hud-chip">
                      <small className="muted">Round Timer</small>
                      <strong>{matchingRoundRemainingSeconds > 0 ? `${matchingRoundRemainingSeconds}s` : '0s'}</strong>
                    </div>
                  ) : null}
                  {!isSpectator && spectatorCount > 0 && (
                    <div className="onevone-hud-chip spectator-count">
                      <small className="muted">Watchers</small>
                      <strong>👁 {spectatorCount}</strong>
                    </div>
                  )}
                  {isSpectator ? (
                    <div className="onevone-hud-chip">
                      <small className="muted">Progress</small>
                      <div className="onevone-progress-row">
                        <strong>{players[0]?.current_round || 1}/{room.rounds}</strong>
                        <span className="muted tiny">vs</span>
                        <strong>{players[1]?.current_round || 1}/{room.rounds}</strong>
                      </div>
                    </div>
                  ) : (
                  <div className="onevone-hud-chip">
                    <small className="muted">Opponent Progress</small>
                    <div className="onevone-progress-row">
                      <strong>{opponentRoundsCompleted}/{room.rounds}</strong>
                      <span className="muted tiny">{opponentRoundStatus}</span>
                    </div>
                    <div className="onevone-progress-track" aria-hidden>
                      <span style={{ width: `${opponentProgressPercent}%` }} />
                    </div>
                  </div>
                  )}
                </div>
                <div className="match-session-controls onevone-session-controls onevone-match-controls">
                  <button className="secondary match-exit-button onevone-leave-button" onClick={() => void confirmLeaveMatch()}>
                    {isSpectator ? 'Stop Spectating' : 'Leave Match'}
                  </button>
                </div>
                {countdownActive ? (
                  <div className="onevone-countdown">
                    <small className="muted">Both players ready</small>
                    <strong>{countdownRemaining}</strong>
                    <p className="muted tiny">Match starts in…</p>
                  </div>
                ) : null}
                {canStartRound && isMatchingRound(currentRound) ? (
                  <div className="onevone-round onevone-match-round">
                    {isSpectator ? (
                      <div className="match-grid match-grid-session">
                        {matchingCards.map((card) => (
                          <div
                            key={`spectate-match-card-${currentRound.round}-${card.id}`}
                            className={`match-card match-spectating`}
                          >
                            <strong className={card.kind === 'code' ? 'match-card-code' : 'match-card-definition'}>
                              {card.text}
                            </strong>
                          </div>
                        ))}
                      </div>
                    ) : (
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
                            <strong className={card.kind === 'code' ? 'match-card-code' : 'match-card-definition'}>
                              {card.text}
                            </strong>
                          </button>
                        )
                      })}
                    </div>
                    )}
                    {!isSpectator ? <p className="muted tiny onevone-match-status">{matchingStatusText}</p> : null}
                  </div>
                ) : (
                  <p className="muted">{countdownActive ? 'Countdown in progress…' : 'Waiting for round sync...'}</p>
                )}
              </div>
            </div>
          ) : null}

          {room.status === 'completed' ? (
            <div className="onevone-result-overlay">
              <div className="card onevone-card onevone-result-shell">
                {isSpectator && (
                  <div className="onevone-spectator-banner spectator-results">
                    <span>👁️ Match Complete</span>
                    <span className="muted tiny">You were spectating</span>
                  </div>
                )}
                <h3>{isSpectator ? 'Match Results' : 'Match Results'}</h3>
                {!isSpectator && (
                <p className="muted tiny onevone-tiebreak-order">
                  Tie-break order: <strong>Score</strong> → <strong>Total time</strong> → <strong>Fastest single round</strong> → <strong>Draw</strong>
                </p>
                )}
                <div
                  className={
                    room.winner_user_id
                      ? (room.winner_user_id === currentUserId ? 'onevone-winner-banner good' : 'onevone-winner-banner')
                      : 'onevone-winner-banner onevone-winner-banner-draw'
                  }
                >
                  {room.winner_user_id
                    ? isSpectator 
                      ? `Winner: ${usernameByUserId[room.winner_user_id] || 'Player'}`
                      : room.winner_user_id === currentUserId
                      ? `Winner: ${myDisplayName}`
                      : `Winner: ${usernameByUserId[room.winner_user_id] || opponentDisplayName}`
                    : 'Result: Draw'}
                </div>
                {tieBreakerDecision && !isSpectator ? (
                  <p className="muted tiny onevone-tiebreak-note">
                    Decision: {tieBreakerDecision.rule} • {tieBreakerDecision.summary}
                  </p>
                ) : null}

                {!isSpectator && (
                <div className="onevone-rematch-panel">
                  <div className="onevone-rematch-head">
                    <p className="muted tiny">Rematch</p>
                    <p className="muted tiny">{rematchReadyCount}/2 agreed</p>
                  </div>
                  <p className="muted tiny">{rematchStatusText}</p>
                  <div className="actions-row">
                    <button
                      className={`${myRematchRequested ? 'secondary cancel-button ready' : 'primary'}`}
                      onClick={() => void toggleRematchVote()}
                      disabled={rematchLoading}
                    >
                      {rematchLoading ? 'Starting...' : myRematchRequested ? 'Cancel' : 'Rematch'}
                    </button>
                  </div>
                </div>
                )}
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
                      <p className="muted tiny">{isSpectator ? 'Player 1' : 'Your Score'}</p>
                      <strong>{myResultRow.score} pts</strong>
                      <p className="muted tiny">{isSpectator ? getPlayerName(players[0]?.user_id, 'Player') : `Rounds: ${myRoundsCompleted}/${room.rounds}`}</p>
                    </article>
                    <article className="onevone-compare-card">
                      <p className="muted tiny">{isSpectator ? 'Player 2' : 'Opponent Score'}</p>
                      <strong>{opponentResultRow.score} pts</strong>
                      <p className="muted tiny">{isSpectator ? getPlayerName(players[1]?.user_id, 'Player') : `Rounds: ${opponentRoundsCompleted}/${room.rounds}`}</p>
                    </article>
                    {!isSpectator && (
                    <>
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
                    <article className="onevone-compare-card">
                      <p className="muted tiny">Your Fastest Round</p>
                      <strong>{myFastestRoundMs > 0 ? formatClock(myFastestRoundMs) : '—'}</strong>
                      <p className="muted tiny">Lowest single-round time</p>
                    </article>
                    <article className="onevone-compare-card">
                      <p className="muted tiny">Opponent Fastest Round</p>
                      <strong>{opponentFastestRoundMs > 0 ? formatClock(opponentFastestRoundMs) : '—'}</strong>
                      <p className="muted tiny">Lowest single-round time</p>
                    </article>
                    </>
                    )}
                  </div>
                ) : null}
                {!isSpectator && myDuelStats ? (
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
                  <button className="primary" onClick={() => void leaveCurrentRoom()}>Back to 1v1 Lobby</button>
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
                <p className="leader-profile-label">Current Activity</p>
                <p>{formatDuelProfileCurrentActivity(selectedDuelProfile.currentActivity)}</p>
              </div>
              {selectedDuelProfile.all.currentStreak > 0 ? (
                <div className="leader-profile-item">
                  <p className="leader-profile-label">Current Win Streak</p>
                  <p>
                    {selectedDuelProfile.all.currentStreak}
                    <span className="onevone-streak-fire" aria-hidden> 🔥</span>
                  </p>
                </div>
              ) : null}
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
