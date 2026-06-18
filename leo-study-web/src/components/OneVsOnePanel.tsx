import { type CSSProperties, type MouseEvent, type ReactNode, type SyntheticEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type RealtimeChannel } from '@supabase/supabase-js'
import { loadLocalContentBundle, type ContentBankItem } from '../content'
import { applyConnect4Move, chooseConnect4BotMove, connect4Columns, connect4Rows, createConnect4State, findConnect4WinningCells, normalizeConnect4State, type Connect4Cell, type Connect4Coordinate, type Connect4Player, type Connect4State } from '../lib/connect4'
import { getEffectiveProfileDecorationForLevel } from '../lib/profileDecorationData'
import { ProfileAvatarDecoration } from '../lib/profileDecorations'
import { supabase } from '../lib/supabase'

type DuelGameType = 'quiz' | 'matching' | 'blaster' | 'connect4'
type DuelCategory = 'all' | 'pc' | 'vc' | 'hs' | 'scenarios'
type DuelRoomStatus = 'waiting' | 'in_progress' | 'completed' | 'cancelled'
type DuelBlasterMode = 'timed' | 'death'

type DuelRoomRow = {
  id: string
  host_user_id: string
  game_type: DuelGameType
  category: DuelCategory
  is_public: boolean
  join_code: string | null
  rounds: number
  question_set: unknown
  settings: Record<string, unknown>
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
  fastest_round_ms: number
  current_round: number
  last_seen: string
  finished_at?: string | null
}

type DuelRoomResultRow = {
  id: string
  room_id: string
  user_id: string
  score: number
  total_time_ms: number
  placement: number
  is_winner: boolean
  finished_at?: string | null
}

type LobbyRoomItem = {
  id: string
  game_type: DuelGameType
  category: DuelCategory
  rounds: number
  settings: Record<string, unknown>
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

type BlasterRoundPayload = {
  round: number
  prompt: string
  targets: string[]
  correctIndex: number
  correctCode: string
  explanation?: string
  sourceLabel?: string
}

type BlasterShotBurst = {
  id: string
  tone: 'good' | 'bad' | 'power' | 'spectator'
  x: number
  y: number
}

type BlasterScoreBroadcastPayload = {
  room_id: string
  user_id: string
  score: number
  delta: number
  round: number
  current_round: number
  total_time_ms: number
  fastest_round_ms: number
  correct: boolean
  sent_at: number
  elapsed_ms?: number
  powerup_key?: DuelBlasterPowerupKey | null
  powerup_effect?: DuelBlasterDisruptionKey | null
  disguise_code?: string | null
  target_index?: number | null
  target_label?: string | null
}

type BlasterPowerupEffectPayload = {
  room_id: string
  user_id: string
  powerup_key: DuelBlasterPowerupKey
  powerup_effect: DuelBlasterDisruptionKey
  disguise_code?: string | null
  sent_at: number
}

type RopeBlasterCloudStatus = 'disabled' | 'connecting' | 'connected' | 'fallback'

type RopeBlasterCloudPlayer = {
  userId: string
  score: number
  currentRound: number
  totalTimeMs: number
  fastestRoundMs: number
}

type RopeBlasterCloudState = {
  type: 'state'
  reason?: string
  sequence?: number
  serverNow?: number
  effectiveRopeLimit?: number
  ropeRemainingPercent?: number
  ko?: boolean
  connected?: number
  players?: RopeBlasterCloudPlayer[]
  lastEvent?: {
    userId?: string
    delta?: number
    eventDelayMs?: number
    clientSentAt?: number
    powerupKey?: DuelBlasterPowerupKey | string | null
    powerupEffect?: DuelBlasterDisruptionKey | string | null
    disguiseCode?: string | null
    targetIndex?: number | null
    targetLabel?: string | null
  } | null
}

type BlasterAsteroidBody = {
  key: string
  element: HTMLElement
  x: number
  y: number
  velocityX: number
  velocityY: number
  halfWidth: number
  halfHeight: number
  collisionGlowUntil: number
  isColliding: boolean
}

type DuelBlasterPowerupKey =
  | 'radio'
  | 'coffee'
  | 'donut'
  | 'code3'
  | 'k9'
  | 'backup'
  | 'vest'
  | 'evidence'
  | 'clone'
  | 'paperwork'
  | 'radar'
  | 'spikes'

type DuelBlasterDisruptionKey = 'clone' | 'paperwork' | 'speedtrap' | 'shake'

type DuelBlasterPowerup = {
  key: DuelBlasterPowerupKey
  label: string
  points: number
  icon: string
  description: string
}

type DuelBlasterDisruption = {
  id: string
  key: DuelBlasterDisruptionKey
  label: string
  icon: string
  cloneText?: string
}

const BLASTER_PAPERWORK_STORM_LABELS = ['RPT', 'SUPP', 'CAD', 'PC', 'VC', 'BWC', 'CASE', 'EVID', 'NARR', 'CYA', 'LOG', 'TOW']

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
  message?: string
  started_at?: string | null
  room_id?: string
}

type DuelStatsMode = 'all' | Exclude<DuelGameType, 'connect4'>
const duelStatsModes: DuelStatsMode[] = ['all', 'matching', 'quiz', 'blaster']

type DuelBotDifficulty = 'adaptive' | 'random' | 'easy' | 'medium' | 'hard' | 'very-hard'
type DuelBotResolvedDifficulty = Exclude<DuelBotDifficulty, 'adaptive' | 'random'>
type DuelBotMatchStatus = 'in_progress' | 'completed'
type DuelBotWinner = 'user' | 'bot' | 'draw'

type DuelBotStats = {
  version: number
  wins: number
  losses: number
  matches_played: number
  current_win_streak: number
  best_win_streak: number
  best_score: number
  best_difficulty: DuelBotResolvedDifficulty | ''
  wins_by_difficulty: Record<DuelBotResolvedDifficulty, number>
  updated_at: string
}

type DuelBotSkillSnapshot = {
  studySeconds: number
  blasterWins: number
  duelWins: number
  masteredCodes: number
  weakCategory: DuelCategory
  weakCodes: string[]
}

type DuelBotRoundPayload = QuizRoundPayload | MatchingRoundPayload | BlasterRoundPayload

type DuelBotMatch = {
  id: string
  status: DuelBotMatchStatus
  gameType: DuelGameType
  difficulty: DuelBotDifficulty
  resolvedDifficulty: DuelBotResolvedDifficulty
  category: DuelCategory
  mode: DuelBlasterMode
  durationSeconds: number
  powerupsEnabled: boolean
  overtimeEnabled: boolean
  overtimeAfterSeconds: number
  rounds: number
  questionSet: DuelBotRoundPayload[]
  userRound: number
  botRound: number
  userScore: number
  botScore: number
  userTotalMs: number
  botTotalMs: number
  userFastestMs: number
  botFastestMs: number
  startedAt: number
  completedAt?: number
  winner: DuelBotWinner | null
  botName: string
  coachingNote: string
  userStreak: number
  botStreak: number
  lastBotCorrect?: boolean
}

type Connect4BotMatch = {
  id: string
  status: DuelBotMatchStatus
  state: Connect4State
  startedAt: number
  completedAt?: number
  winner: DuelBotWinner | null
  botName: string
  difficulty: DuelBotDifficulty
  resolvedDifficulty: DuelBotResolvedDifficulty
}

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
  level: number
  haloClass: string
  profileDecorationKey: string
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
  level: number
  haloClass: string
  profileDecorationKey: string
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
  blaster: {
    wins: number
    losses: number
    matches: number
  }
}

type DuelProfileActivityDisplay = {
  state: 'active' | 'idle' | 'offline'
  statusLabel: string
  mainLabel: string
  subLabel: string
}

type OnlineInviteUser = {
  user_id: string
  username: string
  avatarUrl: string
  supporterTier: SupporterTier
  level: number
  haloClass: string
  profileDecorationKey: string
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
const duelBlasterDurationOptions = [30, 60, 90]
const duelBlasterDefaultDurationSeconds = 30
const duelBlasterRoundCap = 50
const duelBlasterDefaultRopeLimit = 900
const duelBlasterDefaultPowerupsEnabled = false
const duelBlasterOvertimeOptions = [45, 60, 90] as const
const duelBlasterDefaultOvertimeEnabled = true
const duelBlasterDefaultOvertimeAfterSeconds = 45
const duelBlasterSuddenDeathRopeMultiplier = 0.45
const duelBlasterSuddenDeathMinimumRopeLimit = 260
const duelBlasterMissPenalty = 85
const defaultRopeBlasterWorkerUrl = 'https://leo-rope-blaster.brad-e22.workers.dev'
const ropeBlasterWorkerUrl = String(
  import.meta.env.VITE_ROPE_BLASTER_WORKER_URL ||
  import.meta.env.VITE_CLOUDFLARE_ROPE_BLASTER_URL ||
  defaultRopeBlasterWorkerUrl,
).replace(/\/+$/, '')
const duelGameTypeLabels: Record<DuelGameType, string> = {
  quiz: 'Quiz',
  matching: 'Matching',
  blaster: 'Code Blaster',
  connect4: 'Connect 4',
}
const duelGameTypeOptions: Array<{ value: DuelGameType; label: string; subtitle: string }> = [
  { value: 'quiz', label: '1v1 Quiz', subtitle: 'Classic question duel' },
  { value: 'matching', label: '1v1 Matching', subtitle: 'Pair codes and definitions' },
  { value: 'blaster', label: 'Rope Blaster', subtitle: 'Timed code blasts or rope KO' },
  { value: 'connect4', label: 'Connect 4', subtitle: 'Drop discs and connect four' },
]
const duelBotDifficultyOptions: Array<{ value: DuelBotDifficulty; label: string; subtitle: string }> = [
  { value: 'adaptive', label: 'Adaptive', subtitle: 'Targets your weak codes' },
  { value: 'random', label: 'Random', subtitle: 'Surprise bot skill' },
  { value: 'easy', label: 'Easy', subtitle: 'Light challenge' },
  { value: 'medium', label: 'Medium', subtitle: 'Solid academy pace' },
  { value: 'hard', label: 'Hard', subtitle: 'Fast and accurate' },
  { value: 'very-hard', label: 'Very Hard', subtitle: 'Boss pressure' },
]
const duelBotResolvedDifficultyLabels: Record<DuelBotResolvedDifficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  'very-hard': 'Very Hard',
}
const duelBotDifficultyRank: Record<DuelBotResolvedDifficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
  'very-hard': 4,
}
const duelBotNames: Record<DuelBotResolvedDifficulty, string[]> = {
  easy: ['Cadet Luna', 'Bot Rookie', 'Officer Sprout'],
  medium: ['Officer Byte', 'Cadet Radar', 'Unit 12'],
  hard: ['Sgt. Vector', 'Code Coach', 'Officer Tempo'],
  'very-hard': ['Lt. Overwatch', 'The Evaluator', 'Code Phantom'],
}
const duelBotStatsVersion = 1
const duelBotCatchupStreakThreshold = 3
const duelBotCatchupLeadThreshold = 100
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

const blasterTargetAnchors = [
  { x: 18, y: 22 },
  { x: 50, y: 18 },
  { x: 82, y: 24 },
  { x: 25, y: 63 },
  { x: 58, y: 70 },
  { x: 78, y: 56 },
]
const blasterFieldWallInsetPx = 28
const blasterAsteroidMinHalfWidthPx = 30
const blasterAsteroidMinHalfHeightPx = 22
const blasterAsteroidMinSpeed = 0.022
const blasterAsteroidMaxSpeed = 0.048
const blasterAsteroidCollisionGapPx = 12
const blasterAsteroidSeparationPasses = 4

function getBlasterWallInset(safeWidth: number, safeHeight: number) {
  return Math.max(12, Math.min(blasterFieldWallInsetPx, Math.min(safeWidth, safeHeight) * 0.045))
}

function blasterTargetDomKey(index: number) {
  return `slot-${index}`
}

function normalizeBlasterTarget(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, ' ')
}

function getBlasterRoundCorrectCode(round: BlasterRoundPayload) {
  return String(round.correctCode || round.targets[round.correctIndex] || '').trim()
}

function uniqueBlasterTargets(targets: string[]) {
  const seenTargets = new Set<string>()
  return targets.filter((target) => {
    const normalized = normalizeBlasterTarget(target)
    if (!normalized || seenTargets.has(normalized)) return false
    seenTargets.add(normalized)
    return true
  })
}

function randomBlasterItem<T>(items: T[]) {
  if (items.length === 0) return null
  return items[Math.floor(Math.random() * items.length)] ?? null
}

function buildBlasterVisibleTargetsForRound(
  previousTargets: string[],
  nextRound: BlasterRoundPayload,
  replacementIndex: number | null,
) {
  const nextRoundTargets = nextRound.targets.map((target) => String(target)).filter((target) => target.trim().length > 0)
  const nextRoundCandidateTargets = uniqueBlasterTargets(nextRoundTargets)
  if (previousTargets.length === 0 || previousTargets.length !== nextRoundTargets.length) {
    return nextRoundTargets
  }

  const nextTargets = [...previousTargets]
  const safeReplacementIndex = replacementIndex !== null && replacementIndex >= 0 && replacementIndex < nextTargets.length
    ? replacementIndex
    : 0
  const correctCode = getBlasterRoundCorrectCode(nextRound)
  const normalizedCorrect = normalizeBlasterTarget(correctCode)
  const targetIndexes = nextTargets.map((_target, index) => index)
  const stableIndexes = targetIndexes.filter((index) => index !== safeReplacementIndex)
  const existingCorrectIndex = stableIndexes.find((index) => normalizeBlasterTarget(nextTargets[index] || '') === normalizedCorrect) ?? -1
  const correctSlotIndex = existingCorrectIndex >= 0
    ? existingCorrectIndex
    : randomBlasterItem(targetIndexes) ?? safeReplacementIndex

  if (correctCode && existingCorrectIndex < 0) {
    nextTargets[correctSlotIndex] = correctCode
  }

  const usedByStableSlots = new Set(
    nextTargets
      .filter((_target, index) => index !== safeReplacementIndex)
      .map((target) => normalizeBlasterTarget(target)),
  )
  const replacementCandidates = nextRoundCandidateTargets.filter((target) => {
    const normalized = normalizeBlasterTarget(target)
    if (usedByStableSlots.has(normalized)) return false
    if (correctCode && correctSlotIndex !== safeReplacementIndex && normalized === normalizedCorrect) return false
    return true
  })
  const replacement = correctSlotIndex === safeReplacementIndex && correctCode
    ? correctCode
    : randomBlasterItem(replacementCandidates)
      || randomBlasterItem(nextRoundCandidateTargets.filter((target) => normalizeBlasterTarget(target) !== normalizedCorrect))
      || nextTargets[safeReplacementIndex]
      || nextRoundTargets[0]
      || correctCode
      || ''

  nextTargets[safeReplacementIndex] = replacement
  if (correctCode && !nextTargets.some((target) => normalizeBlasterTarget(target) === normalizedCorrect)) {
    nextTargets[randomBlasterItem(targetIndexes) ?? safeReplacementIndex] = correctCode
  }

  const usedTargets = new Set<string>()
  const resolvedTargets = nextTargets.map((target, index) => {
    const normalized = normalizeBlasterTarget(target)
    if (target && !usedTargets.has(normalized)) {
      usedTargets.add(normalized)
      return target
    }
    const fallback = nextRoundTargets.find((candidate) => !usedTargets.has(normalizeBlasterTarget(candidate)))
      || target
      || nextRoundTargets[index]
      || ''
    usedTargets.add(normalizeBlasterTarget(fallback))
    return fallback
  })

  if (correctCode && !resolvedTargets.some((target) => normalizeBlasterTarget(target) === normalizedCorrect)) {
    resolvedTargets[randomBlasterItem(targetIndexes) ?? safeReplacementIndex] = correctCode
  }

  return resolvedTargets
}

function blasterTargetStyle(seedInput: string, index: number): CSSProperties {
  const seed = hashStringToInt(`${seedInput}:${index}`)
  const anchors = seededShuffle(blasterTargetAnchors, `${seedInput}:target-layout`)
  const anchor = anchors[index % anchors.length] || blasterTargetAnchors[index % blasterTargetAnchors.length]
  const jitterX = ((seed % 7) - 3) * 2
  const jitterY = ((Math.floor(seed / 13) % 7) - 3) * 2
  const drift = 5 + (seed % 10)
  const orbitX = 7 + (Math.floor(seed / 17) % 12)
  const orbitY = 6 + (Math.floor(seed / 29) % 11)
  const duration = 6.2 + ((seed % 1800) / 1000)
  const delay = -((seed % 2400) / 1000)
  return {
    left: `calc(${anchor.x}% + ${jitterX}px)`,
    top: `calc(${anchor.y}% + ${jitterY}px)`,
    ['--duel-blaster-drift' as string]: `${drift}px`,
    ['--duel-blaster-orbit-x' as string]: `${orbitX}px`,
    ['--duel-blaster-orbit-y' as string]: `${orbitY}px`,
    ['--duel-blaster-orbit-duration' as string]: `${duration}s`,
    ['--duel-blaster-delay' as string]: `${delay}s`,
  } as CSSProperties
}

function duelBlasterPowerupForRound(round: number, powerupsEnabled: boolean, mode: DuelBlasterMode = 'timed'): DuelBlasterPowerup | null {
  if (!powerupsEnabled) return null
  if (mode === 'death') {
    if (round % 11 === 0) return { key: 'clone', label: 'Clone Jammer', points: 160, icon: '🌀', description: 'Correct blast clones your opponent’s labels.' }
    if (round % 10 === 0) return { key: 'paperwork', label: 'Paperwork Storm', points: 150, icon: '📄', description: 'Correct blast rains fake reports on them.' }
    if (round % 8 === 0) return { key: 'spikes', label: 'Pursuit Panic', points: 175, icon: '🚓', description: 'Correct blast makes their asteroid field go Code 3 fast.' }
    if (round % 7 === 0) return { key: 'code3', label: 'Code 3 Surge', points: 230, icon: '🚨', description: 'A huge correct blast yanks the rope hard.' }
    if (round % 5 === 0) return { key: 'vest', label: 'Ballistic Vest', points: 135, icon: '🦺', description: 'A miss hurts less and keeps you alive.' }
    if (round % 4 === 0) return { key: 'radar', label: 'Spotlight Sweep', points: 145, icon: '🔦', description: 'A quick scanner glow marks the right asteroid.' }
    if (round % 3 === 0) return { key: 'radio', label: 'Radio Boost', points: 140, icon: '📻', description: 'Your streak bonus counts double.' }
    return null
  }
  if (round % 17 === 0) return { key: 'clone', label: 'Clone Jammer', points: 160, icon: '🌀', description: 'Correct blast clones your opponent’s labels.' }
  if (round % 16 === 0) return { key: 'paperwork', label: 'Paperwork Storm', points: 150, icon: '📄', description: 'Correct blast rains fake reports on them.' }
  if (round % 14 === 0) return { key: 'radar', label: 'Spotlight Sweep', points: 145, icon: '🔦', description: 'A quick scanner glow marks the right asteroid.' }
  if (round % 13 === 0) return { key: 'backup', label: 'Backup Unit', points: 170, icon: '🚔', description: 'Correct blast gets an extra shove.' }
  if (round % 12 === 0) return { key: 'spikes', label: 'Pursuit Panic', points: 175, icon: '🚓', description: 'Correct blast makes their asteroid field go Code 3 fast.' }
  if (round % 11 === 0) return { key: 'k9', label: 'K-9 Sniff', points: 150, icon: '🐕', description: 'A paw glow hints at the best target.' }
  if (round % 9 === 0) return { key: 'evidence', label: 'Evidence Bag', points: 150, icon: '🧾', description: 'Chain the streak into bonus pressure.' }
  if (round % 7 === 0) return { key: 'code3', label: 'Code 3 Surge', points: 230, icon: '🚨', description: 'A huge correct blast yanks the rope hard.' }
  if (round % 6 === 0) return { key: 'vest', label: 'Ballistic Vest', points: 135, icon: '🦺', description: 'A miss hurts less and keeps you alive.' }
  if (round % 5 === 0) return { key: 'donut', label: 'Donut Armor', points: 165, icon: '🍩', description: 'A miss keeps your streak from breaking.' }
  if (round % 4 === 0) return { key: 'coffee', label: 'Coffee Rush', points: 145, icon: '☕️', description: 'Answer in 4 seconds for a speed bonus.' }
  if (round % 3 === 0) return { key: 'radio', label: 'Radio Boost', points: 140, icon: '📻', description: 'Your streak bonus counts double.' }
  return null
}

const duelBlasterPowerupGlossary: Array<DuelBlasterPowerup & { timing: string }> = [
  { key: 'radio', label: 'Radio Boost', points: 140, icon: '📻', description: 'Your streak bonus counts double when you hit the correct asteroid.', timing: 'Common streak booster' },
  { key: 'coffee', label: 'Coffee Rush', points: 145, icon: '☕️', description: 'Timed mode bonus for answering in 4 seconds or less.', timing: 'Timed mode only' },
  { key: 'donut', label: 'Donut Armor', points: 165, icon: '🍩', description: 'A miss keeps your streak alive instead of resetting it.', timing: 'Timed mode only' },
  { key: 'code3', label: 'Code 3 Surge', points: 230, icon: '🚨', description: 'A huge correct blast yanks the rope hard.', timing: 'High-impact rounds' },
  { key: 'k9', label: 'K-9 Sniff', points: 150, icon: '🐕', description: 'A paw-glow hint points toward the best target.', timing: 'Timed mode only' },
  { key: 'backup', label: 'Backup Unit', points: 170, icon: '🚔', description: 'Correct answers get an extra shove on the rope.', timing: 'Timed mode only' },
  { key: 'vest', label: 'Ballistic Vest', points: 135, icon: '🦺', description: 'Wrong clicks hurt less so one miss does not end the fight.', timing: 'Defense round' },
  { key: 'evidence', label: 'Evidence Bag', points: 150, icon: '🧾', description: 'A chain bonus rewards sustained accuracy.', timing: 'Timed mode only' },
  { key: 'clone', label: 'Clone Jammer', points: 160, icon: '🌀', description: 'The opponent briefly sees cloned code labels, forcing them to slow down.', timing: 'Disruption round' },
  { key: 'paperwork', label: 'Paperwork Storm', points: 150, icon: '📄', description: 'Fake reports flood the opponent screen and block visibility.', timing: 'Disruption round' },
  { key: 'radar', label: 'Spotlight Sweep', points: 145, icon: '🔦', description: 'A scanner glow marks the right asteroid.', timing: 'Hint round' },
  { key: 'spikes', label: 'Pursuit Panic', points: 175, icon: '🚓', description: 'Opponent asteroids surge to Code 3 speed and become harder to click.', timing: 'Disruption round' },
]

function duelBlasterDisruptionForPowerup(powerup: DuelBlasterPowerup | null): DuelBlasterDisruptionKey | null {
  if (!powerup) return null
  if (powerup.key === 'clone') return 'clone'
  if (powerup.key === 'paperwork') return 'paperwork'
  if (powerup.key === 'spikes') return 'speedtrap'
  if (powerup.key === 'code3') return 'shake'
  return null
}

function getDuelBlasterDisruptionMeta(key: DuelBlasterDisruptionKey) {
  if (key === 'clone') return { label: 'Clone Jammer', icon: '🌀', durationMs: 2300 }
  if (key === 'paperwork') return { label: 'Paperwork Storm', icon: '📄', durationMs: 1850 }
  if (key === 'speedtrap') return { label: 'Pursuit Panic', icon: '🚓', durationMs: 1650 }
  return { label: 'Code 3 Shockwave', icon: '🚨', durationMs: 720 }
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

function readNumberSetting(
  settings: Record<string, unknown> | null | undefined,
  key: string,
  fallback: number,
  min: number,
  max: number,
) {
  const value = Number(settings?.[key] ?? fallback)
  const safe = Number.isFinite(value) ? value : fallback
  return Math.max(min, Math.min(max, Math.round(safe)))
}

function getBlasterMode(settings: Record<string, unknown> | null | undefined): DuelBlasterMode {
  return settings?.blaster_win_condition === 'death' || settings?.blaster_sudden_death === true ? 'death' : 'timed'
}

function getBlasterDurationSeconds(settings: Record<string, unknown> | null | undefined) {
  return readNumberSetting(settings, 'blaster_duration_seconds', duelBlasterDefaultDurationSeconds, 15, 300)
}

function getBlasterRopeLimit(settings: Record<string, unknown> | null | undefined) {
  return readNumberSetting(settings, 'blaster_rope_limit', duelBlasterDefaultRopeLimit, 300, 3000)
}

function getBlasterOvertimeEnabled(settings: Record<string, unknown> | null | undefined) {
  if (!settings || settings.blaster_overtime_enabled === undefined) return duelBlasterDefaultOvertimeEnabled
  return settings.blaster_overtime_enabled !== false && String(settings.blaster_overtime_enabled).toLowerCase() !== 'false'
}

function getBlasterOvertimeAfterSeconds(settings: Record<string, unknown> | null | undefined) {
  const rawSeconds = readNumberSetting(
    settings,
    'blaster_overtime_after_seconds',
    duelBlasterDefaultOvertimeAfterSeconds,
    duelBlasterOvertimeOptions[0],
    duelBlasterOvertimeOptions[duelBlasterOvertimeOptions.length - 1],
  )
  return duelBlasterOvertimeOptions.reduce(
    (closest, option) => Math.abs(option - rawSeconds) < Math.abs(closest - rawSeconds) ? option : closest,
    duelBlasterDefaultOvertimeAfterSeconds,
  )
}

function getBlasterSuddenDeathRopeLimit(baseLimit: number) {
  return Math.max(
    duelBlasterSuddenDeathMinimumRopeLimit,
    Math.round(Math.max(1, baseLimit) * duelBlasterSuddenDeathRopeMultiplier),
  )
}

function formatBlasterRuleLabel(settings: Record<string, unknown> | null | undefined) {
  const mode = getBlasterMode(settings)
  const overtimeLabel = getBlasterOvertimeEnabled(settings)
    ? `OT ${getBlasterOvertimeAfterSeconds(settings)}s`
    : 'No OT'
  return `${mode === 'death' ? 'To the Death' : `${getBlasterDurationSeconds(settings)}s`} · Rope KO · ${overtimeLabel}`
}

function toRopeBlasterWebSocketUrl(baseUrl: string, roomId: string, userId: string, displayName: string) {
  if (!baseUrl || !roomId || !userId) return ''
  const url = new URL(`${baseUrl}/room/${encodeURIComponent(roomId)}`)
  url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:'
  url.searchParams.set('userId', userId)
  url.searchParams.set('name', displayName || 'Player')
  return url.toString()
}

function formatDuelRoomRuleLabel(room: Pick<LobbyRoomItem, 'game_type' | 'rounds' | 'settings'>) {
  if (room.game_type === 'connect4') return 'Classic 7x6'
  return room.game_type === 'blaster' ? formatBlasterRuleLabel(room.settings) : `${room.rounds} rounds`
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

function parseDuelProfileLevelSnapshot(details: Record<string, unknown>) {
  const snapshot = details.levelSnapshot && typeof details.levelSnapshot === 'object'
    ? (details.levelSnapshot as Record<string, unknown>)
    : {}
  const level = Math.max(1, Math.floor(Number(snapshot.level || 1)))
  const haloClass = typeof snapshot.haloClass === 'string' && snapshot.haloClass.trim()
    ? snapshot.haloClass
    : fallbackLevelHaloClass(level)
  return { level, haloClass }
}

function emptyDuelProfileSnapshot(userId: string): DuelProfileSnapshot {
  return {
    user_id: userId,
    username: fallbackUsername(userId),
    avatarUrl: defaultAvatarUrl,
    supporterTier: 'free',
    nameStyle: { ...defaultNameStyle },
    level: 1,
    haloClass: 'level-halo-recruit',
    profileDecorationKey: 'auto',
    agency: '',
    bio: '',
    currentActivity: null,
    all: { wins: 0, losses: 0, matches: 0, currentStreak: 0, bestStreak: 0 },
    matching: { wins: 0, losses: 0, matches: 0 },
    quiz: { wins: 0, losses: 0, matches: 0 },
    blaster: { wins: 0, losses: 0, matches: 0 },
  }
}

function describeDuelProfileCurrentActivity(activity: DuelProfileSnapshot['currentActivity']): DuelProfileActivityDisplay {
  const activityLabel = String(activity?.label || '').trim()
  const fallbackLabel = activityLabel ? `Last activity: ${activityLabel}` : 'No recent activity'

  if (!activityLabel) {
    return {
      state: 'offline',
      statusLabel: 'Offline',
      mainLabel: 'Offline',
      subLabel: 'No recent activity',
    }
  }

  const updatedAtMs = Date.parse(activity?.updatedAt || '')
  if (!Number.isFinite(updatedAtMs)) {
    return {
      state: 'active',
      statusLabel: 'Active',
      mainLabel: activityLabel,
      subLabel: 'Active now',
    }
  }
  const elapsedMs = Math.max(0, Date.now() - updatedAtMs)
  if (elapsedMs <= 90_000) {
    return {
      state: 'active',
      statusLabel: 'Active',
      mainLabel: activityLabel,
      subLabel: 'Active now',
    }
  }
  if (elapsedMs <= 15 * 60 * 1000) {
    return {
      state: 'idle',
      statusLabel: 'Idling',
      mainLabel: 'Idling',
      subLabel: fallbackLabel,
    }
  }
  return {
    state: 'offline',
    statusLabel: 'Offline',
    mainLabel: 'Offline',
    subLabel: fallbackLabel,
  }
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
    level: Math.max(1, Math.floor(Number(row.level || 1))),
    haloClass: typeof row.haloClass === 'string' && row.haloClass.trim()
      ? row.haloClass
      : fallbackLevelHaloClass(Number(row.level || 1)),
    profileDecorationKey: typeof row.profileDecorationKey === 'string' ? row.profileDecorationKey : 'auto',
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

function emptyDuelBotStats(): DuelBotStats {
  return {
    version: duelBotStatsVersion,
    wins: 0,
    losses: 0,
    matches_played: 0,
    current_win_streak: 0,
    best_win_streak: 0,
    best_score: 0,
    best_difficulty: '',
    wins_by_difficulty: {
      easy: 0,
      medium: 0,
      hard: 0,
      'very-hard': 0,
    },
    updated_at: '',
  }
}

function duelBotStatsCacheKey(userId: string) {
  return `leo-study:duel-bot-stats:v${duelBotStatsVersion}:${userId}`
}

function sanitizeDuelBotStats(input: unknown): DuelBotStats {
  const fallback = emptyDuelBotStats()
  if (!input || typeof input !== 'object') return fallback
  const row = input as Record<string, unknown>
  const winsByDifficultyRaw = row.wins_by_difficulty && typeof row.wins_by_difficulty === 'object'
    ? row.wins_by_difficulty as Partial<Record<DuelBotResolvedDifficulty, unknown>>
    : {}
  const bestDifficulty = String(row.best_difficulty || '') as DuelBotResolvedDifficulty | ''
  return {
    version: duelBotStatsVersion,
    wins: Math.max(0, Math.floor(Number(row.wins || 0))),
    losses: Math.max(0, Math.floor(Number(row.losses || 0))),
    matches_played: Math.max(0, Math.floor(Number(row.matches_played || 0))),
    current_win_streak: Math.max(0, Math.floor(Number(row.current_win_streak || 0))),
    best_win_streak: Math.max(0, Math.floor(Number(row.best_win_streak || 0))),
    best_score: Math.max(0, Math.floor(Number(row.best_score || 0))),
    best_difficulty: bestDifficulty && duelBotDifficultyRank[bestDifficulty] ? bestDifficulty : '',
    wins_by_difficulty: {
      easy: Math.max(0, Math.floor(Number(winsByDifficultyRaw.easy || 0))),
      medium: Math.max(0, Math.floor(Number(winsByDifficultyRaw.medium || 0))),
      hard: Math.max(0, Math.floor(Number(winsByDifficultyRaw.hard || 0))),
      'very-hard': Math.max(0, Math.floor(Number(winsByDifficultyRaw['very-hard'] || 0))),
    },
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : '',
  }
}

function readDuelBotStats(userId: string) {
  if (typeof window === 'undefined' || !userId.trim()) return emptyDuelBotStats()
  try {
    const raw = window.localStorage.getItem(duelBotStatsCacheKey(userId))
    return raw ? sanitizeDuelBotStats(JSON.parse(raw)) : emptyDuelBotStats()
  } catch {
    return emptyDuelBotStats()
  }
}

function writeDuelBotStats(userId: string, stats: DuelBotStats) {
  if (typeof window === 'undefined' || !userId.trim()) return
  try {
    window.localStorage.setItem(duelBotStatsCacheKey(userId), JSON.stringify(stats))
  } catch {
    // ignore storage write failures
  }
}

function shuffleRandom<T>(items: T[]) {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    ;[copy[index], copy[swap]] = [copy[swap], copy[index]]
  }
  return copy
}

function contentCategoryToDuelCategory(item: ContentBankItem): DuelCategory {
  if (item.category === 'pc') return 'pc'
  if (item.category === 'vc') return 'vc'
  if (item.category === 'hs') return 'hs'
  return 'all'
}

function duelCategoryLabel(category: DuelCategory) {
  if (category === 'pc') return 'Penal Codes'
  if (category === 'vc') return 'Vehicle Codes'
  if (category === 'hs') return 'HS Codes'
  if (category === 'scenarios') return 'Scenarios'
  return 'All Codes'
}

function codeItemSection(item: ContentBankItem) {
  return String(item.codeSection || item.answer || '').trim()
}

function codeItemDefinition(item: ContentBankItem) {
  return String(item.title || item.explanation || item.question || '').trim()
}

function uniqueBotStrings(items: string[]) {
  const seen = new Set<string>()
  const results: string[] = []
  items.forEach((item) => {
    const value = String(item || '').trim()
    const key = value.toLowerCase()
    if (!value || seen.has(key)) return
    seen.add(key)
    results.push(value)
  })
  return results
}

function getBotCodeItems(category: DuelCategory, minimumItems = 6) {
  const bundle = loadLocalContentBundle()
  const codeItems = bundle.codeItems
    .filter((item) => codeItemSection(item) && codeItemDefinition(item))
    .filter((item) => category === 'all' || category === 'scenarios' || contentCategoryToDuelCategory(item) === category)
  const fallbackItems = bundle.codeItems.filter((item) => codeItemSection(item) && codeItemDefinition(item))
  return codeItems.length >= minimumItems ? codeItems : fallbackItems
}

function prioritizeBotCodeItems(items: ContentBankItem[], priorityCodes: string[] = []) {
  const prioritySet = new Set(priorityCodes.map(normalizeBlasterTarget).filter(Boolean))
  if (prioritySet.size === 0) return shuffleRandom(items)
  const priorityItems = shuffleRandom(items.filter((item) => prioritySet.has(normalizeBlasterTarget(codeItemSection(item)))))
  const nonPriorityItems = shuffleRandom(items.filter((item) => !prioritySet.has(normalizeBlasterTarget(codeItemSection(item)))))
  return [...priorityItems, ...nonPriorityItems]
}

function pickBotDistractors(
  correctItem: ContentBankItem,
  pool: ContentBankItem[],
  count: number,
  mode: 'definition' | 'section',
) {
  const correctValue = mode === 'definition' ? codeItemDefinition(correctItem) : codeItemSection(correctItem)
  const normalizedCorrect = mode === 'definition'
    ? correctValue.toLowerCase()
    : normalizeBlasterTarget(correctValue)
  const sameCategory = shuffleRandom(pool.filter((item) => {
    if (item.id === correctItem.id) return false
    if (contentCategoryToDuelCategory(item) !== contentCategoryToDuelCategory(correctItem)) return false
    const candidate = mode === 'definition' ? codeItemDefinition(item) : codeItemSection(item)
    return (mode === 'definition' ? candidate.toLowerCase() : normalizeBlasterTarget(candidate)) !== normalizedCorrect
  }))
  const anyCategory = shuffleRandom(pool.filter((item) => {
    if (item.id === correctItem.id) return false
    const candidate = mode === 'definition' ? codeItemDefinition(item) : codeItemSection(item)
    return (mode === 'definition' ? candidate.toLowerCase() : normalizeBlasterTarget(candidate)) !== normalizedCorrect
  }))
  return uniqueBotStrings([...sameCategory, ...anyCategory].map((item) => mode === 'definition' ? codeItemDefinition(item) : codeItemSection(item))).slice(0, count)
}

function buildBotQuizRounds(category: DuelCategory, roundCount = 10, priorityCodes: string[] = []) {
  const usableItems = getBotCodeItems(category, 4)
  const shuffledItems = prioritizeBotCodeItems(usableItems, priorityCodes)
  const rounds: QuizRoundPayload[] = []

  for (let index = 0; index < Math.min(roundCount, shuffledItems.length); index += 1) {
    const item = shuffledItems[index]
    const correctCode = codeItemSection(item)
    const correctDefinition = codeItemDefinition(item)
    if (!correctCode || !correctDefinition) continue
    const asksForDefinition = index % 2 === 0
    const correctAnswer = asksForDefinition ? correctDefinition : correctCode
    const distractors = pickBotDistractors(item, usableItems, 5, asksForDefinition ? 'definition' : 'section')
    const choices = shuffleRandom(uniqueBotStrings([correctAnswer, ...distractors]).slice(0, 4))
    const correctIndex = choices.findIndex((choice) => choice.toLowerCase() === correctAnswer.toLowerCase())
    if (choices.length < 2 || correctIndex < 0) continue
    rounds.push({
      round: rounds.length + 1,
      prompt: asksForDefinition
        ? `What best matches ${correctCode}?`
        : `Which section number matches: ${correctDefinition}?`,
      choices,
      correctIndex,
      explanation: item.explanation || `${correctCode}: ${correctDefinition}.`,
      sourceLabel: item.category.toUpperCase(),
    })
  }

  return rounds
}

function buildBotMatchingRounds(category: DuelCategory, roundCount = 5, priorityCodes: string[] = []) {
  const usableItems = getBotCodeItems(category, 3)
  const shuffledItems = prioritizeBotCodeItems(usableItems, priorityCodes)
  const rounds: MatchingRoundPayload[] = []
  let itemIndex = 0

  for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
    const selectedItems: ContentBankItem[] = []
    const usedSections = new Set<string>()
    while (selectedItems.length < 3 && itemIndex < shuffledItems.length) {
      const item = shuffledItems[itemIndex]
      itemIndex += 1
      const section = codeItemSection(item)
      const definition = codeItemDefinition(item)
      const sectionKey = normalizeBlasterTarget(section)
      if (!section || !definition || usedSections.has(sectionKey)) continue
      usedSections.add(sectionKey)
      selectedItems.push(item)
    }
    if (selectedItems.length < 3) break
    rounds.push({
      round: rounds.length + 1,
      pairs: selectedItems.map((item, pairIndex) => ({
        pairId: `bot-match-${rounds.length + 1}-${pairIndex}-${item.id}`,
        left: codeItemSection(item),
        right: codeItemDefinition(item),
      })),
    })
  }

  return rounds
}

function buildMatchingCardsForRound(round: MatchingRoundPayload, seed: string) {
  const cards = round.pairs.flatMap((pair) => ([
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
  return seededShuffle(cards, seed)
}

function buildBotBlasterRounds(category: DuelCategory, roundCount = duelBlasterRoundCap, priorityCodes: string[] = []) {
  const usableItems = getBotCodeItems(category, 6)
  const shuffledItems = prioritizeBotCodeItems(usableItems, priorityCodes)
  const distractorPool = shuffleRandom(usableItems.map(codeItemSection).filter(Boolean))
  const rounds: BlasterRoundPayload[] = []

  for (let index = 0; index < Math.min(roundCount, shuffledItems.length); index += 1) {
    const item = shuffledItems[index]
    const correctCode = codeItemSection(item)
    if (!correctCode) continue
    const distractors = distractorPool.filter((target) => normalizeBlasterTarget(target) !== normalizeBlasterTarget(correctCode))
    const targets = shuffleRandom(uniqueBlasterTargets([correctCode, ...distractors]).slice(0, 6))
    const resolvedTargets = targets.length >= 2 ? targets : [correctCode, ...distractors.slice(0, 5)]
    const correctIndex = Math.max(0, resolvedTargets.findIndex((target) => normalizeBlasterTarget(target) === normalizeBlasterTarget(correctCode)))
    rounds.push({
      round: rounds.length + 1,
      prompt: item.title || item.question.replace(/^Which section number matches:\s*/i, '').replace(/\?$/, ''),
      targets: resolvedTargets,
      correctIndex,
      correctCode,
      explanation: item.explanation,
      sourceLabel: item.category.toUpperCase(),
    })
  }

  return rounds
}

function parseDuelBotSkillSnapshot(input: unknown, fallbackStats: DuelStatsLeaderboardEntry | null): DuelBotSkillSnapshot {
  const row = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const profileDetails = row.profile_details && typeof row.profile_details === 'object'
    ? row.profile_details as Record<string, unknown>
    : {}
  const stats = profileDetails.stats && typeof profileDetails.stats === 'object'
    ? profileDetails.stats as Record<string, unknown>
    : {}
  const studyModeCounts = stats.studyModeCounts && typeof stats.studyModeCounts === 'object'
    ? stats.studyModeCounts as Record<string, unknown>
    : {}
  const algorithmSnapshot = profileDetails.algorithmSnapshot && typeof profileDetails.algorithmSnapshot === 'object'
    ? profileDetails.algorithmSnapshot as Record<string, unknown>
    : {}
  const categoryNeed: Record<'pc' | 'vc' | 'hs', number> = { pc: 0, vc: 0, hs: 0 }
  const weakCodes: Array<{ section: string; need: number }> = []
  Object.values(algorithmSnapshot).forEach((entry) => {
    if (!entry || typeof entry !== 'object') return
    const snapshot = entry as Record<string, unknown>
    const codeSet = String(snapshot.codeSet || '').toLowerCase()
    const attempts = Math.max(0, Number(snapshot.attempts || 0))
    const needScore = Math.max(0, Number(snapshot.needScore || 0))
    const status = String(snapshot.status || '')
    const bucket = codeSet === 'penal' || codeSet === 'pc'
      ? 'pc'
      : codeSet === 'vehicle' || codeSet === 'vc'
        ? 'vc'
        : codeSet === 'hs'
          ? 'hs'
          : null
    if (!bucket) return
    categoryNeed[bucket] += needScore + (status === 'Needs Work' ? 1.5 : 0) + (attempts === 0 ? 0.2 : 0)
    const section = String(snapshot.sectionNumber || '').trim()
    if (section) {
      weakCodes.push({
        section,
        need: needScore + (status === 'Needs Work' ? 2 : 0) + (attempts > 0 && Number(snapshot.accuracy || 0) < 0.7 ? 1 : 0),
      })
    }
  })
  const studyBuckets: Array<'pc' | 'hs' | 'vc'> = ['pc', 'hs', 'vc']
  const leastStudied = [...studyBuckets].sort((left, right) => Number(studyModeCounts[left] || 0) - Number(studyModeCounts[right] || 0))[0]
  const weakCategory = Object.values(categoryNeed).some((value) => value > 0)
    ? (Object.entries(categoryNeed).sort((left, right) => right[1] - left[1])[0]?.[0] as DuelCategory) || 'all'
    : leastStudied === 'pc'
      ? 'pc'
      : leastStudied === 'vc'
        ? 'vc'
        : leastStudied === 'hs'
          ? 'hs'
          : 'all'

  return {
    studySeconds: Math.max(0, Math.floor(Number(stats.studySeconds || 0))),
    blasterWins: Math.max(0, Math.floor(Number(fallbackStats?.wins || 0))),
    duelWins: Math.max(0, Math.floor(Number(fallbackStats?.wins || 0))),
    masteredCodes: Math.max(0, Math.floor(Number(stats.lifetimeMasteredCodes || 0))),
    weakCategory,
    weakCodes: weakCodes
      .sort((left, right) => right.need - left.need)
      .map((entry) => entry.section)
      .filter((section, index, all) => all.findIndex((candidate) => normalizeBlasterTarget(candidate) === normalizeBlasterTarget(section)) === index)
      .slice(0, 18),
  }
}

function resolveBotDifficulty(input: DuelBotDifficulty, skill: DuelBotSkillSnapshot): DuelBotResolvedDifficulty {
  if (input === 'easy' || input === 'medium' || input === 'hard' || input === 'very-hard') return input
  if (input === 'random') {
    const roll = Math.random()
    if (roll < 0.22) return 'easy'
    if (roll < 0.58) return 'medium'
    if (roll < 0.88) return 'hard'
    return 'very-hard'
  }
  const studyHours = skill.studySeconds / 3600
  const score = studyHours * 0.7 + skill.duelWins * 1.25 + skill.blasterWins * 1.35 + skill.masteredCodes * 0.18
  if (score >= 38) return 'very-hard'
  if (score >= 18) return 'hard'
  if (score >= 6) return 'medium'
  return 'easy'
}

function duelBotDifficultyConfig(difficulty: DuelBotResolvedDifficulty, scoreGap: number, userHotStreak = 0) {
  const base = {
    easy: { minDelay: 2400, maxDelay: 4300, accuracy: 0.56, points: 106 },
    medium: { minDelay: 2600, maxDelay: 4300, accuracy: 0.66, points: 118 },
    hard: { minDelay: 1450, maxDelay: 2850, accuracy: 0.81, points: 134 },
    'very-hard': { minDelay: 850, maxDelay: 1750, accuracy: 0.91, points: 152 },
  }[difficulty]
  const mercyAccuracyDrop = difficulty === 'very-hard'
    ? scoreGap < -540 ? 0.06 : scoreGap < -340 ? 0.035 : 0
    : scoreGap < -420 ? 0.12 : scoreGap < -260 ? 0.07 : 0
  const pressureAccuracyBoost = scoreGap > 260 ? (difficulty === 'easy' ? 0.025 : 0.04) : 0
  const hotStreakTier = Math.max(0, Math.floor((userHotStreak - duelBotCatchupStreakThreshold) / 2) + 1)
  const catchupActive = userHotStreak >= duelBotCatchupStreakThreshold && scoreGap >= duelBotCatchupLeadThreshold
  const catchupStrength = catchupActive ? Math.min(4, hotStreakTier) : 0
  const delayMultiplier = catchupStrength > 0 ? Math.max(0.38, 0.66 - catchupStrength * 0.075) : 1
  const accuracyCap = difficulty === 'very-hard' ? 0.97 : difficulty === 'hard' ? 0.95 : 0.92
  return {
    ...base,
    minDelay: Math.round(base.minDelay * delayMultiplier),
    maxDelay: Math.round(base.maxDelay * delayMultiplier),
    accuracy: Math.max(0.32, Math.min(accuracyCap, base.accuracy - mercyAccuracyDrop + pressureAccuracyBoost + catchupStrength * 0.06)),
    points: base.points + catchupStrength * 24,
    catchupActive,
    catchupStrength,
  }
}

function duelBotOpeningDelayMultiplier(difficulty: DuelBotResolvedDifficulty, botRound: number, botTotalMs: number) {
  if (difficulty !== 'easy') return 1
  if (botRound !== 1 || botTotalMs > 0) return 1
  return 0.32
}

function duelBotModeDelayMultiplier(gameType: DuelGameType, difficulty: DuelBotResolvedDifficulty) {
  if (gameType === 'quiz') {
    if (difficulty === 'very-hard') return 0.82
    if (difficulty === 'hard') return 0.96
    if (difficulty === 'medium') return 1.05
    return 1.18
  }
  if (gameType === 'matching') {
    if (difficulty === 'very-hard') return 1.05
    if (difficulty === 'hard') return 1.2
    if (difficulty === 'medium') return 1.35
    return 1.55
  }
  return 1
}

function calculateDuelQuizPoints(correct: boolean, nextStreak: number, elapsedMs: number) {
  const speedBonus = correct ? Math.max(0, Math.min(40, Math.round((9000 - elapsedMs) / 300))) : 0
  const streakBonus = correct ? Math.min(70, nextStreak * 10) : 0
  return correct ? 100 + speedBonus + streakBonus : -15
}

function calculateDuelMatchingBotPoints(correct: boolean, nextStreak: number, elapsedMs: number, roundProgressPoints = 90) {
  if (!correct) return -15
  const speedBonus = Math.max(0, Math.min(60, Math.round((22_000 - elapsedMs) / 400)))
  const streakBonus = Math.min(75, nextStreak * 12)
  return Math.max(20, roundProgressPoints + 25 + speedBonus + streakBonus)
}

function calculateDuelBlasterPointDetails(
  correct: boolean,
  nextStreak: number,
  elapsedMs: number,
  powerup: DuelBlasterPowerup | null,
  mode: DuelBlasterMode,
) {
  let streakBonus = correct ? Math.min(80, Math.floor(nextStreak / 3) * 20) : 0
  if (correct && powerup?.key === 'radio') streakBonus *= 2
  const quickDrawBonus = correct && powerup?.key === 'coffee' && mode === 'timed' && elapsedMs <= 4000 ? 75 : 0
  const backupBonus = correct && powerup?.key === 'backup' ? 65 : 0
  const evidenceBonus = correct && powerup?.key === 'evidence' ? Math.min(90, Math.max(30, Math.floor(nextStreak / 2) * 30)) : 0
  const missPenalty = powerup?.key === 'vest' ? 35 : duelBlasterMissPenalty
  const points = correct
    ? (powerup?.points || 120) + streakBonus + quickDrawBonus + backupBonus + evidenceBonus
    : -missPenalty
  return {
    points,
    streakBonus,
    quickDrawBonus,
    backupBonus,
    evidenceBonus,
    missPenalty,
  }
}

function botDifficultyDisplay(difficulty: DuelBotDifficulty, resolved: DuelBotResolvedDifficulty) {
  if (difficulty === 'adaptive') return `Adaptive · ${duelBotResolvedDifficultyLabels[resolved]}`
  if (difficulty === 'random') return `Random · ${duelBotResolvedDifficultyLabels[resolved]}`
  return duelBotResolvedDifficultyLabels[resolved]
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

function isBlasterRound(value: unknown): value is BlasterRoundPayload {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<BlasterRoundPayload>
  return typeof row.round === 'number'
    && typeof row.prompt === 'string'
    && Array.isArray(row.targets)
    && typeof row.correctIndex === 'number'
}

function connect4CellClass(cell: Connect4Cell, isWinningCell = false) {
  const baseClass = cell === 'P1'
    ? 'connect4-cell connect4-cell-p1'
    : cell === 'P2'
      ? 'connect4-cell connect4-cell-p2'
      : 'connect4-cell connect4-cell-empty'
  return isWinningCell ? `${baseClass} connect4-cell-winning` : baseClass
}

function connect4CellLabel(cell: Connect4Cell, rowIndex: number, columnIndex: number) {
  const token = cell === 'P1' ? 'Player 1 disc' : cell === 'P2' ? 'Player 2 disc' : 'Empty'
  return `${token}, row ${rowIndex + 1}, column ${columnIndex + 1}`
}

function connect4WinningCellKey(rowIndex: number, columnIndex: number) {
  return `${rowIndex}:${columnIndex}`
}

function connect4WinLineStyle(cells: Connect4Coordinate[]): CSSProperties | undefined {
  if (cells.length < 2) return undefined
  const [startCell] = cells
  const endCell = cells[cells.length - 1]
  const leftPercent = ((startCell.column + 0.5) / connect4Columns) * 100
  const topPercent = ((startCell.row + 0.5) / connect4Rows) * 100
  const deltaXPercent = ((endCell.column - startCell.column) / connect4Columns) * 100
  const deltaYPercent = ((endCell.row - startCell.row) / connect4Rows) * 100
  const angle = Math.atan2(deltaYPercent, deltaXPercent) * (180 / Math.PI)

  return {
    left: `${leftPercent}%`,
    top: `${topPercent}%`,
    width: `${Math.hypot(deltaXPercent, deltaYPercent)}%`,
    transform: `translateY(-50%) rotate(${angle}deg)`,
  }
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
    message: typeof row.message === 'string' ? row.message : undefined,
    started_at: typeof row.started_at === 'string' ? row.started_at : null,
    room_id: typeof row.room_id === 'string' ? row.room_id : undefined,
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

const duelRoomStatuses: DuelRoomStatus[] = ['waiting', 'in_progress', 'completed', 'cancelled']

function asSnapshotRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function asSnapshotRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(asSnapshotRecord).filter((row): row is Record<string, unknown> => row !== null)
    : []
}

function normalizeDuelRoomStatus(value: unknown): DuelRoomStatus {
  const status = String(value || '').trim()
  return duelRoomStatuses.includes(status as DuelRoomStatus) ? (status as DuelRoomStatus) : 'waiting'
}

function getWinnerUserIdFromResults(resultRows: Record<string, unknown>[]): string | null {
  const winner = resultRows.find((row) => Boolean(row.is_winner))
  const userId = winner ? String(winner.user_id || '').trim() : ''
  return userId || null
}

function mapDuelRoomSnapshot(
  row: Record<string, unknown>,
  options: { forceCompleted?: boolean; winnerUserId?: string | null } = {},
): DuelRoomRow {
  const status = options.forceCompleted ? 'completed' : normalizeDuelRoomStatus(row.status)
  return {
    id: String(row.id || ''),
    host_user_id: String(row.host_user_id || ''),
    game_type: String(row.game_type || 'quiz') as DuelGameType,
    category: String(row.category || 'all') as DuelCategory,
    is_public: Boolean(row.is_public),
    join_code: row.join_code ? String(row.join_code) : null,
    rounds: Number(row.rounds || 5),
    question_set: row.question_set,
    status,
    current_round: Number(row.current_round || 1),
    winner_user_id: row.winner_user_id ? String(row.winner_user_id) : options.winnerUserId || null,
    created_at: String(row.created_at || ''),
    started_at: row.started_at ? String(row.started_at) : null,
    settings: row.settings && typeof row.settings === 'object' ? (row.settings as Record<string, unknown>) : {},
  }
}

function mapDuelPlayerSnapshot(row: Record<string, unknown>): DuelRoomPlayerRow {
  return {
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
    finished_at: row.finished_at ? String(row.finished_at) : null,
  }
}

function mapDuelResultSnapshot(row: Record<string, unknown>): DuelRoomResultRow {
  return {
    id: String(row.id || ''),
    room_id: String(row.room_id || ''),
    user_id: String(row.user_id || ''),
    score: Number(row.score || 0),
    total_time_ms: Number(row.total_time_ms || 0),
    placement: Number(row.placement || 2),
    is_winner: Boolean(row.is_winner),
    finished_at: row.finished_at ? String(row.finished_at) : null,
  }
}

export function OneVsOnePanel(props: {
  currentUserId: string
  currentUsername: string
  isOwner?: boolean
  externalJoinRoomId?: string | null
  onExternalJoinHandled?: () => void
  invitePreset?: 'rope-blaster' | 'bot-practice' | null
  onInvitePresetHandled?: () => void
  onStudyActivity?: () => void
  onActiveMatchChange?: (active: boolean) => void
  connect4Enabled?: boolean
  onDuelPerformanceReward?: (result: {
    roomId: string
    gameType: DuelGameType
    rounds: number
    score: number
    opponentScore: number
    won: boolean
    draw: boolean
    moveCount?: number
  }) => void
  sessionXpReward?: ReactNode
}) {
  const {
    currentUserId,
    currentUsername,
    isOwner = false,
    externalJoinRoomId = null,
    onExternalJoinHandled,
    invitePreset = null,
    onInvitePresetHandled,
    onStudyActivity,
    onActiveMatchChange,
    connect4Enabled = true,
    onDuelPerformanceReward,
    sessionXpReward,
  } = props

  const availableDuelGameTypeOptions = useMemo(
    () => duelGameTypeOptions.filter((option) => option.value !== 'connect4' || connect4Enabled),
    [connect4Enabled],
  )
  const [selectedGameType, setSelectedGameType] = useState<DuelGameType>('quiz')
  const [selectedCategory, setSelectedCategory] = useState<DuelCategory>('all')
  const [selectedPowerupsEnabled, setSelectedPowerupsEnabled] = useState(duelBlasterDefaultPowerupsEnabled)
  const [selectedBlasterMode, setSelectedBlasterMode] = useState<DuelBlasterMode>('timed')
  const [selectedBlasterDurationSeconds, setSelectedBlasterDurationSeconds] = useState(duelBlasterDefaultDurationSeconds)
  const [selectedBlasterOvertimeEnabled, setSelectedBlasterOvertimeEnabled] = useState(duelBlasterDefaultOvertimeEnabled)
  const [selectedBlasterOvertimeAfterSeconds, setSelectedBlasterOvertimeAfterSeconds] = useState(duelBlasterDefaultOvertimeAfterSeconds)
  const [isPublicRoom, setIsPublicRoom] = useState(true)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showBotSetupModal, setShowBotSetupModal] = useState(false)
  const [inviteGameType, setInviteGameType] = useState<DuelGameType>('quiz')
  const [inviteCategory, setInviteCategory] = useState<DuelCategory>('all')
  const [inviteQuizRounds, setInviteQuizRounds] = useState(10)
  const [invitePowerupsEnabled, setInvitePowerupsEnabled] = useState(duelBlasterDefaultPowerupsEnabled)
  const [inviteBlasterMode, setInviteBlasterMode] = useState<DuelBlasterMode>('timed')
  const [inviteBlasterDurationSeconds, setInviteBlasterDurationSeconds] = useState(duelBlasterDefaultDurationSeconds)
  const [inviteBlasterOvertimeEnabled, setInviteBlasterOvertimeEnabled] = useState(duelBlasterDefaultOvertimeEnabled)
  const [inviteBlasterOvertimeAfterSeconds, setInviteBlasterOvertimeAfterSeconds] = useState(duelBlasterDefaultOvertimeAfterSeconds)
  const [onlineInviteUsers, setOnlineInviteUsers] = useState<OnlineInviteUser[]>([])
  const [onlineInviteLoading, setOnlineInviteLoading] = useState(false)
  const [inviteSendingUserId, setInviteSendingUserId] = useState<string | null>(null)
  const [showPowerupGlossary, setShowPowerupGlossary] = useState(false)
  const [botDifficulty, setBotDifficulty] = useState<DuelBotDifficulty>('adaptive')
  const [botStarting, setBotStarting] = useState(false)
  const [botMatch, setBotMatch] = useState<DuelBotMatch | null>(null)
  const [connect4BotMatch, setConnect4BotMatch] = useState<Connect4BotMatch | null>(null)
  const [botStats, setBotStats] = useState<DuelBotStats>(() => readDuelBotStats(currentUserId))
  const [botSkillSnapshot, setBotSkillSnapshot] = useState<DuelBotSkillSnapshot>(() => parseDuelBotSkillSnapshot(null, null))

  const [publicRooms, setPublicRooms] = useState<LobbyRoomItem[]>([])
  const [joinCodeInput, setJoinCodeInput] = useState('')
  const [roomId, setRoomId] = useState<string | null>(null)
  const [showCreateRoomModal, setShowCreateRoomModal] = useState(false)
  const [showChangeModeModal, setShowChangeModeModal] = useState(false)
  const [lobbyEditGameType, setLobbyEditGameType] = useState<DuelGameType>('quiz')
  const [lobbyEditCategory, setLobbyEditCategory] = useState<DuelCategory>('all')
  const [lobbyEditQuizRounds, setLobbyEditQuizRounds] = useState(10)
  const [lobbyEditPowerupsEnabled, setLobbyEditPowerupsEnabled] = useState(duelBlasterDefaultPowerupsEnabled)
  const [lobbyEditBlasterMode, setLobbyEditBlasterMode] = useState<DuelBlasterMode>('timed')
  const [lobbyEditBlasterDurationSeconds, setLobbyEditBlasterDurationSeconds] = useState(duelBlasterDefaultDurationSeconds)
  const [lobbyEditBlasterOvertimeEnabled, setLobbyEditBlasterOvertimeEnabled] = useState(duelBlasterDefaultOvertimeEnabled)
  const [lobbyEditBlasterOvertimeAfterSeconds, setLobbyEditBlasterOvertimeAfterSeconds] = useState(duelBlasterDefaultOvertimeAfterSeconds)
  const [lobbySettingsSaving, setLobbySettingsSaving] = useState(false)
  const lockGameSetupPageScroll = showInviteModal || showBotSetupModal || showCreateRoomModal || showChangeModeModal || showPowerupGlossary
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
  const [waitingChatMessages, setWaitingChatMessages] = useState<WaitingRoomMessage[]>([])
  const [waitingChatInput, setWaitingChatInput] = useState('')
  const [waitingChatSending, setWaitingChatSending] = useState(false)

  const [roundStartedAt, setRoundStartedAt] = useState<number>(0)
  const [hudNow, setHudNow] = useState<number>(() => Date.now())
  const [, setSubmittingRound] = useState(false)
  const [quizChoice, setQuizChoice] = useState<number | null>(null)
  const [quizLocked, setQuizLocked] = useState(false)

  const [matchingCards, setMatchingCards] = useState<DuelMatchCard[]>([])
  const [selectedMatchingCards, setSelectedMatchingCards] = useState<string[]>([])
  const [wrongMatchingCardIds, setWrongMatchingCardIds] = useState<string[]>([])
  const [matchedPairIds, setMatchedPairIds] = useState<string[]>([])
  const [, setMatchingMistakes] = useState(0)
  const [matchingRoundPoints, setMatchingRoundPoints] = useState(0)
  const [matchingSubmitted, setMatchingSubmitted] = useState(false)
  const [blasterChoice, setBlasterChoice] = useState<number | null>(null)
  const [blasterChoiceRound, setBlasterChoiceRound] = useState<number | null>(null)
  const [blasterLocked, setBlasterLocked] = useState(false)
  const [blasterStreak, setBlasterStreak] = useState(0)
  const [, setBlasterFeedback] = useState('')
  const [blasterVisibleTargets, setBlasterVisibleTargets] = useState<string[]>([])
  const [blasterShotBursts, setBlasterShotBursts] = useState<BlasterShotBurst[]>([])
  const [blasterTugPulse, setBlasterTugPulse] = useState<'pull' | 'miss' | ''>('')
  const [blasterDisruption, setBlasterDisruption] = useState<DuelBlasterDisruption | null>(null)
  const [blasterCloudStatus, setBlasterCloudStatus] = useState<RopeBlasterCloudStatus>(ropeBlasterWorkerUrl ? 'connecting' : 'disabled')
  const [blasterCloudLatencyMs, setBlasterCloudLatencyMs] = useState<number | null>(null)
  const previousPlayersRef = useRef<DuelRoomPlayerRow[]>([])
  const previousRoomStatusRef = useRef<DuelRoomStatus | null>(null)
  const activityBootstrappedRef = useRef(false)
  const initializedRoundKeyRef = useRef('')
  const activeRoomIdRef = useRef<string | null>(roomId)
  const liveRoomRef = useRef<DuelRoomRow | null>(null)
  const livePlayersRef = useRef<DuelRoomPlayerRow[]>([])
  const refreshInFlightRef = useRef(false)
  const refreshQueuedRef = useRef(false)
  const roundSubmitQueueRef = useRef<Promise<void>>(Promise.resolve())
  const roomRealtimeChannelRef = useRef<RealtimeChannel | null>(null)
  const ropeBlasterSocketRef = useRef<WebSocket | null>(null)
  const ropeBlasterPingTimerRef = useRef<number | null>(null)
  const ropeBlasterReconnectTimerRef = useRef<number | null>(null)
  const ropeBlasterSequenceRef = useRef(0)
  const latestBlasterBroadcastRef = useRef<Record<string, { currentRound: number; sentAt: number }>>({})
  const waitingChatEndRef = useRef<HTMLDivElement | null>(null)
  const rewardedResultRoomIdsRef = useRef<Set<string>>(new Set())
  const duelProfileCacheRef = useRef<Record<string, DuelProfileSnapshot>>({})
  const duelLeaderboardRequestRef = useRef(0)
  const winsLeaderboardRef = useRef<DuelStatsLeaderboardEntry[]>(winsLeaderboard)
  const streakLeaderboardRef = useRef<DuelStatsLeaderboardEntry[]>(streakLeaderboard)
  const myDuelStatsRef = useRef<DuelStatsLeaderboardEntry | null>(myDuelStats)
  const roundStartedAtRef = useRef(0)
  const autoForfeitRoundKeyRef = useRef('')
  const quizSpamHistoryRef = useRef<QuizSpamSample[]>([])
  const quizSpamStrikeRef = useRef(0)
  const blasterTugPulseTimerRef = useRef<number | null>(null)
  const blasterDisruptionTimerRef = useRef<number | null>(null)
  const blasterDisruptionRef = useRef<DuelBlasterDisruption | null>(null)
  const blasterFieldRef = useRef<HTMLDivElement | null>(null)
  const blasterTargetRefs = useRef<Record<string, HTMLElement | null>>({})
  const blasterAnimationFrameRef = useRef<number | null>(null)
  const blasterBodiesRef = useRef<BlasterAsteroidBody[]>([])
  const blasterMotionRoundRef = useRef(0)
  const blasterMotionTargetsRef = useRef<string[]>([])
  const blasterRespawnTargetIndexRef = useRef<number | null>(null)
  const blasterVisibleTargetsRef = useRef<string[]>([])
  const blasterVisibleRoundKeyRef = useRef('')
  const blasterPendingReplacementIndexRef = useRef<number | null>(null)
  const botAnswerTimerRef = useRef<number | null>(null)
  const botMatchRef = useRef<DuelBotMatch | null>(null)
  const recordedBotMatchIdsRef = useRef<Set<string>>(new Set())

  const isSignedIn = currentUserId.trim().length > 0
  const markStudyActivity = useCallback(() => {
    onStudyActivity?.()
  }, [onStudyActivity])

  useEffect(() => {
    activeRoomIdRef.current = roomId
  }, [roomId])

  useEffect(() => {
    liveRoomRef.current = room
  }, [room])

  useEffect(() => {
    livePlayersRef.current = players
  }, [players])

  useEffect(() => {
    duelProfileCacheRef.current = duelProfileByUserId
  }, [duelProfileByUserId])

  useEffect(() => {
    latestBlasterBroadcastRef.current = {}
  }, [roomId])

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
    setBotStats(readDuelBotStats(currentUserId))
  }, [currentUserId])

  useEffect(() => {
    botMatchRef.current = botMatch
  }, [botMatch])

  useEffect(() => {
    if (!lockGameSetupPageScroll || typeof window === 'undefined' || typeof document === 'undefined') return

    const html = document.documentElement
    const body = document.body
    const scrollY = window.scrollY || html.scrollTop || 0
    const scrollbarGap = Math.max(0, window.innerWidth - html.clientWidth)
    const previousHtmlOverflow = html.style.overflow
    const previousHtmlOverscrollBehavior = html.style.overscrollBehavior
    const previousBodyOverflow = body.style.overflow
    const previousBodyOverscrollBehavior = body.style.overscrollBehavior
    const previousBodyPosition = body.style.position
    const previousBodyTop = body.style.top
    const previousBodyLeft = body.style.left
    const previousBodyRight = body.style.right
    const previousBodyWidth = body.style.width
    const previousBodyPaddingRight = body.style.paddingRight

    html.style.overflow = 'hidden'
    html.style.overscrollBehavior = 'none'
    body.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'none'
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
    if (scrollbarGap > 0) {
      body.style.paddingRight = `${scrollbarGap}px`
    }

    return () => {
      html.style.overflow = previousHtmlOverflow
      html.style.overscrollBehavior = previousHtmlOverscrollBehavior
      body.style.overflow = previousBodyOverflow
      body.style.overscrollBehavior = previousBodyOverscrollBehavior
      body.style.position = previousBodyPosition
      body.style.top = previousBodyTop
      body.style.left = previousBodyLeft
      body.style.right = previousBodyRight
      body.style.width = previousBodyWidth
      body.style.paddingRight = previousBodyPaddingRight
      window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' })
    }
  }, [lockGameSetupPageScroll])

  useEffect(() => () => {
    if (blasterTugPulseTimerRef.current !== null) {
      window.clearTimeout(blasterTugPulseTimerRef.current)
      blasterTugPulseTimerRef.current = null
    }
    if (blasterAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(blasterAnimationFrameRef.current)
      blasterAnimationFrameRef.current = null
    }
    blasterBodiesRef.current = []
    if (botAnswerTimerRef.current !== null) {
      window.clearTimeout(botAnswerTimerRef.current)
      botAnswerTimerRef.current = null
    }
  }, [])

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
        settings: (row as Record<string, unknown>).settings && typeof (row as Record<string, unknown>).settings === 'object'
          ? (row as Record<string, unknown>).settings as Record<string, unknown>
          : {},
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
    }).filter((row) => row.id && (connect4Enabled || row.game_type !== 'connect4'))
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
  }, [connect4Enabled, isSignedIn])

  const loadOnlineInviteUsers = useCallback(async () => {
    if (!supabase || !isSignedIn) return
    setOnlineInviteLoading(true)
    const { data, error: rpcError } = await supabase.rpc('list_online_1v1_users', { p_minutes_interval: 5 })
    if (rpcError) {
      setOnlineInviteLoading(false)
      setError(rpcError.message || 'Could not load online users.')
      return
    }
    const baseUsers: OnlineInviteUser[] = (Array.isArray(data) ? data : []).map((row) => {
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
        level: 1,
        haloClass: 'level-halo-recruit',
        profileDecorationKey: 'auto',
        last_active: lastActive,
      }
    }).filter((row) => row.user_id)

    const userIds = baseUsers.map((user) => user.user_id)
    if (userIds.length === 0) {
      setOnlineInviteUsers([])
      setOnlineInviteLoading(false)
      return
    }

    const { data: appStateRows } = await supabase
      .from('app_state')
      .select('user_id,profile_details')
      .in('user_id', userIds)

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
      const levelSnapshot = parseDuelProfileLevelSnapshot(details)
      accumulator[userId] = {
        level: levelSnapshot.level,
        haloClass: levelSnapshot.haloClass,
        profileDecorationKey: typeof details.profileDecorationKey === 'string' ? details.profileDecorationKey : 'auto',
      }
      return accumulator
    }, {})

    setOnlineInviteUsers(baseUsers.map((user) => ({
      ...user,
      level: detailsMap[user.user_id]?.level || user.level,
      haloClass: detailsMap[user.user_id]?.haloClass || user.haloClass,
      profileDecorationKey: detailsMap[user.user_id]?.profileDecorationKey || user.profileDecorationKey,
    })))
    setOnlineInviteLoading(false)
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
        level: profile?.level || 1,
        haloClass: profile?.haloClass || 'level-halo-recruit',
        profileDecorationKey: profile?.profileDecorationKey || 'auto',
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
      next.level = entry.level || next.level
      next.haloClass = entry.haloClass || next.haloClass
      next.profileDecorationKey = entry.profileDecorationKey || next.profileDecorationKey
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
      if (!userId || !duelStatsModes.includes(gameType)) return
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
      level: number
      haloClass: string
      profileDecorationKey: string
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
      const levelSnapshot = parseDuelProfileLevelSnapshot(details)
      accumulator[userId] = {
        bio: String(details.bio || '').trim(),
        agency: String(details.agency || '').trim(),
        nameStyle: sanitizeNameStyle(details.nameStyle),
        level: levelSnapshot.level,
        haloClass: levelSnapshot.haloClass,
        profileDecorationKey: typeof details.profileDecorationKey === 'string' ? details.profileDecorationKey : 'auto',
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
      const blaster = allStatsByKey.get(`${userId}:blaster`)
      const profile = profileMap[userId]
      const details = detailsMap[userId]
      const fallbackProfile = nextProfileSnapshotByUserId[userId] || emptyDuelProfileSnapshot(userId)
      nextProfileSnapshotByUserId[userId] = {
        user_id: userId,
        username: profile?.username || fallbackProfile.username,
        avatarUrl: profile?.avatarUrl || fallbackProfile.avatarUrl,
        supporterTier: profile?.supporterTier || fallbackProfile.supporterTier,
        nameStyle: details?.nameStyle || fallbackProfile.nameStyle,
        level: details?.level || fallbackProfile.level,
        haloClass: details?.haloClass || fallbackProfile.haloClass,
        profileDecorationKey: details?.profileDecorationKey || fallbackProfile.profileDecorationKey,
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
        blaster: {
          wins: blaster?.wins || 0,
          losses: blaster?.losses || 0,
          matches: blaster?.matches_played || 0,
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

  const loadBotSkillSnapshot = useCallback(async () => {
    if (!supabase || !isSignedIn || !currentUserId) {
      const fallback = parseDuelBotSkillSnapshot(null, myDuelStatsRef.current)
      setBotSkillSnapshot(fallback)
      return fallback
    }

    const { data } = await supabase
      .from('app_state')
      .select('profile_details')
      .eq('user_id', currentUserId)
      .maybeSingle()
    const snapshot = parseDuelBotSkillSnapshot(data, myDuelStatsRef.current)
    setBotSkillSnapshot(snapshot)
    return snapshot
  }, [currentUserId, isSignedIn])

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

  const loadRoomPlayerProfiles = useCallback(async (userIds: string[]) => {
    if (!supabase || !isSignedIn) return
    const uniqueUserIds = [...new Set(userIds.map((userId) => userId.trim()).filter(Boolean))]
    if (uniqueUserIds.length === 0) return

    const [{ data: profileRows }, { data: appStateRows }] = await Promise.all([
      supabase
        .from('profiles')
        .select('user_id,username,avatar_path,supporter_tier')
        .in('user_id', uniqueUserIds),
      supabase
        .from('app_state')
        .select('user_id,profile_details')
        .in('user_id', uniqueUserIds),
    ])

    const profileMap = (Array.isArray(profileRows) ? profileRows : []).reduce<Record<string, {
      username: string
      avatarUrl: string
      supporterTier: SupporterTier
    }>>((accumulator, row) => {
      const value = row as Record<string, unknown>
      const userId = String(value.user_id || '')
      if (!userId) return accumulator
      accumulator[userId] = {
        username: String(value.username || '').trim() || fallbackUsername(userId),
        avatarUrl: toPublicAvatarUrl(String(value.avatar_path || '')),
        supporterTier: sanitizeSupporterTier(value.supporter_tier),
      }
      return accumulator
    }, {})

    const detailsMap = (Array.isArray(appStateRows) ? appStateRows : []).reduce<Record<string, {
      bio: string
      agency: string
      nameStyle: NameStyle
      level: number
      haloClass: string
      profileDecorationKey: string
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
      const levelSnapshot = parseDuelProfileLevelSnapshot(details)
      accumulator[userId] = {
        bio: String(details.bio || '').trim(),
        agency: String(details.agency || '').trim(),
        nameStyle: sanitizeNameStyle(details.nameStyle),
        level: levelSnapshot.level,
        haloClass: levelSnapshot.haloClass,
        profileDecorationKey: typeof details.profileDecorationKey === 'string' ? details.profileDecorationKey : 'auto',
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

    const nameMap = uniqueUserIds.reduce<Record<string, string>>((accumulator, userId) => {
      accumulator[userId] = profileMap[userId]?.username || fallbackUsername(userId)
      return accumulator
    }, {})
    setUsernameByUserId((previous) => ({ ...previous, ...nameMap }))

    setDuelProfileByUserId((previous) => {
      const next: Record<string, DuelProfileSnapshot> = { ...duelProfileCacheRef.current, ...previous }
      uniqueUserIds.forEach((userId) => {
        const profile = profileMap[userId]
        const details = detailsMap[userId]
        const fallbackProfile = next[userId] || emptyDuelProfileSnapshot(userId)
        next[userId] = {
          ...fallbackProfile,
          user_id: userId,
          username: profile?.username || fallbackProfile.username,
          avatarUrl: profile?.avatarUrl || fallbackProfile.avatarUrl,
          supporterTier: profile?.supporterTier || fallbackProfile.supporterTier,
          nameStyle: details?.nameStyle || fallbackProfile.nameStyle,
          level: details?.level || fallbackProfile.level,
          haloClass: details?.haloClass || fallbackProfile.haloClass,
          profileDecorationKey: details?.profileDecorationKey || fallbackProfile.profileDecorationKey,
          agency: details?.agency || fallbackProfile.agency,
          bio: details?.bio || fallbackProfile.bio,
          currentActivity: details?.currentActivity || fallbackProfile.currentActivity,
        }
      })
      duelProfileCacheRef.current = next
      return next
    })
  }, [isSignedIn])

  const applyRoomSnapshot = useCallback(async (params: {
    roomRow: Record<string, unknown>
    playerRows: unknown
    resultRows: unknown
    expectedRoomId?: string
    preferCompleted?: boolean
  }) => {
    const snapshotRoomId = String(params.roomRow.id || '').trim()
    const expectedRoomId = String(params.expectedRoomId || activeRoomIdRef.current || '').trim()
    if (!snapshotRoomId || (expectedRoomId && snapshotRoomId !== expectedRoomId)) return null
    if (activeRoomIdRef.current && snapshotRoomId !== activeRoomIdRef.current) return null

    const playerRecordRows = asSnapshotRecords(params.playerRows)
    const resultRecordRows = asSnapshotRecords(params.resultRows)
    const requiredResultCount = Math.max(2, playerRecordRows.length || 2)
    const completedByResults = resultRecordRows.length >= requiredResultCount
    const mappedRoom = mapDuelRoomSnapshot(params.roomRow, {
      forceCompleted: Boolean(params.preferCompleted) || completedByResults,
      winnerUserId: getWinnerUserIdFromResults(resultRecordRows),
    })
    const mappedPlayers = playerRecordRows.map(mapDuelPlayerSnapshot)
    const mappedResults = mappedRoom.status === 'completed'
      ? resultRecordRows.map(mapDuelResultSnapshot)
      : []

    setRoom(mappedRoom)
    setPlayers((previous) => mappedPlayers.map((player) => {
      const current = previous.find((item) => item.user_id === player.user_id)
      if (!current || mappedRoom.status !== 'in_progress') return player
      return {
        ...player,
        score: mappedRoom.game_type === 'blaster'
          ? player.current_round >= current.current_round
            ? player.score
            : current.score
          : Math.max(player.score, current.score),
        total_time_ms: Math.max(player.total_time_ms, current.total_time_ms),
        fastest_round_ms: player.fastest_round_ms || current.fastest_round_ms,
        current_round: Math.max(player.current_round, current.current_round),
        finished_at: player.finished_at || current.finished_at || null,
      }
    }))
    setResults(mappedResults)

    const userIds = [
      ...mappedPlayers.map((player) => player.user_id),
      ...mappedResults.map((result) => result.user_id),
    ]
    await loadRoomPlayerProfiles(userIds)
    return mappedRoom
  }, [loadRoomPlayerProfiles])

  const refreshRoomSnapshot = useCallback(async () => {
    if (!supabase || !roomId || !isSignedIn) return
    const requestedRoomId = roomId
    const client = supabase
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true
      return
    }
    refreshInFlightRef.current = true

    try {
      const loadViaRpc = async () => {
        const { data: roomData, error: rpcError } = await client.rpc('get_1v1_room_details', { p_room_id: requestedRoomId })
        const rpcResult = asSnapshotRecord(Array.isArray(roomData) ? roomData[0] : roomData)
        const rpcRoom = asSnapshotRecord(rpcResult?.room)
        if (rpcError || !rpcResult || !rpcRoom) return false
        if (activeRoomIdRef.current !== requestedRoomId) return true
        await applyRoomSnapshot({
          roomRow: rpcRoom,
          playerRows: rpcResult.players,
          resultRows: rpcResult.results,
          expectedRoomId: requestedRoomId,
        })
        return true
      }

      const [{ data: roomRow, error: roomError }, { data: playerRows, error: playersError }, { data: resultRows, error: resultsError }] = await Promise.all([
        client.from('rooms').select('*').eq('id', requestedRoomId).maybeSingle(),
        client.from('room_players').select('*').eq('room_id', requestedRoomId).order('slot_no', { ascending: true }),
        client.from('room_results').select('*').eq('room_id', requestedRoomId).order('placement', { ascending: true }),
      ])

      const directRoom = asSnapshotRecord(roomRow)
      if (!directRoom || roomError || playersError || resultsError) {
        const loadedViaRpc = await loadViaRpc()
        if (loadedViaRpc) return
        if (activeRoomIdRef.current !== requestedRoomId) return

        setError(roomError?.message || playersError?.message || resultsError?.message || 'Could not load room.')
        if (!directRoom) {
          setRoomId(null)
          setRoom(null)
          setPlayers([])
          setResults([])
        }
        return
      }

      await applyRoomSnapshot({
        roomRow: directRoom,
        playerRows,
        resultRows,
        expectedRoomId: requestedRoomId,
      })
    } finally {
      refreshInFlightRef.current = false
      if (refreshQueuedRef.current) {
        refreshQueuedRef.current = false
        window.setTimeout(() => {
          if (activeRoomIdRef.current === requestedRoomId) {
            void refreshRoomSnapshot()
          }
        }, 60)
      }
    }
  }, [applyRoomSnapshot, isSignedIn, roomId])

  const triggerBlasterDisruption = useCallback((effect: DuelBlasterDisruptionKey, cloneText?: string | null) => {
    if (blasterDisruptionTimerRef.current !== null) {
      window.clearTimeout(blasterDisruptionTimerRef.current)
      blasterDisruptionTimerRef.current = null
    }
    const meta = getDuelBlasterDisruptionMeta(effect)
    const nextEffect: DuelBlasterDisruption = {
      id: `${effect}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      key: effect,
      label: meta.label,
      icon: meta.icon,
      cloneText: cloneText?.trim() || 'PC 404',
    }
    blasterDisruptionRef.current = nextEffect
    setBlasterDisruption(nextEffect)
    blasterDisruptionTimerRef.current = window.setTimeout(() => {
      blasterDisruptionRef.current = null
      setBlasterDisruption(null)
      blasterDisruptionTimerRef.current = null
    }, meta.durationMs)
  }, [])

  useEffect(() => {
    return () => {
      if (blasterDisruptionTimerRef.current !== null) {
        window.clearTimeout(blasterDisruptionTimerRef.current)
        blasterDisruptionTimerRef.current = null
      }
    }
  }, [])

  const triggerBlasterShotBurstAtElement = useCallback((element: HTMLElement | null | undefined, tone: BlasterShotBurst['tone']) => {
    const targetBounds = element?.getBoundingClientRect()
    if (!targetBounds) return
    const burstId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const nextBurst: BlasterShotBurst = {
      id: burstId,
      tone,
      x: targetBounds.left + targetBounds.width / 2,
      y: targetBounds.top + targetBounds.height / 2,
    }

    setBlasterShotBursts((previous) => [...previous.slice(-5), nextBurst])
    window.setTimeout(() => {
      setBlasterShotBursts((previous) => previous.filter((burst) => burst.id !== burstId))
    }, 820)
  }, [])

  const triggerBlasterShotBurst = useCallback((event: MouseEvent<HTMLButtonElement>, tone: BlasterShotBurst['tone']) => {
    triggerBlasterShotBurstAtElement(event.currentTarget, tone)
  }, [triggerBlasterShotBurstAtElement])

  const applyBlasterScoreBroadcast = useCallback((payloadLike: unknown) => {
    const payload = payloadLike && typeof payloadLike === 'object'
      ? payloadLike as Partial<BlasterScoreBroadcastPayload>
      : null
    const broadcastRoomId = typeof payload?.room_id === 'string' ? payload.room_id : ''
    const userId = typeof payload?.user_id === 'string' ? payload.user_id : ''
    if (!payload || broadcastRoomId !== roomId || !userId || userId === currentUserId) return

    const currentRoom = liveRoomRef.current
    if (!currentRoom || currentRoom.status !== 'in_progress' || currentRoom.game_type !== 'blaster') return

    const nextScore = Number(payload.score)
    const nextDelta = Number(payload.delta)
    const nextRound = Number(payload.current_round)
    const answeredRound = Number(payload.round)
    const sentAt = Number(payload.sent_at)
    if (!Number.isFinite(nextScore) || !Number.isFinite(nextRound) || !Number.isFinite(sentAt)) return
    const safeAnsweredRound = Number.isFinite(answeredRound) ? answeredRound : nextRound - 1

    const latest = latestBlasterBroadcastRef.current[userId]
    if (
      latest
      && (
        nextRound < latest.currentRound
        || (nextRound === latest.currentRound && sentAt <= latest.sentAt)
      )
    ) {
      return
    }
    latestBlasterBroadcastRef.current[userId] = { currentRound: nextRound, sentAt }

    const totalTimeMs = Number(payload.total_time_ms)
    const fastestRoundMs = Number(payload.fastest_round_ms)
    setPlayers((previous) => previous.map((player) => {
      if (player.user_id !== userId) return player
      if (nextRound < player.current_round) return player
      return {
        ...player,
        score: nextScore,
        total_time_ms: Number.isFinite(totalTimeMs) ? Math.max(player.total_time_ms, totalTimeMs) : player.total_time_ms,
        fastest_round_ms: Number.isFinite(fastestRoundMs) && fastestRoundMs > 0
          ? player.fastest_round_ms > 0
            ? Math.min(player.fastest_round_ms, fastestRoundMs)
            : fastestRoundMs
          : player.fastest_round_ms,
        current_round: Math.max(player.current_round, nextRound, safeAnsweredRound + 1),
        last_seen: new Date(sentAt).toISOString(),
      }
    }))

    if (Number.isFinite(nextDelta) && nextDelta !== 0) {
      setBlasterTugPulse(nextDelta > 0 ? 'miss' : 'pull')
      if (blasterTugPulseTimerRef.current !== null) {
        window.clearTimeout(blasterTugPulseTimerRef.current)
      }
      blasterTugPulseTimerRef.current = window.setTimeout(() => {
        setBlasterTugPulse('')
        blasterTugPulseTimerRef.current = null
      }, 360)
    }

    const targetIndex = Number(payload.target_index)
    if (Number.isFinite(targetIndex)) {
      triggerBlasterShotBurstAtElement(
        blasterTargetRefs.current[blasterTargetDomKey(Math.max(0, Math.floor(targetIndex)))],
        payload.correct ? 'spectator' : 'bad',
      )
    }

    const powerupEffect = typeof payload.powerup_effect === 'string' ? payload.powerup_effect as DuelBlasterDisruptionKey : null
    if (payload.correct && powerupEffect) {
      triggerBlasterDisruption(powerupEffect, typeof payload.disguise_code === 'string' ? payload.disguise_code : null)
    }
  }, [currentUserId, roomId, triggerBlasterDisruption, triggerBlasterShotBurstAtElement])

  const applyBlasterPowerupEffectBroadcast = useCallback((payloadLike: unknown) => {
    const payload = payloadLike && typeof payloadLike === 'object'
      ? payloadLike as Partial<BlasterPowerupEffectPayload>
      : null
    if (!payload || payload.room_id !== roomId || !payload.user_id || payload.user_id === currentUserId) return
    const currentRoom = liveRoomRef.current
    if (!currentRoom || currentRoom.status !== 'in_progress' || currentRoom.game_type !== 'blaster') return
    if (!payload.powerup_effect) return
    triggerBlasterDisruption(payload.powerup_effect, typeof payload.disguise_code === 'string' ? payload.disguise_code : null)
  }, [currentUserId, roomId, triggerBlasterDisruption])

  const applyRopeBlasterCloudState = useCallback((payloadLike: unknown) => {
    const payload = payloadLike && typeof payloadLike === 'object'
      ? payloadLike as RopeBlasterCloudState
      : null
    if (!payload || payload.type !== 'state') return

    const nextSequence = Number(payload.sequence || 0)
    if (nextSequence > 0 && nextSequence < ropeBlasterSequenceRef.current) return
    ropeBlasterSequenceRef.current = Math.max(ropeBlasterSequenceRef.current, nextSequence)

    const lastEvent = payload.lastEvent && typeof payload.lastEvent === 'object' ? payload.lastEvent : null
    const currentRoom = liveRoomRef.current
    if (!currentRoom || currentRoom.status !== 'in_progress' || currentRoom.game_type !== 'blaster') return
    const cloudPlayers = Array.isArray(payload.players) ? payload.players : []
    if (cloudPlayers.length === 0) return

    const byUserId = new Map(cloudPlayers.map((player) => [player.userId, player]))
    setPlayers((previous) => previous.map((player) => {
      const cloudPlayer = byUserId.get(player.user_id)
      if (!cloudPlayer) return player

      const cloudRound = Math.max(1, Math.round(Number(cloudPlayer.currentRound || 1)))
      if (cloudRound < player.current_round) return player

      const cloudFastest = Number(cloudPlayer.fastestRoundMs || 0)
      return {
        ...player,
        score: Math.round(Number(cloudPlayer.score || 0)),
        current_round: Math.max(player.current_round, cloudRound),
        total_time_ms: Math.max(player.total_time_ms, Math.round(Number(cloudPlayer.totalTimeMs || 0))),
        fastest_round_ms: cloudFastest > 0
          ? player.fastest_round_ms > 0
            ? Math.min(player.fastest_round_ms, Math.round(cloudFastest))
            : Math.round(cloudFastest)
          : player.fastest_round_ms,
        last_seen: new Date(Number(payload.serverNow) || Date.now()).toISOString(),
      }
    }))

    if (lastEvent?.userId && lastEvent.userId !== currentUserId && Number.isFinite(Number(lastEvent.delta))) {
      const delta = Number(lastEvent.delta)
      setBlasterTugPulse(delta > 0 ? 'miss' : 'pull')
      if (blasterTugPulseTimerRef.current !== null) {
        window.clearTimeout(blasterTugPulseTimerRef.current)
      }
      blasterTugPulseTimerRef.current = window.setTimeout(() => {
        setBlasterTugPulse('')
        blasterTugPulseTimerRef.current = null
      }, 260)
      const targetIndex = Number(lastEvent.targetIndex)
      if (Number.isFinite(targetIndex)) {
        triggerBlasterShotBurstAtElement(
          blasterTargetRefs.current[blasterTargetDomKey(Math.max(0, Math.floor(targetIndex)))],
          delta > 0 ? 'spectator' : 'bad',
        )
      }
    }

    if (
      lastEvent?.userId
      && lastEvent.userId !== currentUserId
      && typeof lastEvent.powerupEffect === 'string'
    ) {
      triggerBlasterDisruption(lastEvent.powerupEffect as DuelBlasterDisruptionKey, lastEvent.disguiseCode || null)
    }

    if (payload.ko) {
      window.setTimeout(() => {
        void refreshRoomSnapshot()
      }, 80)
    }
  }, [currentUserId, refreshRoomSnapshot, triggerBlasterDisruption, triggerBlasterShotBurstAtElement])

  const sendRopeBlasterCloudMessage = useCallback((payload: Record<string, unknown>) => {
    const socket = ropeBlasterSocketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return false
    try {
      socket.send(JSON.stringify(payload))
      return true
    } catch {
      return false
    }
  }, [])

  const sendRopeBlasterShot = useCallback((payload: BlasterScoreBroadcastPayload) => {
    return sendRopeBlasterCloudMessage({
      type: 'shot',
      delta: payload.delta,
      round: payload.round,
      currentRound: payload.current_round,
      elapsedMs: payload.elapsed_ms,
      correct: payload.correct,
      sentAt: payload.sent_at,
      powerupKey: payload.powerup_key,
      powerupEffect: payload.powerup_effect,
      disguiseCode: payload.disguise_code,
      targetIndex: payload.target_index,
      targetLabel: payload.target_label,
    })
  }, [sendRopeBlasterCloudMessage])

  const broadcastBlasterScore = useCallback((payload: BlasterScoreBroadcastPayload) => {
    if (sendRopeBlasterShot(payload)) return
    const channel = roomRealtimeChannelRef.current
    if (!channel) return
    void channel.send({
      type: 'broadcast',
      event: 'blaster-score',
      payload,
    })
  }, [sendRopeBlasterShot])

  const broadcastBlasterPowerupEffect = useCallback((payload: BlasterPowerupEffectPayload) => {
    const channel = roomRealtimeChannelRef.current
    if (!channel) return
    void channel.send({
      type: 'broadcast',
      event: 'blaster-powerup-effect',
      payload,
    })
  }, [])

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
    if (!isSignedIn || !showBotSetupModal) return
    void loadBotSkillSnapshot()
  }, [isSignedIn, loadBotSkillSnapshot, showBotSetupModal])

  useEffect(() => {
    if (inviteGameType !== 'quiz' && inviteCategory === 'scenarios') {
      setInviteCategory('all')
    }
  }, [inviteCategory, inviteGameType])

  useEffect(() => {
    if (connect4Enabled) return
    if (selectedGameType === 'connect4') setSelectedGameType('quiz')
    if (inviteGameType === 'connect4') setInviteGameType('quiz')
    if (lobbyEditGameType === 'connect4') setLobbyEditGameType('quiz')
  }, [connect4Enabled, inviteGameType, lobbyEditGameType, selectedGameType])

  useEffect(() => {
    if (selectedGameType !== 'quiz' && selectedCategory === 'scenarios') {
      setSelectedCategory('all')
    }
  }, [selectedCategory, selectedGameType])

  useEffect(() => {
    if (lobbyEditGameType !== 'quiz' && lobbyEditCategory === 'scenarios') {
      setLobbyEditCategory('all')
    }
  }, [lobbyEditCategory, lobbyEditGameType])

  useEffect(() => {
    if (!showChangeModeModal) return
    if (!room || room.status !== 'waiting' || room.host_user_id !== currentUserId) {
      setShowChangeModeModal(false)
    }
  }, [currentUserId, room, showChangeModeModal])

  useEffect(() => {
    if (invitePreset !== 'rope-blaster') return
    if (!isSignedIn) return
    setSelectedGameType('blaster')
    setSelectedCategory('all')
    setSelectedPowerupsEnabled(duelBlasterDefaultPowerupsEnabled)
    setSelectedBlasterMode('timed')
    setSelectedBlasterDurationSeconds(duelBlasterDefaultDurationSeconds)
    setSelectedBlasterOvertimeEnabled(duelBlasterDefaultOvertimeEnabled)
    setSelectedBlasterOvertimeAfterSeconds(duelBlasterDefaultOvertimeAfterSeconds)
    setInviteGameType('blaster')
    setInviteCategory('all')
    setInvitePowerupsEnabled(duelBlasterDefaultPowerupsEnabled)
    setInviteBlasterMode('timed')
    setInviteBlasterDurationSeconds(duelBlasterDefaultDurationSeconds)
    setInviteBlasterOvertimeEnabled(duelBlasterDefaultOvertimeEnabled)
    setInviteBlasterOvertimeAfterSeconds(duelBlasterDefaultOvertimeAfterSeconds)
    setShowInviteModal(true)
    setError('')
    setNotice('')
    void loadOnlineInviteUsers()
    onInvitePresetHandled?.()
  }, [invitePreset, isSignedIn, loadOnlineInviteUsers, onInvitePresetHandled])

  useEffect(() => {
    if (invitePreset !== 'bot-practice') return
    if (!isSignedIn) return
    setSelectedGameType('quiz')
    setSelectedCategory('all')
    setInviteGameType('quiz')
    setInviteCategory('all')
    setInviteQuizRounds(10)
    setBotDifficulty('adaptive')
    setShowInviteModal(false)
    setShowBotSetupModal(true)
    setError('')
    setNotice('')
    void loadBotSkillSnapshot()
    onInvitePresetHandled?.()
  }, [invitePreset, isSignedIn, loadBotSkillSnapshot, onInvitePresetHandled])

  useEffect(() => {
    if (!roomId || !isSignedIn) return
    void refreshRoomSnapshot()
  }, [isSignedIn, refreshRoomSnapshot, roomId])

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
          broadcast: {
            self: false,
            ack: false,
          },
          presence: {
            key: currentUserId,
          },
        },
      })
      .on('broadcast', { event: 'blaster-score' }, ({ payload }) => {
        applyBlasterScoreBroadcast(payload)
      })
      .on('broadcast', { event: 'blaster-powerup-effect' }, ({ payload }) => {
        applyBlasterPowerupEffectBroadcast(payload)
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        void refreshRoomSnapshot()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_state' }, () => {
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
        roomRealtimeChannelRef.current = channel
        void channel.track({
          user_id: currentUserId,
          online_at: new Date().toISOString(),
        })
      }
    })

    return () => {
      if (roomRealtimeChannelRef.current === channel) {
        roomRealtimeChannelRef.current = null
      }
      void client.removeChannel(channel)
    }
  }, [applyBlasterPowerupEffectBroadcast, applyBlasterScoreBroadcast, currentUserId, isSignedIn, loadWaitingChatMessages, refreshRoomSnapshot, roomId])

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
  const connect4PlayerOne = useMemo(() => players.find((player) => player.slot_no === 1) || null, [players])
  const connect4PlayerTwo = useMemo(() => players.find((player) => player.slot_no === 2) || null, [players])
  const isSpectator = useMemo(() => !myPlayer && players.length > 0 && room?.status === 'in_progress', [myPlayer, players, room])
  const connect4State = useMemo(() => {
    const rawState = room?.settings?.connect4
    return normalizeConnect4State(
      rawState && typeof rawState === 'object'
        ? (rawState as Partial<Connect4State>)
        : createConnect4State(),
    )
  }, [room?.settings])
  const myConnect4Token: Connect4Player | null = myPlayer?.slot_no === 1 ? 'P1' : myPlayer?.slot_no === 2 ? 'P2' : null

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
  const currentRoundPayloadNumber = isQuizRound(currentRound) || isMatchingRound(currentRound) || isBlasterRound(currentRound)
    ? currentRound.round
    : currentRoundNumber
  const initializedRoundKey = room && myPlayer
    ? `${room.id}:${room.game_type}:${room.status}:${room.started_at || ''}:${myPlayer.current_round}:${currentRoundPayloadNumber}`
    : ''

  useEffect(() => {
    if (isBlasterRound(currentRound)) {
      blasterMotionRoundRef.current = currentRound.round
      const visualRoundKey = `${room?.id || 'room'}:${currentRound.round}`
      setBlasterVisibleTargets((previousTargets) => {
        if (blasterVisibleRoundKeyRef.current === visualRoundKey && previousTargets.length > 0) {
          return previousTargets
        }

        const replacementIndex = blasterPendingReplacementIndexRef.current
        const shouldStartFresh = previousTargets.length === 0
          || previousTargets.length !== currentRound.targets.length
          || currentRound.round <= 1
          || !blasterVisibleRoundKeyRef.current.startsWith(`${room?.id || 'room'}:`)

        if (shouldStartFresh) {
          const nextRoundTargets = currentRound.targets.map((target) => String(target)).filter((target) => target.trim().length > 0)
          blasterVisibleRoundKeyRef.current = visualRoundKey
          blasterPendingReplacementIndexRef.current = null
          return nextRoundTargets
        }

        const nextTargets = buildBlasterVisibleTargetsForRound(previousTargets, currentRound, replacementIndex)
        blasterVisibleRoundKeyRef.current = visualRoundKey
        blasterPendingReplacementIndexRef.current = null
        return nextTargets
      })
      return
    }
    blasterMotionRoundRef.current = 0
    blasterMotionTargetsRef.current = []
    blasterRespawnTargetIndexRef.current = null
    blasterPendingReplacementIndexRef.current = null
    blasterVisibleRoundKeyRef.current = ''
    setBlasterVisibleTargets([])
  }, [currentRound, room?.id])

  useEffect(() => {
    blasterVisibleTargetsRef.current = blasterVisibleTargets
    blasterMotionTargetsRef.current = blasterVisibleTargets
  }, [blasterVisibleTargets])

  const countdownSeconds = 3
  const serverStartRemainingMs = useMemo(() => {
    if (!room || room.status !== 'in_progress') return 0
    const startedAtMs = room.started_at ? Date.parse(room.started_at) : NaN
    if (!Number.isFinite(startedAtMs)) return 0
    return Math.max(0, startedAtMs - hudNow)
  }, [hudNow, room])
  const countdownRemaining = useMemo(() => {
    if (serverStartRemainingMs <= 0) return 0
    return Math.ceil(Math.min(serverStartRemainingMs, countdownSeconds * 1000) / 1000)
  }, [serverStartRemainingMs])
  const countdownActive = serverStartRemainingMs > 0
  const connect4IsMyTurn = Boolean(
    room?.game_type === 'connect4'
      && room.status === 'in_progress'
      && connect4State.status === 'active'
      && myConnect4Token === connect4State.currentTurn
      && !countdownActive,
  )
  const connect4WinnerName = connect4State.winner === 'P1'
    ? getPlayerName(connect4PlayerOne?.user_id || '', 'Player 1')
    : connect4State.winner === 'P2'
      ? getPlayerName(connect4PlayerTwo?.user_id || '', 'Player 2')
      : ''
  const syncingBeforeCountdown = serverStartRemainingMs > countdownSeconds * 1000
  const currentRoomStatus = room?.status
  const myPlayerFinishedMatch = Boolean(
    room
    && myPlayer
    && room.status === 'in_progress'
    && myPlayer.current_round > room.rounds,
  )

  useEffect(() => {
    if (!roomId || !isSignedIn) return
    const shouldPollRoom = !currentRoomStatus || currentRoomStatus === 'waiting' || currentRoomStatus === 'in_progress'
    if (!shouldPollRoom) return

    const timer = window.setInterval(() => {
      void refreshRoomSnapshot()
    }, countdownActive || myPlayerFinishedMatch ? 650 : currentRoomStatus === 'in_progress' ? 1500 : 1000)

    return () => window.clearInterval(timer)
  }, [countdownActive, currentRoomStatus, isSignedIn, myPlayerFinishedMatch, refreshRoomSnapshot, roomId])

  const canStartRound = Boolean(
    room
    && myPlayer
    && room.status === 'in_progress'
    && myPlayer.current_round <= room.rounds
    && !countdownActive,
  )
  const roundIsInitialized = Boolean(
    initializedRoundKey
    && initializedRoundKeyRef.current === initializedRoundKey
    && roundStartedAt > 0,
  )

  const applyOptimisticRoundAdvance = useCallback((params: { round: number; points: number; elapsedMs: number }) => {
    if (!room || !currentUserId) return
    const nowIso = new Date().toISOString()
    setPlayers((previous) => previous.map((player) => {
      if (player.user_id !== currentUserId) return player
      const nextRound = Math.max(player.current_round, Math.min(room.rounds + 1, params.round + 1))
      const safeElapsedMs = Math.max(0, params.elapsedMs)
      const nextFastest = safeElapsedMs > 0
        ? player.fastest_round_ms > 0
          ? Math.min(player.fastest_round_ms, safeElapsedMs)
          : safeElapsedMs
        : player.fastest_round_ms
      return {
        ...player,
        score: player.score + params.points,
        total_time_ms: player.total_time_ms + safeElapsedMs,
        fastest_round_ms: nextFastest,
        current_round: nextRound,
        finished_at: params.round >= room.rounds ? player.finished_at || nowIso : player.finished_at || null,
        last_seen: nowIso,
      }
    }))
  }, [currentUserId, room])

  const quizRoundTimeLimitMs = useMemo(() => {
    if (!room || room.game_type !== 'quiz') return duelQuizRoundTimeLimitMs
    return room.category === 'scenarios' ? duelScenarioQuizRoundTimeLimitMs : duelQuizRoundTimeLimitMs
  }, [room])
  const quizRoundTimeLimitLabel = `${Math.round(quizRoundTimeLimitMs / 1000)}-second`

  const submitRound = useCallback(async (params: { round: number; correct: boolean; elapsedMs: number; points?: number }) => {
    if (!supabase || !roomId) return
    const client = supabase
    setSubmittingRound(true)
    setError('')
    const submitTask = async () => {
      const { data: submitState, error: rpcError } = await client.rpc('submit_1v1_round', {
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
        if (room?.status === 'in_progress' && room.game_type === 'blaster') {
          setBlasterLocked(false)
          setBlasterChoice(null)
          setBlasterChoiceRound(null)
        }
        void refreshRoomSnapshot()
        return
      }

      const payload = submitState && typeof submitState === 'object'
        ? (submitState as Record<string, unknown>)
        : null
      const nextPlayers = Array.isArray(payload?.players)
        ? payload.players
          .map((row): DuelRoomPlayerRow | null => {
            if (!row || typeof row !== 'object') return null
            const value = row as Record<string, unknown>
            const userId = String(value.user_id || '').trim()
            if (!userId) return null
            const current = livePlayersRef.current.find((player) => player.user_id === userId)
            if (!current) return null
            const nextPlayer: DuelRoomPlayerRow = {
              ...current,
              score: Number.isFinite(Number(value.score))
                ? Number(value.score)
                : current.score || 0,
              total_time_ms: Math.max(Number(value.total_time_ms || 0), current.total_time_ms || 0),
              fastest_round_ms: Number(value.fastest_round_ms || current.fastest_round_ms || 0),
              current_round: Math.max(Number(value.current_round || 1), current.current_round || 1),
              finished_at: value.finished_at ? String(value.finished_at) : current.finished_at || null,
              last_seen: new Date().toISOString(),
            }
            return nextPlayer
          })
          .filter((row): row is DuelRoomPlayerRow => row !== null)
        : []

      if (nextPlayers.length > 0) {
        setPlayers((previous) => {
          const byUserId = new Map(previous.map((player) => [player.user_id, player]))
          nextPlayers.forEach((player) => byUserId.set(player.user_id, player))
          return Array.from(byUserId.values()).sort((left, right) => left.slot_no - right.slot_no)
        })
      }

      if (payload) {
        const nextStatus = String(payload.status || '').trim()
        const nextWinner = String(payload.winner_user_id || '').trim()
        setRoom((previous) => {
          if (!previous || previous.id !== roomId) return previous
          const nextRoomStatus = ['waiting', 'in_progress', 'completed', 'cancelled'].includes(nextStatus)
            ? nextStatus as DuelRoomStatus
            : previous.status
          const highestRound = nextPlayers.reduce((maxRound, player) => Math.max(maxRound, player.current_round), previous.current_round)
          return {
            ...previous,
            status: nextRoomStatus,
            winner_user_id: nextWinner || previous.winner_user_id,
            current_round: nextRoomStatus === 'completed'
              ? previous.rounds
              : Math.max(previous.current_round, Math.min(previous.rounds, highestRound)),
          }
        })
      }

      const selfAdvanced = nextPlayers.some((player) => player.user_id === currentUserId && player.current_round > params.round)
      if (room?.status === 'in_progress' && room.game_type === 'quiz' && selfAdvanced) {
        setQuizLocked(false)
        setQuizChoice(null)
      }
      if (room?.status === 'in_progress' && room.game_type === 'blaster' && selfAdvanced) {
        setBlasterLocked(false)
        setBlasterChoice(null)
        setBlasterChoiceRound(null)
      }

      window.setTimeout(() => {
        void refreshRoomSnapshot()
      }, payload && String(payload.status || '') === 'completed' ? 80 : 250)

      if (room?.status === 'in_progress' && params.round >= room.rounds && String(payload?.status || '') !== 'completed') {
        const finalRoundRefreshDelaysMs = [900, 1800, 3600]
        finalRoundRefreshDelaysMs.forEach((delayMs) => {
          window.setTimeout(() => {
            void refreshRoomSnapshot()
          }, delayMs)
        })
      }
    }

    roundSubmitQueueRef.current = roundSubmitQueueRef.current
      .catch(() => undefined)
      .then(submitTask)
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Could not submit round.'
        setError(message)
        if (room?.status === 'in_progress' && room.game_type === 'quiz') {
          setQuizLocked(false)
          setQuizChoice(null)
        }
      if (room?.status === 'in_progress' && room.game_type === 'matching') {
        setMatchingSubmitted(false)
      }
      if (room?.status === 'in_progress' && room.game_type === 'blaster') {
        setBlasterLocked(false)
        setBlasterChoice(null)
        setBlasterChoiceRound(null)
      }
      void refreshRoomSnapshot()
      })
      .finally(() => {
        setSubmittingRound(false)
      })

    await roundSubmitQueueRef.current
  }, [currentUserId, refreshRoomSnapshot, room?.game_type, room?.rounds, room?.status, roomId])

  const submitConnect4Move = useCallback(async (column: number) => {
    if (!supabase || !roomId || !room || room.game_type !== 'connect4') return
    if (!connect4Enabled) {
      setError('Connect 4 is disabled.')
      return
    }
    if (!connect4IsMyTurn || isSpectator) return

    setError('')
    const { data, error: rpcError } = await supabase.rpc('submit_connect4_move', {
      p_room_id: roomId,
      p_column: column,
    })
    if (rpcError) {
      setError(rpcError.message || 'Could not drop disc.')
      void refreshRoomSnapshot()
      return
    }

    const payload = data && typeof data === 'object'
      ? (data as Record<string, unknown>)
      : null
    const nextConnect4 = payload?.connect4 && typeof payload.connect4 === 'object'
      ? normalizeConnect4State(payload.connect4 as Partial<Connect4State>)
      : null
    if (nextConnect4) {
      const nextStatus = String(payload?.status || '').trim()
      const nextWinnerUserId = typeof payload?.winner_user_id === 'string' ? payload.winner_user_id : ''
      setRoom((previous) => {
        if (!previous || previous.id !== roomId) return previous
        return {
          ...previous,
          status: ['waiting', 'in_progress', 'completed', 'cancelled'].includes(nextStatus)
            ? nextStatus as DuelRoomStatus
            : previous.status,
          winner_user_id: nextWinnerUserId || previous.winner_user_id,
          current_round: Math.max(previous.current_round, nextConnect4.moveHistory.length),
          settings: {
            ...previous.settings,
            connect4: nextConnect4,
          },
        }
      })
    }
    markStudyActivity()
    void refreshRoomSnapshot()
  }, [connect4Enabled, connect4IsMyTurn, isSpectator, markStudyActivity, refreshRoomSnapshot, room, roomId])

  const submitConnect4BotMove = useCallback((column: number) => {
    if (!connect4BotMatch || connect4BotMatch.status !== 'in_progress') return
    if (connect4BotMatch.state.currentTurn !== 'P1' || connect4BotMatch.state.status !== 'active') return
    const playersForBot = { player1UserId: currentUserId, player2UserId: 'connect4-bot' }
    let userState: Connect4State
    try {
      userState = applyConnect4Move(connect4BotMatch.state, column, currentUserId, playersForBot).state
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : 'Could not drop disc.')
      return
    }

    const completeUserMatch = userState.status === 'completed'
    setConnect4BotMatch((previous) => {
      if (!previous || previous.id !== connect4BotMatch.id) return previous
      return {
        ...previous,
        state: userState,
        status: completeUserMatch ? 'completed' : previous.status,
        completedAt: completeUserMatch ? Date.now() : previous.completedAt,
        winner: userState.winner === 'P1' ? 'user' : userState.winner === 'P2' ? 'bot' : userState.draw ? 'draw' : previous.winner,
      }
    })
    markStudyActivity()
    if (completeUserMatch) return

    if (botAnswerTimerRef.current !== null) {
      window.clearTimeout(botAnswerTimerRef.current)
      botAnswerTimerRef.current = null
    }
    botAnswerTimerRef.current = window.setTimeout(() => {
      const botColumn = chooseConnect4BotMove(userState, 'P2')
      if (botColumn < 0) return
      try {
        const botState = applyConnect4Move(userState, botColumn, 'connect4-bot', playersForBot).state
        setConnect4BotMatch((previous) => {
          if (!previous || previous.id !== connect4BotMatch.id) return previous
          const completeBotMatch = botState.status === 'completed'
          return {
            ...previous,
            state: botState,
            status: completeBotMatch ? 'completed' : previous.status,
            completedAt: completeBotMatch ? Date.now() : previous.completedAt,
            winner: botState.winner === 'P1' ? 'user' : botState.winner === 'P2' ? 'bot' : botState.draw ? 'draw' : previous.winner,
          }
        })
      } catch (moveError) {
        setError(moveError instanceof Error ? moveError.message : 'Bot could not move.')
      } finally {
        botAnswerTimerRef.current = null
      }
    }, 420)
  }, [connect4BotMatch, currentUserId, markStudyActivity])

  const triggerAutoForfeit = useCallback(async (roundKey: string, reason: 'question' | 'matching' | 'blaster' = 'question') => {
    if (!supabase || !roomId || !roundKey || !room || !myPlayer) return
    if (room.status !== 'in_progress' || myPlayer.current_round > room.rounds) {
      void refreshRoomSnapshot()
      return
    }
    if (autoForfeitRoundKeyRef.current === roundKey) return
    autoForfeitRoundKeyRef.current = roundKey
    setQuizLocked(true)
    setNotice(
      reason === 'matching'
        ? '30-second round limit reached. You forfeited the match.'
        : reason === 'blaster'
          ? 'Blaster shot timer reached zero. You forfeited the match.'
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
  }, [myPlayer, quizRoundTimeLimitLabel, refreshRoomSnapshot, room, roomId])

  const finishBlasterByTimeout = useCallback(async () => {
    if (!supabase || !roomId) return
    const { error: rpcError } = await supabase.rpc('finish_1v1_blaster_timeout', { p_room_id: roomId })
    if (rpcError) {
      const normalized = String(rpcError.message || '').toLowerCase()
      if (!normalized.includes('countdown') && !normalized.includes('not active') && !normalized.includes('completed')) {
        setError(rpcError.message || 'Could not finish blaster match.')
      }
      return
    }
    setNotice('Time expired. Final tug score locked.')
    void refreshRoomSnapshot()
  }, [refreshRoomSnapshot, roomId])

  const submitQuizAnswer = useCallback((choiceIndex: number) => {
    if (!room || room.status !== 'in_progress' || room.game_type !== 'quiz') return
    if (!canStartRound || !isQuizRound(currentRound) || quizLocked) return

    const startedAt = roundStartedAtRef.current || roundStartedAt
    if (startedAt <= 0 || initializedRoundKeyRef.current !== initializedRoundKey) return

    const correct = choiceIndex === currentRound.correctIndex
    const elapsedMs = Math.max(0, Date.now() - startedAt)
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
      if (currentRound.round < room.rounds) {
        applyOptimisticRoundAdvance({ round: currentRound.round, points: 0, elapsedMs })
        setQuizChoice(null)
        setQuizLocked(false)
      }
      void submitRound({ round: currentRound.round, correct: false, elapsedMs })
      return
    }

    if (currentRound.round < room.rounds) {
      applyOptimisticRoundAdvance({ round: currentRound.round, points: correct ? 100 : 0, elapsedMs })
      setQuizChoice(null)
      setQuizLocked(false)
    }
    void submitRound({ round: currentRound.round, correct, elapsedMs })
  }, [
    applyOptimisticRoundAdvance,
    canStartRound,
    currentRound,
    initializedRoundKey,
    markStudyActivity,
    quizLocked,
    room,
    roundStartedAt,
    submitRound,
    triggerAutoForfeit,
  ])

  const triggerBlasterTugPulse = useCallback((tone: 'pull' | 'miss') => {
    if (blasterTugPulseTimerRef.current !== null) {
      window.clearTimeout(blasterTugPulseTimerRef.current)
    }
    setBlasterTugPulse(tone)
    blasterTugPulseTimerRef.current = window.setTimeout(() => {
      setBlasterTugPulse('')
      blasterTugPulseTimerRef.current = null
    }, tone === 'pull' ? 520 : 420)
  }, [])

  const submitBlasterAnswer = useCallback((targetIndex: number, event?: MouseEvent<HTMLButtonElement>) => {
    if (!room || room.status !== 'in_progress' || room.game_type !== 'blaster') return
    if (!canStartRound || !isBlasterRound(currentRound) || blasterLocked) return

    const startedAt = roundStartedAtRef.current || roundStartedAt
    if (startedAt <= 0 || initializedRoundKeyRef.current !== initializedRoundKey) return

    const selectedTarget = blasterVisibleTargetsRef.current[targetIndex] || currentRound.targets[targetIndex] || ''
    const correctCode = getBlasterRoundCorrectCode(currentRound)
    const correct = normalizeBlasterTarget(selectedTarget) === normalizeBlasterTarget(correctCode)
    const elapsedMs = Math.max(0, Date.now() - startedAt)
    const powerup = duelBlasterPowerupForRound(currentRound.round, Boolean(room.settings?.powerups_enabled), getBlasterMode(room.settings))
    const powerupEffect = correct ? duelBlasterDisruptionForPowerup(powerup) : null
    const nextStreak = correct ? blasterStreak + 1 : powerup?.key === 'donut' || powerup?.key === 'vest' ? blasterStreak : 0
    let streakBonus = correct ? Math.min(80, Math.floor(nextStreak / 3) * 20) : 0
    if (correct && powerup?.key === 'radio') {
      streakBonus *= 2
    }
    const quickDrawBonus = correct && powerup?.key === 'coffee' && getBlasterMode(room.settings) === 'timed' && elapsedMs <= 4000 ? 75 : 0
    const backupBonus = correct && powerup?.key === 'backup' ? 65 : 0
    const evidenceBonus = correct && powerup?.key === 'evidence' ? Math.min(90, Math.max(30, Math.floor(nextStreak / 2) * 30)) : 0
    const basePoints = correct ? powerup?.points || 120 : 0
    const missPenalty = powerup?.key === 'vest' ? 35 : duelBlasterMissPenalty
    const points = correct ? basePoints + streakBonus + quickDrawBonus + backupBonus + evidenceBonus : -missPenalty
    const selfPlayer = livePlayersRef.current.find((player) => player.user_id === currentUserId)
    const nextSelfCurrentRound = Math.max(
      selfPlayer?.current_round || 1,
      Math.min(room.rounds + 1, currentRound.round + 1),
    )
    const nextSelfScore = (selfPlayer?.score || 0) + points
    const nextSelfTotalTimeMs = (selfPlayer?.total_time_ms || 0) + elapsedMs
    const nextSelfFastestMs = elapsedMs > 0
      ? selfPlayer?.fastest_round_ms && selfPlayer.fastest_round_ms > 0
        ? Math.min(selfPlayer.fastest_round_ms, elapsedMs)
        : elapsedMs
      : selfPlayer?.fastest_round_ms || 0
    const bonusNotes = [
      quickDrawBonus > 0 ? 'coffee speed bonus' : '',
      backupBonus > 0 ? 'backup shove' : '',
      evidenceBonus > 0 ? 'evidence chain' : '',
      powerup?.key === 'clone' && powerupEffect ? 'clone jammer' : '',
      powerup?.key === 'paperwork' && powerupEffect ? 'paperwork storm' : '',
      powerup?.key === 'spikes' && powerupEffect ? 'pursuit panic' : '',
      powerup?.key === 'radar' ? 'spotlight sweep' : '',
      streakBonus > 0 ? `${powerup?.key === 'radio' ? 'double ' : ''}streak bonus` : '',
    ].filter(Boolean)

    markStudyActivity()
    if (event) triggerBlasterShotBurst(event, correct ? (powerup ? 'power' : 'good') : 'bad')
    triggerBlasterTugPulse(correct ? 'pull' : 'miss')
    blasterRespawnTargetIndexRef.current = targetIndex
    blasterPendingReplacementIndexRef.current = targetIndex
    setBlasterChoice(targetIndex)
    setBlasterChoiceRound(currentRound.round)
    setBlasterLocked(true)
    setBlasterStreak(nextStreak)
    setBlasterFeedback(correct
      ? `${powerup ? `${powerup.icon} ${powerup.label}! ` : ''}+${points} tug pressure${bonusNotes.length ? ` (${bonusNotes.join(', ')})` : ''}`
      : `${powerup?.key === 'donut' ? '🍩 Donut Armor saved your streak. ' : ''}${powerup?.key === 'vest' ? '🦺 Vest absorbed most of it. ' : ''}-${missPenalty} tug pressure. Correct target: ${correctCode}`)
    if (currentUserId && powerup && powerupEffect) {
      broadcastBlasterPowerupEffect({
        room_id: room.id,
        user_id: currentUserId,
        powerup_key: powerup.key,
        powerup_effect: powerupEffect,
        disguise_code: selectedTarget || correctCode,
        sent_at: Date.now(),
      })
    }

    if (currentRound.round < room.rounds) {
      const nextRound = roundList[currentRound.round]
      if (isBlasterRound(nextRound)) {
        const previousVisibleTargets = blasterVisibleTargetsRef.current.length > 0
          ? blasterVisibleTargetsRef.current
          : currentRound.targets.map((target) => String(target))
        const nextVisibleTargets = buildBlasterVisibleTargetsForRound(previousVisibleTargets, nextRound, targetIndex)
        const nextVisualRoundKey = `${room.id}:${nextRound.round}`
        blasterVisibleTargetsRef.current = nextVisibleTargets
        blasterMotionTargetsRef.current = nextVisibleTargets
        blasterMotionRoundRef.current = nextRound.round
        blasterVisibleRoundKeyRef.current = nextVisualRoundKey
        blasterPendingReplacementIndexRef.current = null
        setBlasterVisibleTargets(nextVisibleTargets)
      }
      window.setTimeout(() => {
        setBlasterChoice(null)
        setBlasterChoiceRound(null)
        setBlasterLocked(false)
        setBlasterFeedback('')
      }, correct ? 360 : 560)
    }

    applyOptimisticRoundAdvance({ round: currentRound.round, points, elapsedMs })
    if (currentUserId) {
      broadcastBlasterScore({
        room_id: room.id,
        user_id: currentUserId,
        score: nextSelfScore,
        delta: points,
        round: currentRound.round,
        current_round: nextSelfCurrentRound,
        total_time_ms: nextSelfTotalTimeMs,
        fastest_round_ms: nextSelfFastestMs,
        correct,
        sent_at: Date.now(),
        elapsed_ms: elapsedMs,
        powerup_key: powerup?.key || null,
        powerup_effect: powerupEffect,
        disguise_code: selectedTarget || correctCode,
        target_index: targetIndex,
        target_label: selectedTarget || correctCode,
      })
    }

    void submitRound({
      round: currentRound.round,
      correct,
      elapsedMs,
      points,
    })
  }, [
    applyOptimisticRoundAdvance,
    blasterLocked,
    blasterStreak,
    broadcastBlasterPowerupEffect,
    broadcastBlasterScore,
    canStartRound,
    currentRound,
    currentUserId,
    initializedRoundKey,
    markStudyActivity,
    room,
    roundList,
    roundStartedAt,
    submitRound,
    triggerBlasterShotBurst,
    triggerBlasterTugPulse,
  ])

  const recordBotMatchResult = useCallback((completedMatch: DuelBotMatch) => {
    if (!currentUserId || recordedBotMatchIdsRef.current.has(completedMatch.id)) return
    recordedBotMatchIdsRef.current.add(completedMatch.id)
    const won = completedMatch.winner === 'user'
    const lost = completedMatch.winner === 'bot'
    const nextDifficulty = completedMatch.resolvedDifficulty
    setBotStats((previousStats) => {
      const previous = sanitizeDuelBotStats(previousStats)
      const nextStreak = won ? previous.current_win_streak + 1 : 0
      const nextBestDifficulty = won && (
        !previous.best_difficulty ||
        duelBotDifficultyRank[nextDifficulty] > duelBotDifficultyRank[previous.best_difficulty]
      )
        ? nextDifficulty
        : previous.best_difficulty
      const nextStats: DuelBotStats = {
        ...previous,
        version: duelBotStatsVersion,
        wins: previous.wins + (won ? 1 : 0),
        losses: previous.losses + (lost ? 1 : 0),
        matches_played: previous.matches_played + 1,
        current_win_streak: nextStreak,
        best_win_streak: Math.max(previous.best_win_streak, nextStreak),
        best_score: Math.max(previous.best_score, completedMatch.userScore),
        best_difficulty: nextBestDifficulty,
        wins_by_difficulty: {
          ...previous.wins_by_difficulty,
          [nextDifficulty]: previous.wins_by_difficulty[nextDifficulty] + (won ? 1 : 0),
        },
        updated_at: new Date().toISOString(),
      }
      writeDuelBotStats(currentUserId, nextStats)
      return nextStats
    })
  }, [currentUserId])

  const finishBotMatch = useCallback((winnerOverride?: DuelBotWinner) => {
    const activeMatch = botMatchRef.current
    if (!activeMatch || activeMatch.status !== 'in_progress') return
    if (botAnswerTimerRef.current !== null) {
      window.clearTimeout(botAnswerTimerRef.current)
      botAnswerTimerRef.current = null
    }
    const winner = winnerOverride || (
      activeMatch.userScore > activeMatch.botScore
        ? 'user'
        : activeMatch.botScore > activeMatch.userScore
          ? 'bot'
          : 'draw'
    )
    const completedMatch: DuelBotMatch = {
      ...activeMatch,
      status: 'completed',
      winner,
      completedAt: Date.now(),
    }
    botMatchRef.current = completedMatch
    setBotMatch(completedMatch)
    recordBotMatchResult(completedMatch)
    setNotice(winner === 'user' ? 'Bot match complete. You beat the bot.' : winner === 'bot' ? 'Bot match complete. Run it back when ready.' : 'Bot match complete. Draw.')
  }, [recordBotMatchResult])

  const startBotMatch = useCallback(async () => {
    setBotStarting(true)
    setError('')
    setNotice('')
    const skillSnapshot = await loadBotSkillSnapshot()
    const resolvedDifficulty = resolveBotDifficulty(botDifficulty, skillSnapshot)
    const gameType = inviteGameType
    const botNames = duelBotNames[resolvedDifficulty]
    const botName = botNames[Math.floor(Math.random() * botNames.length)] || 'Code Bot'
    const startedAt = Date.now()
    if (gameType === 'connect4') {
      const nextMatch: Connect4BotMatch = {
        id: `connect4-bot-${startedAt}-${Math.random().toString(16).slice(2)}`,
        status: 'in_progress',
        state: createConnect4State(),
        startedAt,
        winner: null,
        botName,
        difficulty: botDifficulty,
        resolvedDifficulty,
      }
      setBotStarting(false)
      setBotMatch(null)
      botMatchRef.current = null
      setConnect4BotMatch(nextMatch)
      setShowInviteModal(false)
      setShowBotSetupModal(false)
      setNotice('')
      markStudyActivity()
      return
    }
    const category = botDifficulty === 'adaptive' && inviteCategory === 'all'
      ? skillSnapshot.weakCategory
      : inviteCategory === 'scenarios' && gameType !== 'quiz'
        ? 'all'
        : inviteCategory
    const priorityCodes = botDifficulty === 'adaptive' ? skillSnapshot.weakCodes : []
    const questionSet: DuelBotRoundPayload[] = gameType === 'blaster'
      ? buildBotBlasterRounds(category, duelBlasterRoundCap, priorityCodes)
      : gameType === 'matching'
        ? buildBotMatchingRounds(category, 5, priorityCodes)
        : buildBotQuizRounds(category, inviteQuizRounds, priorityCodes)
    setBotStarting(false)
    const minimumRounds = gameType === 'matching' ? 1 : gameType === 'blaster' ? 6 : 3
    if (questionSet.length < minimumRounds) {
      setError('Not enough code questions are loaded for a bot match yet.')
      return
    }
    const botRoomId = `bot-${startedAt}-${Math.random().toString(16).slice(2)}`
    const coachingNote = botDifficulty === 'adaptive'
      ? `Adaptive picked ${duelCategoryLabel(category)} and front-loaded weaker code sections from your study history.`
      : botDifficulty === 'random'
        ? `Random rolled ${duelBotResolvedDifficultyLabels[resolvedDifficulty]}.`
        : `${duelBotResolvedDifficultyLabels[resolvedDifficulty]} bot pressure selected.`
    const nextMatch: DuelBotMatch = {
      id: botRoomId,
      status: 'in_progress',
      gameType,
      difficulty: botDifficulty,
      resolvedDifficulty,
      category,
      mode: inviteBlasterMode,
      durationSeconds: inviteBlasterDurationSeconds,
      powerupsEnabled: invitePowerupsEnabled,
      overtimeEnabled: inviteBlasterOvertimeEnabled,
      overtimeAfterSeconds: inviteBlasterOvertimeAfterSeconds,
      rounds: questionSet.length,
      questionSet,
      userRound: 1,
      botRound: 1,
      userScore: 0,
      botScore: 0,
      userTotalMs: 0,
      botTotalMs: 0,
      userFastestMs: 0,
      botFastestMs: 0,
      startedAt,
      winner: null,
      botName,
      coachingNote,
      userStreak: 0,
      botStreak: 0,
    }
    botMatchRef.current = nextMatch
    setBotMatch(nextMatch)
    setShowInviteModal(false)
    setShowBotSetupModal(false)
    setBlasterStreak(0)
    setBlasterLocked(false)
    setBlasterChoice(null)
    setBlasterChoiceRound(null)
    setBlasterShotBursts([])
    setBlasterTugPulse('')
    setQuizChoice(null)
    setQuizLocked(false)
    setSelectedMatchingCards([])
    setWrongMatchingCardIds([])
    setMatchedPairIds([])
    setMatchingMistakes(0)
    setMatchingRoundPoints(0)
    setMatchingSubmitted(false)
    const firstRound = questionSet[0]
    if (isBlasterRound(firstRound)) {
      blasterMotionRoundRef.current = firstRound.round
      blasterVisibleRoundKeyRef.current = `${botRoomId}:${firstRound.round}`
      blasterVisibleTargetsRef.current = firstRound.targets
      blasterMotionTargetsRef.current = firstRound.targets
      setBlasterVisibleTargets(firstRound.targets)
    } else {
      blasterVisibleTargetsRef.current = []
      blasterMotionTargetsRef.current = []
      setBlasterVisibleTargets([])
    }
    if (isMatchingRound(firstRound)) {
      setMatchingCards(buildMatchingCardsForRound(firstRound, `${botRoomId}-${firstRound.round}`))
    } else {
      setMatchingCards([])
    }
    setRoundStartedAt(startedAt)
    roundStartedAtRef.current = startedAt
    markStudyActivity()
  }, [
    botDifficulty,
    inviteBlasterDurationSeconds,
    inviteBlasterMode,
    inviteBlasterOvertimeAfterSeconds,
    inviteBlasterOvertimeEnabled,
    inviteCategory,
    inviteGameType,
    invitePowerupsEnabled,
    inviteQuizRounds,
    loadBotSkillSnapshot,
    markStudyActivity,
  ])

  const submitBotBlasterAnswer = useCallback((targetIndex: number, event?: MouseEvent<HTMLButtonElement>) => {
    const activeMatch = botMatchRef.current
    if (!activeMatch || activeMatch.status !== 'in_progress' || blasterLocked) return
    const currentBotRound = activeMatch.questionSet[activeMatch.userRound - 1]
    if (!isBlasterRound(currentBotRound)) return
    const selectedTarget = blasterVisibleTargetsRef.current[targetIndex] || currentBotRound.targets[targetIndex] || ''
    const correctCode = getBlasterRoundCorrectCode(currentBotRound)
    const correct = normalizeBlasterTarget(selectedTarget) === normalizeBlasterTarget(correctCode)
    const elapsedMs = Math.max(0, Date.now() - (roundStartedAtRef.current || activeMatch.startedAt))
    const powerup = duelBlasterPowerupForRound(currentBotRound.round, activeMatch.powerupsEnabled, activeMatch.mode)
    const powerupEffect = correct ? duelBlasterDisruptionForPowerup(powerup) : null
    const nextStreak = correct ? blasterStreak + 1 : powerup?.key === 'donut' || powerup?.key === 'vest' ? blasterStreak : 0
    const pointDetails = calculateDuelBlasterPointDetails(correct, nextStreak, elapsedMs, powerup, activeMatch.mode)
    const { points } = pointDetails
    const nextRoundNumber = Math.min(activeMatch.rounds + 1, activeMatch.userRound + 1)
    const nextScore = activeMatch.userScore + points
    const nextTotalMs = activeMatch.userTotalMs + elapsedMs
    const nextFastest = elapsedMs > 0 && (activeMatch.userFastestMs <= 0 || elapsedMs < activeMatch.userFastestMs)
      ? elapsedMs
      : activeMatch.userFastestMs

    markStudyActivity()
    if (event) triggerBlasterShotBurst(event, correct ? (powerup ? 'power' : 'good') : 'bad')
    triggerBlasterTugPulse(correct ? 'pull' : 'miss')
    if (correct && powerupEffect) triggerBlasterDisruption(powerupEffect, selectedTarget || correctCode)
    setBlasterChoice(targetIndex)
    setBlasterChoiceRound(currentBotRound.round)
    setBlasterLocked(true)
    setBlasterStreak(nextStreak)
    blasterRespawnTargetIndexRef.current = targetIndex

    const nextMatch: DuelBotMatch = {
      ...activeMatch,
      userScore: nextScore,
      userRound: nextRoundNumber,
      userTotalMs: nextTotalMs,
      userFastestMs: nextFastest,
      userStreak: nextStreak,
    }
    botMatchRef.current = nextMatch
    setBotMatch(nextMatch)

    const nextRound = nextMatch.questionSet[nextRoundNumber - 1]
    if (isBlasterRound(nextRound)) {
      const previousVisibleTargets = blasterVisibleTargetsRef.current.length > 0
        ? blasterVisibleTargetsRef.current
        : currentBotRound.targets.map((target) => String(target))
      const nextVisibleTargets = buildBlasterVisibleTargetsForRound(previousVisibleTargets, nextRound, targetIndex)
      blasterVisibleTargetsRef.current = nextVisibleTargets
      blasterMotionTargetsRef.current = nextVisibleTargets
      blasterMotionRoundRef.current = nextRound.round
      blasterVisibleRoundKeyRef.current = `${nextMatch.id}:${nextRound.round}`
      setBlasterVisibleTargets(nextVisibleTargets)
      const nextStartedAt = Date.now()
      roundStartedAtRef.current = nextStartedAt
      setRoundStartedAt(nextStartedAt)
    }

    window.setTimeout(() => {
      setBlasterChoice(null)
      setBlasterChoiceRound(null)
      setBlasterLocked(false)
    }, correct ? 260 : 420)
  }, [
    blasterLocked,
    blasterStreak,
    markStudyActivity,
    triggerBlasterDisruption,
    triggerBlasterShotBurst,
    triggerBlasterTugPulse,
  ])

  const submitBotQuizAnswer = useCallback((choiceIndex: number) => {
    const activeMatch = botMatchRef.current
    if (!activeMatch || activeMatch.status !== 'in_progress' || activeMatch.gameType !== 'quiz' || quizLocked) return
    const currentBotRound = activeMatch.questionSet[activeMatch.userRound - 1]
    if (!isQuizRound(currentBotRound)) return
    const startedAt = roundStartedAtRef.current || activeMatch.startedAt
    const elapsedMs = Math.max(0, Date.now() - startedAt)
    const correct = choiceIndex === currentBotRound.correctIndex
    const nextStreak = correct ? activeMatch.userStreak + 1 : 0
    const points = calculateDuelQuizPoints(correct, nextStreak, elapsedMs)
    const nextRoundNumber = Math.min(activeMatch.rounds + 1, activeMatch.userRound + 1)
    const nextScore = activeMatch.userScore + points
    const nextFastest = elapsedMs > 0 && (activeMatch.userFastestMs <= 0 || elapsedMs < activeMatch.userFastestMs)
      ? elapsedMs
      : activeMatch.userFastestMs

    markStudyActivity()
    setQuizChoice(choiceIndex)
    setQuizLocked(true)

    window.setTimeout(() => {
      const latestMatch = botMatchRef.current
      if (!latestMatch || latestMatch.status !== 'in_progress' || latestMatch.gameType !== 'quiz') return
      if (latestMatch.userRound !== activeMatch.userRound) return
      const nextMatch: DuelBotMatch = {
        ...latestMatch,
        userScore: nextScore,
        userRound: nextRoundNumber,
        userTotalMs: latestMatch.userTotalMs + elapsedMs,
        userFastestMs: nextFastest,
        userStreak: nextStreak,
      }
      botMatchRef.current = nextMatch
      setBotMatch(nextMatch)
      setQuizChoice(null)
      setQuizLocked(false)
      roundStartedAtRef.current = Date.now()
      setRoundStartedAt(roundStartedAtRef.current)
    }, correct ? 360 : 620)
  }, [markStudyActivity, quizLocked])

  const handleBotMatchingCardClick = useCallback((cardId: string) => {
    const activeMatch = botMatchRef.current
    if (!activeMatch || activeMatch.status !== 'in_progress' || activeMatch.gameType !== 'matching' || matchingSubmitted) return
    if (selectedMatchingCards.length >= 2) return
    const card = matchingCards.find((item) => item.id === cardId)
    if (!card || matchedPairIds.includes(card.pairId) || selectedMatchingCards.includes(cardId)) return
    markStudyActivity()
    setSelectedMatchingCards((previous) => {
      if (previous.includes(cardId) || previous.length >= 2) return previous
      return [...previous, cardId]
    })
  }, [markStudyActivity, matchedPairIds, matchingCards, matchingSubmitted, selectedMatchingCards])

  useEffect(() => {
    if (!botMatch || botMatch.status !== 'in_progress') return
    setHudNow(Date.now())
    const timer = window.setInterval(() => setHudNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [botMatch])

  useEffect(() => {
    if (!botMatch || botMatch.status !== 'in_progress') return
    if (botMatch.gameType === 'blaster') {
      const baseLimit = duelBlasterDefaultRopeLimit
      const elapsedMs = Math.max(0, hudNow - botMatch.startedAt)
      const suddenDeathActive = botMatch.overtimeEnabled && elapsedMs >= botMatch.overtimeAfterSeconds * 1000
      const effectiveLimit = suddenDeathActive ? getBlasterSuddenDeathRopeLimit(baseLimit) : baseLimit
      const scoreGap = botMatch.userScore - botMatch.botScore
      if (Math.abs(scoreGap) >= effectiveLimit) {
        finishBotMatch(scoreGap > 0 ? 'user' : 'bot')
        return
      }
      if (botMatch.mode === 'timed' && elapsedMs >= botMatch.durationSeconds * 1000) {
        finishBotMatch()
        return
      }
    }
    if (botMatch.userRound > botMatch.rounds && botMatch.botRound > botMatch.rounds) {
      finishBotMatch()
    }
  }, [botMatch, finishBotMatch, hudNow])

  useEffect(() => {
    if (!botMatch || botMatch.status !== 'in_progress') return
    if (botAnswerTimerRef.current !== null) {
      window.clearTimeout(botAnswerTimerRef.current)
      botAnswerTimerRef.current = null
    }
    if (botMatch.botRound > botMatch.rounds) return
    const currentBotRound = botMatch.questionSet[botMatch.botRound - 1]
    if (!currentBotRound) return

    const scoreGap = botMatch.userScore - botMatch.botScore
    const userHotStreak = botMatch.gameType === 'blaster' ? blasterStreak : botMatch.userStreak
    const config = duelBotDifficultyConfig(botMatch.resolvedDifficulty, scoreGap, userHotStreak)
    const modeDelayMultiplier = duelBotModeDelayMultiplier(botMatch.gameType, botMatch.resolvedDifficulty)
    const openingDelayMultiplier = duelBotOpeningDelayMultiplier(botMatch.resolvedDifficulty, botMatch.botRound, botMatch.botTotalMs)
    const delay = (config.minDelay + Math.random() * Math.max(0, config.maxDelay - config.minDelay)) * modeDelayMultiplier * openingDelayMultiplier
    botAnswerTimerRef.current = window.setTimeout(() => {
      const activeMatch = botMatchRef.current
      if (!activeMatch || activeMatch.status !== 'in_progress') return
      const activeRound = activeMatch.questionSet[activeMatch.botRound - 1]
      if (!activeRound) return
      const activeScoreGap = activeMatch.userScore - activeMatch.botScore
      const activeUserHotStreak = activeMatch.gameType === 'blaster' ? blasterStreak : activeMatch.userStreak
      const activeConfig = duelBotDifficultyConfig(activeMatch.resolvedDifficulty, activeScoreGap, activeUserHotStreak)
      const correct = Math.random() < activeConfig.accuracy
      const elapsedMs = Math.max(0, Math.round(delay))
      let nextBotStreak = correct ? activeMatch.botStreak + 1 : 0
      let points = 0
      let powerupEffect: DuelBlasterDisruptionKey | null = null
      if (activeMatch.gameType === 'blaster' && isBlasterRound(activeRound)) {
        const powerup = duelBlasterPowerupForRound(activeRound.round, activeMatch.powerupsEnabled, activeMatch.mode)
        powerupEffect = correct ? duelBlasterDisruptionForPowerup(powerup) : null
        nextBotStreak = correct ? activeMatch.botStreak + 1 : powerup?.key === 'donut' || powerup?.key === 'vest' ? activeMatch.botStreak : 0
        points = calculateDuelBlasterPointDetails(correct, nextBotStreak, elapsedMs, powerup, activeMatch.mode).points
      } else if (activeMatch.gameType === 'matching') {
        points = calculateDuelMatchingBotPoints(correct, nextBotStreak, elapsedMs)
      } else {
        points = calculateDuelQuizPoints(correct, nextBotStreak, elapsedMs)
      }
      const nextBotRound = Math.min(activeMatch.rounds + 1, activeMatch.botRound + 1)
      const nextBotScore = activeMatch.botScore + points
      const nextBotTotalMs = activeMatch.botTotalMs + elapsedMs
      const nextBotFastestMs = elapsedMs > 0 && (activeMatch.botFastestMs <= 0 || elapsedMs < activeMatch.botFastestMs)
        ? elapsedMs
        : activeMatch.botFastestMs
      const nextMatch: DuelBotMatch = {
        ...activeMatch,
        botScore: nextBotScore,
        botRound: nextBotRound,
        botTotalMs: nextBotTotalMs,
        botFastestMs: nextBotFastestMs,
        botStreak: nextBotStreak,
        lastBotCorrect: correct,
      }
      botMatchRef.current = nextMatch
      setBotMatch(nextMatch)
      if (activeMatch.gameType === 'blaster' && isBlasterRound(activeRound)) {
        const targetIndex = correct
          ? activeRound.targets.findIndex((target) => normalizeBlasterTarget(target) === normalizeBlasterTarget(getBlasterRoundCorrectCode(activeRound)))
          : Math.max(0, activeRound.targets.findIndex((target) => normalizeBlasterTarget(target) !== normalizeBlasterTarget(getBlasterRoundCorrectCode(activeRound))))
        triggerBlasterShotBurstAtElement(
          blasterTargetRefs.current[blasterTargetDomKey(Math.max(0, targetIndex))],
          correct ? 'spectator' : 'bad',
        )
        triggerBlasterTugPulse(correct ? 'miss' : 'pull')
        if (correct && powerupEffect) triggerBlasterDisruption(powerupEffect, getBlasterRoundCorrectCode(activeRound))
      }
    }, delay)

    return () => {
      if (botAnswerTimerRef.current !== null) {
        window.clearTimeout(botAnswerTimerRef.current)
        botAnswerTimerRef.current = null
      }
    }
  }, [blasterStreak, botMatch, triggerBlasterDisruption, triggerBlasterShotBurstAtElement, triggerBlasterTugPulse])

  useEffect(() => {
    if (!room || !myPlayer || !canStartRound) return
    if (!initializedRoundKey) return
    if (initializedRoundKeyRef.current === initializedRoundKey) return
    initializedRoundKeyRef.current = initializedRoundKey

    const nextRoundStartedAt = Date.now()
    roundStartedAtRef.current = nextRoundStartedAt
    setRoundStartedAt(nextRoundStartedAt)
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
    setBlasterChoice(null)
    setBlasterChoiceRound(null)
    setBlasterLocked(false)
    setBlasterFeedback('')
    setBlasterShotBursts([])
    setBlasterTugPulse('')

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

  useEffect(() => {
    if (!currentRoomStatus || currentRoomStatus === 'in_progress') return
    initializedRoundKeyRef.current = ''
    roundStartedAtRef.current = 0
    autoForfeitRoundKeyRef.current = ''
    setRoundStartedAt(0)
    setQuizChoice(null)
    setQuizLocked(false)
    setSelectedMatchingCards([])
    setWrongMatchingCardIds([])
    setMatchedPairIds([])
    setMatchingMistakes(0)
    setMatchingRoundPoints(0)
    setMatchingSubmitted(false)
    setMatchingCards([])
    setBlasterChoice(null)
    setBlasterChoiceRound(null)
    setBlasterLocked(false)
    setBlasterStreak(0)
    setBlasterFeedback('')
    setBlasterShotBursts([])
    setBlasterTugPulse('')
  }, [currentRoomStatus, room?.id])

  const enterFreshRoom = useCallback((nextRoomId: string) => {
    activeRoomIdRef.current = nextRoomId
    refreshInFlightRef.current = false
    refreshQueuedRef.current = false
    initializedRoundKeyRef.current = ''
    autoForfeitRoundKeyRef.current = ''
    roundStartedAtRef.current = 0
    quizSpamHistoryRef.current = []
    quizSpamStrikeRef.current = 0
    previousPlayersRef.current = []
    previousRoomStatusRef.current = null
    activityBootstrappedRef.current = false
    setRoomId(nextRoomId)
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
    setBlasterChoice(null)
    setBlasterChoiceRound(null)
    setBlasterLocked(false)
    setBlasterStreak(0)
    setBlasterFeedback('')
    setBlasterShotBursts([])
    setBlasterTugPulse('')
    if (blasterDisruptionTimerRef.current !== null) {
      window.clearTimeout(blasterDisruptionTimerRef.current)
      blasterDisruptionTimerRef.current = null
    }
    blasterDisruptionRef.current = null
    setBlasterDisruption(null)
    setWaitingChatMessages([])
    setWaitingChatInput('')
    setWaitingChatSending(false)
    setActivityLog([])
  }, [])

  useEffect(() => {
    if (!externalJoinRoomId) return
    if (roomId === externalJoinRoomId && room?.id === externalJoinRoomId) {
      onExternalJoinHandled?.()
      return
    }
    enterFreshRoom(externalJoinRoomId)
    setNotice('Invite accepted. Joined 1v1 room.')
    onExternalJoinHandled?.()
  }, [enterFreshRoom, externalJoinRoomId, onExternalJoinHandled, room?.id, roomId])

  const createRoom = async () => {
    if (!supabase || !isSignedIn) return
    if (selectedGameType === 'connect4' && !connect4Enabled) {
      setError('Connect 4 is disabled.')
      return
    }
    setLoading(true)
    setError('')
    setNotice('')
    const { data, error: rpcError } = await supabase.rpc('create_1v1_room_v2', {
        p_game_type: selectedGameType,
        p_category: selectedGameType === 'connect4' ? 'all' : selectedCategory,
        p_is_public: isPublicRoom,
        p_rounds: selectedGameType === 'connect4'
          ? 42
          : selectedGameType === 'matching'
          ? 5
          : selectedGameType === 'blaster'
            ? duelBlasterRoundCap
            : selectedQuizRounds,
        p_powerups_enabled: selectedGameType === 'blaster' ? selectedPowerupsEnabled : false,
        p_blaster_duration_seconds: selectedGameType === 'blaster'
          ? selectedBlasterDurationSeconds
          : duelBlasterDefaultDurationSeconds,
        p_blaster_sudden_death: selectedGameType === 'blaster' && selectedBlasterMode === 'death',
        p_blaster_rope_limit: duelBlasterDefaultRopeLimit,
        p_blaster_overtime_enabled: selectedGameType === 'blaster' ? selectedBlasterOvertimeEnabled : duelBlasterDefaultOvertimeEnabled,
        p_blaster_overtime_after_seconds: selectedGameType === 'blaster' ? selectedBlasterOvertimeAfterSeconds : duelBlasterDefaultOvertimeAfterSeconds,
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
    enterFreshRoom(nextRoomId)
    setNotice('Room created. Waiting for opponent.')
  }

  const syncLobbySettingsDraftFromRoom = useCallback((sourceRoom: DuelRoomRow) => {
    const sourceSettings = sourceRoom.settings || {}
    setLobbyEditGameType(sourceRoom.game_type)
    setLobbyEditCategory(sourceRoom.game_type !== 'quiz' && sourceRoom.category === 'scenarios' ? 'all' : sourceRoom.category)
    setLobbyEditQuizRounds(sourceRoom.game_type === 'quiz' ? sourceRoom.rounds || selectedQuizRounds : selectedQuizRounds)
    setLobbyEditPowerupsEnabled(sourceRoom.game_type === 'blaster' ? Boolean(sourceSettings.powerups_enabled ?? selectedPowerupsEnabled) : selectedPowerupsEnabled)
    setLobbyEditBlasterMode(sourceRoom.game_type === 'blaster' ? getBlasterMode(sourceSettings) : selectedBlasterMode)
    setLobbyEditBlasterDurationSeconds(sourceRoom.game_type === 'blaster' ? getBlasterDurationSeconds(sourceSettings) : selectedBlasterDurationSeconds)
    setLobbyEditBlasterOvertimeEnabled(sourceRoom.game_type === 'blaster' ? getBlasterOvertimeEnabled(sourceSettings) : selectedBlasterOvertimeEnabled)
    setLobbyEditBlasterOvertimeAfterSeconds(sourceRoom.game_type === 'blaster' ? getBlasterOvertimeAfterSeconds(sourceSettings) : selectedBlasterOvertimeAfterSeconds)
  }, [
    selectedBlasterDurationSeconds,
    selectedBlasterMode,
    selectedBlasterOvertimeAfterSeconds,
    selectedBlasterOvertimeEnabled,
    selectedPowerupsEnabled,
    selectedQuizRounds,
  ])

  const openChangeModeModal = () => {
    if (!room || room.status !== 'waiting') {
      setError('Game settings can only be changed before the match starts.')
      return
    }
    if (room.host_user_id !== currentUserId) {
      setError('Only the host can change the lobby mode.')
      return
    }
    syncLobbySettingsDraftFromRoom(room)
    setError('')
    setNotice('')
    setShowChangeModeModal(true)
  }

  const saveLobbySettings = async () => {
    if (!supabase || !room || !roomId) return
    if (room.status !== 'waiting') {
      setError('Game settings can only be changed before the match starts.')
      setShowChangeModeModal(false)
      return
    }
    if (room.host_user_id !== currentUserId) {
      setError('Only the host can change the lobby mode.')
      setShowChangeModeModal(false)
      return
    }

    if (lobbyEditGameType === 'connect4' && !connect4Enabled) {
      setError('Connect 4 is disabled.')
      setShowChangeModeModal(false)
      return
    }

    const nextCategory = lobbyEditGameType === 'connect4' || (lobbyEditGameType !== 'quiz' && lobbyEditCategory === 'scenarios') ? 'all' : lobbyEditCategory
    const nextRounds = lobbyEditGameType === 'connect4'
      ? 42
      : lobbyEditGameType === 'matching'
      ? 5
      : lobbyEditGameType === 'blaster'
        ? duelBlasterRoundCap
        : lobbyEditQuizRounds
    const nextSettings: Record<string, unknown> = {
      powerups_enabled: lobbyEditGameType === 'blaster' ? lobbyEditPowerupsEnabled : false,
      blaster_duration_seconds: lobbyEditGameType === 'blaster' ? lobbyEditBlasterDurationSeconds : duelBlasterDefaultDurationSeconds,
      blaster_win_condition: lobbyEditGameType === 'blaster' && lobbyEditBlasterMode === 'death' ? 'death' : 'timed',
      blaster_rope_limit: duelBlasterDefaultRopeLimit,
      blaster_overtime_enabled: lobbyEditGameType === 'blaster' ? lobbyEditBlasterOvertimeEnabled : duelBlasterDefaultOvertimeEnabled,
      blaster_overtime_after_seconds: lobbyEditGameType === 'blaster' ? lobbyEditBlasterOvertimeAfterSeconds : duelBlasterDefaultOvertimeAfterSeconds,
    }

    setLobbySettingsSaving(true)
    setError('')
    setNotice('')
    let rpcErrorMessage = ''
    try {
      const { error: rpcError } = await supabase.rpc('update_1v1_lobby_settings', {
        p_room_id: roomId,
        p_game_type: lobbyEditGameType,
        p_category: nextCategory,
        p_rounds: nextRounds,
        p_powerups_enabled: lobbyEditGameType === 'blaster' ? lobbyEditPowerupsEnabled : false,
        p_blaster_duration_seconds: lobbyEditGameType === 'blaster'
          ? lobbyEditBlasterDurationSeconds
          : duelBlasterDefaultDurationSeconds,
        p_blaster_sudden_death: lobbyEditGameType === 'blaster' && lobbyEditBlasterMode === 'death',
        p_blaster_rope_limit: duelBlasterDefaultRopeLimit,
        p_blaster_overtime_enabled: lobbyEditGameType === 'blaster' ? lobbyEditBlasterOvertimeEnabled : duelBlasterDefaultOvertimeEnabled,
        p_blaster_overtime_after_seconds: lobbyEditGameType === 'blaster' ? lobbyEditBlasterOvertimeAfterSeconds : duelBlasterDefaultOvertimeAfterSeconds,
      })
      rpcErrorMessage = rpcError?.message || ''
    } catch (err) {
      rpcErrorMessage = err instanceof Error ? err.message : 'Could not update lobby settings.'
    } finally {
      setLobbySettingsSaving(false)
    }
    if (rpcErrorMessage) {
      setError(rpcErrorMessage || 'Could not update lobby settings.')
      return
    }

    setSelectedGameType(lobbyEditGameType)
    setSelectedCategory(nextCategory)
    setSelectedQuizRounds(lobbyEditQuizRounds)
    setSelectedPowerupsEnabled(lobbyEditPowerupsEnabled)
    setSelectedBlasterMode(lobbyEditBlasterMode)
    setSelectedBlasterDurationSeconds(lobbyEditBlasterDurationSeconds)
    setSelectedBlasterOvertimeEnabled(lobbyEditBlasterOvertimeEnabled)
    setSelectedBlasterOvertimeAfterSeconds(lobbyEditBlasterOvertimeAfterSeconds)
    setRoom((previous) => previous && previous.id === roomId
      ? {
        ...previous,
        game_type: lobbyEditGameType,
        category: nextCategory,
        rounds: nextRounds,
        settings: nextSettings,
        current_round: 1,
        started_at: null,
        winner_user_id: null,
      }
      : previous)
    setPlayers((previous) => previous.map((player) => ({
      ...player,
      is_ready: false,
      score: 0,
      total_time_ms: 0,
      fastest_round_ms: 0,
      current_round: 1,
      finished_at: null,
    })))
    setShowChangeModeModal(false)
    setNotice('Lobby settings updated. Both players need to ready up again.')
    await refreshRoomSnapshot()
    window.setTimeout(() => void refreshRoomSnapshot(), 400)
  }

  const openInviteModal = (sourceRoom?: DuelRoomRow | null, presetGameType?: DuelGameType) => {
    const sourceGameType = presetGameType || sourceRoom?.game_type || selectedGameType
    const sourceCategory = sourceRoom?.category || selectedCategory
    const sourceSettings = sourceRoom?.settings || null
    setInviteGameType(sourceGameType)
    setInviteCategory(sourceGameType !== 'quiz' && sourceCategory === 'scenarios' ? 'all' : sourceCategory)
    setInviteQuizRounds(sourceGameType === 'quiz' ? sourceRoom?.rounds || selectedQuizRounds : selectedQuizRounds)
    setInvitePowerupsEnabled(sourceGameType === 'blaster' ? Boolean(sourceSettings?.powerups_enabled ?? selectedPowerupsEnabled) : selectedPowerupsEnabled)
    setInviteBlasterMode(sourceGameType === 'blaster' ? getBlasterMode(sourceSettings) : selectedBlasterMode)
    setInviteBlasterDurationSeconds(sourceGameType === 'blaster' ? getBlasterDurationSeconds(sourceSettings) : selectedBlasterDurationSeconds)
    setInviteBlasterOvertimeEnabled(sourceGameType === 'blaster' ? getBlasterOvertimeEnabled(sourceSettings) : selectedBlasterOvertimeEnabled)
    setInviteBlasterOvertimeAfterSeconds(sourceGameType === 'blaster' ? getBlasterOvertimeAfterSeconds(sourceSettings) : selectedBlasterOvertimeAfterSeconds)
    setShowBotSetupModal(false)
    setShowInviteModal(true)
    setError('')
    setNotice('')
    void loadOnlineInviteUsers()
  }

  const openBotSetupModal = (presetGameType?: DuelGameType) => {
    const requestedGameType = presetGameType || selectedGameType
    const sourceGameType = requestedGameType
    setInviteGameType(sourceGameType)
    setInviteCategory(sourceGameType !== 'quiz' && selectedCategory === 'scenarios' ? 'all' : selectedCategory)
    setInviteQuizRounds(selectedQuizRounds)
    setInvitePowerupsEnabled(selectedPowerupsEnabled)
    setInviteBlasterMode(selectedBlasterMode)
    setInviteBlasterDurationSeconds(selectedBlasterDurationSeconds)
    setInviteBlasterOvertimeEnabled(selectedBlasterOvertimeEnabled)
    setInviteBlasterOvertimeAfterSeconds(selectedBlasterOvertimeAfterSeconds)
    setShowInviteModal(false)
    setShowBotSetupModal(true)
    setError('')
    setNotice('')
    void loadBotSkillSnapshot()
  }

  const broadcastInviteCreated = useCallback(async (payload: {
    targetUserId: string
    inviteId: string
    roomId: string
  }) => {
    if (!supabase) return

    const broadcastChannel = supabase.channel('duel-invite-broadcast')

    try {
      await new Promise<void>((resolve) => {
        let settled = false
        const finish = () => {
          if (settled) return
          settled = true
          resolve()
        }

        broadcastChannel.subscribe((status) => {
          if (status === 'SUBSCRIBED' || status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
            finish()
          }
        })

        window.setTimeout(finish, 500)
      })

      const result = await broadcastChannel.send({
        type: 'broadcast',
        event: 'duel-invite-created',
        payload: {
          target_user_id: payload.targetUserId,
          sender_user_id: currentUserId,
          invite_id: payload.inviteId || null,
          room_id: payload.roomId,
          sent_at: new Date().toISOString(),
        },
      })

      if (result !== 'ok') {
        console.warn('[1v1] invite broadcast fallback send was not acknowledged:', result)
      }
    } finally {
      await supabase.removeChannel(broadcastChannel)
    }
  }, [currentUserId])

  const sendInvite = async (targetUser: OnlineInviteUser) => {
    if (!supabase || !isSignedIn) return
    if (inviteGameType === 'connect4' && !connect4Enabled) {
      setError('Connect 4 is disabled.')
      return
    }
    setInviteSendingUserId(targetUser.user_id)
    setError('')
    setNotice('')
    const inviteRounds = inviteGameType === 'connect4'
      ? 42
      : inviteGameType === 'matching'
      ? 5
      : inviteGameType === 'blaster'
        ? duelBlasterRoundCap
        : inviteQuizRounds
    const { data, error: rpcError } = await supabase.rpc('create_1v1_invite_v2', {
        p_target_user_id: targetUser.user_id,
        p_game_type: inviteGameType,
        p_category: inviteGameType === 'connect4' ? 'all' : inviteCategory,
        p_rounds: inviteRounds,
        p_powerups_enabled: inviteGameType === 'blaster' ? invitePowerupsEnabled : false,
        p_blaster_duration_seconds: inviteGameType === 'blaster'
          ? inviteBlasterDurationSeconds
          : duelBlasterDefaultDurationSeconds,
        p_blaster_sudden_death: inviteGameType === 'blaster' && inviteBlasterMode === 'death',
        p_blaster_rope_limit: duelBlasterDefaultRopeLimit,
        p_blaster_overtime_enabled: inviteGameType === 'blaster' ? inviteBlasterOvertimeEnabled : duelBlasterDefaultOvertimeEnabled,
        p_blaster_overtime_after_seconds: inviteGameType === 'blaster' ? inviteBlasterOvertimeAfterSeconds : duelBlasterDefaultOvertimeAfterSeconds,
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

    await broadcastInviteCreated({
      targetUserId: targetUser.user_id,
      inviteId: nextInviteId,
      roomId: nextRoomId,
    })

    setShowInviteModal(false)
    enterFreshRoom(nextRoomId)
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
    if (previousRoomStatus === 'completed' || previousRoomStatus === 'cancelled') {
      setNotice('Start a new game from the results screen to play again.')
      return
    }
    const { data, error: rpcError } = await supabase.rpc('set_1v1_ready', { p_room_id: roomId, p_ready: ready })
    if (rpcError) {
      setError(rpcError.message || 'Could not update ready status.')
      return
    }

    const state = parseReadyRpcState(data)
    const nextRoomId = state.room_id || roomId
    const switchingRooms = Boolean(nextRoomId && nextRoomId !== roomId)
    if (state.status === 'in_progress' && roomId) {
      const nextStartedAt = state.started_at || new Date(Date.now() + 4000).toISOString()
      setRoom((previous) => previous && previous.id === roomId
        ? {
          ...previous,
          status: 'in_progress',
          current_round: 1,
          started_at: nextStartedAt,
        }
        : previous)
      setPlayers((previous) => previous.map((player) => ({
        ...player,
        is_ready: false,
        current_round: player.current_round,
      })))
    }
    if (switchingRooms && nextRoomId) {
      initializedRoundKeyRef.current = ''
      roundStartedAtRef.current = 0
      autoForfeitRoundKeyRef.current = ''
      setRoomId(nextRoomId)
      setRoom(null)
      setPlayers([])
      setResults([])
    }
    if (!switchingRooms) {
      void refreshRoomSnapshot()
      window.setTimeout(() => void refreshRoomSnapshot(), 250)
      window.setTimeout(() => void refreshRoomSnapshot(), 900)
    }

    if ((previousRoomStatus === 'waiting' || state.status === 'waiting') && ready && state.player_count === 2 && state.ready_count === 2) {
      setNotice('Syncing with your opponent…')
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
    if (!canStartRound || !isQuizRound(currentRound) || quizLocked) return

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
  }, [room, currentRound, canStartRound, quizLocked, submitQuizAnswer])

  // Keyboard shortcuts for bot 1v1 quiz answers.
  useEffect(() => {
    if (!botMatch || botMatch.status !== 'in_progress' || botMatch.gameType !== 'quiz') return
    if (quizLocked) return
    const currentBotRound = botMatch.questionSet[botMatch.userRound - 1]
    if (!isQuizRound(currentBotRound)) return

    const handleBotQuizKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) return

      const keyNumber = Number.parseInt(event.key, 10)
      const codeNumber = event.code.startsWith('Digit') || event.code.startsWith('Numpad')
        ? Number.parseInt(event.code.replace(/\D/g, ''), 10)
        : Number.NaN
      const choiceNumber = Number.isFinite(keyNumber) ? keyNumber : codeNumber
      if (!Number.isInteger(choiceNumber)) return
      const choiceIndex = choiceNumber - 1
      if (choiceIndex < 0 || choiceIndex >= currentBotRound.choices.length) return

      event.preventDefault()
      submitBotQuizAnswer(choiceIndex)
    }

    window.addEventListener('keydown', handleBotQuizKeyDown)
    return () => window.removeEventListener('keydown', handleBotQuizKeyDown)
  }, [botMatch, quizLocked, submitBotQuizAnswer])

  useEffect(() => {
    if (!room || !myPlayer || room.status !== 'in_progress' || room.game_type !== 'quiz') return
    if (myPlayer.current_round > room.rounds) return
    if (isSpectator || !canStartRound || !roundIsInitialized || !isQuizRound(currentRound) || quizLocked) return
    const startedAt = roundStartedAtRef.current
    if (startedAt <= 0 || initializedRoundKeyRef.current !== initializedRoundKey) return

    const roundKey = `${room.id}:${myPlayer.user_id}:${currentRound.round}`
    const elapsedMs = Math.max(0, Date.now() - startedAt)
    const remainingMs = quizRoundTimeLimitMs - elapsedMs

    if (remainingMs <= 0) {
      void triggerAutoForfeit(roundKey, 'blaster')
      return
    }

    const timer = window.setTimeout(() => {
      void triggerAutoForfeit(roundKey, 'blaster')
    }, remainingMs)

    return () => window.clearTimeout(timer)
  }, [
    canStartRound,
    currentRound,
    initializedRoundKey,
    isSpectator,
    myPlayer,
    quizLocked,
    roundIsInitialized,
    room,
    roundStartedAt,
    triggerAutoForfeit,
    quizRoundTimeLimitMs,
  ])

  useEffect(() => {
    if (!room || !myPlayer || room.status !== 'in_progress' || room.game_type !== 'matching') return
    if (myPlayer.current_round > room.rounds) return
    if (isSpectator || !canStartRound || !roundIsInitialized || !isMatchingRound(currentRound) || matchingSubmitted) return
    const startedAt = roundStartedAtRef.current
    if (startedAt <= 0 || initializedRoundKeyRef.current !== initializedRoundKey) return

    const roundKey = `${room.id}:${myPlayer.user_id}:${currentRound.round}:matching`
    const elapsedMs = Math.max(0, Date.now() - startedAt)
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
    initializedRoundKey,
    isSpectator,
    matchingSubmitted,
    myPlayer,
    roundIsInitialized,
    room,
    roundStartedAt,
    triggerAutoForfeit,
  ])

  useEffect(() => {
    if (!room || !myPlayer || room.status !== 'in_progress' || room.game_type !== 'blaster') return
    if (isSpectator || countdownActive || getBlasterMode(room.settings) === 'death') return
    const startedAtMs = room.started_at ? Date.parse(room.started_at) : NaN
    if (!Number.isFinite(startedAtMs) || hudNow < startedAtMs) return

    const remainingMs = startedAtMs + (getBlasterDurationSeconds(room.settings) * 1000) - hudNow
    if (remainingMs <= 0) {
      void finishBlasterByTimeout()
      return
    }

    const timer = window.setTimeout(() => {
      void finishBlasterByTimeout()
    }, remainingMs)

    return () => window.clearTimeout(timer)
  }, [
    countdownActive,
    finishBlasterByTimeout,
    hudNow,
    isSpectator,
    myPlayer,
    room,
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
    if (matchingSubmitted) return
    if (matchedPairIds.length !== currentRound.pairs.length) return

    const startedAt = roundStartedAtRef.current || roundStartedAt
    if (startedAt <= 0 || initializedRoundKeyRef.current !== initializedRoundKey) return
    setMatchingSubmitted(true)
    const elapsedMs = Math.max(0, Date.now() - startedAt)
    const completionBonus = 20
    const roundPoints = Math.max(0, matchingRoundPoints + completionBonus)
    if (currentRound.round < room.rounds) {
      applyOptimisticRoundAdvance({ round: currentRound.round, points: roundPoints, elapsedMs })
    }
    void submitRound({
      round: currentRound.round,
      correct: true,
      elapsedMs,
      points: roundPoints,
    })
  }, [applyOptimisticRoundAdvance, currentRound, initializedRoundKey, matchedPairIds.length, matchingRoundPoints, matchingSubmitted, room, roundStartedAt, submitRound])

  useEffect(() => {
    if (!botMatch || botMatch.status !== 'in_progress' || botMatch.gameType !== 'matching') return
    const currentBotRound = botMatch.questionSet[botMatch.userRound - 1]
    if (!isMatchingRound(currentBotRound) || matchingSubmitted) return
    if (matchedPairIds.length !== currentBotRound.pairs.length) return

    setMatchingSubmitted(true)
    const elapsedMs = Math.max(0, Date.now() - (roundStartedAtRef.current || botMatch.startedAt))
    const nextStreak = botMatch.userStreak + 1
    const roundPoints = calculateDuelMatchingBotPoints(true, nextStreak, elapsedMs, matchingRoundPoints)
    const nextRoundNumber = Math.min(botMatch.rounds + 1, botMatch.userRound + 1)
    const activeMatch = botMatchRef.current && botMatchRef.current.id === botMatch.id
      ? botMatchRef.current
      : botMatch
    const nextFastest = elapsedMs > 0 && (activeMatch.userFastestMs <= 0 || elapsedMs < activeMatch.userFastestMs)
      ? elapsedMs
      : activeMatch.userFastestMs
    const nextMatch: DuelBotMatch = {
      ...activeMatch,
      userScore: activeMatch.userScore + roundPoints,
      userRound: nextRoundNumber,
      userTotalMs: activeMatch.userTotalMs + elapsedMs,
      userFastestMs: nextFastest,
      userStreak: nextStreak,
    }
    botMatchRef.current = nextMatch
    setBotMatch(nextMatch)

    window.setTimeout(() => {
      const latestMatch = botMatchRef.current
      const nextRound = latestMatch?.questionSet[nextRoundNumber - 1]
      setSelectedMatchingCards([])
      setWrongMatchingCardIds([])
      setMatchedPairIds([])
      setMatchingMistakes(0)
      setMatchingRoundPoints(0)
      setMatchingSubmitted(false)
      if (latestMatch?.status === 'in_progress' && isMatchingRound(nextRound)) {
        setMatchingCards(buildMatchingCardsForRound(nextRound, `${latestMatch.id}-${nextRound.round}`))
        roundStartedAtRef.current = Date.now()
        setRoundStartedAt(roundStartedAtRef.current)
      } else {
        setMatchingCards([])
      }
    }, 420)
  }, [botMatch, matchedPairIds.length, matchingRoundPoints, matchingSubmitted])

  const leaveRoom = useCallback(() => {
    initializedRoundKeyRef.current = ''
    autoForfeitRoundKeyRef.current = ''
    roundStartedAtRef.current = 0
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
    setBlasterChoice(null)
    setBlasterChoiceRound(null)
    setBlasterLocked(false)
    setBlasterStreak(0)
    setBlasterFeedback('')
    setBlasterShotBursts([])
    setBlasterTugPulse('')
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

  const exitBotMatch = useCallback(() => {
    if (botAnswerTimerRef.current !== null) {
      window.clearTimeout(botAnswerTimerRef.current)
      botAnswerTimerRef.current = null
    }
    botMatchRef.current = null
    setBotMatch(null)
    setConnect4BotMatch(null)
    initializedRoundKeyRef.current = ''
    roundStartedAtRef.current = 0
    setRoundStartedAt(0)
    setBlasterChoice(null)
    setBlasterChoiceRound(null)
    setBlasterLocked(false)
    setBlasterStreak(0)
    setBlasterShotBursts([])
    setBlasterTugPulse('')
    setBlasterVisibleTargets([])
    blasterVisibleTargetsRef.current = []
    blasterMotionTargetsRef.current = []
    blasterMotionRoundRef.current = 0
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

  const roomPlayerRowsSorted = useMemo(() => {
    if (room?.status === 'completed' && results.length > 0) {
      return [...results].sort((left, right) => left.placement - right.placement)
    }
    return [...players].sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      if (left.total_time_ms !== right.total_time_ms) return left.total_time_ms - right.total_time_ms
      return left.slot_no - right.slot_no
    })
  }, [players, results, room?.status])

  const myResultRow = useMemo(() => roomPlayerRowsSorted.find((entry) => entry.user_id === currentUserId) || null, [currentUserId, roomPlayerRowsSorted])
  const opponentResultRow = useMemo(() => roomPlayerRowsSorted.find((entry) => entry.user_id !== currentUserId) || null, [currentUserId, roomPlayerRowsSorted])

  const lobbyReadyCount = players.filter((player) => player.is_ready).length
  const lobbyPlayerCount = players.length
  const isRoomHost = Boolean(room && room.host_user_id === currentUserId)
  const canHostChangeLobbyMode = Boolean(room && room.status === 'waiting' && isRoomHost)
  const roomRuleLabel = room ? formatDuelRoomRuleLabel(room) : ''
  const roomCategoryLabel = room ? duelCategoryLabel(room.category) : ''
  const lobbyEditRuleLabel = lobbyEditGameType === 'connect4'
    ? 'Classic 7x6'
    : lobbyEditGameType === 'quiz'
      ? `${lobbyEditQuizRounds} questions`
      : lobbyEditGameType === 'matching'
        ? '3 pair sets'
        : lobbyEditBlasterMode === 'death'
          ? 'To the Death'
          : `${lobbyEditBlasterDurationSeconds}s timer`
  const lobbyEditAssistLabel = lobbyEditGameType === 'blaster'
    ? `${lobbyEditPowerupsEnabled ? 'Power-ups on' : 'Power-ups off'} | Overtime ${lobbyEditBlasterOvertimeEnabled ? `${lobbyEditBlasterOvertimeAfterSeconds}s` : 'off'}`
    : lobbyEditGameType === 'connect4'
      ? 'Column-drop duel'
    : lobbyEditGameType === 'matching'
      ? 'Fast pair rounds'
      : 'Code recall rounds'
  const waitingChatSendDisabled = waitingChatSending || !waitingChatInput.trim() || !room || room.status !== 'waiting'
  const inviteGameLabel = duelGameTypeLabels[inviteGameType]
  const inviteCategoryLabel = inviteCategory === 'all'
    ? 'ALL'
    : inviteCategory === 'pc'
      ? 'PC'
      : inviteCategory === 'vc'
        ? 'VC'
        : inviteCategory === 'hs'
          ? 'HS'
          : 'Scenarios'
  const botSetupDifficultyOption = duelBotDifficultyOptions.find((option) => option.value === botDifficulty) || duelBotDifficultyOptions[0]
  const botSetupRuleLabel = inviteGameType === 'connect4'
    ? 'Classic 7x6'
    : inviteGameType === 'quiz'
      ? `${inviteQuizRounds} questions`
      : inviteGameType === 'matching'
        ? '3 pair sets'
        : inviteBlasterMode === 'death'
          ? 'To the Death'
          : `${inviteBlasterDurationSeconds}s timer`
  const botSetupAssistLabel = inviteGameType === 'blaster'
    ? `${invitePowerupsEnabled ? 'Power-ups on' : 'Power-ups off'} | Overtime ${inviteBlasterOvertimeEnabled ? `${inviteBlasterOvertimeAfterSeconds}s` : 'off'}`
    : inviteGameType === 'connect4'
      ? 'Bot blocks and wins'
    : inviteGameType === 'matching'
      ? 'Fast pair rounds'
      : 'Code recall rounds'
  const botSetupFocusCodes = botSkillSnapshot.weakCodes.slice(0, 3)
  const botSetupFocusLabel = botSetupFocusCodes.length > 0 ? botSetupFocusCodes.join(', ') : 'Balanced rotation'
  const inRoom = Boolean(room && roomId && room.id === roomId)
  const isJoiningRoom = Boolean(roomId && !inRoom)
  // const waitingPlayersCount = players.length
  // const waitingStatusMessage = waitingPlayersCount < 2
  //   ? `Waiting for ${2 - waitingPlayersCount} more player${2 - waitingPlayersCount === 1 ? '' : 's'} to join.`
  //   : lobbyReadyCount < 2
  //     ? 'Both players joined. Waiting for both players to ready up.'
  //     : 'Both players are ready. Match countdown starting…'

  const matchingStatusText = matchingSubmitted
    ? 'Set complete. Waiting for next set…'
    : 'Match all 3 pairs to auto-submit this set.'
  const blasterPowerupsEnabled = Boolean(room?.settings?.powerups_enabled)
  const blasterMode = getBlasterMode(room?.settings)
  const blasterPowerup = isBlasterRound(currentRound)
    ? duelBlasterPowerupForRound(currentRound.round, blasterPowerupsEnabled, blasterMode)
    : null
  const blasterRoundTargets = isBlasterRound(currentRound)
    ? blasterVisibleTargets.length > 0
      ? blasterVisibleTargets
      : currentRound.targets.map((target) => String(target))
    : []
  const blasterRoundCorrectCode = isBlasterRound(currentRound) ? getBlasterRoundCorrectCode(currentRound) : ''
  const blasterDurationSeconds = getBlasterDurationSeconds(room?.settings)
  const blasterRopeLimit = getBlasterRopeLimit(room?.settings)
  const blasterOvertimeEnabled = getBlasterOvertimeEnabled(room?.settings)
  const blasterOvertimeAfterSeconds = getBlasterOvertimeAfterSeconds(room?.settings)
  const blasterMatchElapsedMs = useMemo(() => {
    if (!room || room.status !== 'in_progress' || room.game_type !== 'blaster') return 0
    const startedAtMs = room.started_at ? Date.parse(room.started_at) : NaN
    if (!Number.isFinite(startedAtMs) || hudNow < startedAtMs || countdownActive) return 0
    return Math.max(0, hudNow - startedAtMs)
  }, [countdownActive, hudNow, room])
  const blasterSuddenDeathActive = room?.status === 'in_progress'
    && room.game_type === 'blaster'
    && blasterOvertimeEnabled
    && blasterMatchElapsedMs >= blasterOvertimeAfterSeconds * 1000
  const blasterSuddenDeathRopeLimit = getBlasterSuddenDeathRopeLimit(blasterRopeLimit)
  const effectiveBlasterRopeLimit = blasterSuddenDeathActive ? blasterSuddenDeathRopeLimit : blasterRopeLimit
  const blasterMatchRemainingMs = useMemo(() => {
    if (!room || room.status !== 'in_progress' || room.game_type !== 'blaster') return 0
    if (blasterMode === 'death' || countdownActive) return 0
    const startedAtMs = room.started_at ? Date.parse(room.started_at) : NaN
    if (!Number.isFinite(startedAtMs)) return 0
    return Math.max(0, startedAtMs + (blasterDurationSeconds * 1000) - hudNow)
  }, [blasterDurationSeconds, blasterMode, countdownActive, hudNow, room])
  const blasterMatchRemainingSeconds = blasterMatchRemainingMs > 0 ? Math.ceil(blasterMatchRemainingMs / 1000) : 0
  const blasterMatchProgressPercent = blasterMode === 'death'
    ? 100
    : Math.max(0, Math.min(100, (blasterMatchRemainingMs / Math.max(1, blasterDurationSeconds * 1000)) * 100))
  const scoreGap = (myPlayer?.score || 0) - (opponentPlayer?.score || 0)
  const tugPercent = Math.max(2, Math.min(98, 50 + (scoreGap / effectiveBlasterRopeLimit) * 50))
  const tugVisualWidthPercent = blasterSuddenDeathActive ? 54 : 100
  const tugVisualStartPercent = blasterSuddenDeathActive ? (100 - tugVisualWidthPercent) / 2 : 0
  const tugVisualPercent = blasterSuddenDeathActive
    ? tugVisualStartPercent + (tugPercent / 100) * tugVisualWidthPercent
    : tugPercent
  const tugTrackStyle = blasterSuddenDeathActive
    ? ({
        '--short-rope-left': `${tugVisualStartPercent}%`,
        '--short-rope-width': `${tugVisualWidthPercent}%`,
      } as CSSProperties)
    : undefined
  const tugRopeStyle: CSSProperties = blasterSuddenDeathActive
    ? {
        left: `${tugVisualStartPercent}%`,
        width: `${Math.max(0, tugVisualPercent - tugVisualStartPercent)}%`,
      }
    : { width: `${tugPercent}%` }
  const tugHandleStyle: CSSProperties = { left: `${tugVisualPercent}%` }
  const blasterRopeRemainingPercent = Math.max(0, Math.round(100 - (Math.abs(scoreGap) / effectiveBlasterRopeLimit) * 100))
  const finalBlasterScoreGap = myResultRow && opponentResultRow ? myResultRow.score - opponentResultRow.score : 0
  const finalBlasterFinishedAtMs = Math.max(
    ...[myResultRow?.finished_at, opponentResultRow?.finished_at]
      .map((value) => value ? Date.parse(value) : NaN)
      .filter((value) => Number.isFinite(value)),
    0,
  )
  const finalBlasterStartedAtMs = room?.started_at ? Date.parse(room.started_at) : NaN
  const finalBlasterSuddenDeath = room?.game_type === 'blaster'
    && blasterOvertimeEnabled
    && Number.isFinite(finalBlasterStartedAtMs)
    && finalBlasterFinishedAtMs > 0
    && finalBlasterFinishedAtMs - finalBlasterStartedAtMs >= blasterOvertimeAfterSeconds * 1000
  const finalBlasterRopeLimit = finalBlasterSuddenDeath ? blasterSuddenDeathRopeLimit : blasterRopeLimit
  const blasterResultRule = room?.game_type !== 'blaster'
    ? ''
    : Math.abs(finalBlasterScoreGap) >= finalBlasterRopeLimit
      ? finalBlasterSuddenDeath ? 'Overtime Rope KO' : 'Rope KO'
      : blasterMode === 'death'
        ? 'Round cap reached'
        : 'Timer expired'
  const tugBaseStateClass = blasterTugPulse
    ? `onevone-tug-${blasterTugPulse}`
    : scoreGap > 0
      ? 'onevone-tug-leading'
      : scoreGap < 0
        ? 'onevone-tug-trailing'
        : 'onevone-tug-even'
  const tugStateClass = `${tugBaseStateClass}${blasterSuddenDeathActive ? ' onevone-tug-sudden-death' : ''}`
  const blasterClockLabel = blasterSuddenDeathActive
    ? 'Overtime'
    : blasterMode === 'death'
      ? 'Win Condition'
      : 'Match Timer'
  const blasterClockValue = blasterMode === 'death'
    ? blasterSuddenDeathActive ? 'Rope Shrunk' : 'To the Death'
    : blasterSuddenDeathActive
      ? `${blasterMatchRemainingSeconds}s left`
      : `${blasterMatchRemainingSeconds}s`
  const botMatchInProgress = botMatch?.status === 'in_progress'
  const connect4BotMatchInProgress = connect4BotMatch?.status === 'in_progress'
  const duelMatchInProgress = Boolean(room?.status === 'in_progress' || botMatchInProgress || connect4BotMatchInProgress)
  useEffect(() => {
    onActiveMatchChange?.(duelMatchInProgress)
  }, [duelMatchInProgress, onActiveMatchChange])

  useEffect(() => () => {
    onActiveMatchChange?.(false)
  }, [onActiveMatchChange])

  const botCurrentRound = botMatchInProgress ? botMatch.questionSet[botMatch.userRound - 1] : null
  const botGameLabel = botMatch ? duelGameTypeLabels[botMatch.gameType] : 'Bot Match'
  const botRoundTargets = botMatchInProgress && isBlasterRound(botCurrentRound)
    ? blasterVisibleTargets.length > 0
      ? blasterVisibleTargets
      : botCurrentRound.targets.map((target) => String(target))
    : []
  const botRoundCorrectCode = botMatchInProgress && isBlasterRound(botCurrentRound) ? getBlasterRoundCorrectCode(botCurrentRound) : ''
  const botMatchElapsedMs = botMatch ? Math.max(0, hudNow - botMatch.startedAt) : 0
  const botSuddenDeathActive = Boolean(
    botMatchInProgress
    && botMatch.gameType === 'blaster'
    && botMatch.overtimeEnabled
    && botMatchElapsedMs >= botMatch.overtimeAfterSeconds * 1000,
  )
  const botEffectiveRopeLimit = botSuddenDeathActive ? getBlasterSuddenDeathRopeLimit(duelBlasterDefaultRopeLimit) : duelBlasterDefaultRopeLimit
  const botScoreGap = botMatch ? botMatch.userScore - botMatch.botScore : 0
  const botTugPercent = Math.max(2, Math.min(98, 50 + (botScoreGap / botEffectiveRopeLimit) * 50))
  const botTugVisualWidthPercent = botSuddenDeathActive ? 54 : 100
  const botTugVisualStartPercent = botSuddenDeathActive ? (100 - botTugVisualWidthPercent) / 2 : 0
  const botTugVisualPercent = botSuddenDeathActive
    ? botTugVisualStartPercent + (botTugPercent / 100) * botTugVisualWidthPercent
    : botTugPercent
  const botTugTrackStyle = botSuddenDeathActive
    ? ({
        '--short-rope-left': `${botTugVisualStartPercent}%`,
        '--short-rope-width': `${botTugVisualWidthPercent}%`,
      } as CSSProperties)
    : undefined
  const botTugRopeStyle: CSSProperties = botSuddenDeathActive
    ? {
        left: `${botTugVisualStartPercent}%`,
        width: `${Math.max(0, botTugVisualPercent - botTugVisualStartPercent)}%`,
      }
    : { width: `${botTugPercent}%` }
  const botTugHandleStyle: CSSProperties = { left: `${botTugVisualPercent}%` }
  const botRopeRemainingPercent = Math.max(0, Math.round(100 - (Math.abs(botScoreGap) / botEffectiveRopeLimit) * 100))
  const botRemainingMs = botMatch && botMatch.gameType === 'blaster' && botMatch.mode === 'timed'
    ? Math.max(0, botMatch.startedAt + botMatch.durationSeconds * 1000 - hudNow)
    : 0
  const botRemainingSeconds = botRemainingMs > 0 ? Math.ceil(botRemainingMs / 1000) : 0
  const botProgressPercent = botMatch
    ? botMatch.gameType === 'blaster' && botMatch.mode === 'timed'
      ? Math.max(0, Math.min(100, (botRemainingMs / Math.max(1, botMatch.durationSeconds * 1000)) * 100))
      : botMatch.gameType === 'blaster'
        ? 100
        : Math.max(0, Math.min(100, ((botMatch.userRound - 1) / Math.max(1, botMatch.rounds)) * 100))
    : 100
  const botPowerup = botMatchInProgress && isBlasterRound(botCurrentRound)
    ? duelBlasterPowerupForRound(botCurrentRound.round, botMatch.powerupsEnabled, botMatch.mode)
    : null
  const botCatchupConfig = botMatchInProgress && botMatch
    ? duelBotDifficultyConfig(botMatch.resolvedDifficulty, botScoreGap, botMatch.gameType === 'blaster' ? blasterStreak : botMatch.userStreak)
    : null
  const botCatchupActive = Boolean(botCatchupConfig?.catchupActive)
  const botTugBaseClass = blasterTugPulse
    ? `onevone-tug-${blasterTugPulse}`
    : botScoreGap > 0
      ? 'onevone-tug-leading'
      : botScoreGap < 0
        ? 'onevone-tug-trailing'
        : 'onevone-tug-even'
  const botTugStateClass = `${botTugBaseClass}${botSuddenDeathActive ? ' onevone-tug-sudden-death' : ''}${botCatchupActive ? ' onevone-bot-catchup-active' : ''}`
  const blasterBotMotionActive = Boolean(botMatchInProgress && botMatch?.gameType === 'blaster')
  const blasterMotionRoomId = blasterBotMotionActive ? botMatch?.id || '' : room?.id || ''
  const blasterMotionRoomStatus = botMatchInProgress ? 'in_progress' : room?.status || null
  const blasterMotionGameType = blasterBotMotionActive ? 'blaster' : room?.game_type || null
  const blasterMotionCanStart = blasterBotMotionActive || canStartRound

  useEffect(() => {
    if (!room || room.status !== 'in_progress' || room.game_type !== 'blaster') return
    if (isSpectator || !blasterSuddenDeathActive) return
    if (Math.abs(scoreGap) < effectiveBlasterRopeLimit) return
    void finishBlasterByTimeout()
  }, [blasterSuddenDeathActive, effectiveBlasterRopeLimit, finishBlasterByTimeout, isSpectator, room, scoreGap])

  useEffect(() => {
    if (ropeBlasterPingTimerRef.current !== null) {
      window.clearInterval(ropeBlasterPingTimerRef.current)
      ropeBlasterPingTimerRef.current = null
    }
    if (ropeBlasterReconnectTimerRef.current !== null) {
      window.clearTimeout(ropeBlasterReconnectTimerRef.current)
      ropeBlasterReconnectTimerRef.current = null
    }

    const activeBlasterRoom = Boolean(
      ropeBlasterWorkerUrl &&
      isSignedIn &&
      currentUserId &&
      roomId &&
      room?.status === 'in_progress' &&
      room.game_type === 'blaster',
    )

    if (!activeBlasterRoom) {
      ropeBlasterSocketRef.current?.close()
      ropeBlasterSocketRef.current = null
      setBlasterCloudStatus(ropeBlasterWorkerUrl ? 'connecting' : 'disabled')
      setBlasterCloudLatencyMs(null)
      return
    }

    let cancelled = false
    const startedAtMs = room?.started_at ? Date.parse(room.started_at) : Date.now()
    const socketUrl = toRopeBlasterWebSocketUrl(ropeBlasterWorkerUrl, roomId || '', currentUserId, currentUsername || 'Player')

    const connect = () => {
      if (cancelled || !socketUrl) return
      setBlasterCloudStatus('connecting')
      const socket = new WebSocket(socketUrl)
      ropeBlasterSocketRef.current = socket

      const sendJoin = () => {
        sendRopeBlasterCloudMessage({
          type: 'join',
          displayName: currentUsername || 'Player',
          startedAt: Number.isFinite(startedAtMs) ? startedAtMs : Date.now(),
          settings: {
            mode: blasterMode,
            durationSeconds: blasterDurationSeconds,
            ropeLimit: blasterRopeLimit,
            powerupsEnabled: blasterPowerupsEnabled,
            overtimeEnabled: blasterOvertimeEnabled,
            overtimeAfterSeconds: blasterOvertimeAfterSeconds,
          },
          clientSentAt: Date.now(),
        })
      }

      socket.addEventListener('open', () => {
        if (cancelled) return
        setBlasterCloudStatus('connected')
        setBlasterCloudLatencyMs(null)
        ropeBlasterSequenceRef.current = 0
        sendJoin()
        const sendPing = () => {
          sendRopeBlasterCloudMessage({ type: 'ping', clientSentAt: Date.now() })
        }
        sendPing()
        ropeBlasterPingTimerRef.current = window.setInterval(sendPing, 2500)
      })

      socket.addEventListener('message', (event) => {
        let message: Record<string, unknown> | null = null
        try {
          message = event.data ? JSON.parse(String(event.data)) as Record<string, unknown> : null
        } catch {
          message = null
        }
        if (!message) return
        if (message.type === 'pong') {
          const sentAt = Number(message.clientSentAt)
          if (Number.isFinite(sentAt)) {
            setBlasterCloudLatencyMs(Math.max(0, Math.round(Date.now() - sentAt)))
          }
          return
        }
        if (message.type === 'hello' && message.state) {
          applyRopeBlasterCloudState(message.state)
          return
        }
        if (message.type === 'state') {
          applyRopeBlasterCloudState(message)
        }
      })

      socket.addEventListener('close', () => {
        if (ropeBlasterSocketRef.current === socket) ropeBlasterSocketRef.current = null
        if (ropeBlasterPingTimerRef.current !== null) {
          window.clearInterval(ropeBlasterPingTimerRef.current)
          ropeBlasterPingTimerRef.current = null
        }
        if (cancelled) return
        setBlasterCloudStatus('fallback')
        ropeBlasterReconnectTimerRef.current = window.setTimeout(connect, 1500)
      })

      socket.addEventListener('error', () => {
        setBlasterCloudStatus('fallback')
      })
    }

    connect()

    return () => {
      cancelled = true
      if (ropeBlasterPingTimerRef.current !== null) {
        window.clearInterval(ropeBlasterPingTimerRef.current)
        ropeBlasterPingTimerRef.current = null
      }
      if (ropeBlasterReconnectTimerRef.current !== null) {
        window.clearTimeout(ropeBlasterReconnectTimerRef.current)
        ropeBlasterReconnectTimerRef.current = null
      }
      if (ropeBlasterSocketRef.current) {
        ropeBlasterSocketRef.current.close()
        ropeBlasterSocketRef.current = null
      }
    }
  }, [
    applyRopeBlasterCloudState,
    blasterDurationSeconds,
    blasterMode,
    blasterOvertimeAfterSeconds,
    blasterOvertimeEnabled,
    blasterPowerupsEnabled,
    blasterRopeLimit,
    currentUserId,
    currentUsername,
    isSignedIn,
    room?.game_type,
    room?.started_at,
    room?.status,
    roomId,
    sendRopeBlasterCloudMessage,
  ])

  useEffect(() => {
    const resetBlasterMotion = () => {
      if (blasterAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(blasterAnimationFrameRef.current)
        blasterAnimationFrameRef.current = null
      }
      blasterBodiesRef.current.forEach((body) => {
        body.element.classList.remove('motion-live', 'colliding')
        body.element.style.transform = ''
      })
      blasterBodiesRef.current = []
    }

    resetBlasterMotion()

    if (!blasterMotionRoomId || blasterMotionRoomStatus !== 'in_progress' || blasterMotionGameType !== 'blaster') return
    if (!blasterMotionCanStart) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let stopped = false
    let previousTimestamp = 0
    let syncedRound = blasterMotionRoundRef.current
    let fieldWidth = 0
    let fieldHeight = 0

    const updateFieldSize = () => {
      const fieldElement = blasterFieldRef.current
      if (!fieldElement) return
      fieldWidth = fieldElement.clientWidth
      fieldHeight = fieldElement.clientHeight
    }

    const clampVelocity = (body: BlasterAsteroidBody) => {
      const speed = Math.hypot(body.velocityX, body.velocityY)
      if (!Number.isFinite(speed) || speed <= 0) {
        body.velocityX = blasterAsteroidMinSpeed
        body.velocityY = blasterAsteroidMinSpeed * 0.65
        return
      }
      if (speed < blasterAsteroidMinSpeed) {
        const multiplier = blasterAsteroidMinSpeed / speed
        body.velocityX *= multiplier
        body.velocityY *= multiplier
      } else if (speed > blasterAsteroidMaxSpeed) {
        const multiplier = blasterAsteroidMaxSpeed / speed
        body.velocityX *= multiplier
        body.velocityY *= multiplier
      }
    }

    const clampBodyToField = (body: BlasterAsteroidBody, safeWidth: number, safeHeight: number) => {
      const wallInset = getBlasterWallInset(safeWidth, safeHeight)
      const minX = wallInset + body.halfWidth
      const maxX = Math.max(minX, safeWidth - wallInset - body.halfWidth)
      const minY = wallInset + body.halfHeight
      const maxY = Math.max(minY, safeHeight - wallInset - body.halfHeight)
      body.x = Math.max(minX, Math.min(maxX, body.x))
      body.y = Math.max(minY, Math.min(maxY, body.y))
    }

    const pushBodiesApart = (
      leftBody: BlasterAsteroidBody,
      rightBody: BlasterAsteroidBody,
      safeWidth: number,
      safeHeight: number,
      timestamp: number,
    ) => {
      const distanceX = rightBody.x - leftBody.x
      const distanceY = rightBody.y - leftBody.y
      const requiredX = leftBody.halfWidth + rightBody.halfWidth + blasterAsteroidCollisionGapPx
      const requiredY = leftBody.halfHeight + rightBody.halfHeight + blasterAsteroidCollisionGapPx
      const overlapX = requiredX - Math.abs(distanceX)
      const overlapY = requiredY - Math.abs(distanceY)
      if (overlapX <= 0 || overlapY <= 0) return

      if (overlapX < overlapY) {
        const directionX = distanceX >= 0 ? 1 : -1
        leftBody.x -= directionX * overlapX * 0.52
        rightBody.x += directionX * overlapX * 0.52
        const leftVelocityX = leftBody.velocityX
        const rightVelocityX = rightBody.velocityX
        leftBody.velocityX = directionX > 0 ? -Math.abs(rightVelocityX || leftVelocityX || blasterAsteroidMinSpeed) : Math.abs(rightVelocityX || leftVelocityX || blasterAsteroidMinSpeed)
        rightBody.velocityX = directionX > 0 ? Math.abs(leftVelocityX || rightVelocityX || blasterAsteroidMinSpeed) : -Math.abs(leftVelocityX || rightVelocityX || blasterAsteroidMinSpeed)
      } else {
        const directionY = distanceY >= 0 ? 1 : -1
        leftBody.y -= directionY * overlapY * 0.52
        rightBody.y += directionY * overlapY * 0.52
        const leftVelocityY = leftBody.velocityY
        const rightVelocityY = rightBody.velocityY
        leftBody.velocityY = directionY > 0 ? -Math.abs(rightVelocityY || leftVelocityY || blasterAsteroidMinSpeed) : Math.abs(rightVelocityY || leftVelocityY || blasterAsteroidMinSpeed)
        rightBody.velocityY = directionY > 0 ? Math.abs(leftVelocityY || rightVelocityY || blasterAsteroidMinSpeed) : -Math.abs(leftVelocityY || rightVelocityY || blasterAsteroidMinSpeed)
      }

      clampBodyToField(leftBody, safeWidth, safeHeight)
      clampBodyToField(rightBody, safeWidth, safeHeight)
      clampVelocity(leftBody)
      clampVelocity(rightBody)
      leftBody.collisionGlowUntil = timestamp + 130
      rightBody.collisionGlowUntil = timestamp + 130
    }

    const createBodyForSlot = (
      index: number,
      element: HTMLElement,
      safeWidth: number,
      safeHeight: number,
      spawnFromEdge = false,
    ): BlasterAsteroidBody => {
      const key = blasterTargetDomKey(index)
      const roundSeed = Math.max(1, blasterMotionRoundRef.current || 1)
      const targetSeed = blasterMotionTargetsRef.current[index] || key
      const layoutSeed = `${blasterMotionRoomId}:${roundSeed}:${targetSeed}`
      const seed = hashStringToInt(`${layoutSeed}:${index}:motion`)
      const shuffledAnchors = seededShuffle(blasterTargetAnchors, `${blasterMotionRoomId}:target-layout`)
      const anchor = shuffledAnchors[index % shuffledAnchors.length] || blasterTargetAnchors[index % blasterTargetAnchors.length]
      const wallInset = getBlasterWallInset(safeWidth, safeHeight)
      const halfWidth = Math.max(blasterAsteroidMinHalfWidthPx, element.offsetWidth / 2)
      const halfHeight = Math.max(blasterAsteroidMinHalfHeightPx, element.offsetHeight / 2)
      const jitterX = ((seed % 17) - 8) * 3
      const jitterY = ((Math.floor(seed / 17) % 15) - 7) * 3
      const minX = wallInset + halfWidth
      const maxX = Math.max(minX, safeWidth - wallInset - halfWidth)
      const minY = wallInset + halfHeight
      const maxY = Math.max(minY, safeHeight - wallInset - halfHeight)
      const spawnSide = seed % 4
      const anchoredX = (safeWidth * anchor.x) / 100 + jitterX
      const anchoredY = (safeHeight * anchor.y) / 100 + jitterY
      const initialX = spawnFromEdge
        ? spawnSide === 0
          ? minX
          : spawnSide === 1
            ? maxX
            : Math.max(minX, Math.min(maxX, anchoredX))
        : Math.max(minX, Math.min(maxX, anchoredX))
      const initialY = spawnFromEdge
        ? spawnSide === 2
          ? minY
          : spawnSide === 3
            ? maxY
            : Math.max(minY, Math.min(maxY, anchoredY))
        : Math.max(minY, Math.min(maxY, anchoredY))
      const direction = ((seed % 360) * Math.PI) / 180
      const speed = 0.025 + ((Math.floor(seed / 23) % 20) / 1000)
      const centerDeltaX = safeWidth / 2 - initialX
      const centerDeltaY = safeHeight / 2 - initialY
      const centerDistance = Math.hypot(centerDeltaX, centerDeltaY) || 1
      const velocityX = ((centerDeltaX / centerDistance) * speed * 0.68) + (Math.cos(direction) * speed * 0.28)
      const velocityY = ((centerDeltaY / centerDistance) * speed * 0.68) + (Math.sin(direction) * speed * 0.28)

      element.classList.add('motion-live')
      element.classList.remove('colliding')

      return {
        key,
        element,
        x: initialX,
        y: initialY,
        velocityX: Math.abs(velocityX) < 0.014 ? (velocityX < 0 ? -0.02 : 0.02) : velocityX,
        velocityY: Math.abs(velocityY) < 0.012 ? (velocityY < 0 ? -0.018 : 0.018) : velocityY,
        halfWidth,
        halfHeight,
        collisionGlowUntil: 0,
        isColliding: false,
      }
    }

    const syncBodiesForCurrentRound = (safeWidth: number, safeHeight: number) => {
      const targets = blasterMotionTargetsRef.current
      if (targets.length === 0) {
        blasterBodiesRef.current.forEach((body) => {
          body.element.classList.remove('motion-live', 'colliding')
          body.element.style.transform = ''
        })
        blasterBodiesRef.current = []
        return
      }

      const latestRound = blasterMotionRoundRef.current
      const roundChanged = latestRound > 0 && latestRound !== syncedRound
      const respawnIndex = roundChanged ? blasterRespawnTargetIndexRef.current : null
      const previousBodiesByKey = new Map(blasterBodiesRef.current.map((body) => [body.key, body]))
      const activeKeys = new Set<string>()
      const nextBodies: BlasterAsteroidBody[] = []

      targets.forEach((_target, index) => {
        const key = blasterTargetDomKey(index)
        const element = blasterTargetRefs.current[key]
        if (!element) return
        activeKeys.add(key)
        const existingBody = previousBodiesByKey.get(key)
        if (existingBody && respawnIndex !== index) {
          existingBody.element = element
          existingBody.halfWidth = Math.max(blasterAsteroidMinHalfWidthPx, element.offsetWidth / 2)
          existingBody.halfHeight = Math.max(blasterAsteroidMinHalfHeightPx, element.offsetHeight / 2)
          element.classList.add('motion-live')
          nextBodies.push(existingBody)
          return
        }
        nextBodies.push(createBodyForSlot(index, element, safeWidth, safeHeight, Boolean(roundChanged && respawnIndex === index)))
      })

      previousBodiesByKey.forEach((body, key) => {
        if (activeKeys.has(key)) return
        body.element.classList.remove('motion-live', 'colliding')
        body.element.style.transform = ''
      })

      blasterBodiesRef.current = nextBodies
      if (roundChanged) {
        syncedRound = latestRound
        blasterRespawnTargetIndexRef.current = null
      }
    }

    updateFieldSize()
    const resizeObserver = typeof ResizeObserver !== 'undefined' && blasterFieldRef.current
      ? new ResizeObserver(updateFieldSize)
      : null
    if (resizeObserver && blasterFieldRef.current) {
      resizeObserver.observe(blasterFieldRef.current)
    }

    const moveBodies = (timestamp: number) => {
      if (stopped) return
      const fieldElement = blasterFieldRef.current
      if (!fieldElement) return

      const elapsedMs = previousTimestamp > 0 ? Math.min(28, timestamp - previousTimestamp) : 16
      previousTimestamp = timestamp
      const safeWidth = Math.max(220, fieldWidth || fieldElement.clientWidth)
      const safeHeight = Math.max(260, fieldHeight || fieldElement.clientHeight)
      syncBodiesForCurrentRound(safeWidth, safeHeight)
      const bodies = blasterBodiesRef.current
      const activeDisruption = blasterDisruptionRef.current
      const motionMultiplier = activeDisruption?.key === 'speedtrap' ? 2.45 : 1

      bodies.forEach((body) => {
        body.x += body.velocityX * elapsedMs * motionMultiplier
        body.y += body.velocityY * elapsedMs * motionMultiplier
        const wallInset = getBlasterWallInset(safeWidth, safeHeight)
        const minX = wallInset + body.halfWidth
        const maxX = Math.max(minX, safeWidth - wallInset - body.halfWidth)
        const minY = wallInset + body.halfHeight
        const maxY = Math.max(minY, safeHeight - wallInset - body.halfHeight)

        if (body.x < minX) {
          body.x = minX
          body.velocityX = Math.abs(body.velocityX)
        } else if (body.x > maxX) {
          body.x = maxX
          body.velocityX = -Math.abs(body.velocityX)
        }

        if (body.y < minY) {
          body.y = minY
          body.velocityY = Math.abs(body.velocityY)
        } else if (body.y > maxY) {
          body.y = maxY
          body.velocityY = -Math.abs(body.velocityY)
        }
        clampVelocity(body)
      })

      for (let pass = 0; pass < blasterAsteroidSeparationPasses; pass += 1) {
        for (let leftIndex = 0; leftIndex < bodies.length; leftIndex += 1) {
          for (let rightIndex = leftIndex + 1; rightIndex < bodies.length; rightIndex += 1) {
            pushBodiesApart(bodies[leftIndex], bodies[rightIndex], safeWidth, safeHeight, timestamp)
          }
        }
      }

      bodies.forEach((body) => {
        clampBodyToField(body, safeWidth, safeHeight)
        body.element.style.transform = `translate3d(${body.x - body.halfWidth}px, ${body.y - body.halfHeight}px, 0)`
        const shouldCollideGlow = body.collisionGlowUntil > timestamp
        if (body.isColliding !== shouldCollideGlow) {
          body.isColliding = shouldCollideGlow
          body.element.classList.toggle('colliding', shouldCollideGlow)
        }
      })

      blasterAnimationFrameRef.current = window.requestAnimationFrame(moveBodies)
    }

    blasterAnimationFrameRef.current = window.requestAnimationFrame(moveBodies)

    return () => {
      stopped = true
      resizeObserver?.disconnect()
      resetBlasterMotion()
    }
  }, [
    blasterMotionGameType,
    blasterMotionRoomId,
    blasterMotionRoomStatus,
    blasterMotionCanStart,
  ])

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
  const selectedDuelProfileActivity = selectedDuelProfile
    ? describeDuelProfileCurrentActivity(selectedDuelProfile.currentActivity)
    : {
      state: 'offline',
      statusLabel: 'Offline',
      mainLabel: 'Offline',
      subLabel: 'No recent activity',
    }
  const renderDuelPlayerAvatar = (userId: string, username: string) => {
    const profile = duelProfileByUserId[userId] || emptyDuelProfileSnapshot(userId)
    return (
      <span className={`onevone-player-slot-avatar-frame avatar-decoration-wrap level-halo-frame ${profile.haloClass}`}>
        <img
          src={profile.avatarUrl || defaultAvatarUrl}
          alt={username}
          className="onevone-player-slot-avatar"
          onError={handleAvatarImageError}
        />
        <ProfileAvatarDecoration
          decoration={getEffectiveProfileDecorationForLevel(profile.level, profile.profileDecorationKey)}
        />
      </span>
    )
  }
  const renderOnlineInviteAvatar = (user: OnlineInviteUser) => (
    <span className={`onevone-online-avatar-frame avatar-decoration-wrap level-halo-frame ${user.haloClass}`}>
      <img
        src={user.avatarUrl || defaultAvatarUrl}
        alt={user.username}
        className="onevone-online-avatar"
        onError={handleAvatarImageError}
      />
      <ProfileAvatarDecoration
        decoration={getEffectiveProfileDecorationForLevel(user.level, user.profileDecorationKey)}
      />
    </span>
  )
  const renderDuelLeaderboardAvatar = (
    entry: Pick<DuelStatsLeaderboardEntry, 'avatarUrl' | 'username'>,
    variant: 'rail' | 'spotlight' = 'rail',
  ) => (
    <img
      src={entry.avatarUrl || defaultAvatarUrl}
      alt={entry.username}
      className={variant === 'spotlight' ? 'onevone-spotlight-avatar' : 'onevone-rail-avatar'}
      onError={handleAvatarImageError}
    />
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
    const myPlayerResult = playerByUserId.get(myResultRow.user_id)
    const opponentPlayerResult = playerByUserId.get(opponentResultRow.user_id)
    const myFinishedAt = myPlayerResult?.finished_at || (room && myPlayerResult && myPlayerResult.current_round > room.rounds ? myPlayerResult.last_seen : null)
    const opponentFinishedAt = opponentPlayerResult?.finished_at || (room && opponentPlayerResult && opponentPlayerResult.current_round > room.rounds ? opponentPlayerResult.last_seen : null)
    const myFinishedMs = myFinishedAt ? Date.parse(myFinishedAt) : Number.NaN
    const opponentFinishedMs = opponentFinishedAt ? Date.parse(opponentFinishedAt) : Number.NaN
    if (Number.isFinite(myFinishedMs) && Number.isFinite(opponentFinishedMs) && myFinishedMs !== opponentFinishedMs) {
      return {
        rule: 'Finish Order',
        summary: myFinishedMs < opponentFinishedMs ? 'You win by finishing first.' : 'Opponent wins by finishing first.',
      }
    }
    if (myResultRow.total_time_ms !== opponentResultRow.total_time_ms) {
      return {
        rule: 'Answer Time',
        summary: myResultRow.total_time_ms < opponentResultRow.total_time_ms ? 'You win on lower answer time.' : 'Opponent wins on lower answer time.',
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
  }, [myResultRow, opponentResultRow, playerByUserId, room])

  const myFastestRoundMs = myResultRow ? playerByUserId.get(myResultRow.user_id)?.fastest_round_ms || 0 : 0
  const opponentFastestRoundMs = opponentResultRow ? playerByUserId.get(opponentResultRow.user_id)?.fastest_round_ms || 0 : 0

  useEffect(() => {
    if (!room || room.status !== 'completed' || isSpectator || !myResultRow || !opponentResultRow) return
    if (rewardedResultRoomIdsRef.current.has(room.id)) return
    rewardedResultRoomIdsRef.current.add(room.id)
    const connect4MoveCount = room.game_type === 'connect4'
      ? normalizeConnect4State(room.settings?.connect4 as Partial<Connect4State> | null | undefined).moveHistory.length
      : undefined
    onDuelPerformanceReward?.({
      roomId: room.id,
      gameType: room.game_type,
      rounds: room.game_type === 'connect4' ? (connect4MoveCount || room.rounds) : room.rounds,
      score: myResultRow.score,
      opponentScore: opponentResultRow.score,
      won: room.winner_user_id === currentUserId,
      draw: !room.winner_user_id,
      moveCount: connect4MoveCount,
    })
  }, [currentUserId, isSpectator, myResultRow, onDuelPerformanceReward, opponentResultRow, room])

  useEffect(() => {
    if (!connect4BotMatch || connect4BotMatch.status !== 'completed') return
    if (rewardedResultRoomIdsRef.current.has(connect4BotMatch.id)) return
    rewardedResultRoomIdsRef.current.add(connect4BotMatch.id)
    onDuelPerformanceReward?.({
      roomId: connect4BotMatch.id,
      gameType: 'connect4',
      rounds: connect4BotMatch.state.moveHistory.length,
      score: connect4BotMatch.winner === 'user' ? 1 : 0,
      opponentScore: connect4BotMatch.winner === 'bot' ? 1 : 0,
      won: connect4BotMatch.winner === 'user',
      draw: connect4BotMatch.winner === 'draw',
      moveCount: connect4BotMatch.state.moveHistory.length,
    })
  }, [connect4BotMatch, onDuelPerformanceReward])

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
      updates.push('Both players ready. Syncing match start.')
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
      {isJoiningRoom ? (
        <div className="card onevone-card onevone-joining-card">
          <h2>Joining 1v1 Room…</h2>
          <p className="muted">Loading the invite room now. You should be moved into the lobby as soon as it syncs.</p>
          <div className="actions-row">
            <button className="primary" type="button" onClick={() => void refreshRoomSnapshot()}>
              Retry Join
            </button>
          </div>
        </div>
      ) : connect4BotMatch ? (
        connect4BotMatch.status === 'in_progress' ? (
          <div className="connect4-session-overlay connect4-bot-overlay">
            <div className="connect4-session-shell">
              <div className="connect4-topbar">
                <button className="secondary onevone-leave-button" onClick={exitBotMatch}>
                  Leave Bot Match
                </button>
                <div className="connect4-title">
                  <span className="muted tiny">1v1 vs Bot · Connect 4</span>
                  <strong>{connect4BotMatch.state.currentTurn === 'P1' ? 'Your move' : `${connect4BotMatch.botName} is thinking`}</strong>
                  <span className="onevone-bot-note">{botDifficultyDisplay(connect4BotMatch.difficulty, connect4BotMatch.resolvedDifficulty)} · Bot blocks and wins when it can.</span>
                </div>
                <div className="connect4-move-count">
                  <small className="muted">Moves</small>
                  <strong>{connect4BotMatch.state.moveHistory.length}/{connect4Rows * connect4Columns}</strong>
                </div>
              </div>

              <div className="connect4-players" aria-label="Connect 4 bot players">
                <div className={`connect4-player-chip ${connect4BotMatch.state.currentTurn === 'P1' ? 'active' : ''}`}>
                  <span className="connect4-token connect4-token-p1" aria-hidden />
                  <small>You</small>
                  <strong>{myDisplayName}</strong>
                </div>
                <div className={`connect4-player-chip ${connect4BotMatch.state.currentTurn === 'P2' ? 'active' : ''}`}>
                  <span className="connect4-token connect4-token-p2" aria-hidden />
                  <small>Bot</small>
                  <strong>{connect4BotMatch.botName}</strong>
                </div>
              </div>

              <div className="connect4-board-wrap">
                <div className="connect4-column-actions" aria-label="Drop a disc by column">
                  {Array.from({ length: connect4Columns }, (_, columnIndex) => {
                    const columnFull = connect4BotMatch.state.board[0]?.[columnIndex] !== null
                    const waitingForBot = connect4BotMatch.state.currentTurn !== 'P1'
                    return (
                      <button
                        key={`connect4-bot-drop-${columnIndex}`}
                        type="button"
                        className={`connect4-column-drop ${columnFull ? 'full' : ''}`}
                        disabled={columnFull || waitingForBot || connect4BotMatch.state.status !== 'active'}
                        onClick={() => submitConnect4BotMove(columnIndex)}
                        aria-label={`Drop disc in column ${columnIndex + 1}`}
                      >
                        {columnIndex + 1}
                      </button>
                    )
                  })}
                </div>
                {(() => {
                  const winningCells = findConnect4WinningCells(connect4BotMatch.state.board, connect4BotMatch.state.winner)
                  const winningCellKeys = new Set(winningCells.map((cell) => connect4WinningCellKey(cell.row, cell.column)))
                  const winLineStyle = connect4WinLineStyle(winningCells)
                  return (
                    <div className="connect4-board" role="grid" aria-label="Connect 4 bot board">
                      {winLineStyle ? <span className="connect4-win-line" style={winLineStyle} aria-hidden /> : null}
                      {connect4BotMatch.state.board.map((row, rowIndex) => (
                        <div key={`connect4-bot-row-${rowIndex}`} className="connect4-row" role="row">
                          {row.map((cell, columnIndex) => {
                            const columnFull = connect4BotMatch.state.board[0]?.[columnIndex] !== null
                            const waitingForBot = connect4BotMatch.state.currentTurn !== 'P1'
                            const canDrop = !columnFull && !waitingForBot && connect4BotMatch.state.status === 'active'
                            return (
                              <button
                                key={`connect4-bot-cell-${rowIndex}-${columnIndex}`}
                                type="button"
                                className={connect4CellClass(cell, winningCellKeys.has(connect4WinningCellKey(rowIndex, columnIndex)))}
                                role="gridcell"
                                disabled={!canDrop}
                                onClick={() => submitConnect4BotMove(columnIndex)}
                                aria-label={`${connect4CellLabel(cell, rowIndex, columnIndex)}. ${canDrop ? `Drop disc in column ${columnIndex + 1}.` : ''}`}
                              />
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>

              <p className="connect4-status muted" aria-live="polite">
                {connect4BotMatch.state.currentTurn === 'P1'
                  ? 'Choose a column to drop your disc.'
                  : `${connect4BotMatch.botName} is choosing a column...`}
              </p>
            </div>
          </div>
        ) : (
          <div className="onevone-result-overlay onevone-bot-result-overlay">
            <div className="card onevone-card onevone-result-shell onevone-bot-result-shell">
              <p className="muted tiny">1v1 vs Bot · Connect 4</p>
              <h3>{connect4BotMatch.winner === 'user' ? 'You beat the bot.' : connect4BotMatch.winner === 'bot' ? 'Bot wins this one.' : 'Draw.'}</h3>
              <div className={connect4BotMatch.winner === 'user' ? 'onevone-winner-banner good' : 'onevone-winner-banner'}>
                {connect4BotMatch.winner === 'user'
                  ? `Winner: ${myDisplayName}`
                  : connect4BotMatch.winner === 'bot'
                    ? `Winner: ${connect4BotMatch.botName}`
                    : 'Result: Draw'}
              </div>
              <div className="onevone-result-summary onevone-bot-result-summary">
                <article className="onevone-result-summary-chip">
                  <span className="muted tiny">Moves</span>
                  <strong>{connect4BotMatch.state.moveHistory.length}</strong>
                </article>
                <article className="onevone-result-summary-chip">
                  <span className="muted tiny">Difficulty</span>
                  <strong>{botDifficultyDisplay(connect4BotMatch.difficulty, connect4BotMatch.resolvedDifficulty)}</strong>
                </article>
              </div>
              {sessionXpReward ? (
                <div className="onevone-result-xp-reward">
                  {sessionXpReward}
                </div>
              ) : null}
              <div className="actions-row">
                <button className="primary" type="button" onClick={() => {
                  exitBotMatch()
                  openBotSetupModal('connect4')
                }}>
                  Start New Connect 4 Bot Match
                </button>
                <button className="secondary" type="button" onClick={exitBotMatch}>
                  Exit
                </button>
              </div>
            </div>
          </div>
        )
      ) : botMatch ? (
        botMatchInProgress ? (
          <div className="blaster-session-overlay onevone-blaster-overlay onevone-bot-overlay">
            <div className="blaster-session-shell onevone-blaster-shell">
              <div className="onevone-blaster-topbar">
                <button className="secondary blaster-exit-button onevone-leave-button" onClick={exitBotMatch}>
                  Leave Bot Match
                </button>
                <div className="onevone-blaster-title">
                  <span className="muted tiny">1v1 vs Bot · {botGameLabel}</span>
                  <strong>{botDifficultyDisplay(botMatch.difficulty, botMatch.resolvedDifficulty)} · {duelCategoryLabel(botMatch.category)}{botMatch.gameType === 'blaster' && botMatch.powerupsEnabled ? ' · Power-ups' : ''}</strong>
                  <span className="onevone-bot-note">{botMatch.coachingNote}</span>
                </div>
                <div className="onevone-blaster-clock">
                  <small className="muted">{botMatch.gameType === 'blaster' ? (botSuddenDeathActive ? 'Overtime' : botMatch.mode === 'death' ? 'Win Condition' : 'Match Timer') : 'Progress'}</small>
                  <strong>{botMatch.gameType === 'blaster' ? (botMatch.mode === 'death' ? botSuddenDeathActive ? 'Rope Shrunk' : 'To the Death' : `${botRemainingSeconds}s`) : `${Math.min(botMatch.userRound, botMatch.rounds)}/${botMatch.rounds}`}</strong>
                  <span className="onevone-blaster-timer-track" aria-hidden>
                    <span style={{ width: `${botProgressPercent}%` }} />
                  </span>
                </div>
              </div>

              {botMatch.gameType === 'blaster' ? (
                <div className={`onevone-tug-panel ${botTugStateClass}`}>
                  {botCatchupActive ? (
                    <div className="onevone-bot-catchup-pill" aria-live="polite">
                      <strong>🤖 Bot adapting</strong>
                      <span>Your hot streak triggered a quick catch-up burst.</span>
                    </div>
                  ) : null}
                  {botSuddenDeathActive ? (
                    <div className="onevone-sudden-death-banner" aria-live="polite">
                      <strong>⚠️ Overtime</strong>
                      <span>Short rope: one strong streak can end it.</span>
                    </div>
                  ) : null}
                  <div className="onevone-tug-names">
                    <span><small>You</small>{myDisplayName}</span>
                    <strong>{botScoreGap === 0 ? 'Even' : botScoreGap > 0 ? `+${botScoreGap}` : `${botScoreGap}`}</strong>
                    <span><small>Bot</small>{botMatch.botName}</span>
                  </div>
                  <div className="onevone-tug-track" style={botTugTrackStyle} aria-label="Bot tug of war score pressure">
                    <span className="onevone-tug-zone onevone-tug-zone-self">Your side</span>
                    <span className="onevone-tug-zone onevone-tug-zone-opponent">Bot side</span>
                    {botSuddenDeathActive ? (
                      <>
                        <span className="onevone-tug-short-window" aria-hidden />
                        <span className="onevone-tug-short-gate onevone-tug-short-gate-self" aria-hidden>KO</span>
                        <span className="onevone-tug-short-gate onevone-tug-short-gate-opponent" aria-hidden>KO</span>
                      </>
                    ) : null}
                    <span className="onevone-tug-midline" />
                    <span className="onevone-tug-rope" style={botTugRopeStyle} />
                    <span className="onevone-tug-handle onevone-tug-bomb" style={botTugHandleStyle} aria-hidden>
                      <span className="onevone-bomb-core" />
                      <span className="onevone-bomb-fuse"><i /></span>
                    </span>
                  </div>
                  <div className="onevone-tug-scores">
                    <span>{botMatch.userScore} pts</span>
                    <span>{botSuddenDeathActive ? 'Sudden Rope' : 'Rope'} {botRopeRemainingPercent}%</span>
                    <span>{botMatch.botScore} pts</span>
                  </div>
                </div>
              ) : (
                <div className={`onevone-bot-duel-panel${botCatchupActive ? ' onevone-bot-catchup-active' : ''}`}>
                  {botCatchupActive ? (
                    <div className="onevone-bot-catchup-pill" aria-live="polite">
                      <strong>🤖 Bot adapting</strong>
                      <span>Your hot streak made the bot speed up for a short catch-up burst.</span>
                    </div>
                  ) : null}
                  <div className="onevone-bot-score-row">
                    <article>
                      <small>You</small>
                      <strong>{botMatch.userScore} pts</strong>
                      <span>Round {Math.min(botMatch.userRound, botMatch.rounds)}/{botMatch.rounds}</span>
                    </article>
                    <div className="onevone-bot-versus">VS</div>
                    <article>
                      <small>{botMatch.botName}</small>
                      <strong>{botMatch.botScore} pts</strong>
                      <span>Round {Math.min(botMatch.botRound, botMatch.rounds)}/{botMatch.rounds}</span>
                    </article>
                  </div>
                  <div className="onevone-bot-progress-bars" aria-hidden>
                    <span style={{ width: `${Math.max(0, Math.min(100, ((botMatch.userRound - 1) / Math.max(1, botMatch.rounds)) * 100))}%` }} />
                    <span style={{ width: `${Math.max(0, Math.min(100, ((botMatch.botRound - 1) / Math.max(1, botMatch.rounds)) * 100))}%` }} />
                  </div>
                </div>
              )}

              {isQuizRound(botCurrentRound) ? (
                <div className="card quiz-card speed-session-card onevone-quiz-card onevone-bot-quiz-card">
                  <p className="muted tiny">Bot round {botMatch.userRound}/{botMatch.rounds} · Beat {botMatch.botName}</p>
                  <h3>{botCurrentRound.prompt}</h3>
                  {botCurrentRound.sourceLabel ? <p className="muted tiny">{botCurrentRound.sourceLabel}</p> : null}
                  <div className="choices">
                    {botCurrentRound.choices.map((choice, index) => {
                      const selected = quizChoice === index
                      const correct = index === botCurrentRound.correctIndex
                      return (
                        <button
                          key={`bot-quiz-choice-${botCurrentRound.round}-${index}`}
                          className={`choice${selected ? ' active' : ''}${selected && correct ? ' correct' : ''}${selected && !correct ? ' wrong' : ''}`}
                          onClick={() => submitBotQuizAnswer(index)}
                          disabled={quizLocked}
                        >
                          <span className="choice-key">{index + 1}</span> {choice}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : isMatchingRound(botCurrentRound) ? (
                <div className="onevone-round onevone-match-round onevone-bot-match-round">
                  <p className="muted tiny">Bot set {botMatch.userRound}/{botMatch.rounds} · Match all 3 pairs before {botMatch.botName}</p>
                  <div className="match-grid match-grid-session">
                    {matchingCards.map((card) => {
                      const selected = selectedMatchingCards.includes(card.id)
                      const matched = matchedPairIds.includes(card.pairId)
                      const wrong = wrongMatchingCardIds.includes(card.id)
                      return (
                        <button
                          key={`bot-match-card-${botCurrentRound.round}-${card.id}`}
                          className={`match-card${selected ? ' match-selected' : ''}${matched ? ' match-done' : ''}${wrong ? ' match-wrong' : ''}`}
                          disabled={matchingSubmitted || matched || (!selected && selectedMatchingCards.length >= 2)}
                          onClick={() => handleBotMatchingCardClick(card.id)}
                        >
                          <strong className={card.kind === 'code' ? 'match-card-code' : 'match-card-definition'}>
                            {card.text}
                          </strong>
                        </button>
                      )
                    })}
                  </div>
                  <p className="muted tiny onevone-match-status">{matchingStatusText}</p>
                </div>
              ) : isBlasterRound(botCurrentRound) ? (
                <div className="onevone-blaster-arena onevone-bot-arena">
                  <div className="onevone-blaster-prompt">
                    <p className="muted tiny">Bot round {botMatch.userRound}/{botMatch.rounds} · Blast the correct code section</p>
                    <h3 title={botCurrentRound.prompt}>{botCurrentRound.prompt}</h3>
                  </div>
                  <div className={botPowerup ? 'onevone-powerup-status-row active' : 'onevone-powerup-status-row'} aria-live="polite">
                    {botPowerup ? (
                      <strong className={`onevone-powerup-pill onevone-powerup-${botPowerup.key}`}>
                        {botPowerup.icon} {botPowerup.label} · {botPowerup.description}
                      </strong>
                    ) : null}
                  </div>
                  <div
                    ref={blasterFieldRef}
                    className={[
                      'onevone-blaster-field',
                      botPowerup ? 'onevone-blaster-field-powered' : '',
                      blasterDisruption ? `onevone-blaster-field-disrupted onevone-blaster-field-disruption-${blasterDisruption.key}` : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <div className="blaster-starfield" aria-hidden>
                      <span></span><span></span><span></span><span></span>
                    </div>
                    {blasterDisruption ? (
                      <div className={`onevone-blaster-disruption onevone-blaster-disruption-${blasterDisruption.key}`} aria-hidden>
                        <strong>{blasterDisruption.icon} {blasterDisruption.label}</strong>
                        {blasterDisruption.key === 'paperwork' ? (
                          <span className="onevone-paperwork-storm">
                            {BLASTER_PAPERWORK_STORM_LABELS.map((label, paperworkIndex) => (
                              <i key={`bot-${label}-${paperworkIndex}`}>{label}</i>
                            ))}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    {botRoundTargets.map((target, index) => {
                      const selected = blasterChoice === index && blasterChoiceRound === botCurrentRound.round
                      const correct = normalizeBlasterTarget(target) === normalizeBlasterTarget(botRoundCorrectCode)
                      const targetKey = blasterTargetDomKey(index)
                      const targetDisplay = blasterDisruption?.key === 'clone'
                        ? blasterDisruption.cloneText || target
                        : target
                      return (
                        <button
                          key={`bot-blaster-target-${index}`}
                          ref={(node) => {
                            blasterTargetRefs.current[targetKey] = node
                          }}
                          type="button"
                          className={`onevone-blaster-target${selected ? ' selected' : ''}${selected && correct ? ' correct' : ''}${selected && !correct ? ' wrong' : ''}${blasterDisruption?.key === 'clone' ? ' cloned' : ''}`}
                          style={blasterTargetStyle(botMatch.id, index)}
                          onClick={(event) => submitBotBlasterAnswer(index, event)}
                          disabled={blasterLocked}
                          aria-label={`Blast ${targetDisplay}`}
                        >
                          <span>{targetDisplay}</span>
                        </button>
                      )
                    })}
                    {blasterShotBursts.map((burst) => (
                      <span
                        key={burst.id}
                        className={`onevone-blaster-shot-burst onevone-blaster-shot-burst-${burst.tone}`}
                        style={{ left: burst.x, top: burst.y }}
                        aria-hidden
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <p className="muted">Loading bot round…</p>
              )}
            </div>
          </div>
        ) : (
          <div className="onevone-result-overlay onevone-bot-result-overlay">
            <div className="card onevone-card onevone-result-shell onevone-bot-result-shell">
              <p className="muted tiny">1v1 vs Bot · {botGameLabel}</p>
              <h3>{botMatch.winner === 'user' ? 'You beat the bot.' : botMatch.winner === 'bot' ? 'Bot wins this one.' : 'Draw.'}</h3>
              <div className={botMatch.winner === 'user' ? 'onevone-winner-banner good' : 'onevone-winner-banner'}>
                {botMatch.winner === 'user'
                  ? `Winner: ${myDisplayName}`
                  : botMatch.winner === 'bot'
                    ? `Winner: ${botMatch.botName}`
                    : 'Result: Draw'}
              </div>
              <div className="onevone-result-summary onevone-bot-result-summary">
                <article className="onevone-result-summary-chip">
                  <span className="muted tiny">Your Score</span>
                  <strong>{botMatch.userScore} pts</strong>
                </article>
                <article className="onevone-result-summary-chip">
                  <span className="muted tiny">Bot Score</span>
                  <strong>{botMatch.botScore} pts</strong>
                </article>
                <article className="onevone-result-summary-chip">
                  <span className="muted tiny">Difficulty</span>
                  <strong>{botDifficultyDisplay(botMatch.difficulty, botMatch.resolvedDifficulty)}</strong>
                </article>
              </div>
              <div className="onevone-new-game-panel">
                <div className="onevone-new-game-head">
                  <p className="muted tiny">Bot stats do not affect real 1v1 streaks</p>
                  <strong>1v1 vs Bots Board</strong>
                </div>
                <div className="onevone-my-summary-grid onevone-bot-summary-grid">
                  <span>Bot wins: <strong>{botStats.wins}</strong></span>
                  <span>Bot losses: <strong>{botStats.losses}</strong></span>
                  <span>Bot streak: <strong>{botStats.current_win_streak}</strong></span>
                  <span>Best score: <strong>{botStats.best_score}</strong></span>
                </div>
              </div>
              <div className="actions-row">
                <button className="primary" type="button" onClick={() => {
                  const lastBotGameType = botMatch.gameType
                  exitBotMatch()
                  openBotSetupModal(lastBotGameType)
                }}>
                  Start New Bot Match
                </button>
                <button className="secondary" type="button" onClick={() => {
                  exitBotMatch()
                  openInviteModal()
                }}>
                  Invite a Friend
                </button>
                <button className="secondary" type="button" onClick={exitBotMatch}>
                  Exit
                </button>
              </div>
            </div>
          </div>
        )
      ) : !inRoom ? (
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
                    <button
                      type="button"
                      className={duelStatsMode === 'blaster' ? 'seg active compact-seg' : 'seg compact-seg'}
                      onClick={() => setDuelStatsMode('blaster')}
                    >
                      Blaster
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
	                        {renderDuelLeaderboardAvatar(topCurrentStreakEntry, 'spotlight')}
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
                          {renderDuelLeaderboardAvatar(entry)}
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
                          {renderDuelLeaderboardAvatar(entry)}
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
                <div className="onevone-my-summary onevone-bot-board">
                  <p className="muted tiny">1v1 Versus Bots</p>
                  <div className="onevone-my-summary-grid">
                    <span>Wins: <strong>{botStats.wins}</strong></span>
                    <span>Matches: <strong>{botStats.matches_played}</strong></span>
                    <span>Bot streak: <strong>{botStats.current_win_streak}</strong></span>
                    <span>Best bot: <strong>{botStats.best_difficulty ? duelBotResolvedDifficultyLabels[botStats.best_difficulty] : '—'}</strong></span>
                  </div>
                  <small className="muted tiny">Separate from real 1v1 stats and streaks.</small>
                </div>
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
                    onClick={() => openInviteModal()}
                    disabled={loading || !supabase}
                  >
                    <span>Invite a Friend</span>
                    <small>Send a direct 1v1 invite to someone online now.</small>
                  </button>
                  <button
                    className="secondary onevone-invite-cta onevone-bot-cta"
                    type="button"
                    onClick={() => openBotSetupModal()}
                  >
                    <span>1v1 Versus Bot</span>
                    <small>Practice Quiz, Matching, Rope Blaster, or Connect 4 with adaptive bots.</small>
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
                            {statusLabel} • {duelGameTypeLabels[item.game_type]} • {item.category.toUpperCase()} • {formatDuelRoomRuleLabel(item)}
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
              <div className="segmented onevone-mode-segmented">
                {availableDuelGameTypeOptions.map((option) => (
                  <button
                    key={`duel-mode-${option.value}`}
                    type="button"
                    className={selectedGameType === option.value ? 'seg active' : 'seg'}
                    onClick={() => {
                      setSelectedGameType(option.value)
                      if (option.value === 'connect4') setSelectedCategory('all')
                      if (option.value !== 'quiz' && selectedCategory === 'scenarios') setSelectedCategory('all')
                    }}
                  >
                    <span>{option.label}</span>
                    <small>{option.subtitle}</small>
                  </button>
                ))}
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
                  .filter((option) => selectedGameType === 'connect4' ? option.value === 'all' : !(selectedGameType !== 'quiz' && option.quizOnly))
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
            {selectedGameType === 'blaster' ? (
              <>
                <label className="game-control">
                  Win Condition
                  <div className="segmented onevone-win-condition-segmented">
                    {duelBlasterDurationOptions.map((seconds) => (
                      <button
                        key={`duel-blaster-duration-${seconds}`}
                        type="button"
                        className={selectedBlasterMode === 'timed' && selectedBlasterDurationSeconds === seconds ? 'seg active' : 'seg'}
                        onClick={() => {
                          setSelectedBlasterMode('timed')
                          setSelectedBlasterDurationSeconds(seconds)
                        }}
                      >
                        {seconds}s
                      </button>
                    ))}
                    <button
                      type="button"
                      className={selectedBlasterMode === 'death' ? 'seg active' : 'seg'}
                      onClick={() => setSelectedBlasterMode('death')}
                    >
                      To the Death
                    </button>
	                  </div>
	                  <small className="muted">Timed matches end on the clock or by rope KO. To the Death removes the clock and ends by rope KO.</small>
                    <button className="secondary onevone-glossary-button" type="button" onClick={() => setShowPowerupGlossary(true)}>
                      View Power-Up Glossary
                    </button>
	                </label>
                <label className={`game-control onevone-powerup-toggle ${selectedPowerupsEnabled ? 'is-enabled' : 'is-disabled'}`}>
                  <span>
                    Enable Power-Ups
                    <small>{selectedBlasterMode === 'death' ? 'No clock-based power-ups in To the Death.' : 'Correct power shots tug harder and build streak pressure.'}</small>
                  </span>
                  <span className="onevone-toggle-action">
                    <input
                      type="checkbox"
                      checked={selectedPowerupsEnabled}
                      onChange={(event) => setSelectedPowerupsEnabled(event.target.checked)}
                      aria-label="Enable power-ups"
                    />
                    <strong className="onevone-toggle-state">{selectedPowerupsEnabled ? 'ON ✓' : 'OFF'}</strong>
                  </span>
                </label>
                <div className="game-control onevone-overtime-control">
                  <label className={`onevone-powerup-toggle ${selectedBlasterOvertimeEnabled ? 'is-enabled' : 'is-disabled'}`}>
                    <span>
                      Enable Overtime
                      <small>When on, the rope shrinks after the selected time so close matches end fast.</small>
                    </span>
                    <span className="onevone-toggle-action">
                      <input
                        type="checkbox"
                        checked={selectedBlasterOvertimeEnabled}
                        onChange={(event) => setSelectedBlasterOvertimeEnabled(event.target.checked)}
                        aria-label="Enable overtime"
                      />
                      <strong className="onevone-toggle-state">{selectedBlasterOvertimeEnabled ? 'ON ✓' : 'OFF'}</strong>
                    </span>
                  </label>
                  <div className={selectedBlasterOvertimeEnabled ? 'onevone-overtime-slider' : 'onevone-overtime-slider disabled'}>
                    <div className="onevone-overtime-slider-head">
                      <span className="muted tiny">Shrink rope after</span>
                      <strong>{selectedBlasterOvertimeAfterSeconds}s</strong>
                    </div>
                    <input
                      className="modern-range"
                      type="range"
                      min={0}
                      max={duelBlasterOvertimeOptions.length - 1}
                      step={1}
                      value={Math.max(0, duelBlasterOvertimeOptions.indexOf(selectedBlasterOvertimeAfterSeconds as (typeof duelBlasterOvertimeOptions)[number]))}
                      disabled={!selectedBlasterOvertimeEnabled}
                      onChange={(event) => {
                        const nextIndex = Number(event.target.value)
                        setSelectedBlasterOvertimeAfterSeconds(duelBlasterOvertimeOptions[nextIndex] || duelBlasterDefaultOvertimeAfterSeconds)
                      }}
                    />
                    <div className="onevone-overtime-marks" aria-hidden>
                      {duelBlasterOvertimeOptions.map((seconds) => <span key={`create-overtime-${seconds}`}>{seconds}s</span>)}
                    </div>
                  </div>
                </div>
              </>
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

      {inRoom && room && showChangeModeModal ? (
        <div
          className="profile-modal-overlay game-setup-overlay onevone-change-mode-overlay"
          onClick={() => {
            if (!lobbySettingsSaving) setShowChangeModeModal(false)
          }}
        >
          <div className="card game-settings-modal onevone-change-mode-modal" onClick={(event) => event.stopPropagation()}>
            <div className="onevone-change-mode-head">
              <div>
                <p className="muted tiny">Host controls</p>
                <h3>Change Mode</h3>
              </div>
              <button
                className="secondary onevone-change-mode-close"
                type="button"
                onClick={() => setShowChangeModeModal(false)}
                disabled={lobbySettingsSaving}
              >
                Close
              </button>
            </div>

            <div className="onevone-change-mode-summary" aria-label="Lobby setting preview">
              <span>
                <small>Mode</small>
                <strong>{duelGameTypeLabels[lobbyEditGameType]}</strong>
              </span>
              <span>
                <small>Category</small>
                <strong>{duelCategoryLabel(lobbyEditCategory)}</strong>
              </span>
              <span>
                <small>Rules</small>
                <strong>{lobbyEditRuleLabel}</strong>
              </span>
              <span>
                <small>Extras</small>
                <strong>{lobbyEditAssistLabel}</strong>
              </span>
            </div>

            <label className="game-control">
              Game Mode
              <div className="segmented onevone-mode-segmented">
                {availableDuelGameTypeOptions.map((option) => (
                  <button
                    key={`lobby-mode-${option.value}`}
                    type="button"
                      className={lobbyEditGameType === option.value ? 'seg active' : 'seg'}
                      onClick={() => {
                        setLobbyEditGameType(option.value)
                        if (option.value === 'connect4') setLobbyEditCategory('all')
                        if (option.value !== 'quiz' && lobbyEditCategory === 'scenarios') setLobbyEditCategory('all')
                      }}
                  >
                    <span>{option.label}</span>
                    <small>{option.subtitle}</small>
                  </button>
                ))}
              </div>
            </label>
            <label className="game-control">
              Category
              <div className="segmented">
                {duelCategoryOptions
                  .filter((option) => lobbyEditGameType === 'connect4' ? option.value === 'all' : !(lobbyEditGameType !== 'quiz' && option.quizOnly))
                  .map((option) => (
                    <button
                      key={`lobby-category-${option.value}`}
                      type="button"
                      className={lobbyEditCategory === option.value ? 'seg active' : 'seg'}
                      onClick={() => setLobbyEditCategory(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
              </div>
            </label>
            {lobbyEditGameType === 'quiz' ? (
              <label className="game-control">
                Questions
                <div className="segmented">
                  {duelQuizRoundOptions.map((count) => (
                    <button
                      key={`lobby-rounds-${count}`}
                      type="button"
                      className={lobbyEditQuizRounds === count ? 'seg active' : 'seg'}
                      onClick={() => setLobbyEditQuizRounds(count)}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </label>
            ) : null}
            {lobbyEditGameType === 'blaster' ? (
              <>
                <label className="game-control">
                  Win Condition
                  <div className="segmented onevone-win-condition-segmented">
                    {duelBlasterDurationOptions.map((seconds) => (
                      <button
                        key={`lobby-blaster-duration-${seconds}`}
                        type="button"
                        className={lobbyEditBlasterMode === 'timed' && lobbyEditBlasterDurationSeconds === seconds ? 'seg active' : 'seg'}
                        onClick={() => {
                          setLobbyEditBlasterMode('timed')
                          setLobbyEditBlasterDurationSeconds(seconds)
                        }}
                      >
                        {seconds}s
                      </button>
                    ))}
                    <button
                      type="button"
                      className={lobbyEditBlasterMode === 'death' ? 'seg active' : 'seg'}
                      onClick={() => setLobbyEditBlasterMode('death')}
                    >
                      To the Death
                    </button>
                  </div>
                  <small className="muted">Timed matches end on the clock or by rope KO. To the Death removes the clock and ends by rope KO.</small>
                  <button className="secondary onevone-glossary-button" type="button" onClick={() => setShowPowerupGlossary(true)}>
                    View Power-Up Glossary
                  </button>
                </label>
                <label className={`game-control onevone-powerup-toggle ${lobbyEditPowerupsEnabled ? 'is-enabled' : 'is-disabled'}`}>
                  <span>
                    Enable Power-Ups
                    <small>{lobbyEditBlasterMode === 'death' ? 'No clock-based power-ups in To the Death.' : 'Correct power shots tug harder and build streak pressure.'}</small>
                  </span>
                  <span className="onevone-toggle-action">
                    <input
                      type="checkbox"
                      checked={lobbyEditPowerupsEnabled}
                      onChange={(event) => setLobbyEditPowerupsEnabled(event.target.checked)}
                      aria-label="Enable power-ups"
                    />
                    <strong className="onevone-toggle-state">{lobbyEditPowerupsEnabled ? 'ON ✓' : 'OFF'}</strong>
                  </span>
                </label>
                <div className="game-control onevone-overtime-control">
                  <label className={`onevone-powerup-toggle ${lobbyEditBlasterOvertimeEnabled ? 'is-enabled' : 'is-disabled'}`}>
                    <span>
                      Enable Overtime
                      <small>When on, the rope shrinks after the selected time so close matches end fast.</small>
                    </span>
                    <span className="onevone-toggle-action">
                      <input
                        type="checkbox"
                        checked={lobbyEditBlasterOvertimeEnabled}
                        onChange={(event) => setLobbyEditBlasterOvertimeEnabled(event.target.checked)}
                        aria-label="Enable overtime"
                      />
                      <strong className="onevone-toggle-state">{lobbyEditBlasterOvertimeEnabled ? 'ON ✓' : 'OFF'}</strong>
                    </span>
                  </label>
                  <div className={lobbyEditBlasterOvertimeEnabled ? 'onevone-overtime-slider' : 'onevone-overtime-slider disabled'}>
                    <div className="onevone-overtime-slider-head">
                      <span className="muted tiny">Shrink rope after</span>
                      <strong>{lobbyEditBlasterOvertimeAfterSeconds}s</strong>
                    </div>
                    <input
                      className="modern-range"
                      type="range"
                      min={0}
                      max={duelBlasterOvertimeOptions.length - 1}
                      step={1}
                      value={Math.max(0, duelBlasterOvertimeOptions.indexOf(lobbyEditBlasterOvertimeAfterSeconds as (typeof duelBlasterOvertimeOptions)[number]))}
                      disabled={!lobbyEditBlasterOvertimeEnabled}
                      onChange={(event) => {
                        const nextIndex = Number(event.target.value)
                        setLobbyEditBlasterOvertimeAfterSeconds(duelBlasterOvertimeOptions[nextIndex] || duelBlasterDefaultOvertimeAfterSeconds)
                      }}
                    />
                    <div className="onevone-overtime-marks" aria-hidden>
                      {duelBlasterOvertimeOptions.map((seconds) => <span key={`lobby-overtime-${seconds}`}>{seconds}s</span>)}
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            <p className="muted tiny onevone-change-mode-note">Saving changes resets both ready checks so the match starts with the new settings.</p>
            <div className="actions-row onevone-change-mode-actions">
              <button
                className="secondary cancel-button"
                type="button"
                onClick={() => setShowChangeModeModal(false)}
                disabled={lobbySettingsSaving}
              >
                Cancel
              </button>
              <button className="primary" type="button" onClick={() => void saveLobbySettings()} disabled={lobbySettingsSaving || !supabase}>
                {lobbySettingsSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showPowerupGlossary ? (
        <div
          className="profile-modal-overlay game-setup-overlay onevone-powerup-glossary-overlay"
          onClick={() => setShowPowerupGlossary(false)}
        >
          <div className="card game-settings-modal onevone-powerup-glossary-modal" onClick={(event) => event.stopPropagation()}>
            <div className="onevone-glossary-head">
              <div>
                <p className="onevone-glossary-kicker">Rope Blaster</p>
                <h3>Power-Up Glossary</h3>
                <span>Know what each boost does before the match starts.</span>
              </div>
              <button className="secondary onevone-glossary-close" type="button" onClick={() => setShowPowerupGlossary(false)}>
                Close
              </button>
            </div>
            <div className="onevone-powerup-glossary-grid">
              {duelBlasterPowerupGlossary.map((powerup) => (
                <article key={`powerup-glossary-${powerup.key}`} className={`onevone-powerup-glossary-card onevone-powerup-${powerup.key}`}>
                  <span className="onevone-powerup-glossary-icon" aria-hidden>
                    <span>{powerup.icon}</span>
                  </span>
                  <div className="onevone-powerup-glossary-copy">
                    <div className="onevone-powerup-glossary-title">
                      <strong>{powerup.label}</strong>
                      <small>{powerup.timing}</small>
                    </div>
                    <p>{powerup.description}</p>
                    <span className="onevone-powerup-glossary-points">{powerup.points} base tug pressure</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {showBotSetupModal ? (
        <div
          className="profile-modal-overlay game-setup-overlay onevone-bot-setup-overlay"
          onClick={() => setShowBotSetupModal(false)}
        >
          <div className="card game-settings-modal onevone-bot-setup-modal" onClick={(event) => event.stopPropagation()}>
            <div className="onevone-bot-setup-head">
              <div className="onevone-bot-title-lockup">
                <p className="muted tiny">Bot match setup</p>
                <h3>1v1 Versus Bot</h3>
                <div className="onevone-bot-header-pills" aria-label="Current bot match settings">
                  <span>{duelGameTypeLabels[inviteGameType]}</span>
                  <span>{botSetupDifficultyOption.label}</span>
                  <span>{botSetupRuleLabel}</span>
                </div>
              </div>
              <button className="secondary onevone-bot-close-button" type="button" onClick={() => setShowBotSetupModal(false)} disabled={botStarting} aria-label="Close bot match setup">
                Close
              </button>
            </div>
            <div className="onevone-bot-setup-body">
              <section className="onevone-bot-lab onevone-bot-command-panel">
                <div className="onevone-bot-lab-head">
                  <span className="onevone-bot-icon" aria-hidden>🤖</span>
                  <div>
                    <strong>Bot Training Room</strong>
                    <p className="muted tiny">Tune the bot pressure, then build a quick private match around the codes you want to sharpen.</p>
                  </div>
                </div>
                <div className="onevone-bot-difficulty-grid" aria-label="Bot difficulty">
                  {duelBotDifficultyOptions.map((option) => (
                    <button
                      key={`bot-modal-difficulty-${option.value}`}
                      type="button"
                      className={botDifficulty === option.value ? 'onevone-bot-difficulty active' : 'onevone-bot-difficulty'}
                      onClick={() => setBotDifficulty(option.value)}
                    >
                      <strong>{option.label}</strong>
                      <small>{option.subtitle}</small>
                    </button>
                  ))}
                </div>
                <div className="onevone-bot-scouting">
                  <span>Adaptive scout</span>
                  <strong>{duelCategoryLabel(botSkillSnapshot.weakCategory)}</strong>
                  <div className="onevone-bot-scout-metrics" aria-label="Bot practice profile">
                    <span>
                      <small>Study</small>
                      <strong>{Math.round(botSkillSnapshot.studySeconds / 60)}m</strong>
                    </span>
                    <span>
                      <small>Wins</small>
                      <strong>{botSkillSnapshot.blasterWins}</strong>
                    </span>
                    <span>
                      <small>Mastered</small>
                      <strong>{botSkillSnapshot.masteredCodes}</strong>
                    </span>
                  </div>
                  <small>
                    Focus: {botSetupFocusLabel}
                  </small>
                </div>
              </section>

              <section className="onevone-bot-builder-panel">
                <div className="onevone-bot-builder-head">
                  <div>
                    <p className="muted tiny">Match builder</p>
                    <strong>{duelGameTypeLabels[inviteGameType]} practice</strong>
                  </div>
                  <span>{duelCategoryLabel(inviteCategory)}</span>
                </div>
                <div className="onevone-bot-summary-strip" aria-label="Bot match summary">
                  <span>
                    <small>Mode</small>
                    <strong>{duelGameTypeLabels[inviteGameType]}</strong>
                  </span>
                  <span>
                    <small>Rules</small>
                    <strong>{botSetupRuleLabel}</strong>
                  </span>
                  <span>
                    <small>Assist</small>
                    <strong>{botSetupAssistLabel}</strong>
                  </span>
                </div>
                <div className="onevone-invite-settings onevone-bot-settings">
                  <label className="game-control">
                    Game Mode
                    <div className="segmented onevone-mode-segmented">
                      {availableDuelGameTypeOptions.map((option) => (
                        <button
                          key={`bot-mode-${option.value}`}
                          type="button"
                          className={inviteGameType === option.value ? 'seg active' : 'seg'}
                          onClick={() => {
                            setInviteGameType(option.value)
                            if (option.value === 'connect4') setInviteCategory('all')
                            if (option.value !== 'quiz' && inviteCategory === 'scenarios') setInviteCategory('all')
                          }}
                        >
                          <span>{option.label}</span>
                          <small>{option.subtitle}</small>
                        </button>
                      ))}
                    </div>
                  </label>
                  <label className="game-control">
                    Category
                    <div className="segmented">
                    {duelCategoryOptions
                        .filter((option) => inviteGameType === 'connect4' ? option.value === 'all' : !(inviteGameType !== 'quiz' && option.quizOnly))
                        .map((option) => (
                          <button
                            key={`bot-category-${option.value}`}
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
                            key={`bot-rounds-${count}`}
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
                  {inviteGameType === 'blaster' ? (
                    <>
                      <label className="game-control">
                        Win Condition
                        <div className="segmented onevone-win-condition-segmented">
                          {duelBlasterDurationOptions.map((seconds) => (
                            <button
                              key={`bot-blaster-duration-${seconds}`}
                              type="button"
                              className={inviteBlasterMode === 'timed' && inviteBlasterDurationSeconds === seconds ? 'seg active' : 'seg'}
                              onClick={() => {
                                setInviteBlasterMode('timed')
                                setInviteBlasterDurationSeconds(seconds)
                              }}
                            >
                              {seconds}s
                            </button>
                          ))}
                          <button
                            type="button"
                            className={inviteBlasterMode === 'death' ? 'seg active' : 'seg'}
                            onClick={() => setInviteBlasterMode('death')}
                          >
                            To the Death
                          </button>
                        </div>
                        <small className="muted">Default is 30 seconds. Rope KO can still end either mode early.</small>
                        <button className="secondary onevone-glossary-button" type="button" onClick={() => setShowPowerupGlossary(true)}>
                          View Power-Up Glossary
                        </button>
                      </label>
                      <label className={`game-control onevone-powerup-toggle ${invitePowerupsEnabled ? 'is-enabled' : 'is-disabled'}`}>
                        <span>
                          Enable Power-Ups
                          <small>{inviteBlasterMode === 'death' ? 'No clock-based power-ups in To the Death.' : 'Power shots make the tug-of-war swing harder.'}</small>
                        </span>
                        <span className="onevone-toggle-action">
                          <input
                            type="checkbox"
                            checked={invitePowerupsEnabled}
                            onChange={(event) => setInvitePowerupsEnabled(event.target.checked)}
                            aria-label="Enable power-ups"
                          />
                          <strong className="onevone-toggle-state">{invitePowerupsEnabled ? 'ON ✓' : 'OFF'}</strong>
                        </span>
                      </label>
                      <div className="game-control onevone-overtime-control">
                        <label className={`onevone-powerup-toggle ${inviteBlasterOvertimeEnabled ? 'is-enabled' : 'is-disabled'}`}>
                          <span>
                            Enable Overtime
                            <small>When on, the rope shrinks after the selected time so close matches end fast.</small>
                          </span>
                          <span className="onevone-toggle-action">
                            <input
                              type="checkbox"
                              checked={inviteBlasterOvertimeEnabled}
                              onChange={(event) => setInviteBlasterOvertimeEnabled(event.target.checked)}
                              aria-label="Enable overtime"
                            />
                            <strong className="onevone-toggle-state">{inviteBlasterOvertimeEnabled ? 'ON ✓' : 'OFF'}</strong>
                          </span>
                        </label>
                        <div className={inviteBlasterOvertimeEnabled ? 'onevone-overtime-slider' : 'onevone-overtime-slider disabled'}>
                          <div className="onevone-overtime-slider-head">
                            <span className="muted tiny">Shrink rope after</span>
                            <strong>{inviteBlasterOvertimeAfterSeconds}s</strong>
                          </div>
                          <input
                            className="modern-range"
                            type="range"
                            min={0}
                            max={duelBlasterOvertimeOptions.length - 1}
                            step={1}
                            value={Math.max(0, duelBlasterOvertimeOptions.indexOf(inviteBlasterOvertimeAfterSeconds as (typeof duelBlasterOvertimeOptions)[number]))}
                            disabled={!inviteBlasterOvertimeEnabled}
                            onChange={(event) => {
                              const nextIndex = Number(event.target.value)
                              setInviteBlasterOvertimeAfterSeconds(duelBlasterOvertimeOptions[nextIndex] || duelBlasterDefaultOvertimeAfterSeconds)
                            }}
                          />
                          <div className="onevone-overtime-marks" aria-hidden>
                            {duelBlasterOvertimeOptions.map((seconds) => <span key={`bot-overtime-${seconds}`}>{seconds}s</span>)}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              </section>
            </div>
            <div className="actions-row onevone-bot-setup-actions">
              <div className="onevone-bot-start-summary">
                <strong>{duelGameTypeLabels[inviteGameType]} vs Bot</strong>
                <span>{duelCategoryLabel(inviteCategory)} | {botSetupRuleLabel} | {botSetupAssistLabel}</span>
              </div>
              <div className="onevone-bot-action-buttons">
                <button className="secondary" type="button" onClick={() => setShowBotSetupModal(false)} disabled={botStarting}>
                  Cancel
                </button>
                <button
                  className="primary onevone-bot-start"
                  type="button"
                  onClick={() => void startBotMatch()}
                  disabled={botStarting}
                >
                  {botStarting ? 'Building bot match…' : `Start ${duelGameTypeLabels[inviteGameType]} vs Bot`}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

	      {showInviteModal ? (
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
                          {renderOnlineInviteAvatar(user)}
                          <div className="onevone-online-copy">
                            <strong>{user.username}</strong>
                            <span className="muted tiny">
                              Invite: {inviteGameLabel} • {inviteCategoryLabel}
                              {inviteGameType === 'quiz' ? ` • ${inviteQuizRounds} rounds` : ''}
	                              {inviteGameType === 'blaster'
	                                ? ` • ${inviteBlasterMode === 'death' ? 'To the Death' : `${inviteBlasterDurationSeconds}s`}`
	                                : ''}
	                              {inviteGameType === 'blaster' && invitePowerupsEnabled ? ' • Power-ups' : ''}
	                              {inviteGameType === 'blaster' ? ` • OT ${inviteBlasterOvertimeEnabled ? `${inviteBlasterOvertimeAfterSeconds}s` : 'Off'}` : ''}
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
                  <div className="segmented onevone-mode-segmented">
                    {availableDuelGameTypeOptions.map((option) => (
                      <button
                        key={`invite-mode-${option.value}`}
                        type="button"
                        className={inviteGameType === option.value ? 'seg active' : 'seg'}
                        onClick={() => {
                          setInviteGameType(option.value)
                          if (option.value !== 'quiz' && inviteCategory === 'scenarios') setInviteCategory('all')
                        }}
                      >
                        <span>{option.label}</span>
                        <small>{option.subtitle}</small>
                      </button>
                    ))}
                  </div>
                </label>
                <label className="game-control">
                  Category
                  <div className="segmented">
                    {duelCategoryOptions
                      .filter((option) => inviteGameType === 'connect4' ? option.value === 'all' : !(inviteGameType !== 'quiz' && option.quizOnly))
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
                {inviteGameType === 'blaster' ? (
                  <>
                    <label className="game-control">
                      Win Condition
                      <div className="segmented onevone-win-condition-segmented">
                        {duelBlasterDurationOptions.map((seconds) => (
                          <button
                            key={`invite-blaster-duration-${seconds}`}
                            type="button"
                            className={inviteBlasterMode === 'timed' && inviteBlasterDurationSeconds === seconds ? 'seg active' : 'seg'}
                            onClick={() => {
                              setInviteBlasterMode('timed')
                              setInviteBlasterDurationSeconds(seconds)
                            }}
                          >
                            {seconds}s
                          </button>
                        ))}
                        <button
                          type="button"
                          className={inviteBlasterMode === 'death' ? 'seg active' : 'seg'}
                          onClick={() => setInviteBlasterMode('death')}
                        >
                          To the Death
                        </button>
	                      </div>
	                      <small className="muted">Default is 30 seconds. Rope KO can still end either mode early.</small>
                        <button className="secondary onevone-glossary-button" type="button" onClick={() => setShowPowerupGlossary(true)}>
                          View Power-Up Glossary
                        </button>
	                    </label>
                    <label className={`game-control onevone-powerup-toggle ${invitePowerupsEnabled ? 'is-enabled' : 'is-disabled'}`}>
                      <span>
                        Enable Power-Ups
                        <small>{inviteBlasterMode === 'death' ? 'No clock-based power-ups in To the Death.' : 'Power shots make the tug-of-war swing harder.'}</small>
                      </span>
                      <span className="onevone-toggle-action">
                        <input
                          type="checkbox"
                          checked={invitePowerupsEnabled}
                          onChange={(event) => setInvitePowerupsEnabled(event.target.checked)}
                          aria-label="Enable power-ups"
                        />
                        <strong className="onevone-toggle-state">{invitePowerupsEnabled ? 'ON ✓' : 'OFF'}</strong>
                      </span>
                    </label>
                    <div className="game-control onevone-overtime-control">
                      <label className={`onevone-powerup-toggle ${inviteBlasterOvertimeEnabled ? 'is-enabled' : 'is-disabled'}`}>
                        <span>
                          Enable Overtime
                          <small>When on, the rope shrinks after the selected time so close matches end fast.</small>
                        </span>
                        <span className="onevone-toggle-action">
                          <input
                            type="checkbox"
                            checked={inviteBlasterOvertimeEnabled}
                            onChange={(event) => setInviteBlasterOvertimeEnabled(event.target.checked)}
                            aria-label="Enable overtime"
                          />
                          <strong className="onevone-toggle-state">{inviteBlasterOvertimeEnabled ? 'ON ✓' : 'OFF'}</strong>
                        </span>
                      </label>
                      <div className={inviteBlasterOvertimeEnabled ? 'onevone-overtime-slider' : 'onevone-overtime-slider disabled'}>
                        <div className="onevone-overtime-slider-head">
                          <span className="muted tiny">Shrink rope after</span>
                          <strong>{inviteBlasterOvertimeAfterSeconds}s</strong>
                        </div>
                        <input
                          className="modern-range"
                          type="range"
                          min={0}
                          max={duelBlasterOvertimeOptions.length - 1}
                          step={1}
                          value={Math.max(0, duelBlasterOvertimeOptions.indexOf(inviteBlasterOvertimeAfterSeconds as (typeof duelBlasterOvertimeOptions)[number]))}
                          disabled={!inviteBlasterOvertimeEnabled}
                          onChange={(event) => {
                            const nextIndex = Number(event.target.value)
                            setInviteBlasterOvertimeAfterSeconds(duelBlasterOvertimeOptions[nextIndex] || duelBlasterDefaultOvertimeAfterSeconds)
                          }}
                        />
                        <div className="onevone-overtime-marks" aria-hidden>
                          {duelBlasterOvertimeOptions.map((seconds) => <span key={`invite-overtime-${seconds}`}>{seconds}s</span>)}
                        </div>
                      </div>
                    </div>
                  </>
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
              <h2>{roomDisplayName} · 1v1 {duelGameTypeLabels[room.game_type]}</h2>
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
                <h2>1v1 {duelGameTypeLabels[room.game_type]}</h2>
                <p className="muted">{roomRuleLabel} · {roomCategoryLabel}</p>
                <div className="onevone-lobby-settings-strip" aria-label="Current lobby settings">
                  <span>
                    <small>Players</small>
                    <strong>{lobbyPlayerCount}/2</strong>
                  </span>
                  <span>
                    <small>Mode</small>
                    <strong>{duelGameTypeLabels[room.game_type]}</strong>
                  </span>
                  <span>
                    <small>Rules</small>
                    <strong>{roomRuleLabel}</strong>
                  </span>
                  {canHostChangeLobbyMode ? (
                    <button className="secondary onevone-change-mode-button" type="button" onClick={openChangeModeModal}>
                      Change Mode
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="onevone-waiting-players">
                <div className={`onevone-player-slot ${myPlayer ? 'filled' : ''}`}>
                  <span className="onevone-player-slot-label">You</span>
                  {myPlayer ? (
                    <>
                      {renderDuelPlayerAvatar(myPlayer.user_id, currentUsername)}
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
                      {renderDuelPlayerAvatar(opponentPlayer.user_id, usernameByUserId[opponentPlayer.user_id] || 'Player')}
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
                    <small className="muted">
                      {syncingBeforeCountdown ? 'Syncing with opponent' : 'Starting together'}
                    </small>
                    {syncingBeforeCountdown ? (
                      <strong className="onevone-syncing-dots">•••</strong>
                    ) : (
                      <strong>{countdownRemaining}</strong>
                    )}
                    <p className="muted tiny">
                      {syncingBeforeCountdown ? 'Locking the shared start time…' : 'Match starts in…'}
                    </p>
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
                          disabled={quizLocked}
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
                    <small className="muted">
                      {syncingBeforeCountdown ? 'Syncing with opponent' : 'Starting together'}
                    </small>
                    {syncingBeforeCountdown ? (
                      <strong className="onevone-syncing-dots">•••</strong>
                    ) : (
                      <strong>{countdownRemaining}</strong>
                    )}
                    <p className="muted tiny">
                      {syncingBeforeCountdown ? 'Locking the shared start time…' : 'Match starts in…'}
                    </p>
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
                            disabled={matchingSubmitted || matched || (!selected && selectedMatchingCards.length >= 2)}
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

          {room.status === 'in_progress' && room.game_type === 'blaster' ? (
            <div className="blaster-session-overlay onevone-blaster-overlay">
              <div className="blaster-session-shell onevone-blaster-shell">
                {isSpectator && (
                  <div className="onevone-spectator-banner">
                    <span>👁️ You are spectating</span>
                    <span className="muted tiny">{players[0] ? usernameByUserId[players[0].user_id] || 'Player 1' : 'Player 1'} vs {players[1] ? usernameByUserId[players[1].user_id] || 'Player 2' : 'Player 2'}</span>
                  </div>
                )}
                <div className="onevone-blaster-topbar">
                  <button className="secondary blaster-exit-button onevone-leave-button" onClick={() => void confirmLeaveMatch()}>
                    {isSpectator ? 'Stop Spectating' : 'Leave Match'}
                  </button>
                  <div className="onevone-blaster-title">
	                    <span className="muted tiny">Rope Blaster</span>
	                    <strong>
	                      {formatBlasterRuleLabel(room.settings)}
	                      {blasterSuddenDeathActive ? ' · Overtime' : ''}
	                      {blasterPowerupsEnabled ? ' · Power-ups' : ''}
                    </strong>
	                    {ropeBlasterWorkerUrl ? (
	                      <span className={`onevone-cloud-latency onevone-cloud-latency-${blasterCloudStatus}`}>
	                        <span className="onevone-cloud-dot" />
	                        Ping
	                        {blasterCloudStatus === 'connected' && blasterCloudLatencyMs !== null ? ` · ${blasterCloudLatencyMs}ms` : ` · ${blasterCloudStatus}`}
	                      </span>
                    ) : null}
                  </div>
                  <div className="onevone-blaster-clock">
                    <small className="muted">{blasterClockLabel}</small>
                    <strong>{blasterClockValue}</strong>
                    <span className="onevone-blaster-timer-track" aria-hidden>
                      <span style={{ width: `${blasterMatchProgressPercent}%` }} />
                    </span>
                  </div>
                </div>

                <div className={`onevone-tug-panel ${tugStateClass}`}>
	                  {blasterSuddenDeathActive ? (
	                    <div className="onevone-sudden-death-banner" aria-live="polite">
	                      <strong>⚠️ Overtime</strong>
	                      <span>Short rope: push the bomb into either glowing KO gate.</span>
                    </div>
                  ) : null}
                  <div className="onevone-tug-names">
                    <span><small>You</small>{myDisplayName}</span>
                    <strong>{scoreGap === 0 ? 'Even' : scoreGap > 0 ? `+${scoreGap}` : `${scoreGap}`}</strong>
                    <span><small>Opponent</small>{opponentDisplayName}</span>
                  </div>
                  <div className="onevone-tug-track" style={tugTrackStyle} aria-label="Tug of war score pressure">
                    <span className="onevone-tug-zone onevone-tug-zone-self">Your side</span>
                    <span className="onevone-tug-zone onevone-tug-zone-opponent">Opponent</span>
                    {blasterSuddenDeathActive ? (
                      <>
                        <span className="onevone-tug-short-window" aria-hidden />
                        <span className="onevone-tug-short-gate onevone-tug-short-gate-self" aria-hidden>KO</span>
                        <span className="onevone-tug-short-gate onevone-tug-short-gate-opponent" aria-hidden>KO</span>
                      </>
                    ) : null}
                    <span className="onevone-tug-midline" />
                    <span className="onevone-tug-rope" style={tugRopeStyle} />
                    <span className="onevone-tug-handle onevone-tug-bomb" style={tugHandleStyle} aria-hidden>
                      <span className="onevone-bomb-core" />
                      <span className="onevone-bomb-fuse"><i /></span>
                    </span>
                  </div>
                  <div className="onevone-tug-scores">
                    <span>{myPlayer?.score || 0} pts</span>
                    <span>{blasterSuddenDeathActive ? 'Sudden Rope' : 'Rope'} {blasterRopeRemainingPercent}%</span>
                    <span>{opponentPlayer?.score || 0} pts</span>
                  </div>
                </div>

                {countdownActive ? (
                  <div className="onevone-countdown">
                    <small className="muted">
                      {syncingBeforeCountdown ? 'Syncing with opponent' : 'Starting together'}
                    </small>
                    {syncingBeforeCountdown ? (
                      <strong className="onevone-syncing-dots">•••</strong>
                    ) : (
                      <strong>{countdownRemaining}</strong>
                    )}
                    <p className="muted tiny">
                      {syncingBeforeCountdown ? 'Locking the shared start time…' : 'Blaster duel starts in…'}
                    </p>
                  </div>
                ) : null}

                {canStartRound && isBlasterRound(currentRound) ? (
                  <div className="onevone-blaster-arena">
	                    <div className="onevone-blaster-prompt">
	                      <p className="muted tiny">Blast the correct code section</p>
	                      <h3 title={currentRound.prompt}>{currentRound.prompt}</h3>
	                    </div>
                    <div className={blasterPowerup ? 'onevone-powerup-status-row active' : 'onevone-powerup-status-row'} aria-live="polite">
	                      {blasterPowerup ? (
	                        <strong className={`onevone-powerup-pill onevone-powerup-${blasterPowerup.key}`}>
	                          {blasterPowerup.icon} {blasterPowerup.label} · {blasterPowerup.description}
                        </strong>
                      ) : null}
                    </div>
                    <div
                      ref={blasterFieldRef}
                      className={[
                        'onevone-blaster-field',
                        blasterPowerup ? 'onevone-blaster-field-powered' : '',
                        blasterDisruption ? `onevone-blaster-field-disrupted onevone-blaster-field-disruption-${blasterDisruption.key}` : '',
                      ].filter(Boolean).join(' ')}
                    >
                      <div className="blaster-starfield" aria-hidden>
                        <span></span><span></span><span></span><span></span>
                      </div>
                      {blasterDisruption ? (
                        <div className={`onevone-blaster-disruption onevone-blaster-disruption-${blasterDisruption.key}`} aria-hidden>
	                          <strong>{blasterDisruption.icon} {blasterDisruption.label}</strong>
	                          {blasterDisruption.key === 'paperwork' ? (
	                            <span className="onevone-paperwork-storm">
	                              {BLASTER_PAPERWORK_STORM_LABELS.map((label, paperworkIndex) => (
	                                <i key={`${label}-${paperworkIndex}`}>{label}</i>
	                              ))}
	                            </span>
	                          ) : null}
	                        </div>
                      ) : null}
                      {blasterRoundTargets.map((target, index) => {
                        const selected = blasterChoice === index && blasterChoiceRound === currentRound.round
                        const correct = normalizeBlasterTarget(target) === normalizeBlasterTarget(blasterRoundCorrectCode)
                        const k9Hinted = blasterPowerup?.key === 'k9' && correct && !blasterLocked
                        const radarHinted = blasterPowerup?.key === 'radar' && correct && !blasterLocked
                        const targetKey = blasterTargetDomKey(index)
                        const targetDisplay = blasterDisruption?.key === 'clone'
                          ? blasterDisruption.cloneText || target
                          : target
                        return isSpectator ? (
                          <div
                            key={`spectate-blaster-target-${index}`}
                            ref={(node) => {
                              blasterTargetRefs.current[targetKey] = node
                            }}
                            className={`onevone-blaster-target spectating${k9Hinted ? ' hinted' : ''}${radarHinted ? ' scanned' : ''}${blasterDisruption?.key === 'clone' ? ' cloned' : ''}`}
                            style={blasterTargetStyle(room.id, index)}
                          >
                            <span>{targetDisplay}</span>
                          </div>
                        ) : (
                          <button
                            key={`duel-blaster-target-${index}`}
                            ref={(node) => {
                              blasterTargetRefs.current[targetKey] = node
                            }}
                            type="button"
                            className={`onevone-blaster-target${selected ? ' selected' : ''}${selected && correct ? ' correct' : ''}${selected && !correct ? ' wrong' : ''}${k9Hinted ? ' hinted' : ''}${radarHinted ? ' scanned' : ''}${blasterDisruption?.key === 'clone' ? ' cloned' : ''}`}
                            style={blasterTargetStyle(room.id, index)}
                            onClick={(event) => submitBlasterAnswer(index, event)}
                            disabled={blasterLocked || !roundIsInitialized}
                            aria-label={`Blast ${targetDisplay}`}
                          >
                            <span>{targetDisplay}</span>
                          </button>
                        )
                      })}
                      {blasterShotBursts.map((burst) => (
                        <span
                          key={burst.id}
                          className={`onevone-blaster-shot-burst onevone-blaster-shot-burst-${burst.tone}`}
                          style={{ left: burst.x, top: burst.y }}
                          aria-hidden
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="muted">{countdownActive ? 'Countdown in progress…' : 'Waiting for round sync...'}</p>
                )}
              </div>
            </div>
          ) : null}

          {room.status === 'in_progress' && room.game_type === 'connect4' ? (
            <div className="connect4-session-overlay">
              <div className="connect4-session-shell">
                <div className="connect4-topbar">
                  <button className="secondary onevone-leave-button" onClick={() => void confirmLeaveMatch()}>
                    {isSpectator ? 'Stop Spectating' : 'Leave Match'}
                  </button>
                  <div className="connect4-title">
                    <span className="muted tiny">1v1 Connect 4</span>
                    <strong>
                      {connect4State.winner
                        ? `${connect4WinnerName || 'Winner'} connects four`
                        : connect4State.draw
                          ? 'Board filled: draw'
                          : countdownActive
                            ? 'Starting together'
                            : isSpectator
                              ? `${connect4State.currentTurn === 'P1' ? getPlayerName(connect4PlayerOne?.user_id || '', 'Player 1') : getPlayerName(connect4PlayerTwo?.user_id || '', 'Player 2')} to move`
                              : connect4IsMyTurn
                                ? 'Your move'
                                : 'Opponent to move'}
                    </strong>
                  </div>
                  <div className="connect4-move-count">
                    <small className="muted">Moves</small>
                    <strong>{connect4State.moveHistory.length}/{connect4Rows * connect4Columns}</strong>
                  </div>
                </div>

                {isSpectator ? (
                  <div className="onevone-spectator-banner">
                    <span>Watching</span>
                    <span className="muted tiny">{getPlayerName(connect4PlayerOne?.user_id || '', 'Player 1')} vs {getPlayerName(connect4PlayerTwo?.user_id || '', 'Player 2')}</span>
                  </div>
                ) : null}

                <div className="connect4-players" aria-label="Connect 4 players">
                  <div className={`connect4-player-chip ${connect4State.currentTurn === 'P1' && connect4State.status === 'active' ? 'active' : ''}`}>
                    <span className="connect4-token connect4-token-p1" aria-hidden />
                    <small>Player 1</small>
                    <strong>{getPlayerName(connect4PlayerOne?.user_id || '', 'Player 1')}</strong>
                  </div>
                  <div className={`connect4-player-chip ${connect4State.currentTurn === 'P2' && connect4State.status === 'active' ? 'active' : ''}`}>
                    <span className="connect4-token connect4-token-p2" aria-hidden />
                    <small>Player 2</small>
                    <strong>{getPlayerName(connect4PlayerTwo?.user_id || '', 'Player 2')}</strong>
                  </div>
                </div>

                {countdownActive ? (
                  <div className="onevone-countdown">
                    <small className="muted">
                      {syncingBeforeCountdown ? 'Syncing with opponent' : 'Starting together'}
                    </small>
                    {syncingBeforeCountdown ? (
                      <strong className="onevone-syncing-dots">•••</strong>
                    ) : (
                      <strong>{countdownRemaining}</strong>
                    )}
                    <p className="muted tiny">
                      {syncingBeforeCountdown ? 'Locking the shared start time...' : 'Connect 4 starts in...'}
                    </p>
                  </div>
                ) : null}

                <div className="connect4-board-wrap">
                  <div className="connect4-column-actions" aria-label="Drop a disc by column">
                    {Array.from({ length: connect4Columns }, (_, columnIndex) => {
                      const columnFull = connect4State.board[0]?.[columnIndex] !== null
                      return (
                        <button
                          key={`connect4-drop-${columnIndex}`}
                          type="button"
                          className={`connect4-column-drop ${columnFull ? 'full' : ''}`}
                          disabled={!connect4IsMyTurn || columnFull}
                          onClick={() => void submitConnect4Move(columnIndex)}
                          aria-label={`Drop disc in column ${columnIndex + 1}`}
                        >
                          {columnIndex + 1}
                        </button>
                      )
                    })}
                  </div>
                  {(() => {
                    const winningCells = findConnect4WinningCells(connect4State.board, connect4State.winner)
                    const winningCellKeys = new Set(winningCells.map((cell) => connect4WinningCellKey(cell.row, cell.column)))
                    const winLineStyle = connect4WinLineStyle(winningCells)
                    return (
                      <div className="connect4-board" role="grid" aria-label="Connect 4 board">
                        {winLineStyle ? <span className="connect4-win-line" style={winLineStyle} aria-hidden /> : null}
                        {connect4State.board.map((row, rowIndex) => (
                          <div key={`connect4-row-${rowIndex}`} className="connect4-row" role="row">
                            {row.map((cell, columnIndex) => {
                              const columnFull = connect4State.board[0]?.[columnIndex] !== null
                              const canDrop = connect4IsMyTurn && !columnFull
                              return (
                                <button
                                  key={`connect4-cell-${rowIndex}-${columnIndex}`}
                                  type="button"
                                  className={connect4CellClass(cell, winningCellKeys.has(connect4WinningCellKey(rowIndex, columnIndex)))}
                                  role="gridcell"
                                  disabled={!canDrop}
                                  onClick={() => void submitConnect4Move(columnIndex)}
                                  aria-label={`${connect4CellLabel(cell, rowIndex, columnIndex)}. ${canDrop ? `Drop disc in column ${columnIndex + 1}.` : ''}`}
                                />
                              )
                            })}
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>

                <p className="connect4-status muted" aria-live="polite">
                  {connect4State.winner
                    ? `${connect4WinnerName || 'Winner'} won this match.`
                    : connect4State.draw
                      ? 'The board is full. This match is a draw.'
                      : isSpectator
                        ? 'Spectator view updates as each player drops a disc.'
                        : connect4IsMyTurn
                          ? 'Choose a column to drop your disc.'
                          : 'Waiting for your opponent to choose a column.'}
                </p>
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
                  Tie-break order: <strong>Score</strong> → <strong>Finish first</strong> → <strong>Answer time</strong> → <strong>Fastest single round</strong> → <strong>Draw</strong>
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
                {room.game_type === 'blaster' && myResultRow && opponentResultRow ? (
                  <p className="muted tiny onevone-tiebreak-note">
                    Code Blaster finish: <strong>{blasterResultRule}</strong> • {formatBlasterRuleLabel(room.settings)} • Final pressure gap {Math.abs(finalBlasterScoreGap)} / {finalBlasterRopeLimit}
                  </p>
                ) : null}
                {!isSpectator && sessionXpReward ? (
                  <div className="onevone-result-xp-reward">
                    {sessionXpReward}
                  </div>
                ) : null}
                {tieBreakerDecision && !isSpectator ? (
                  <p className="muted tiny onevone-tiebreak-note">
                    Decision: {tieBreakerDecision.rule} • {tieBreakerDecision.summary}
                  </p>
                ) : null}

                {!isSpectator && (
                <div className="onevone-new-game-panel">
                  <div className="onevone-new-game-head">
                    <p className="muted tiny">Next Match</p>
                    <strong>Start a new game</strong>
                  </div>
                  <p className="muted tiny">Open the invite screen, choose anyone online, and create a fresh 1v1 room.</p>
                  <div className="actions-row">
                    <button
                      className="primary"
                      onClick={() => openInviteModal(room)}
                    >
                      Start New Game
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
                  <span className={`leader-avatar-frame avatar-decoration-wrap level-halo-frame ${selectedDuelProfile.haloClass}`}>
                    <img
                      src={selectedDuelProfile.avatarUrl}
                      alt={selectedDuelProfile.username}
                      className="leader-avatar"
                      onError={handleAvatarImageError}
                    />
                    <ProfileAvatarDecoration
                      decoration={getEffectiveProfileDecorationForLevel(selectedDuelProfile.level, selectedDuelProfile.profileDecorationKey)}
                    />
                  </span>
                </span>
                <div className="onevone-profile-name-wrap">
                  <div className="leader-profile-name-row">
                    <h3
                      className={`leader-profile-name ${displayNameClass(selectedDuelProfile.supporterTier, true)}`}
                      style={displayNameStyle(selectedDuelProfile.nameStyle, selectedDuelProfile.supporterTier)}
                    >
                      {selectedDuelProfile.username}
                    </h3>
                    <span className={`profile-presence-pill is-${selectedDuelProfileActivity.state}`}>
                      {selectedDuelProfileActivity.statusLabel}
                    </span>
                  </div>
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
                <div className="leader-profile-activity">
                  <p className={`leader-profile-activity-main is-${selectedDuelProfileActivity.state}`}>
                    {selectedDuelProfileActivity.mainLabel}
                  </p>
                  <p className="leader-profile-activity-sub">{selectedDuelProfileActivity.subLabel}</p>
                </div>
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
              <article className="leader-profile-stat">
                <p className="leader-profile-label">Blaster W-L</p>
                <strong>{selectedDuelProfile.blaster.wins}-{selectedDuelProfile.blaster.losses}</strong>
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
