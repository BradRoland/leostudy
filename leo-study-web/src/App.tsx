import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type SyntheticEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { FireFlame, type FireFlameOption } from '@9am/fire-flame-react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { Analytics } from '@vercel/analytics/react'
import './App.css'
import { loadLocalContentBundle, type ContentBankItem, type ScenarioBankItem, type ScenarioBankSubQuestion, type ScenarioTrainingSection } from './content'
import { useOwner } from './hooks/useOwner'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { OneVsOnePanel } from './components/OneVsOnePanel'
import { DuelInviteBanner } from './components/DuelInviteBanner'
import { GlobalChatWidget } from './components/GlobalChatWidget'
import { StudyGuidePage } from './components/StudyGuidePage'
import { StudyPracticeTestPage } from './components/StudyPracticeTestPage'
import './components/GlobalChatWidget.css'

type CodeSet = 'penal' | 'hs' | 'vehicle'
type CodeFilter = CodeSet | 'all'
type SupporterTier = 'free' | 'tier2' | 'tier5' | 'tier10'
type DisplayMode = 'dark' | 'light'
type AppTab = 'library' | 'study' | 'games' | 'scenarios' | 'home' | 'leaderboards' | 'chat'
type HomeActionTarget = 'study' | 'games-matching' | 'games-speed' | 'scenarios'
type HomeDurationFilter = 15 | 30 | 60
type DuelLeaderboardMode = 'all' | 'matching' | 'quiz'
type GameModeSelection = {
  duration: HomeDurationFilter
  filter: CodeFilter
}
type HomeActionOptions = {
  gamePreset?: GameModeSelection
  forceAllTime?: boolean
}
type AppIconName = 'study' | 'games' | 'scenarios' | 'support' | 'home' | 'library' | 'flashcards' | 'test' | 'warning' | 'chat' | 'leaderboards' | 'settings' | 'stats' | 'speed' | 'duel' | 'updates'
type StatsIconName = 'overview' | 'time' | 'words' | 'penal' | 'flashcards' | 'scenarios' | 'streak' | 'game' | 'studyset'
type StudyWrongness = 'balanced' | 'needs_work' | 'most_needs_work'
type StudyAnswerMode = 'multiple' | 'truefalse'
type StudyActivitySource = 'flashcards' | 'study_test' | 'study_guide' | 'study_practice' | 'matching' | 'speed' | 'duel'
type PresenceStatus = 'active' | 'away'
type CurrentUserActivity = {
  key: string
  label: string
  updatedAt: string
}
type ProfileActivityDisplay = {
  state: 'active' | 'idle' | 'offline'
  statusLabel: string
  mainLabel: string
  subLabel: string
}
type BannerTone = 'courteous' | 'notice' | 'urgent'

const studyTrackingTickMs = 5000
const studyActivityWindowMs = 20000
const leaderboardRefreshThrottleMs = 5000
const homeLeaderboardRefreshThrottleMs = 7000
const historyHydrateLimit = 4000
const remoteTrackHistoryMaxPoints = 900
const remoteTimelineMaxPoints = 2400
const interactiveTrendMaxPoints = 96

type HomeLeaderboardEntry = {
  userId: string
  playerName: string
  avatarUrl: string
  supporterTier: SupporterTier
  themeId: string
  nameStyle: NameStyle
  bio: string
  agency: string
  isOwner: boolean
  value: number
  masteredCodes: number
  studySeconds: number
  studyDayStreak: number
  mostStudiedMode: CodeFilter | null
  duelWins: number
  duelLosses: number
  duelCurrentWinStreak: number
  currentActivity: CurrentUserActivity | null
}

type HomeLeaderboardCardKey = 'study_time' | 'study_streak' | 'matching' | 'speed' | 'mastered' | 'duel_wins' | 'duel_streak'

type HomeLeaderboardPreferences = {
  visibleCards: HomeLeaderboardCardKey[]
  duelWinsMode: DuelLeaderboardMode
  duelStreakMode: DuelLeaderboardMode
}

type CodeSection = {
  id: string
  codeSet: CodeSet
  sectionNumber: string
  title: string
  text: string
}

type QuizQuestion = {
  id: string
  codeSet: CodeSet
  linkedSectionNumber: string
  prompt: string
  choices: string[]
  correctIndex: number
  explanation: string
}

type Flashcard = {
  id: string
  codeSet: CodeSet
  front: string
  back: string
}

type ScenarioQuestion = {
  id: string
  codeSet: CodeSet
  tmasSet: ScenarioTrainingSection
  scenarioGroupId: string
  scenarioTitle: string
  scenarioStem: string
  questionNumber: number
  questionCount: number
  prompt: string
  choices: string[]
  correctIndex: number
  explanation: string
}

type CodePerformance = {
  correctCount: number
  incorrectCount: number
  correctStreak?: number
}

type MatchCard = {
  id: string
  pairId: string
  sectionNumber: string
  codeSet: CodeSet
  text: string
  kind: 'code' | 'definition'
}

type LeaderboardEntry = {
  id: string
  userId: string
  game: string
  playerName: string
  avatarUrl: string
  supporterTier: SupporterTier
  bio: string
  agency: string
  nameStyle: NameStyle
  themeId: string
  isOwner: boolean
  matchDuration: number | null
  matchFilter: CodeFilter | null
  score: number
  round: number
  createdAt: number
  masteredCodes: number
  studySeconds: number
  studyDayStreak: number
  mostStudiedMode: CodeFilter | null
  duelWins: number
  duelLosses: number
  duelCurrentWinStreak: number
  currentActivity: CurrentUserActivity | null
}

type LeaderboardRefreshResult = {
  allTimeEntries: LeaderboardEntry[]
  weeklyEntries: LeaderboardEntry[]
}

type LeaderNameEntry = Pick<LeaderboardEntry, 'playerName' | 'supporterTier' | 'nameStyle' | 'duelCurrentWinStreak'>

type PersistedState = {
  performance: Record<string, CodePerformance>
  highScores: {
    matching: number
    blaster: number
    caseFile: number
    rapidFire: number
    gravity: number
  }
  bestStreak: number
  profileDetails: ProfileDetails
}

type UserProfile = {
  userId: string
  username: string
  avatarPath: string
  avatarUrl: string
  supporterTier: SupporterTier
  isOwner: boolean
  createdAt: string
}

type BugSeverity = 'low' | 'medium' | 'high' | 'urgent'
type BugStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

type BugReport = {
  id: string
  reporterUserId: string
  reporterName: string
  reporterEmail: string
  pagePath: string
  severity: BugSeverity
  summary: string
  details: string
  status: BugStatus
  ownerNote: string
  userAgent: string
  viewport: string
  createdAt: number
  updatedAt: number
}

type ContentEditorItem = {
  id: string
  category: string
  type: 'code' | 'scenario' | 'question'
  title: string
  question: string
  answer: string
  tags: string[]
  difficulty: string
  codeSection: string
  explanation: string
  sourceUrl: string
  scenario: string
  scenarioQuestions: string[]
  keyPoints: string[]
  isPublished: boolean
}

type ProfileDetails = {
  bio: string
  agency: string
  displayMode: DisplayMode
  homeLeaderboardRotationMs: number
  homeLeaderboardPreferences: HomeLeaderboardPreferences
  themeId: string
  nameStyle: NameStyle
  namePresets: NameStylePreset[]
  systemNoticesSeen: string[]
  stats: UserStats
  algorithmSnapshot?: Record<string, PersistedAlgorithmStat>
  currentActivity: CurrentUserActivity | null
}

type NameStyle = {
  color: string
  fontFamily: string
  fontWeight: number
  fontStyle: 'normal' | 'italic'
  glowEnabled: boolean
  glowIntensity: number
}

type NameStylePreset = {
  id: string
  name: string
  style: NameStyle
}

type UserStats = {
  studySeconds: number
  studyDayStreak: number
  bestStudyDayStreak: number
  lastStudyDay: string
  gamePlays: Record<'matching' | 'speed', number>
  flashcardsReviewed: number
  scenariosReviewed: number
  studyModeCounts: Record<CodeFilter, number>
  sessionTracks: Record<string, SessionTrack>
  sessionTimeline: SessionTimelinePoint[]
}

type SessionMode = 'study_test' | 'matching' | 'speed'

type SessionTrack = {
  lastAttempt: SessionAttemptSnapshot | null
  accuracyHistory: number[]
  scoreHistory: number[]
}

type SessionTimelinePoint = {
  mode: SessionMode
  filter: CodeFilter
  accuracy: number
  score: number
  at: number
}

type SessionAttemptSnapshot = {
  accuracy: number
  score: number
  correct: number
  incorrect: number
  rank: number | null
  duration: number | null
  filter: CodeFilter
  at: number
}

type ScoreTimelinePoint = {
  at: number
  score: number
}

type LeaderPreviewItem = {
  rank: number
  playerName: string
  score: number
  isCurrentUser: boolean
}

type LeaderboardBoard = {
  key: string
  game: 'Matching' | 'Speed Test'
  duration: HomeDurationFilter
  filter: CodeFilter
  entries: LeaderboardEntry[]
}

type DepartmentLeaderboardEntry = {
  key: string
  agency: string
  totalScore: number
  averageScore: number
  balancedScore: number
  playerCount: number
  attempts: number
  topKUsed: number
}

type WeeklyPerformanceLeader = {
  entry: LeaderboardEntry
  firstPlaceCount: number
  leaderboardAppearances: number
  totalScore: number
  bestSingleScore: number
}

type SessionPerformanceReport = {
  mode: SessionMode
  title: string
  contextLabel: string
  accuracy: number
  correct: number
  incorrect: number
  score: number
  deltaAccuracy: number | null
  deltaScore: number | null
  trend: number[]
  scoreTrend: number[]
  focusTips: string[]
  leaderboardPreview: LeaderPreviewItem[]
  currentRank: number | null
  previousRank: number | null
}

type SettingsTab =
  | 'profile'
  | 'customization'
  | 'support'
  | 'security'
  | 'editor'
  | 'agencies'
  | 'banner'
  | 'bug_report'
  | 'bug_inbox'

type AppBannerSettings = {
  enabled: boolean
  tone: BannerTone
  message: string
  scroll: boolean
  scrollSpeed: number
  scrollRepeat: number
}

const defaultLeaderboardRotationMs = 3600

const defaultAgency = 'Unaffiliated'
const appSettingsRowId = 'global'
const defaultAppBannerSettings: AppBannerSettings = {
  enabled: false,
  tone: 'notice',
  message: '',
  scroll: false,
  scrollSpeed: 20,
  scrollRepeat: 2,
}
const bannerToneLabel: Record<BannerTone, string> = {
  courteous: 'Courteous',
  notice: 'Notice',
  urgent: 'Urgent',
}
const bugSeverityLabel: Record<BugSeverity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
}
const bugStatusLabel: Record<BugStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
}
const bugStatusOrder: BugStatus[] = ['open', 'in_progress', 'resolved', 'closed']
const fallbackAgencyOptions = [
  'Fresno Police Department',
  'Fresno Sheriffs Office',
  'Madera Police Department',
  'Madera Sheriffs Office',
  'Los Banos Police Department',
  'DMV',
  'Department of Insurance',
  'Clovis PD',
  'Unaffiliated',
  'Mariposa Sheriffs Office',
] as const

function sanitizeAgencyOptions(value: unknown): string[] {
  const candidates = Array.isArray(value) ? value : fallbackAgencyOptions
  const normalized = candidates
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)

  const deduped = normalized.filter((entry, index, list) => list.findIndex((candidate) => candidate.toLowerCase() === entry.toLowerCase()) === index)
  if (!deduped.some((entry) => entry.toLowerCase() === defaultAgency.toLowerCase())) {
    deduped.push(defaultAgency)
  }

  return deduped.length > 0 ? deduped : [defaultAgency]
}

function normalizeAgency(value: unknown, options: string[]): string {
  const safeOptions = sanitizeAgencyOptions(options)
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return safeOptions.find((agency) => agency.toLowerCase() === defaultAgency.toLowerCase()) || safeOptions[0] || defaultAgency
  const exact = safeOptions.find((a) => a.toLowerCase() === raw)
  if (exact) return exact
  if (raw.includes('fresno') && raw.includes('sheriff')) return safeOptions.find((a) => a.toLowerCase() === 'fresno sheriffs office') || safeOptions[0]
  if (raw.includes('fresno')) return safeOptions.find((a) => a.toLowerCase() === 'fresno police department') || safeOptions[0]
  if (raw.includes('madera') && raw.includes('sheriff')) return safeOptions.find((a) => a.toLowerCase() === 'madera sheriffs office') || safeOptions[0]
  if (raw.includes('madera')) return safeOptions.find((a) => a.toLowerCase() === 'madera police department') || safeOptions[0]
  if (raw.includes('los banos')) return safeOptions.find((a) => a.toLowerCase() === 'los banos police department') || safeOptions[0]
  if (raw.includes('department of insurance') || raw === 'doi') return safeOptions.find((a) => a.toLowerCase() === 'department of insurance') || safeOptions[0]
  if (raw.includes('dmv') || raw.includes('motor vehicle')) return safeOptions.find((a) => a.toLowerCase() === 'dmv') || safeOptions[0]
  if (raw.includes('clovis')) return safeOptions.find((a) => a.toLowerCase() === 'clovis pd') || safeOptions[0]
  if (raw.includes('mariposa') && raw.includes('sheriff')) return safeOptions.find((a) => a.toLowerCase() === 'mariposa sheriffs office') || safeOptions[0]
  return safeOptions.find((agency) => agency.toLowerCase() === defaultAgency.toLowerCase()) || safeOptions[0] || defaultAgency
}

function sanitizeBannerTone(value: unknown): BannerTone {
  const tone = String(value || '').trim().toLowerCase()
  if (tone === 'courteous' || tone === 'urgent') return tone
  return 'notice'
}

function sanitizeBugSeverity(value: unknown): BugSeverity {
  const severity = String(value || '').trim().toLowerCase()
  if (severity === 'low' || severity === 'high' || severity === 'urgent') return severity
  return 'medium'
}

function sanitizeBugStatus(value: unknown): BugStatus {
  const status = String(value || '').trim().toLowerCase()
  if (status === 'in_progress' || status === 'resolved' || status === 'closed') return status
  return 'open'
}

function sanitizeAppBannerSettings(input: unknown): AppBannerSettings {
  if (!input || typeof input !== 'object') return { ...defaultAppBannerSettings }
  const value = input as Partial<AppBannerSettings> & {
    banner_enabled?: unknown
    banner_level?: unknown
    banner_message?: unknown
    banner_scroll?: unknown
    banner_scroll_speed?: unknown
    banner_scroll_repeat?: unknown
  }
  const rawMessage = typeof value.message === 'string'
    ? value.message
    : typeof value.banner_message === 'string'
      ? value.banner_message
      : ''
  const message = rawMessage.replace(/\s+/g, ' ').trim().slice(0, 320)
  const enabled = typeof value.enabled === 'boolean'
    ? value.enabled
    : Boolean(value.banner_enabled)
  const scroll = typeof value.scroll === 'boolean'
    ? value.scroll
    : Boolean(value.banner_scroll)
  const tone = sanitizeBannerTone(value.tone ?? value.banner_level)
  const rawScrollSpeed = Number(value.scrollSpeed ?? value.banner_scroll_speed)
  const rawScrollRepeat = Number(value.scrollRepeat ?? value.banner_scroll_repeat)
  const scrollSpeed = Number.isFinite(rawScrollSpeed) ? Math.min(60, Math.max(6, Math.round(rawScrollSpeed))) : defaultAppBannerSettings.scrollSpeed
  const scrollRepeat = Number.isFinite(rawScrollRepeat) ? Math.min(8, Math.max(1, Math.round(rawScrollRepeat))) : defaultAppBannerSettings.scrollRepeat
  return {
    enabled,
    tone,
    message,
    scroll,
    scrollSpeed,
    scrollRepeat,
  }
}

function buildBannerMarqueeSegments(message: string, repeatCount: number): string[] {
  const trimmed = message.trim()
  if (!trimmed) return []
  const count = Math.min(8, Math.max(1, Math.round(repeatCount || 1)))
  return Array.from({ length: count }, () => trimmed)
}

type MasteryStatus = '' | 'Needs Work' | 'Getting There' | 'On Track' | 'Almost Mastered' | 'Mastered'

type PersistedAlgorithmStat = {
  codeSet: CodeSet
  sectionNumber: string
  title: string
  correctCount: number
  incorrectCount: number
  attempts: number
  accuracy: number
  correctStreak: number
  needScore: number
  status: MasteryStatus
}

type LeaderboardProfileSnapshot = {
  bio: string
  agency: string
  themeId: string
  nameStyle: NameStyle
  homeLeaderboardRotationMs: number
  studySeconds: number
  studyDayStreak: number
  studyModeCounts: Record<CodeFilter, number>
  masteredCodes: number | null
  currentActivity: CurrentUserActivity | null
}

type AppThemePreset = {
  id: string
  name: string
  swatch: string
  vars: {
    bg: string
    panel: string
    panelStrong: string
    border: string
    text: string
    muted: string
    accent: string
    good: string
    bad: string
    bodyRadial: string
    bodyBase: string
  }
}

const gameHighScoreSeed = {
  matching: 0,
  blaster: 0,
  caseFile: 0,
  rapidFire: 0,
  gravity: 0,
}
const avatarBucket = (import.meta.env.VITE_SUPABASE_AVATAR_BUCKET || 'avatars').trim()
const defaultAvatarUrl = `${import.meta.env.BASE_URL || '/'}default-avatar.svg`
const defaultAvatarPngUrl = `${import.meta.env.BASE_URL || '/'}default-avatar.png`

const codeSetLabel: Record<CodeSet, string> = {
  penal: 'Penal',
  hs: 'HS',
  vehicle: 'Vehicle',
}

const homeLeaderboardRotationDurations: Array<15 | 30 | 60> = [15, 30, 60]
const homeLeaderboardRotationCodeSets: CodeFilter[] = ['all', 'penal', 'hs', 'vehicle']
const duelLeaderboardModeOrder: DuelLeaderboardMode[] = ['all', 'matching', 'quiz']
const duelLeaderboardModeLabel: Record<DuelLeaderboardMode, string> = {
  all: 'All',
  matching: 'Matching',
  quiz: 'Quiz',
}
const homeLeaderboardRotationSteps = homeLeaderboardRotationDurations.flatMap((duration) =>
  homeLeaderboardRotationCodeSets.map((codeSet) => ({ duration, codeSet })),
)
const homeLeaderboardCardOrder: HomeLeaderboardCardKey[] = ['study_time', 'study_streak', 'matching', 'speed', 'mastered', 'duel_wins', 'duel_streak']
const homeLeaderboardCardLabel: Record<HomeLeaderboardCardKey, string> = {
  study_time: 'Most Study Time',
  study_streak: 'Best Study Streak',
  matching: 'Best Matching Score',
  speed: 'Best Speed Test Score',
  mastered: 'Most Mastered Codes',
  duel_wins: '1v1 Most Wins',
  duel_streak: '1v1 Streak Leaderboard',
}
const homeLeaderboardCardDescription: Record<HomeLeaderboardCardKey, string> = {
  study_time: 'Top total study minutes',
  study_streak: 'Longest active daily streak',
  matching: 'Highest matching game score',
  speed: 'Highest speed test score',
  mastered: 'Most 20-streak code masters',
  duel_wins: 'Most 1v1 wins',
  duel_streak: 'Largest active 1v1 streak',
}
const homeLeaderboardCardIcon: Record<HomeLeaderboardCardKey, AppIconName> = {
  study_time: 'study',
  study_streak: 'stats',
  matching: 'games',
  speed: 'speed',
  mastered: 'library',
  duel_wins: 'duel',
  duel_streak: 'duel',
}
const defaultHomeLeaderboardPreferences: HomeLeaderboardPreferences = {
  visibleCards: ['study_time', 'matching', 'speed'],
  duelWinsMode: 'all',
  duelStreakMode: 'all',
}
const homeEncouragementQuotes = [
  'Consistency compounds. One focused session today makes tomorrow easier.',
  'Train your weakest category first. Confidence follows reps.',
  'Small wins stack fast. Keep your streak alive and protect momentum.',
  'If you can answer under pressure, you can perform under pressure.',
  'Mastery is repetition with feedback. Stay with the process.',
]
const releaseNotesV040: Array<{ title: string; items: string[] }> = [
  {
    title: 'Study Guide Rebuild (v0.40)',
    items: [
      'Added a full Study Guide section inside Study Hub with a cleaner LD-by-LD layout, chapter navigation, and a left-side LD rail that scrolls independently.',
      'Rebuilt each LD study guide around official POST workbook material and the tested TTS points instead of a generic workbook dump.',
      'Each LD now shows TMAS exam coverage, chapter jump links, TTS breakdowns, explanations, and TMAS-style example scenarios tied to the tested objectives.',
    ],
  },
  {
    title: 'Practice Test Expansion',
    items: [
      'Added a dedicated Practice Test section in Study Hub with a full-screen test flow, cleaner setup, mobile-friendly layout, and improved results coaching.',
      'Added a TMAS 2 practice bank with randomized scenario-based testing, selectable test lengths, and LD performance coaching at the end of each run.',
      'Added a focused LD 15 / 16 / 20 practice test with concentrated arrest, search, and force scenarios for the most heavily tested TMAS material.',
    ],
  },
  {
    title: 'TMAS 2 Scenario and TTS Coverage',
    items: [
      'Expanded TMAS 2 scenarios and kept grouped four-question scenario flows so each scenario stays together during randomization.',
      'The focused LD 15 / 16 / 20 practice bank is now mapped directly to the official POST TTS objectives instead of generic labels.',
      'TMAS 2 scenario metadata now syncs correctly through Supabase, including grouped sub-questions and TMAS section tagging.',
    ],
  },
  {
    title: 'Quality and UX Updates',
    items: [
      'Practice tests now scale better for desktop and mobile, support real scrolling through long scenarios, and automatically move users into the explanation area after answering.',
      'Study Guide and Practice Test study time now counts only while the user is actively interacting, not while sitting AFK on the page.',
      'Profile views now show what another user is currently doing on the site, such as studying, testing, flashcards, 1v1, or practice tests.',
    ],
  },
]
const studyStreakMilestones = [3, 7, 14, 21, 30]

const defaultGamesModeSelection: GameModeSelection = { duration: 30, filter: 'all' }
const gamesModeStorageKey = 'leo_study_games_mode_selection'

function sanitizeGameModeSelection(input: unknown): GameModeSelection {
  if (!input || typeof input !== 'object') return { ...defaultGamesModeSelection }
  const value = input as Partial<GameModeSelection>
  const duration = [15, 30, 60].includes(Number(value.duration)) ? (Number(value.duration) as HomeDurationFilter) : defaultGamesModeSelection.duration
  const filter = (['all', 'penal', 'hs', 'vehicle'].includes(String(value.filter)) ? String(value.filter) : defaultGamesModeSelection.filter) as CodeFilter
  return { duration, filter }
}

function loadStoredGameModeSelection(): GameModeSelection {
  if (typeof window === 'undefined') return { ...defaultGamesModeSelection }
  try {
    const raw = window.localStorage.getItem(gamesModeStorageKey)
    if (!raw) return { ...defaultGamesModeSelection }
    return sanitizeGameModeSelection(JSON.parse(raw) as unknown)
  } catch {
    return { ...defaultGamesModeSelection }
  }
}

const tierLabel: Record<SupporterTier, string> = {
  free: 'Free',
  tier2: '$2 Supporter',
  tier5: '$5 Supporter+',
  tier10: '$10 Pro Supporter',
}

function normalizeRoutePath(path: string): string {
  const lowered = String(path || '/').toLowerCase()
  const normalized = lowered.replace(/\/+$/, '')
  return normalized.length > 0 ? normalized : '/'
}

const supporterTierOrder: SupporterTier[] = ['free', 'tier2', 'tier5', 'tier10']
const avatarCropFrameSize = 280
const avatarOutputSize = 512

function tierRank(tier: SupporterTier) {
  return supporterTierOrder.indexOf(tier)
}

function leaderboardCodeSetLabel(filter: CodeFilter | null | undefined) {
  if (!filter || filter === 'all') return 'All'
  return codeSetLabel[filter]
}

function normalizeAgencyKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\bpolice dept\b/g, 'police department')
    .replace(/\bpd\b/g, 'police department')
    .replace(/\bsheriff dept\b/g, 'sheriff department')
    .replace(/\s+/g, ' ')
    .trim()
}

function toTitleCase(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function canonicalAgencyName(rawAgency: string) {
  const normalized = normalizeAgencyKey(rawAgency)
  if (!normalized) return ''
  if (normalized.includes('fresno')) return 'Fresno Police Department'
  if (
    normalized.includes('los banos') ||
    normalized.includes('las banos') ||
    normalized.includes('los vanos')
  ) {
    return 'Los Banos Police Department'
  }
  return toTitleCase(normalized)
}

function sessionModeLabel(mode: SessionMode) {
  if (mode === 'study_test') return 'Study Test'
  if (mode === 'matching') return 'Matching'
  return 'Speed Test'
}

function sessionTrackKey(options: { mode: SessionMode; filter: CodeFilter; duration?: number | null; answerMode?: StudyAnswerMode; wrongness?: StudyWrongness; questionCount?: number }) {
  if (options.mode === 'study_test') {
    return `study_test|${options.filter}|${options.answerMode || 'multiple'}|${options.wrongness || 'needs_work'}|${options.questionCount || 0}`
  }
  return `${options.mode}|${options.duration || 0}|${options.filter}`
}

function getSessionTrack(stats: UserStats, trackKey: string): SessionTrack {
  return stats.sessionTracks[trackKey] || { lastAttempt: null, accuracyHistory: [], scoreHistory: [] }
}

function getLeaderboardPreview(
  entries: LeaderboardEntry[],
  game: 'Matching' | 'Speed Test',
  duration: number,
  filter: CodeFilter,
  currentUserId: string,
) {
  const scoped = topEntryPerUser(
    entries
      .filter((entry) => entry.game === game)
      .filter((entry) => entry.matchDuration === duration && entry.matchFilter === filter),
  )
  const preview = scoped.slice(0, 5).map(
    (entry, index): LeaderPreviewItem => ({
      rank: index + 1,
      playerName: entry.playerName,
      score: entry.score,
      isCurrentUser: entry.userId === currentUserId,
    }),
  )
  const currentRank = scoped.findIndex((entry) => entry.userId === currentUserId)
  return { preview, currentRank: currentRank >= 0 ? currentRank + 1 : null }
}

function topLeaderboardEntryForMode(
  entries: LeaderboardEntry[],
  options: {
    game: 'Matching' | 'Speed Test'
    duration: number
    filter: CodeFilter
    scope: 'weekly' | 'alltime'
    weeklyWindow?: { weekStartMs: number; nextWeekStartMs: number }
  },
) {
  const scoped = topEntryPerUser(
    entries
      .filter((entry) => entry.game === options.game)
      .filter((entry) => entry.matchDuration === options.duration && entry.matchFilter === options.filter)
      .filter((entry) => {
        if (options.scope !== 'weekly') return true
        if (!options.weeklyWindow) return false
        return entry.createdAt >= options.weeklyWindow.weekStartMs && entry.createdAt < options.weeklyWindow.nextWeekStartMs
      }),
  )
  return scoped[0] || null
}

function buildLeaderboardBoards(entries: LeaderboardEntry[], limit = 5): LeaderboardBoard[] {
  const durations: HomeDurationFilter[] = [15, 30, 60]
  const filters: CodeFilter[] = ['all', 'penal', 'hs', 'vehicle']
  const games: Array<'Matching' | 'Speed Test'> = ['Matching', 'Speed Test']
  const boards: LeaderboardBoard[] = []

  for (const game of games) {
    for (const duration of durations) {
      for (const filter of filters) {
        const scoped = entries
          .filter((entry) => entry.game === game)
          .filter((entry) => entry.matchDuration === duration && entry.matchFilter === filter)
        const deduped = topEntryPerUser(scoped)
        const trimmed = limit > 0 ? deduped.slice(0, limit) : deduped
        if (trimmed.length === 0) continue
        boards.push({
          key: `${game.toLowerCase()}-${duration}-${filter}`,
          game,
          duration,
          filter,
          entries: trimmed,
        })
      }
    }
  }

  return boards
}

function buildLeaderboardFirstPlaceCountMap(boards: LeaderboardBoard[]) {
  const counts: Record<string, number> = {}
  for (const board of boards) {
    const topUserId = board.entries[0]?.userId
    if (!topUserId) continue
    counts[topUserId] = (counts[topUserId] || 0) + 1
  }
  return counts
}

function buildWeeklyTopPerformer(entries: LeaderboardEntry[]): WeeklyPerformanceLeader | null {
  const boards = buildLeaderboardBoards(entries, 0)
  if (boards.length === 0) return null

  const byUser = new Map<
    string,
    {
      entry: LeaderboardEntry
      firstPlaceCount: number
      leaderboardAppearances: number
      totalScore: number
      bestSingleScore: number
    }
  >()

  for (const board of boards) {
    for (let index = 0; index < board.entries.length; index += 1) {
      const entry = board.entries[index]
      const current = byUser.get(entry.userId)
      if (!current) {
        byUser.set(entry.userId, {
          entry,
          firstPlaceCount: index === 0 ? 1 : 0,
          leaderboardAppearances: 1,
          totalScore: entry.score,
          bestSingleScore: entry.score,
        })
        continue
      }
      current.firstPlaceCount += index === 0 ? 1 : 0
      current.leaderboardAppearances += 1
      current.totalScore += entry.score
      current.bestSingleScore = Math.max(current.bestSingleScore, entry.score)
      if (entry.score > current.entry.score || (entry.score === current.entry.score && entry.round > current.entry.round)) {
        current.entry = entry
      }
    }
  }

  const sorted = [...byUser.values()].sort((left, right) =>
    right.firstPlaceCount - left.firstPlaceCount ||
    right.totalScore - left.totalScore ||
    right.bestSingleScore - left.bestSingleScore ||
    right.leaderboardAppearances - left.leaderboardAppearances,
  )

  return sorted[0] || null
}

function buildDepartmentLeaders(entries: LeaderboardEntry[]): DepartmentLeaderboardEntry[] {
  const leaderboardModeKey = (entry: LeaderboardEntry) =>
    `${entry.game.toLowerCase()}|${entry.matchDuration ?? 0}|${entry.matchFilter ?? 'all'}`

  const validEntries = topEntryPerUserMode(entries).filter((entry) => {
    const canonicalAgency = canonicalAgencyName(entry.agency || '')
    if (!canonicalAgency) return false
    return Number.isFinite(entry.score) && entry.score >= 0
  })

  if (validEntries.length === 0) return []

  const latestAgencyByUser = new Map<string, { agency: string; agencyKey: string; createdAt: number }>()
  for (const entry of validEntries) {
    const agency = canonicalAgencyName(entry.agency || '')
    if (!agency) continue
    const agencyKey = normalizeAgencyKey(agency)
    const current = latestAgencyByUser.get(entry.userId)
    if (!current) {
      latestAgencyByUser.set(entry.userId, { agency, agencyKey, createdAt: entry.createdAt })
      continue
    }
    const shouldReplace =
      entry.createdAt > current.createdAt ||
      (entry.createdAt === current.createdAt && current.agencyKey === 'unaffiliated' && agencyKey !== 'unaffiliated')
    if (shouldReplace) {
      latestAgencyByUser.set(entry.userId, { agency, agencyKey, createdAt: entry.createdAt })
    }
  }

  const modeScores = new Map<string, number[]>()
  for (const entry of validEntries) {
    const modeKey = leaderboardModeKey(entry)
    const list = modeScores.get(modeKey) || []
    list.push(Math.max(0, entry.score))
    modeScores.set(modeKey, list)
  }

  const modeSortedScores = new Map<string, number[]>()
  for (const [modeKey, scores] of modeScores.entries()) {
    modeSortedScores.set(modeKey, [...scores].sort((left, right) => left - right))
  }

  const percentileRank = (sortedScores: number[], score: number) => {
    const n = sortedScores.length
    if (n <= 1) return 1
    let lower = 0
    while (lower < n && sortedScores[lower] < score) lower += 1
    let upper = lower
    while (upper < n && sortedScores[upper] <= score) upper += 1
    const lessCount = lower
    const equalCount = upper - lower
    const percentile = (lessCount + (equalCount * 0.5)) / n
    return Math.max(0, Math.min(1, percentile))
  }

  const playerModePercentiles = new Map<
    string,
    {
      userId: string
      agency: string
      agencyKey: string
      modePercentiles: Map<string, number>
    }
  >()

  for (const entry of validEntries) {
    const userAgency = latestAgencyByUser.get(entry.userId)
    if (!userAgency) continue
    const agency = canonicalAgencyName(entry.agency || '')
    if (!agency) continue
    const agencyKey = normalizeAgencyKey(agency)
    if (agencyKey !== userAgency.agencyKey) continue
    const modeKey = leaderboardModeKey(entry)
    const sortedScores = modeSortedScores.get(modeKey)
    if (!sortedScores || sortedScores.length === 0) continue
    const percentile = percentileRank(sortedScores, Math.max(0, entry.score))
    const current = playerModePercentiles.get(entry.userId) || {
      userId: entry.userId,
      agency: userAgency.agency,
      agencyKey: userAgency.agencyKey,
      modePercentiles: new Map<string, number>(),
    }
    const existing = current.modePercentiles.get(modeKey)
    if (typeof existing !== 'number' || percentile > existing) {
      current.modePercentiles.set(modeKey, percentile)
    }
    playerModePercentiles.set(entry.userId, current)
  }

  const topModesPerPlayer = 3
  const departments = new Map<
    string,
    {
      key: string
      agency: string
      playerScores: number[]
      attempts: number
      players: Set<string>
    }
  >()

  for (const player of playerModePercentiles.values()) {
    const perModeScores = [...player.modePercentiles.values()]
    if (perModeScores.length === 0) continue
    const topModes = [...perModeScores].sort((left, right) => right - left).slice(0, topModesPerPlayer)
    const basePlayerScore = topModes.reduce((sum, value) => sum + value, 0) / topModes.length
    const modeCoverage = Math.min(1, perModeScores.length / topModesPerPlayer)
    const coverageFloor = 0.85
    const playerScore = basePlayerScore * (coverageFloor + ((1 - coverageFloor) * modeCoverage))

    const current = departments.get(player.agencyKey) || {
      key: player.agencyKey,
      agency: player.agency,
      playerScores: [],
      attempts: 0,
      players: new Set<string>(),
    }
    current.playerScores.push(playerScore)
    current.attempts += perModeScores.length
    current.players.add(player.userId)
    departments.set(player.agencyKey, current)
  }

  const topK = 6
  return [...departments.values()]
    .map((entry): DepartmentLeaderboardEntry => {
      const topPlayers = [...entry.playerScores].sort((left, right) => right - left).slice(0, topK)
      const topKUsed = Math.max(1, topPlayers.length)
      const normalizedScore = topPlayers.reduce((sum, value) => sum + value, 0) / topKUsed
      return {
        key: entry.key,
        agency: entry.agency,
        totalScore: Math.round(normalizedScore * 1000),
        averageScore: Math.round((normalizedScore * 1000) / 10),
        balancedScore: Math.round(normalizedScore * 1000),
        playerCount: entry.players.size,
        attempts: entry.attempts,
        topKUsed,
      }
    })
    .sort((left, right) =>
      right.balancedScore - left.balancedScore ||
      right.averageScore - left.averageScore ||
      right.playerCount - left.playerCount ||
      left.agency.localeCompare(right.agency),
    )
}

function topDepartmentEntryForScope(
  entries: LeaderboardEntry[],
  options: { scope: 'weekly' | 'alltime'; weeklyWindow?: { weekStartMs: number; nextWeekStartMs: number } },
): DepartmentLeaderboardEntry | null {
  const scoped = options.scope === 'weekly' && options.weeklyWindow
    ? entries.filter(
      (entry) =>
        entry.createdAt >= options.weeklyWindow!.weekStartMs &&
        entry.createdAt < options.weeklyWindow!.nextWeekStartMs,
    )
    : entries
  const leaders = buildDepartmentLeaders(scoped)
  return leaders[0] || null
}

async function createCroppedAvatarFile(sourceUrl: string, zoom: number, offsetX: number, offsetY: number, sourceName: string) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image for cropping.'))
    img.src = sourceUrl
  })

  const canvas = document.createElement('canvas')
  canvas.width = avatarOutputSize
  canvas.height = avatarOutputSize
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not initialize crop canvas.')

  const coverScale = Math.max(avatarOutputSize / image.naturalWidth, avatarOutputSize / image.naturalHeight) * zoom
  const drawWidth = image.naturalWidth * coverScale
  const drawHeight = image.naturalHeight * coverScale
  const offsetScale = avatarOutputSize / avatarCropFrameSize
  const drawX = (avatarOutputSize - drawWidth) / 2 + offsetX * offsetScale
  const drawY = (avatarOutputSize - drawHeight) / 2 + offsetY * offsetScale

  context.clearRect(0, 0, avatarOutputSize, avatarOutputSize)
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', 0.95))
  if (!blob) throw new Error('Could not create cropped image.')

  const baseName = sourceName.replace(/\.[^/.]+$/, '').replace(/[^a-z0-9-_]+/gi, '_').slice(0, 40) || 'avatar'
  return new File([blob], `${baseName}_cropped.png`, { type: 'image/png' })
}

const profileFontOptions = [
  { label: 'Inter', value: 'Inter, system-ui, sans-serif' },
  { label: 'Poppins', value: '"Poppins", "Inter", system-ui, sans-serif' },
  { label: 'Montserrat', value: '"Montserrat", "Inter", system-ui, sans-serif' },
  { label: 'Orbitron', value: '"Orbitron", "Inter", system-ui, sans-serif' },
  { label: 'Bebas Neue', value: '"Bebas Neue", "Inter", system-ui, sans-serif' },
  { label: 'Playfair', value: '"Playfair Display", serif' },
  { label: 'Merriweather', value: '"Merriweather", serif' },
  { label: 'Fira Code', value: '"Fira Code", "SFMono-Regular", Menlo, monospace' },
  { label: 'Pacifico', value: '"Pacifico", cursive' },
  { label: 'Caveat', value: '"Caveat", cursive' },
] as const

const defaultNameStyle: NameStyle = {
  color: '#ffd76e',
  fontFamily: profileFontOptions[0].value,
  fontWeight: 600,
  fontStyle: 'normal',
  glowEnabled: true,
  glowIntensity: 40,
}

const nameColorPalette = ['#ffd76e', '#f0f4ff', '#ff6f78', '#44de8e', '#65b7ff', '#c793ff', '#ff9f43', '#8ff3ff', '#ffec9f', '#ff8dbd']

const appThemePresets: AppThemePreset[] = [
  {
    id: 'midnight',
    name: 'Midnight Blue',
    swatch: 'linear-gradient(120deg, #152441, #0b1328)',
    vars: {
      bg: '#091224',
      panel: 'rgba(31, 47, 79, 0.76)',
      panelStrong: 'rgba(22, 36, 66, 0.94)',
      border: 'rgba(125, 153, 211, 0.28)',
      text: '#eef4ff',
      muted: '#aebddf',
      accent: '#4f8dff',
      good: '#2fd18d',
      bad: '#ff6b7f',
      bodyRadial: '#13284c',
      bodyBase: '#060d1d',
    },
  },
  {
    id: 'pastel-sky',
    name: 'Pastel Sky',
    swatch: 'linear-gradient(120deg, #9fc6ff, #d9e8ff)',
    vars: {
      bg: '#e9f3ff',
      panel: 'rgba(219, 233, 255, 0.86)',
      panelStrong: 'rgba(206, 223, 250, 0.96)',
      border: 'rgba(91, 124, 188, 0.3)',
      text: '#0f2141',
      muted: '#445d8d',
      accent: '#2f74e5',
      good: '#23935b',
      bad: '#c45263',
      bodyRadial: '#8db8f3',
      bodyBase: '#dceaff',
    },
  },
  {
    id: 'pastel-rose',
    name: 'Pastel Rose',
    swatch: 'linear-gradient(120deg, #ffd9e6, #ffe8d2)',
    vars: {
      bg: '#fff6fb',
      panel: 'rgba(255, 237, 245, 0.88)',
      panelStrong: 'rgba(255, 230, 240, 0.96)',
      border: 'rgba(188, 123, 150, 0.28)',
      text: '#2f1b30',
      muted: '#6f5270',
      accent: '#c35f92',
      good: '#2c9b6e',
      bad: '#cc5163',
      bodyRadial: '#ffd6ea',
      bodyBase: '#fff1f8',
    },
  },
  {
    id: 'pure-white',
    name: 'Clean White',
    swatch: 'linear-gradient(120deg, #ffffff, #eef3fb)',
    vars: {
      bg: '#f8fbff',
      panel: 'rgba(251, 253, 255, 0.94)',
      panelStrong: 'rgba(243, 248, 255, 0.98)',
      border: 'rgba(122, 140, 173, 0.25)',
      text: '#101a2e',
      muted: '#4c5f83',
      accent: '#2f70e1',
      good: '#27895b',
      bad: '#c3495f',
      bodyRadial: '#edf3fb',
      bodyBase: '#f7fafe',
    },
  },
  {
    id: 'pure-black',
    name: 'Obsidian Black',
    swatch: 'linear-gradient(120deg, #17191e, #07080a)',
    vars: {
      bg: '#07080a',
      panel: 'rgba(27, 30, 36, 0.84)',
      panelStrong: 'rgba(20, 22, 27, 0.95)',
      border: 'rgba(126, 133, 149, 0.26)',
      text: '#f4f6fb',
      muted: '#aeb6c8',
      accent: '#5f97ff',
      good: '#3dc088',
      bad: '#ff7080',
      bodyRadial: '#242833',
      bodyBase: '#050608',
    },
  },
  {
    id: 'golden',
    name: 'Executive Gold',
    swatch: 'linear-gradient(120deg, #3a2a0e, #d8ad4a 54%, #705118)',
    vars: {
      bg: '#15100a',
      panel: 'rgba(75, 56, 28, 0.78)',
      panelStrong: 'rgba(63, 45, 18, 0.94)',
      border: 'rgba(226, 188, 109, 0.4)',
      text: '#fff4d4',
      muted: '#e8d1a0',
      accent: '#e3bc68',
      good: '#5fd29b',
      bad: '#f28d78',
      bodyRadial: '#8f6c35',
      bodyBase: '#0f0a04',
    },
  },
  {
    id: 'ocean-mint',
    name: 'Ocean Mint',
    swatch: 'linear-gradient(120deg, #0e4a59, #2ea88f)',
    vars: {
      bg: '#05262f',
      panel: 'rgba(17, 73, 86, 0.8)',
      panelStrong: 'rgba(13, 60, 73, 0.93)',
      border: 'rgba(114, 197, 195, 0.3)',
      text: '#e8fcff',
      muted: '#a2d6dd',
      accent: '#47c4b2',
      good: '#67ebb0',
      bad: '#ff8f8a',
      bodyRadial: '#1b6878',
      bodyBase: '#041921',
    },
  },
  {
    id: 'lavender-dusk',
    name: 'Lavender Dusk',
    swatch: 'linear-gradient(120deg, #4a3f82, #8775d7)',
    vars: {
      bg: '#18152f',
      panel: 'rgba(55, 48, 97, 0.8)',
      panelStrong: 'rgba(46, 39, 84, 0.94)',
      border: 'rgba(170, 158, 247, 0.3)',
      text: '#f4f0ff',
      muted: '#c8c1eb',
      accent: '#9a87ff',
      good: '#67d7aa',
      bad: '#ff829f',
      bodyRadial: '#4f458e',
      bodyBase: '#120f24',
    },
  },
  {
    id: 'sage-stone',
    name: 'Sage Stone',
    swatch: 'linear-gradient(120deg, #1c342d, #9eb8a8)',
    vars: {
      bg: '#0f1d19',
      panel: 'rgba(45, 70, 61, 0.8)',
      panelStrong: 'rgba(30, 49, 42, 0.94)',
      border: 'rgba(146, 179, 160, 0.28)',
      text: '#ecf6f1',
      muted: '#b3cabc',
      accent: '#70b69a',
      good: '#55d198',
      bad: '#ff7f8e',
      bodyRadial: '#36574c',
      bodyBase: '#0a1310',
    },
  },
  {
    id: 'berry-night',
    name: 'Berry Night',
    swatch: 'linear-gradient(120deg, #351634, #a03e7d)',
    vars: {
      bg: '#160a18',
      panel: 'rgba(66, 28, 64, 0.82)',
      panelStrong: 'rgba(54, 20, 51, 0.94)',
      border: 'rgba(198, 113, 171, 0.3)',
      text: '#fdeefe',
      muted: '#deb4da',
      accent: '#de6cb5',
      good: '#5fd9a2',
      bad: '#ff8194',
      bodyRadial: '#6f2f66',
      bodyBase: '#120612',
    },
  },
]

const darkModeVars = {
  bg: '#070a2b',
  panel: '#1b2050',
  panelStrong: '#0f133d',
  sidebar: '#060928',
  border: '#2d356f',
  text: '#f4f6ff',
  muted: '#c1c8f2',
  textMuted: '#8b95ca',
  accent: '#4a63ff',
  good: '#2ed3ff',
  bad: '#ff5d73',
  gold: '#8ac4ff',
  bodyRadial: '#111744',
  bodyBase: '#070a2b',
} as const

const lightModeVars = {
  bg: '#f3f5fb',
  panel: '#ffffff',
  panelStrong: '#eef1f8',
  sidebar: '#ffffff',
  border: '#d8dfef',
  text: '#202a4c',
  muted: '#67759a',
  textMuted: '#8593b5',
  accent: '#4a63ff',
  good: '#3f63ff',
  bad: '#d44a66',
  gold: '#5f79ff',
  bodyRadial: '#eff2f9',
  bodyBase: '#f3f5fb',
} as const

const defaultUserStats: UserStats = {
  studySeconds: 0,
  studyDayStreak: 0,
  bestStudyDayStreak: 0,
  lastStudyDay: '',
  gamePlays: {
    matching: 0,
    speed: 0,
  },
  flashcardsReviewed: 0,
  scenariosReviewed: 0,
  studyModeCounts: {
    all: 0,
    penal: 0,
    hs: 0,
    vehicle: 0,
  },
  sessionTracks: {},
  sessionTimeline: [],
}

const stripeTierLinks: Partial<Record<Exclude<SupporterTier, 'free'>, string>> = {
  tier2: (import.meta.env.VITE_STRIPE_LINK_TIER2 || '').trim(),
  tier5: (import.meta.env.VITE_STRIPE_LINK_TIER5 || '').trim(),
  tier10: (import.meta.env.VITE_STRIPE_LINK_TIER10 || '').trim(),
}
const appContentSource = String(import.meta.env.VITE_CONTENT_SOURCE || 'local')
  .trim()
  .toLowerCase()

function sanitizeDisplayMode(value: unknown): DisplayMode {
  return value === 'light' ? 'light' : 'dark'
}

function sanitizeCurrentUserActivity(value: unknown): CurrentUserActivity | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<CurrentUserActivity>
  const key = typeof raw.key === 'string' ? raw.key.trim() : ''
  const label = typeof raw.label === 'string' ? raw.label.trim() : ''
  const updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt.trim() : ''
  if (!key || !label) return null
  return {
    key,
    label,
    updatedAt,
  }
}

function describeProfileCurrentActivity(
  activity: CurrentUserActivity | null,
  nowMs: number,
  presence?: PresenceStatus | null,
): ProfileActivityDisplay {
  const activityLabel = String(activity?.label || '').trim()
  const fallbackLabel = activityLabel ? `Last activity: ${activityLabel}` : 'No recent activity'

  if (presence === 'active') {
    return {
      state: 'active',
      statusLabel: 'Active',
      mainLabel: activityLabel || 'Active on site',
      subLabel: 'Active now',
    }
  }

  if (presence === 'away') {
    return {
      state: 'idle',
      statusLabel: 'Idling',
      mainLabel: 'Idling',
      subLabel: fallbackLabel,
    }
  }

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
  const elapsedMs = Math.max(0, nowMs - updatedAtMs)
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

function sanitizeHomeLeaderboardPreferences(input: unknown): HomeLeaderboardPreferences {
  const fallback: HomeLeaderboardPreferences = {
    visibleCards: [...defaultHomeLeaderboardPreferences.visibleCards],
    duelWinsMode: defaultHomeLeaderboardPreferences.duelWinsMode,
    duelStreakMode: defaultHomeLeaderboardPreferences.duelStreakMode,
  }
  if (!input || typeof input !== 'object') return fallback
  const value = input as Partial<HomeLeaderboardPreferences>
  const hasVisibleCards = Array.isArray(value.visibleCards)
  const rawCards = hasVisibleCards ? (value.visibleCards as HomeLeaderboardCardKey[]) : []
  const normalizedVisible = homeLeaderboardCardOrder.filter((card) => rawCards.includes(card))
  const visibleCards = hasVisibleCards ? normalizedVisible : [...fallback.visibleCards]
  const duelWinsMode = duelLeaderboardModeOrder.includes(String(value.duelWinsMode) as DuelLeaderboardMode)
    ? (String(value.duelWinsMode) as DuelLeaderboardMode)
    : fallback.duelWinsMode
  const duelStreakMode = duelLeaderboardModeOrder.includes(String(value.duelStreakMode) as DuelLeaderboardMode)
    ? (String(value.duelStreakMode) as DuelLeaderboardMode)
    : fallback.duelStreakMode
  return {
    visibleCards,
    duelWinsMode,
    duelStreakMode,
  }
}

function createEmptyEditorItem(): ContentEditorItem {
  return {
    id: '',
    category: 'pc',
    type: 'code',
    title: '',
    question: '',
    answer: '',
    tags: [],
    difficulty: '',
    codeSection: '',
    explanation: '',
    sourceUrl: '',
    scenario: '',
    scenarioQuestions: [],
    keyPoints: [],
    isPublished: true,
  }
}

function shortText(text: string, max = 140) {
  const clean = text.trim()
  return clean.length <= max ? clean : `${clean.slice(0, max)}...`
}

function formatStudyTime(seconds: number) {
  if (seconds <= 0) return '0m'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

function getCurrentWeeklyWindowMs(nowMs: number) {
  const now = new Date(nowMs)
  const weekStart = new Date(now)
  weekStart.setHours(0, 0, 0, 0)
  const dayOfWeek = weekStart.getDay() // 0 = Sunday, 1 = Monday
  const daysSinceMonday = (dayOfWeek + 6) % 7
  weekStart.setDate(weekStart.getDate() - daysSinceMonday)
  const nextWeekStart = new Date(weekStart)
  nextWeekStart.setDate(nextWeekStart.getDate() + 7)
  return {
    weekStartMs: weekStart.getTime(),
    nextWeekStartMs: nextWeekStart.getTime(),
  }
}

function dayKeyUtc(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDayKeyLocal(dayKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(year, month - 1, day)
  parsed.setHours(0, 0, 0, 0)
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null
  return parsed
}

function dayGapFromToday(dayKey: string) {
  if (!dayKey.trim()) return null
  const parsed = parseDayKeyLocal(dayKey)
  if (!parsed) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.floor((today.getTime() - parsed.getTime()) / (24 * 60 * 60 * 1000))
}

function studyStreakLapseInfo(stats: UserStats) {
  const gapDays = dayGapFromToday(stats.lastStudyDay)
  if (gapDays === null || gapDays <= 1 || stats.studyDayStreak <= 0) return null
  return {
    gapDays,
    previousStreak: Math.max(0, Math.floor(stats.studyDayStreak)),
  }
}

function applyStudyDayActivity(stats: UserStats) {
  const today = dayKeyUtc()
  if (stats.lastStudyDay === today) return stats
  const gapDays = dayGapFromToday(stats.lastStudyDay)
  const continuesStreak = gapDays === 1
  const nextStreak = continuesStreak ? Math.max(1, stats.studyDayStreak) + 1 : 1
  return {
    ...stats,
    lastStudyDay: today,
    studyDayStreak: nextStreak,
    bestStudyDayStreak: Math.max(stats.bestStudyDayStreak, nextStreak),
  }
}

function dedupeSections(sections: CodeSection[]) {
  const map = new Map<string, CodeSection>()
  for (const section of sections) {
    map.set(`${section.codeSet}|${section.sectionNumber.toLowerCase()}`, section)
  }
  return [...map.values()].sort((a, b) => a.sectionNumber.localeCompare(b.sectionNumber))
}

function contentItemToSection(item: ContentBankItem): CodeSection | null {
  const codeSet = categoryToCodeSet(item.category, item.codeSection || '')
  if (!codeSet) return null

  const sectionNumber = (item.codeSection || item.answer || '').trim()
  const title = item.title.trim()
  const text = (item.explanation || item.question || '').trim()
  if (!sectionNumber || !title) return null

  return {
    id: item.id.trim() || crypto.randomUUID(),
    codeSet,
    sectionNumber,
    title,
    text,
  }
}

function topEntryPerUser(entries: LeaderboardEntry[]) {
  return Array.from(
    entries.reduce<Map<string, LeaderboardEntry>>((accumulator, entry) => {
      const key = entry.userId.toLowerCase()
      const current = accumulator.get(key)
      if (!current || entry.score > current.score || (entry.score === current.score && entry.round > current.round)) {
        accumulator.set(key, entry)
      }
      return accumulator
    }, new Map<string, LeaderboardEntry>()),
  )
    .map(([, entry]) => entry)
    .sort((left, right) => right.score - left.score || right.round - left.round)
}

function topEntryPerUserMode(entries: LeaderboardEntry[]) {
  return Array.from(
    entries.reduce<Map<string, LeaderboardEntry>>((accumulator, entry) => {
      const key = `${entry.userId.toLowerCase()}|${entry.game.toLowerCase()}|${entry.matchDuration ?? 0}|${entry.matchFilter ?? 'all'}`
      const current = accumulator.get(key)
      if (
        !current ||
        entry.score > current.score ||
        (entry.score === current.score && entry.round > current.round) ||
        (entry.score === current.score && entry.round === current.round && entry.createdAt > current.createdAt)
      ) {
        accumulator.set(key, entry)
      }
      return accumulator
    }, new Map<string, LeaderboardEntry>()),
  )
    .map(([, entry]) => entry)
    .sort((left, right) => right.score - left.score || right.round - left.round || right.createdAt - left.createdAt)
}

function isLeaderboardScoreImprovement(
  score: number,
  round: number,
  current: Pick<LeaderboardEntry, 'score' | 'round'> | null | undefined,
) {
  if (!current) return true
  if (score > current.score) return true
  return score === current.score && round > current.round
}

function shuffle<T>(array: T[]) {
  const clone = [...array]
  for (let index = clone.length - 1; index > 0; index -= 1) {
    const nextIndex = Math.floor(Math.random() * (index + 1))
    ;[clone[index], clone[nextIndex]] = [clone[nextIndex], clone[index]]
  }
  return clone
}

function buildQuestions(sections: CodeSection[]) {
  const questions: QuizQuestion[] = []

  for (const section of sections) {
    const pool = sections.filter((candidate) => candidate.codeSet === section.codeSet && candidate.id !== section.id)
    if (pool.length < 3) continue

    const distractorByTitle = shuffle(pool).slice(0, 3)
    const sectionChoices = shuffle([section.sectionNumber, ...distractorByTitle.map((item) => item.sectionNumber)])
    questions.push({
      id: crypto.randomUUID(),
      codeSet: section.codeSet,
      linkedSectionNumber: section.sectionNumber,
      prompt: `Which section number matches: ${section.title}?`,
      choices: sectionChoices,
      correctIndex: sectionChoices.indexOf(section.sectionNumber),
      explanation: `${section.sectionNumber}: ${section.title}. ${shortText(section.text)}`,
    })

    const distractorBySection = shuffle(pool).slice(0, 3)
    const titleChoices = shuffle([section.title, ...distractorBySection.map((item) => item.title)])
    questions.push({
      id: crypto.randomUUID(),
      codeSet: section.codeSet,
      linkedSectionNumber: section.sectionNumber,
      prompt: `What best matches ${section.sectionNumber}?`,
      choices: titleChoices,
      correctIndex: titleChoices.indexOf(section.title),
      explanation: `${section.sectionNumber}: ${section.title}. ${shortText(section.text)}`,
    })
  }

  return questions
}

function performanceNeedWorkWeight(stats?: CodePerformance) {
  const correct = stats?.correctCount ?? 0
  const incorrect = stats?.incorrectCount ?? 0
  const attempts = correct + incorrect
  const errorRate = (incorrect + 1) / (attempts + 2)
  const streak = stats?.correctStreak ?? 0

  let weight = 1 + errorRate * 4 + Math.max(0, incorrect - correct * 0.5) * 0.2
  if (attempts === 0) weight += 0.35
  if (streak >= 20) weight *= 0.18
  else if (streak >= 10) weight *= 0.45
  else if (streak >= 5) weight *= 0.7
  return Math.max(0.1, Math.min(weight, 7))
}

function buildAdaptiveFlashcardOrder(
  flashcards: Flashcard[],
  performance: Record<string, CodePerformance>,
) {
  const baseIds = flashcards.map((card) => card.id)
  const extraIds: string[] = []
  for (const card of flashcards) {
    const key = performanceKey(card.codeSet, card.front)
    const stats = performance[key]
    const correct = stats?.correctCount ?? 0
    const incorrect = stats?.incorrectCount ?? 0
    const streak = stats?.correctStreak ?? 0
    const attempts = correct + incorrect
    const errorRate = (incorrect + 1) / (attempts + 2)
    let repeats = errorRate >= 0.7 ? 4 : errorRate >= 0.55 ? 3 : errorRate >= 0.4 ? 2 : 1
    if (streak >= 20) repeats = 1
    else if (streak >= 10) repeats = Math.max(1, repeats - 1)
    for (let index = 1; index < repeats; index += 1) extraIds.push(card.id)
  }

  const shuffledBase = shuffle(baseIds)
  const shuffledExtras = shuffle(extraIds)
  const shuffled = [...shuffledBase]
  for (let index = 0; index < shuffledExtras.length; index += 1) {
    const insertAt = Math.min(shuffled.length, 1 + index * 2)
    shuffled.splice(insertAt, 0, shuffledExtras[index])
  }
  for (let index = 1; index < shuffled.length; index += 1) {
    if (shuffled[index] !== shuffled[index - 1]) continue
    const swapIndex = shuffled.findIndex((item, candidateIndex) => candidateIndex > index && item !== shuffled[index])
    if (swapIndex > index) [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled
}

function weightedSampleUnique<T>(items: T[], count: number, weightOf: (item: T) => number) {
  const source = [...items]
  const result: T[] = []
  while (source.length > 0 && result.length < count) {
    const weights = source.map((item) => Math.max(0.01, weightOf(item)))
    const total = weights.reduce((sum, value) => sum + value, 0)
    let draw = Math.random() * total
    let selectedIndex = 0
    for (let index = 0; index < source.length; index += 1) {
      draw -= weights[index]
      if (draw <= 0) {
        selectedIndex = index
        break
      }
    }
    result.push(source[selectedIndex])
    source.splice(selectedIndex, 1)
  }
  return result
}

function categoryToCodeSet(category: string, codeSection = ''): CodeSet | null {
  const normalized = category.trim().toLowerCase()
  const section = codeSection.trim().toLowerCase()
  if (['pc', 'penal', 'penal code'].includes(normalized)) return 'penal'
  if (['hs', 'h&s', 'health', 'health & safety', 'health and safety'].includes(normalized)) return 'hs'
  if (['vc', 'vehicle', 'vehicle code'].includes(normalized)) return 'vehicle'
  if (section.startsWith('pc')) return 'penal'
  if (section.startsWith('h&s') || section.startsWith('hs')) return 'hs'
  if (section.startsWith('vc')) return 'vehicle'
  return null
}

function normalizeScenarioSection(value: ScenarioBankItem['tmasSet'] | null | undefined): ScenarioTrainingSection {
  return value === 'tmas2' ? 'tmas2' : 'tmas1'
}

function buildScenarioChoices(choices: string[], correctChoice: string) {
  const randomizedChoices = shuffle([...choices])
  return {
    choices: randomizedChoices,
    correctIndex: Math.max(0, randomizedChoices.indexOf(correctChoice)),
  }
}

function buildLegacyScenarioQuestion(row: ScenarioBankItem): ScenarioQuestion[] {
  const fallbackDistractors = [
    'Document observations only and continue routine contact',
    'Investigate further using articulable facts and legal authority',
    'Insufficient facts for immediate enforcement action',
    'Reassess scene safety and gather additional witness evidence',
  ]
  const codeSet = categoryToCodeSet(row.category, row.codeSection || '') || 'penal'
  const prompt = row.scenario.trim()
  const providedChoices = row.questions.map((item) => item.trim()).filter(Boolean).slice(0, 4)
  const correctChoice = (row.expectedAnswer || '').trim()
  const tmasSet = normalizeScenarioSection(row.tmasSet)

  if (providedChoices.length >= 2 && correctChoice && providedChoices.includes(correctChoice)) {
    const { choices, correctIndex } = buildScenarioChoices(providedChoices, correctChoice)
    return [
      {
        id: row.id,
        codeSet,
        tmasSet,
        scenarioGroupId: row.id,
        scenarioTitle: row.title.trim() || 'Scenario',
        scenarioStem: prompt,
        questionNumber: 1,
        questionCount: 1,
        prompt,
        choices,
        correctIndex,
        explanation: row.explanation?.trim() || (row.keyPoints || []).join(' '),
      },
    ]
  }

  const fallback = correctChoice || row.keyPoints?.[0] || row.title || 'Use the best lawful response.'
  const distractors = fallbackDistractors
    .filter((item) => item !== fallback)
    .slice(0, 3)
  const { choices, correctIndex } = buildScenarioChoices([fallback, ...distractors].slice(0, 4), fallback)

  return [
    {
      id: row.id,
      codeSet,
      tmasSet,
      scenarioGroupId: row.id,
      scenarioTitle: row.title.trim() || 'Scenario',
      scenarioStem: prompt,
      questionNumber: 1,
      questionCount: 1,
      prompt,
      choices,
      correctIndex,
      explanation: row.explanation?.trim() || (row.keyPoints || []).join(' '),
    },
  ]
}

function buildGroupedScenarioQuestions(row: ScenarioBankItem, subQuestions: ScenarioBankSubQuestion[]): ScenarioQuestion[] {
  const codeSet = categoryToCodeSet(row.category, row.codeSection || '') || 'penal'
  const scenarioStem = row.scenario.trim()
  const scenarioTitle = row.title.trim() || 'Scenario'
  const tmasSet = normalizeScenarioSection(row.tmasSet)

  return subQuestions.map((subQuestion, index) => {
    const { choices, correctIndex } = buildScenarioChoices(subQuestion.choices, subQuestion.expectedAnswer)
    return {
      id: subQuestion.id,
      codeSet,
      tmasSet,
      scenarioGroupId: row.id,
      scenarioTitle,
      scenarioStem,
      questionNumber: index + 1,
      questionCount: subQuestions.length,
      prompt: subQuestion.prompt,
      choices,
      correctIndex,
      explanation: subQuestion.explanation?.trim() || row.explanation?.trim() || '',
    }
  })
}

function buildScenarioDeck(rows: ScenarioBankItem[], section: ScenarioTrainingSection) {
  const filteredRows = rows.filter((row) => normalizeScenarioSection(row.tmasSet) === section)

  if (section === 'tmas2') {
    return shuffle(filteredRows).flatMap((row) => {
      const subQuestions = (row.subQuestions || []).filter((subQuestion) => subQuestion.choices.length >= 2)
      if (subQuestions.length === 0) return []
      return buildGroupedScenarioQuestions(row, subQuestions)
    })
  }

  return shuffle(
    filteredRows.flatMap((row) => {
      const subQuestions = (row.subQuestions || []).filter((subQuestion) => subQuestion.choices.length >= 2)
      if (subQuestions.length > 0) return buildGroupedScenarioQuestions(row, subQuestions)
      return buildLegacyScenarioQuestion(row)
    }),
  )
}

type FireParticle = {
  id: number
  left: string
  size: number
  delay: string
  duration: string
  drift: string
}

function streakToFireLevel(streak: number) {
  return streak >= 100 ? 8 : streak >= 75 ? 7 : streak >= 50 ? 6 : streak >= 40 ? 5 : streak >= 30 ? 4 : streak >= 25 ? 3 : streak >= 10 ? 2 : streak >= 5 ? 1 : 0
}

function buildFireOption(level: number, hostWidth: number): FireFlameOption | undefined {
  if (level === 0) return undefined
  const preset = {
    1: { particleNum: 18, particleDistance: 10 },
    2: { particleNum: 28, particleDistance: 11 },
    3: { particleNum: 40, particleDistance: 12 },
    4: { particleNum: 54, particleDistance: 13 },
    5: { particleNum: 70, particleDistance: 15 },
    6: { particleNum: 88, particleDistance: 17 },
    7: { particleNum: 108, particleDistance: 19 },
    8: { particleNum: 132, particleDistance: 21 },
  } as const
  const heights = { 1: 120, 2: 132, 3: 146, 4: 160, 5: 176, 6: 194, 7: 214, 8: 236 } as const
  const current = preset[level as keyof typeof preset]
  const height = heights[level as keyof typeof heights]
  const width = Math.max(320, hostWidth || 0)
  return {
    painterType: 'canvas',
    w: width,
    h: height,
    x: Math.floor(width / 2),
    y: height - 1,
    mousemove: false,
    innerColor: '#ffe0a4',
    outerColor: '#ff5a24',
    ...current,
  }
}

function buildFireParticles(level: number): FireParticle[] {
  if (level === 0) return []
  const counts = [0, 18, 30, 44, 62, 84, 108, 136, 168]
  const count = counts[level] ?? 180
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    left: `${(index * 29) % 100}%`,
    size: 8 + ((index * 5 + level * 3) % 16),
    delay: `${(index % 20) * 0.045}s`,
    duration: `${0.9 + ((index * 7 + level) % 10) * 0.12}s`,
    drift: `${((index % 3) - 1) * (8 + level * 2)}px`,
  }))
}

function performanceKey(codeSet: CodeSet, section: string) {
  return `${codeSet}|${section.trim().toLowerCase()}`
}

function mastery(performance?: CodePerformance): MasteryStatus {
  if (!performance || performance.correctCount + performance.incorrectCount === 0) return ''
  const correct = performance.correctCount ?? 0
  const incorrect = performance.incorrectCount ?? 0
  const attempts = correct + incorrect
  const streak = performance.correctStreak ?? 0
  const accuracy = attempts > 0 ? correct / attempts : 0

  if (streak >= 20) return 'Mastered'
  if (streak >= 15 || (attempts >= 16 && accuracy >= 0.85)) return 'Almost Mastered'
  if (streak >= 10 || (attempts >= 10 && accuracy >= 0.7)) return 'On Track'
  if (streak >= 4 || (attempts >= 5 && accuracy >= 0.55)) return 'Getting There'
  return 'Needs Work'
}

function masteryBadgeClass(status: MasteryStatus) {
  if (status === 'Mastered') return 'badge-mastered'
  if (status === 'Almost Mastered') return 'badge-almost'
  if (status === 'On Track') return 'badge-track'
  if (status === 'Getting There') return 'badge-getting'
  return 'badge-work'
}

function buildAlgorithmSnapshot(
  sections: CodeSection[],
  performance: Record<string, CodePerformance>,
): Record<string, PersistedAlgorithmStat> {
  const snapshot: Record<string, PersistedAlgorithmStat> = {}
  for (const section of sections) {
    const key = performanceKey(section.codeSet, section.sectionNumber)
    const stats = performance[key]
    const correct = stats?.correctCount ?? 0
    const incorrect = stats?.incorrectCount ?? 0
    const attempts = correct + incorrect
    const accuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : 0
    const needScore = Number(performanceNeedWorkWeight(stats).toFixed(4))
    snapshot[key] = {
      codeSet: section.codeSet,
      sectionNumber: section.sectionNumber,
      title: section.title,
      correctCount: correct,
      incorrectCount: incorrect,
      attempts,
      accuracy,
      correctStreak: stats?.correctStreak ?? 0,
      needScore,
      status: mastery(stats),
    }
  }
  return snapshot
}

function sanitizeNameStyle(input: unknown): NameStyle {
  if (!input || typeof input !== 'object') return { ...defaultNameStyle }
  const value = input as Partial<NameStyle>
  const allowedFonts = new Set<string>(profileFontOptions.map((option) => option.value))
  const normalizedGlow = typeof value.glowIntensity === 'number' ? Math.max(0, Math.min(100, Math.floor(value.glowIntensity))) : defaultNameStyle.glowIntensity
  return {
    color: typeof value.color === 'string' && /^#([0-9a-f]{6})$/i.test(value.color) ? value.color : defaultNameStyle.color,
    fontFamily: typeof value.fontFamily === 'string' && allowedFonts.has(value.fontFamily) ? value.fontFamily : defaultNameStyle.fontFamily,
    fontWeight: value.fontWeight === 700 ? 700 : 600,
    fontStyle: value.fontStyle === 'italic' ? 'italic' : 'normal',
    glowEnabled: Boolean(value.glowEnabled),
    glowIntensity: normalizedGlow,
  }
}

function sanitizeNamePresets(input: unknown): NameStylePreset[] {
  if (!Array.isArray(input)) return []
  return input
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const value = entry as Partial<NameStylePreset>
      const name = typeof value.name === 'string' ? value.name.trim().slice(0, 24) : ''
      if (!name) return null
      return {
        id: typeof value.id === 'string' && value.id.trim().length > 0 ? value.id : crypto.randomUUID(),
        name,
        style: sanitizeNameStyle(value.style),
      } satisfies NameStylePreset
    })
    .filter((entry): entry is NameStylePreset => Boolean(entry))
    .slice(0, 8)
}

function sanitizeSystemNoticesSeen(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return [...new Set(input.map((entry) => String(entry || '').trim()).filter(Boolean))].slice(-24)
}

function sanitizeLeaderboardRotationMs(input: unknown) {
  if (typeof input !== 'number' || Number.isNaN(input)) return defaultLeaderboardRotationMs
  return Math.max(2000, Math.min(12000, Math.round(input)))
}

function countMasteredCodesFromSnapshot(snapshot: unknown): number | null {
  if (!snapshot || typeof snapshot !== 'object') return null
  const entries = Object.values(snapshot as Record<string, unknown>)
  let masteredCount = 0
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const stat = entry as Partial<PersistedAlgorithmStat>
    if (stat.status === 'Mastered') {
      masteredCount += 1
      continue
    }
    if (typeof stat.correctStreak === 'number' && stat.correctStreak >= 20) {
      masteredCount += 1
    }
  }
  return masteredCount
}

function countMasteredCodesFromPerformanceMap(performance: unknown): number {
  if (!performance || typeof performance !== 'object') return 0
  let masteredCount = 0
  for (const entry of Object.values(performance as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object') continue
    const stats = entry as Partial<CodePerformance>
    const candidate: CodePerformance = {
      correctCount: typeof stats.correctCount === 'number' ? Math.max(0, Math.floor(stats.correctCount)) : 0,
      incorrectCount: typeof stats.incorrectCount === 'number' ? Math.max(0, Math.floor(stats.incorrectCount)) : 0,
      correctStreak: typeof stats.correctStreak === 'number' ? Math.max(0, Math.floor(stats.correctStreak)) : 0,
    }
    if (mastery(candidate) === 'Mastered') masteredCount += 1
  }
  return masteredCount
}

function parseLeaderboardProfileSnapshot(input: unknown): LeaderboardProfileSnapshot {
  const fallback: LeaderboardProfileSnapshot = {
    bio: '',
    agency: defaultAgency,
    themeId: appThemePresets[0].id,
    nameStyle: { ...defaultNameStyle },
    homeLeaderboardRotationMs: defaultLeaderboardRotationMs,
    studySeconds: 0,
    studyDayStreak: 0,
    studyModeCounts: { ...defaultUserStats.studyModeCounts },
    masteredCodes: null,
    currentActivity: null,
  }
  if (!input || typeof input !== 'object') return fallback

  const value = input as Partial<ProfileDetails>
  const statsRaw = value.stats && typeof value.stats === 'object' ? (value.stats as Record<string, unknown>) : {}
  const studyModeCountsRaw =
    statsRaw.studyModeCounts && typeof statsRaw.studyModeCounts === 'object'
      ? (statsRaw.studyModeCounts as Record<string, unknown>)
      : {}
  const normalizeCount = (rawValue: unknown) =>
    typeof rawValue === 'number' && Number.isFinite(rawValue) ? Math.max(0, Math.floor(rawValue)) : 0

  return {
    bio: typeof value.bio === 'string' ? value.bio : fallback.bio,
    agency: typeof value.agency === 'string' && value.agency.trim().length > 0 ? value.agency : fallback.agency,
    themeId: getThemePreset(typeof value.themeId === 'string' ? value.themeId : fallback.themeId).id,
    nameStyle: sanitizeNameStyle(value.nameStyle),
    homeLeaderboardRotationMs: sanitizeLeaderboardRotationMs(value.homeLeaderboardRotationMs),
    studySeconds: normalizeCount(statsRaw.studySeconds),
    studyDayStreak: normalizeCount(statsRaw.studyDayStreak),
    studyModeCounts: {
      all: normalizeCount(studyModeCountsRaw.all),
      penal: normalizeCount(studyModeCountsRaw.penal),
      hs: normalizeCount(studyModeCountsRaw.hs),
      vehicle: normalizeCount(studyModeCountsRaw.vehicle),
    },
    masteredCodes: countMasteredCodesFromSnapshot(value.algorithmSnapshot),
    currentActivity: sanitizeCurrentUserActivity(value.currentActivity),
  }
}

function mostStudiedModeFromCounts(studyModeCounts: Record<CodeFilter, number>): CodeFilter | null {
  const ranked: CodeFilter[] = ['penal', 'hs', 'vehicle', 'all']
  let winner: CodeFilter | null = null
  let max = 0
  for (const mode of ranked) {
    const value = studyModeCounts[mode] || 0
    if (value > max) {
      max = value
      winner = mode
    }
  }
  return max > 0 ? winner : null
}

function sanitizeUserStats(input: unknown): UserStats {
  if (!input || typeof input !== 'object') return { ...defaultUserStats, gamePlays: { ...defaultUserStats.gamePlays }, studyModeCounts: { ...defaultUserStats.studyModeCounts } }
  const value = input as Partial<UserStats>
  const gamePlays = value.gamePlays && typeof value.gamePlays === 'object' ? value.gamePlays : {}
  const studyModeCounts = value.studyModeCounts && typeof value.studyModeCounts === 'object' ? value.studyModeCounts : {}
  const legacyLastAttempts = (value as { lastAttempts?: unknown }).lastAttempts
  const legacyAccuracyHistory = (value as { accuracyHistory?: unknown }).accuracyHistory
  const sessionTracks = value.sessionTracks && typeof value.sessionTracks === 'object' ? value.sessionTracks : {}
  const sanitizeAttempt = (entry: unknown): SessionAttemptSnapshot | null => {
    if (!entry || typeof entry !== 'object') return null
    const value = entry as Partial<SessionAttemptSnapshot>
    const filter = (['all', 'penal', 'hs', 'vehicle'].includes(String(value.filter)) ? String(value.filter) : 'all') as CodeFilter
    return {
      accuracy: typeof value.accuracy === 'number' ? Math.max(0, Math.min(100, Math.round(value.accuracy))) : 0,
      score: typeof value.score === 'number' ? Math.max(0, Math.round(value.score)) : 0,
      correct: typeof value.correct === 'number' ? Math.max(0, Math.round(value.correct)) : 0,
      incorrect: typeof value.incorrect === 'number' ? Math.max(0, Math.round(value.incorrect)) : 0,
      rank: typeof value.rank === 'number' && value.rank > 0 ? Math.round(value.rank) : null,
      duration: typeof value.duration === 'number' && value.duration > 0 ? Math.round(value.duration) : null,
      filter,
      at: typeof value.at === 'number' ? value.at : Date.now(),
    }
  }
  const sanitizeHistory = (entry: unknown) =>
    Array.isArray(entry)
      ? entry
          .map((value) => (typeof value === 'number' ? Math.max(0, Math.min(100, Math.round(value))) : null))
          .filter((value): value is number => value !== null)
          .slice(-12)
      : []
  const sanitizeScoreHistory = (entry: unknown) =>
    Array.isArray(entry)
      ? entry
          .map((value) => (typeof value === 'number' ? Math.max(0, Math.round(value)) : null))
          .filter((value): value is number => value !== null)
          .slice(-12)
      : []
  const sanitizeTrack = (entry: unknown): SessionTrack => {
    if (!entry || typeof entry !== 'object') return { lastAttempt: null, accuracyHistory: [], scoreHistory: [] }
    const value = entry as { lastAttempt?: unknown; accuracyHistory?: unknown; scoreHistory?: unknown }
    const lastAttempt = sanitizeAttempt(value.lastAttempt)
    const scoreHistory = sanitizeScoreHistory(value.scoreHistory)
    const normalizedScoreHistory = scoreHistory.length > 0
      ? scoreHistory
      : lastAttempt
        ? [lastAttempt.score]
        : []
    return {
      lastAttempt,
      accuracyHistory: sanitizeHistory(value.accuracyHistory),
      scoreHistory: normalizedScoreHistory,
    }
  }
  const sanitizeTimelinePoint = (entry: unknown): SessionTimelinePoint | null => {
    if (!entry || typeof entry !== 'object') return null
    const value = entry as Partial<SessionTimelinePoint>
    const mode = (['study_test', 'matching', 'speed'].includes(String(value.mode)) ? String(value.mode) : '') as SessionMode | ''
    const filter = (['all', 'penal', 'hs', 'vehicle'].includes(String(value.filter)) ? String(value.filter) : '') as CodeFilter | ''
    if (!mode || !filter) return null
    const accuracy = typeof value.accuracy === 'number' ? Math.max(0, Math.min(100, Math.round(value.accuracy))) : null
    const score = typeof (value as { score?: unknown }).score === 'number'
      ? Math.max(0, Math.round((value as { score?: number }).score || 0))
      : null
    const at = typeof value.at === 'number' ? value.at : null
    if (accuracy === null || at === null) return null
    return { mode, filter, accuracy, score: score ?? accuracy, at }
  }
  const sessionTimeline = Array.isArray(value.sessionTimeline)
    ? value.sessionTimeline
        .map((entry) => sanitizeTimelinePoint(entry))
        .filter((entry): entry is SessionTimelinePoint => Boolean(entry))
        .sort((left, right) => left.at - right.at)
        .slice(-320)
    : []
  const normalizedTracks = Object.entries(sessionTracks as Record<string, unknown>).reduce<Record<string, SessionTrack>>((accumulator, [key, value]) => {
    if (!key.trim()) return accumulator
    accumulator[key] = sanitizeTrack(value)
    return accumulator
  }, {})
  if (Object.keys(normalizedTracks).length === 0) {
    const legacyAttemptsMap = legacyLastAttempts && typeof legacyLastAttempts === 'object' ? legacyLastAttempts as Record<string, unknown> : {}
    const legacyHistoryMap = legacyAccuracyHistory && typeof legacyAccuracyHistory === 'object' ? legacyAccuracyHistory as Record<string, unknown> : {}
    const legacyModes: SessionMode[] = ['study_test', 'matching', 'speed']
    for (const mode of legacyModes) {
      const legacyAttempt = sanitizeAttempt(legacyAttemptsMap[mode])
      normalizedTracks[sessionTrackKey({ mode, filter: 'all', duration: mode === 'study_test' ? null : 0 })] = {
        lastAttempt: legacyAttempt,
        accuracyHistory: sanitizeHistory(legacyHistoryMap[mode]),
        scoreHistory: legacyAttempt ? [legacyAttempt.score] : [],
      }
    }
  }
  return {
    studySeconds: typeof value.studySeconds === 'number' ? Math.max(0, Math.floor(value.studySeconds)) : 0,
    studyDayStreak: typeof value.studyDayStreak === 'number' ? Math.max(0, Math.floor(value.studyDayStreak)) : 0,
    bestStudyDayStreak: typeof value.bestStudyDayStreak === 'number' ? Math.max(0, Math.floor(value.bestStudyDayStreak)) : 0,
    lastStudyDay: typeof value.lastStudyDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.lastStudyDay) ? value.lastStudyDay : '',
    gamePlays: {
      matching: typeof (gamePlays as Record<string, unknown>).matching === 'number' ? Math.max(0, Math.floor((gamePlays as Record<string, number>).matching)) : 0,
      speed: typeof (gamePlays as Record<string, unknown>).speed === 'number' ? Math.max(0, Math.floor((gamePlays as Record<string, number>).speed)) : 0,
    },
    flashcardsReviewed: typeof value.flashcardsReviewed === 'number' ? Math.max(0, Math.floor(value.flashcardsReviewed)) : 0,
    scenariosReviewed: typeof value.scenariosReviewed === 'number' ? Math.max(0, Math.floor(value.scenariosReviewed)) : 0,
    studyModeCounts: {
      all: typeof (studyModeCounts as Record<string, unknown>).all === 'number' ? Math.max(0, Math.floor((studyModeCounts as Record<string, number>).all)) : 0,
      penal: typeof (studyModeCounts as Record<string, unknown>).penal === 'number' ? Math.max(0, Math.floor((studyModeCounts as Record<string, number>).penal)) : 0,
      hs: typeof (studyModeCounts as Record<string, unknown>).hs === 'number' ? Math.max(0, Math.floor((studyModeCounts as Record<string, number>).hs)) : 0,
      vehicle: typeof (studyModeCounts as Record<string, unknown>).vehicle === 'number' ? Math.max(0, Math.floor((studyModeCounts as Record<string, number>).vehicle)) : 0,
    },
    sessionTracks: normalizedTracks,
    sessionTimeline,
  }
}

function hexToRgba(hex: string, alpha: number) {
  const value = hex.replace('#', '')
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function glowNormalization(style: NameStyle) {
  const fontKey = style.fontFamily.toLowerCase()
  let multiplier = 1
  if (fontKey.includes('pacifico')) multiplier *= 0.46
  if (fontKey.includes('caveat')) multiplier *= 0.62
  if (fontKey.includes('bebas')) multiplier *= 0.54
  if (fontKey.includes('playfair') || fontKey.includes('merriweather')) multiplier *= 0.9
  if (style.fontWeight >= 700) multiplier *= 0.9
  if (style.fontStyle === 'italic') multiplier *= 0.94
  return Math.max(0.5, Math.min(1, multiplier))
}

function displayNameStyle(nameStyle: NameStyle | undefined, tier: SupporterTier): CSSProperties | undefined {
  if (!nameStyle || tier !== 'tier10') return undefined
  const style = sanitizeNameStyle(nameStyle)
  const normalized = glowNormalization(style)
  const glowAlpha = Math.min(0.9, (0.12 + style.glowIntensity / 140) * normalized)
  const glowRadius = (4 + style.glowIntensity / 2.4) * normalized
  const glowColor = hexToRgba(style.color, glowAlpha)
  return {
    color: style.color,
    WebkitTextFillColor: style.color,
    fontFamily: style.fontFamily,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    textShadow: style.glowEnabled
      ? `0 0 ${glowRadius}px ${glowColor}, 0 0 ${Math.max(1.8, glowRadius * 0.42)}px ${glowColor}`
      : undefined,
  }
}

function getThemePreset(themeId?: string) {
  const fallback = appThemePresets[0]
  if (!themeId) return fallback
  return appThemePresets.find((theme) => theme.id === themeId) || fallback
}

function sanitizeState(input: unknown): PersistedState {
  const fallback: PersistedState = {
    performance: {},
    highScores: gameHighScoreSeed,
    bestStreak: 0,
    profileDetails: {
      bio: '',
      agency: defaultAgency,
      displayMode: 'dark',
      homeLeaderboardRotationMs: defaultLeaderboardRotationMs,
      homeLeaderboardPreferences: { ...defaultHomeLeaderboardPreferences, visibleCards: [...defaultHomeLeaderboardPreferences.visibleCards] },
      themeId: appThemePresets[0].id,
      nameStyle: { ...defaultNameStyle },
      namePresets: [],
      systemNoticesSeen: [],
      stats: { ...defaultUserStats, gamePlays: { ...defaultUserStats.gamePlays }, studyModeCounts: { ...defaultUserStats.studyModeCounts } },
      currentActivity: null,
    },
  }

  if (!input || typeof input !== 'object') {
    return fallback
  }

  const state = input as Partial<PersistedState>
  return {
    performance: state.performance && typeof state.performance === 'object' ? state.performance : {},
    highScores: {
      ...gameHighScoreSeed,
      ...(state.highScores && typeof state.highScores === 'object' ? state.highScores : {}),
    },
    bestStreak: typeof state.bestStreak === 'number' ? Math.max(0, Math.floor(state.bestStreak)) : 0,
    profileDetails:
      state.profileDetails && typeof state.profileDetails === 'object'
        ? {
            bio: String((state.profileDetails as Partial<ProfileDetails>).bio || ''),
            agency: String((state.profileDetails as Partial<ProfileDetails>).agency || ''),
            displayMode: sanitizeDisplayMode((state.profileDetails as Partial<ProfileDetails>).displayMode),
            homeLeaderboardRotationMs: sanitizeLeaderboardRotationMs((state.profileDetails as Partial<ProfileDetails>).homeLeaderboardRotationMs),
            homeLeaderboardPreferences: sanitizeHomeLeaderboardPreferences((state.profileDetails as Partial<ProfileDetails>).homeLeaderboardPreferences),
            themeId: getThemePreset(String((state.profileDetails as Partial<ProfileDetails>).themeId || appThemePresets[0].id)).id,
            nameStyle: sanitizeNameStyle((state.profileDetails as Partial<ProfileDetails>).nameStyle),
            namePresets: sanitizeNamePresets((state.profileDetails as Partial<ProfileDetails>).namePresets),
            systemNoticesSeen: sanitizeSystemNoticesSeen((state.profileDetails as Partial<ProfileDetails>).systemNoticesSeen),
            stats: sanitizeUserStats((state.profileDetails as Partial<ProfileDetails>).stats),
            currentActivity: sanitizeCurrentUserActivity((state.profileDetails as Partial<ProfileDetails>).currentActivity),
            algorithmSnapshot:
              (state.profileDetails as Partial<ProfileDetails>).algorithmSnapshot &&
              typeof (state.profileDetails as Partial<ProfileDetails>).algorithmSnapshot === 'object'
                ? ((state.profileDetails as Partial<ProfileDetails>).algorithmSnapshot as Record<string, PersistedAlgorithmStat>)
                : undefined,
          }
        : {
            bio: '',
            agency: defaultAgency,
            displayMode: 'dark',
            homeLeaderboardRotationMs: defaultLeaderboardRotationMs,
            homeLeaderboardPreferences: { ...defaultHomeLeaderboardPreferences, visibleCards: [...defaultHomeLeaderboardPreferences.visibleCards] },
            themeId: appThemePresets[0].id,
            nameStyle: { ...defaultNameStyle },
            namePresets: [],
            systemNoticesSeen: [],
            stats: { ...defaultUserStats, gamePlays: { ...defaultUserStats.gamePlays }, studyModeCounts: { ...defaultUserStats.studyModeCounts } },
            currentActivity: null,
          },
  }
}

function normalizeAvatarPath(rawValue: string): string {
  const value = rawValue.trim()
  if (!value) {
    return ''
  }

  if (!/^https?:\/\//i.test(value)) {
    const trimmedLeadingSlash = value.replace(/^\/+/, '')
    if (trimmedLeadingSlash.startsWith(`${avatarBucket}/`)) {
      return trimmedLeadingSlash.slice(avatarBucket.length + 1)
    }
    return trimmedLeadingSlash
  }

  const marker = `/storage/v1/object/public/${avatarBucket}/`
  const markerIndex = value.indexOf(marker)
  if (markerIndex < 0) {
    return ''
  }
  return value.slice(markerIndex + marker.length).replace(/^\/+/, '')
}

function toPublicAvatarUrl(rawValue: string): string {
  const avatarPath = normalizeAvatarPath(rawValue)
  if (!avatarPath) return ''
  if (avatarPath === defaultAvatarUrl.replace(/^\/+/, '')) return ''
  if (!avatarPath.includes('/')) return ''

  if (supabase) {
    const { data } = supabase.storage.from(avatarBucket).getPublicUrl(avatarPath)
    if (data?.publicUrl) return data.publicUrl
  }

  const baseUrl = (import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '')
  if (!baseUrl) return ''
  return `${baseUrl}/storage/v1/object/public/${avatarBucket}/${avatarPath}`
}

function mapProfileRow(row: Record<string, unknown>, userId: string): UserProfile {
  const avatarPath = String(row.avatar_path || '')
  return {
    userId,
    username: String(row.username || ''),
    avatarPath,
    avatarUrl: toPublicAvatarUrl(avatarPath) || defaultAvatarUrl,
    supporterTier: (['free', 'tier2', 'tier5', 'tier10'].includes(String(row.supporter_tier))
      ? String(row.supporter_tier)
      : 'free') as SupporterTier,
    isOwner: Boolean(row.is_owner),
    createdAt: String(row.created_at || ''),
  }
}

function rowToBugReport(row: Record<string, unknown>): BugReport | null {
  const id = String(row.id || '').trim()
  const reporterUserId = String(row.reporter_user_id || '').trim()
  const summary = String(row.summary || '').trim()
  const details = String(row.details || '').trim()
  if (!id || !reporterUserId || !summary || !details) return null

  const createdAtRaw = Date.parse(String(row.created_at || ''))
  const updatedAtRaw = Date.parse(String(row.updated_at || ''))

  return {
    id,
    reporterUserId,
    reporterName: String(row.reporter_name || 'User').trim() || 'User',
    reporterEmail: String(row.reporter_email || '').trim(),
    pagePath: String(row.page_path || '').trim() || '/home',
    severity: sanitizeBugSeverity(row.severity),
    summary,
    details,
    status: sanitizeBugStatus(row.status),
    ownerNote: String(row.owner_note || '').trim(),
    userAgent: String(row.user_agent || '').trim(),
    viewport: String(row.viewport || '').trim(),
    createdAt: Number.isFinite(createdAtRaw) ? createdAtRaw : Date.now(),
    updatedAt: Number.isFinite(updatedAtRaw) ? updatedAtRaw : Date.now(),
  }
}

function rowToEditorItem(row: Record<string, unknown>): ContentEditorItem | null {
  const id = String(row.id || '').trim()
  const category = String(row.category || '').trim().toLowerCase()
  const type = String(row.type || 'code').trim().toLowerCase()
  const title = String(row.title || '').trim()
  if (!id || !category || !title) return null
  if (!['code', 'scenario', 'question'].includes(type)) return null

  return {
    id,
    category,
    type: type as ContentEditorItem['type'],
    title,
    question: String(row.question || '').trim(),
    answer: String(row.answer || '').trim(),
    tags: Array.isArray(row.tags) ? row.tags.map((entry) => String(entry).trim()).filter(Boolean) : [],
    difficulty: String(row.difficulty || '').trim(),
    codeSection: String(row.code_section || '').trim(),
    explanation: String(row.explanation || '').trim(),
    sourceUrl: String(row.source_url || '').trim(),
    scenario: String(row.scenario || '').trim(),
    scenarioQuestions: Array.isArray(row.scenario_questions) ? row.scenario_questions.map((entry) => String(entry).trim()).filter(Boolean) : [],
    keyPoints: Array.isArray(row.key_points) ? row.key_points.map((entry) => String(entry).trim()).filter(Boolean) : [],
    isPublished: row.is_published === false ? false : true,
  }
}

function localBundleToEditorItems(): ContentEditorItem[] {
  const bundle = loadLocalContentBundle()
  for (const warning of bundle.warnings) console.warn(warning)

  const codeItems = bundle.codeItems.map(
    (item): ContentEditorItem => ({
      id: item.id,
      category: item.category,
      type: 'code',
      title: item.title,
      question: item.question,
      answer: item.answer || '',
      tags: item.tags || [],
      difficulty: item.difficulty || '',
      codeSection: item.codeSection || '',
      explanation: item.explanation || '',
      sourceUrl: item.sourceUrl || '',
      scenario: '',
      scenarioQuestions: [],
      keyPoints: [],
      isPublished: true,
    }),
  )

  const scenarioEditorItems = bundle.scenarioItems.map(
    (item): ContentEditorItem => ({
      id: item.id,
      category: item.category,
      type: 'scenario',
      title: item.title,
      question: '',
      answer: item.expectedAnswer || '',
      tags: item.tags || [],
      difficulty: item.difficulty || '',
      codeSection: item.codeSection || '',
      explanation: item.explanation || '',
      sourceUrl: item.sourceUrl || '',
      scenario: item.scenario,
      scenarioQuestions: item.questions || [],
      keyPoints: item.keyPoints || [],
      isPublished: true,
    }),
  )

  return [...codeItems, ...scenarioEditorItems]
}

function mergeContentById<T extends { id: string }>(primary: T[], fallback: T[]) {
  const merged = new Map<string, T>()
  for (const item of primary) merged.set(item.id, item)
  for (const item of fallback) {
    if (!merged.has(item.id)) merged.set(item.id, item)
  }
  return [...merged.values()]
}

function tierNameClass(tier: SupporterTier) {
  if (tier === 'tier2') return 'tier-name tier-name-red'
  if (tier === 'tier5') return 'tier-name tier-name-green'
  if (tier === 'tier10') return 'tier-name tier-name-gold'
  return 'tier-name'
}

function displayNameClass(tier: SupporterTier, hasStyle: boolean) {
  if (tier === 'tier10' && hasStyle) return 'tier-name-custom'
  return tierNameClass(tier)
}

function leaderboardNameSizeClass(name: string) {
  const length = name.trim().length
  if (length >= 30) return 'is-very-long'
  if (length >= 20) return 'is-long'
  return ''
}

function leaderboardNameLayoutClass(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const longestWord = words.reduce((maxLength, word) => Math.max(maxLength, word.length), 0)

  const classes: string[] = []
  if (words.length >= 2) classes.push('is-multi-word')
  if (words.length === 1 && longestWord >= 16) classes.push('is-single-word-long')
  if (words.length === 1 && longestWord >= 24) classes.push('is-single-word-very-long')
  return classes.join(' ')
}

function LeaderboardPlayerName({ entry }: { entry: LeaderNameEntry }) {
  const streak = Math.max(0, Math.floor(entry.duelCurrentWinStreak || 0))
  const nameSizeClass = leaderboardNameSizeClass(entry.playerName)
  const nameLayoutClass = leaderboardNameLayoutClass(entry.playerName)
  return (
    <span className="leader-player-name-block">
      <span
        className={`${displayNameClass(entry.supporterTier, true)} leader-player-name-text ${nameSizeClass} ${nameLayoutClass}`.trim()}
        style={displayNameStyle(entry.nameStyle, entry.supporterTier)}
      >
        {entry.playerName}
      </span>
      {streak > 0 ? (
        <span className="leader-win-streak-inline" aria-label={`Current 1v1 win streak: ${streak}`}>
          <span className="leader-win-streak-icon" aria-hidden>🔥</span>
          <span>{streak}</span>
        </span>
      ) : null}
    </span>
  )
}

function AppIcon({ name, className = '' }: { name: AppIconName; className?: string }) {
  const commonProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (name === 'study') {
    return (
      <svg {...commonProps} className={className} aria-hidden>
        <path d="M4 5.5h7a3 3 0 0 1 3 3V19H7a3 3 0 0 0-3 3Z" />
        <path d="M20 5.5h-7a3 3 0 0 0-3 3V19h7a3 3 0 0 1 3 3Z" />
      </svg>
    )
  }
  if (name === 'games') {
    return (
      <svg {...commonProps} className={className} aria-hidden>
        <path d="M8 10h8a4 4 0 0 1 3.7 5.5l-1.4 3.3a2 2 0 0 1-3 .9l-2.3-1.6a2 2 0 0 0-2.3 0l-2.3 1.6a2 2 0 0 1-3-.9L4.3 15.5A4 4 0 0 1 8 10Z" />
        <path d="M8 14h2" />
        <path d="M9 13v2" />
        <circle cx="15.5" cy="14.5" r="0.8" fill="currentColor" />
        <circle cx="17.8" cy="16.1" r="0.8" fill="currentColor" />
      </svg>
    )
  }
  if (name === 'scenarios') {
    return (
      <svg {...commonProps} className={className} aria-hidden>
        <path d="M12 3 4 7v5c0 5 3.4 8.7 8 9.9 4.6-1.2 8-4.9 8-9.9V7Z" />
        <path d="m9.3 12 1.9 1.9 3.8-3.8" />
      </svg>
    )
  }
  if (name === 'support') {
    return (
      <svg {...commonProps} className={className} aria-hidden>
        <path d="M12 21s-7-4.3-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.7-7 10-7 10Z" />
      </svg>
    )
  }
  if (name === 'library') {
    return (
      <svg {...commonProps} className={className} aria-hidden>
        <path d="M4 5h4v15H4zM10 3h4v17h-4zM16 7h4v13h-4z" />
      </svg>
    )
  }
  if (name === 'warning') {
    return (
      <svg {...commonProps} className={className} aria-hidden>
        <path d="M12 3 1.8 20.5a1.4 1.4 0 0 0 1.2 2.1h18a1.4 1.4 0 0 0 1.2-2.1L12 3Z" />
        <path d="M12 9v5" />
        <path d="M12 17.3h.01" />
      </svg>
    )
  }
  if (name === 'chat') {
    return (
      <svg {...commonProps} className={className} aria-hidden>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    )
  }
  if (name === 'leaderboards') {
    return (
      <svg {...commonProps} className={className} aria-hidden>
        <path d="M4 18h16" />
        <path d="M6 18V10" />
        <path d="M12 18V6" />
        <path d="M18 18V13" />
      </svg>
    )
  }
  if (name === 'settings') {
    return (
      <svg {...commonProps} className={className} aria-hidden>
        <circle cx="12" cy="12" r="3.2" />
        <path d="M19.2 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1.1 1.1a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1 1 0 0 1-1 1h-1.6a1 1 0 0 1-1-1v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4 0l-1.1-1.1a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1 1 0 0 1-1-1v-1.6a1 1 0 0 1 1-1h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 0 1 0-1.4l1.1-1.1a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1 1 0 0 1 1-1h1.6a1 1 0 0 1 1 1v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 0 1 1.4 0l1.1 1.1a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a1 1 0 0 1 1 1v1.6a1 1 0 0 1-1 1H20a1 1 0 0 0-.8.6Z" />
      </svg>
    )
  }
  if (name === 'stats') {
    return (
      <svg {...commonProps} className={className} aria-hidden>
        <path d="M4 20V8" />
        <path d="M10 20V4" />
        <path d="M16 20v-7" />
        <path d="M22 20v-4" />
      </svg>
    )
  }
  if (name === 'speed') {
    return (
      <svg {...commonProps} className={className} aria-hidden>
        <path d="M5 15a7 7 0 1 1 14 0" />
        <path d="M12 15l3.6-3.6" />
        <path d="M12 20v-1" />
      </svg>
    )
  }
  if (name === 'duel') {
    return (
      <svg {...commonProps} className={className} aria-hidden>
        <circle cx="8" cy="8" r="3" />
        <circle cx="16" cy="8" r="3" />
        <path d="M3.5 19c.8-3 2.4-4.5 4.5-4.5S11.7 16 12.5 19" />
        <path d="M11.5 19c.8-3 2.4-4.5 4.5-4.5s3.7 1.5 4.5 4.5" />
      </svg>
    )
  }
  if (name === 'updates') {
    return (
      <svg {...commonProps} className={className} aria-hidden>
        <path d="M12 3.8v3.1" />
        <path d="M12 17.1v3.1" />
        <path d="m6.7 6.7 2.2 2.2" />
        <path d="m15.1 15.1 2.2 2.2" />
        <path d="M3.8 12h3.1" />
        <path d="M17.1 12h3.1" />
        <path d="m6.7 17.3 2.2-2.2" />
        <path d="m15.1 8.9 2.2-2.2" />
        <circle cx="12" cy="12" r="2.2" />
      </svg>
    )
  }
  if (name === 'flashcards') {
    return (
      <svg {...commonProps} className={className} aria-hidden>
        <rect x="3.5" y="8" width="13" height="10" rx="2.2" />
        <rect x="7.5" y="4.5" width="13" height="10" rx="2.2" />
        <path d="M10 8h6" />
        <path d="M10 11h8" />
      </svg>
    )
  }
  if (name === 'test') {
    return (
      <svg {...commonProps} className={className} aria-hidden>
        <rect x="5" y="3.5" width="14" height="17" rx="2.5" />
        <path d="M9 8h6" />
        <path d="M9 12h2.5" />
        <path d="m14.4 12 1.2 1.2 2.2-2.2" />
        <path d="M9 16h2.5" />
        <path d="m14.4 16 1.2 1.2 2.2-2.2" />
      </svg>
    )
  }
  return (
    <svg {...commonProps} className={className} aria-hidden>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10.5V20h13v-9.5" />
    </svg>
  )
}

function StatsIcon({ name, className = '' }: { name: StatsIconName; className?: string }) {
  const commonProps = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  if (name === 'overview') {
    return (
      <svg {...commonProps} className={className} aria-hidden>
        <path d="M4 19V9" />
        <path d="M10 19V5" />
        <path d="M16 19v-7" />
        <path d="M22 19v-4" />
      </svg>
    )
  }
  if (name === 'time') {
    return (
      <svg {...commonProps} className={className} aria-hidden>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l2.7 1.7" />
      </svg>
    )
  }
  if (name === 'words') {
    return (
      <svg {...commonProps} className={className} aria-hidden>
        <path d="M4 6h16" />
        <path d="M4 11h12" />
        <path d="M4 16h10" />
        <path d="M18 14v6" />
        <path d="m15.5 17 2.5-3 2.5 3" />
      </svg>
    )
  }
  if (name === 'penal') {
    return (
      <svg {...commonProps} className={className} aria-hidden>
        <path d="M12 4v16" />
        <path d="M6 8h12" />
        <path d="M7 8 5 13h5" />
        <path d="m17 8 2 5h-5" />
      </svg>
    )
  }
  if (name === 'flashcards') {
    return (
      <svg {...commonProps} className={className} aria-hidden>
        <rect x="3.5" y="8" width="13" height="10" rx="2.2" />
        <rect x="7.5" y="4.5" width="13" height="10" rx="2.2" />
        <path d="M10 8h6" />
        <path d="M10 11h8" />
      </svg>
    )
  }
  if (name === 'scenarios') {
    return <AppIcon name="scenarios" className={className} />
  }
  if (name === 'streak') {
    return (
      <svg {...commonProps} className={className} aria-hidden>
        <path d="M12 3c2 2.2 2.8 4 2.5 5.7-.2 1.2-.9 2.2-2.1 3.3" />
        <path d="M9.5 9.4c-2 1.8-3 3.4-3 5.3 0 3 2.4 5.3 5.5 5.3s5.5-2.3 5.5-5.3c0-2.1-1.2-3.9-3.5-5.8" />
      </svg>
    )
  }
  if (name === 'game') {
    return <AppIcon name="games" className={className} />
  }
  return <AppIcon name="study" className={className} />
}

function buildTrendPath(points: number[]) {
  const width = 320
  const height = 116
  const paddingX = 14
  const paddingY = 12
  const usableWidth = width - paddingX * 2
  const usableHeight = height - paddingY * 2
  const safePoints = points.length > 1 ? points : [points[0] ?? 0, points[0] ?? 0]
  const finitePoints: number[] = []
  let minValue = Number.POSITIVE_INFINITY
  let maxValue = Number.NEGATIVE_INFINITY
  for (const rawValue of safePoints) {
    const value = Number.isFinite(rawValue) ? rawValue : 0
    finitePoints.push(value)
    if (value < minValue) minValue = value
    if (value > maxValue) maxValue = value
  }
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    minValue = 0
    maxValue = 0
  }
  const spread = maxValue - minValue
  const padding = spread > 0 ? spread * 0.15 : Math.max(5, Math.abs(maxValue) * 0.2 + 2)
  const rangeMin = minValue - padding
  const rangeMax = maxValue + padding
  const range = Math.max(1, rangeMax - rangeMin)
  const stepX = safePoints.length > 1 ? usableWidth / (safePoints.length - 1) : 0
  const coords = finitePoints.map((value, index) => {
    const clamped = Math.max(rangeMin, Math.min(rangeMax, value))
    const x = paddingX + index * stepX
    const y = paddingY + ((rangeMax - clamped) / range) * usableHeight
    return { x, y }
  })
  return {
    width,
    height,
    coords,
    path: coords.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' '),
  }
}

function compressTrendPoints(points: number[], maxPoints = 60) {
  if (!Array.isArray(points) || points.length === 0) return []
  if (!Number.isFinite(maxPoints) || maxPoints < 2) return [Math.round(Number(points[points.length - 1] || 0))]
  const finitePoints = points.filter((value) => Number.isFinite(value))
  if (finitePoints.length === 0) return []
  if (finitePoints.length <= maxPoints) return finitePoints

  const lastIndex = finitePoints.length - 1
  const bucketTotals = new Array<number>(maxPoints).fill(0)
  const bucketCounts = new Array<number>(maxPoints).fill(0)
  for (let index = 0; index < finitePoints.length; index += 1) {
    const bucket = lastIndex === 0
      ? 0
      : Math.min(maxPoints - 1, Math.floor((index / lastIndex) * (maxPoints - 1)))
    bucketTotals[bucket] += finitePoints[index]
    bucketCounts[bucket] += 1
  }

  const compressed: number[] = []
  for (let bucket = 0; bucket < maxPoints; bucket += 1) {
    if (bucketCounts[bucket] <= 0) continue
    compressed.push(Math.round(bucketTotals[bucket] / bucketCounts[bucket]))
  }
  return compressed.length > 0 ? compressed : finitePoints.slice(-maxPoints)
}

function compressTimelinePoints(points: ScoreTimelinePoint[], maxPoints = remoteTimelineMaxPoints) {
  if (!Array.isArray(points) || points.length === 0) return []
  if (!Number.isFinite(maxPoints) || maxPoints < 2) return [points[points.length - 1]]
  if (points.length <= maxPoints) return points

  const bucketSize = points.length / maxPoints
  const compressed: ScoreTimelinePoint[] = []
  for (let bucket = 0; bucket < maxPoints; bucket += 1) {
    const start = Math.floor(bucket * bucketSize)
    const end = Math.max(start + 1, Math.floor((bucket + 1) * bucketSize))
    const sample = points[Math.min(points.length - 1, end - 1)] || points[start]
    if (sample) compressed.push(sample)
  }

  const latest = points[points.length - 1]
  if (compressed.length > 0 && latest && compressed[compressed.length - 1].at !== latest.at) {
    compressed[compressed.length - 1] = latest
  }
  return compressed.slice(-maxPoints)
}

type InteractiveTrendChartProps = {
  chartId: string
  values: number[]
  ariaLabel: string
  pointLabel?: string
  valueSuffix?: string
  formatValue?: (value: number) => string
  emptyMessage?: string
  className?: string
  describePoint?: (index: number, total: number, value: number) => string
  describeSuggestion?: (value: number, delta: number | null) => string
}

function InteractiveTrendChart({
  chartId,
  values,
  ariaLabel,
  pointLabel = 'Point',
  valueSuffix = '',
  formatValue,
  emptyMessage = 'No trend data yet.',
  className = '',
  describePoint,
  describeSuggestion,
}: InteractiveTrendChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const chartValues = useMemo(() => compressTrendPoints(values, interactiveTrendMaxPoints), [values])
  const trend = useMemo(() => (chartValues.length > 0 ? buildTrendPath(chartValues) : null), [chartValues])

  useEffect(() => {
    if (hoveredIndex !== null && hoveredIndex >= chartValues.length) {
      setHoveredIndex(null)
    }
  }, [chartValues.length, hoveredIndex])

  const activeIndex = chartValues.length === 0
    ? -1
    : hoveredIndex !== null && hoveredIndex >= 0 && hoveredIndex < chartValues.length
      ? hoveredIndex
      : chartValues.length - 1
  const activePoint = trend && activeIndex >= 0 ? trend.coords[activeIndex] : null
  const activeValue = activeIndex >= 0 ? chartValues[activeIndex] : null
  const previousValue = activeIndex > 0 ? chartValues[activeIndex - 1] : null
  const delta = activeValue !== null && previousValue !== null
    ? activeValue - previousValue
    : null
  const pointDescription = activeValue === null
    ? ''
    : describePoint
      ? describePoint(activeIndex, chartValues.length, activeValue)
      : `${pointLabel} ${activeIndex + 1}`
  const renderValue = (value: number) => {
    if (formatValue) return formatValue(value)
    return `${Math.round(value)}${valueSuffix}`
  }
  const suggestion = activeValue === null
    ? 'Complete more sessions to unlock deeper trend guidance.'
    : describeSuggestion
      ? describeSuggestion(activeValue, delta)
      : delta === null
        ? 'First tracked point. Keep building consistency.'
        : delta > 0
          ? 'Your trend is improving. Keep this pace.'
          : delta < 0
            ? 'Trend dipped. Review misses and rebound next run.'
            : 'Stable trend. Keep stacking clean reps.'

  if (!trend || !activePoint || activeValue === null) {
    return <p className="muted tiny">{emptyMessage}</p>
  }

  return (
    <>
      <svg
        viewBox={`0 0 ${trend.width} ${trend.height}`}
        className={`session-trend-chart interactive-trend-chart ${className}`.trim()}
        role="img"
        aria-label={ariaLabel}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <path d={trend.path} className="session-trend-glow" />
        <path d={trend.path} className="session-trend-line" />
        {trend.coords.map((point, index) => (
          <g key={`${chartId}-trend-point-${index}`}>
            <circle
              cx={point.x}
              cy={point.y}
              r={hoveredIndex === index ? 3.8 : 3}
              className={hoveredIndex === index ? 'interactive-trend-point interactive-trend-point-active' : 'interactive-trend-point'}
            />
            <circle
              cx={point.x}
              cy={point.y}
              r={9}
              className="interactive-trend-point-hit"
              onMouseEnter={() => setHoveredIndex(index)}
              onFocus={() => setHoveredIndex(index)}
              onClick={() => setHoveredIndex(index)}
              aria-label={`${pointLabel} ${index + 1}: ${renderValue(chartValues[index])}`}
            />
          </g>
        ))}
        <line
          x1={activePoint.x}
          y1={activePoint.y}
          x2={activePoint.x}
          y2={trend.height - 8}
          className="interactive-trend-hover-line"
        />
        <circle cx={activePoint.x} cy={activePoint.y} r="5" className="session-trend-dot interactive-trend-dot-active" />
        <text
          x={Math.min(trend.width - 42, Math.max(12, activePoint.x + 8))}
          y={Math.max(16, activePoint.y - 10)}
          className="interactive-trend-hover-label"
        >
          {renderValue(activeValue)}
        </text>
      </svg>
      <div className="interactive-trend-insight">
        <span className="interactive-trend-insight-item">
          {pointDescription}: <strong>{renderValue(activeValue)}</strong>
        </span>
        <span className="interactive-trend-insight-item">
          {delta === null
            ? 'No previous point yet.'
            : delta >= 0
              ? `+${renderValue(delta)} vs previous`
              : `${renderValue(delta)} vs previous`}
        </span>
        <span className="interactive-trend-insight-item">{suggestion}</span>
      </div>
    </>
  )
}

function SessionPerformanceReportCard({ report }: { report: SessionPerformanceReport }) {
  const trendValues = useMemo(
    () => compressTrendPoints(report.scoreTrend.length > 0 ? report.scoreTrend : [report.score], 64),
    [report.scoreTrend, report.score],
  )
  const improvedRank = report.currentRank !== null && report.previousRank !== null && report.currentRank < report.previousRank
  const movedCount =
    report.currentRank !== null && report.previousRank !== null && report.currentRank < report.previousRank
      ? report.previousRank - report.currentRank
      : 0

  return (
    <div className="card session-report-card">
      <div className="session-report-head">
        <div>
          <h3>{sessionModeLabel(report.mode)} Performance</h3>
          <p className="muted">{report.contextLabel} • Score: {report.score} pts</p>
        </div>
      </div>

      <div className="session-trend-wrap">
        <InteractiveTrendChart
          chartId={`session-report-${report.mode}-${report.contextLabel}`}
          values={trendValues}
          ariaLabel={`${sessionModeLabel(report.mode)} score trend`}
          pointLabel="Attempt"
          valueSuffix=" pts"
          describeSuggestion={(_, delta) => {
            if (delta === null) return 'First tracked score for this mode.'
            if (delta > 0) return 'Score is climbing. Keep pushing.'
            if (delta < 0) return 'Score dipped. Tighten fundamentals and run it back.'
            return 'Stable score. Focus on speed and consistency.'
          }}
        />
      </div>

      <div className="session-metrics-grid">
        <div>
          <small>Correct</small>
          <strong>{report.correct}</strong>
        </div>
        <div>
          <small>Incorrect</small>
          <strong>{report.incorrect}</strong>
        </div>
        <div>
          <small>Score</small>
          <strong>{report.score}</strong>
        </div>
      </div>

      <p className="session-summary-line">
        {report.deltaScore === null
          ? 'First tracked attempt for this mode. Keep building consistency.'
          : report.deltaScore >= 0
            ? `You improved ${report.deltaScore} points since your last attempt.`
            : `You are down ${Math.abs(report.deltaScore)} points from your last attempt. Bounce back next run.`}
      </p>
      {report.focusTips.length > 0 ? (
        <p className="session-focus-line">
          Focus next: {report.focusTips.join(' • ')}
        </p>
      ) : null}

      {report.leaderboardPreview.length > 0 ? (
        <div className="session-leader-preview">
          <p className="session-leader-title">Leaderboard Preview</p>
          {report.leaderboardPreview.map((entry) => (
            <div key={`${report.mode}-leader-${entry.rank}-${entry.playerName}`} className={`session-leader-row ${entry.isCurrentUser ? 'is-you' : ''}`}>
              <span>#{entry.rank}</span>
              <span>{entry.playerName}</span>
              <strong>{entry.score}</strong>
            </div>
          ))}
          {report.currentRank ? (
            <p className={`session-rank-note ${improvedRank ? 'rank-up' : ''}`}>
              You are #{report.currentRank}
              {improvedRank ? ` and jumped up ${movedCount} spot${movedCount > 1 ? 's' : ''}.` : '.'}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

type GameStartInsightsPanelProps = {
  title: 'Matching' | 'Speed Test'
  icon: 'games' | 'study'
  startLabel: string
  disabled?: boolean
  disabledHint?: string | null
  onStart: () => void
  duration: HomeDurationFilter
  filter: CodeFilter
  sessionTrack: SessionTrack
  focusTips: string[]
  codeSetBreakdown: Array<{ codeSet: CodeSet; attempts: number; accuracyPercent: number }>
}

function GameStartInsightsPanel(props: GameStartInsightsPanelProps) {
  const {
    title,
    icon,
    startLabel,
    disabled = false,
    disabledHint = null,
    onStart,
    duration,
    filter,
    sessionTrack,
    focusTips,
    codeSetBreakdown,
  } = props
  const [hoveredTrendIndex, setHoveredTrendIndex] = useState<number | null>(null)
  const trendValues = useMemo(() => compressTrendPoints(sessionTrack.scoreHistory || [], 64), [sessionTrack.scoreHistory])
  const chartValues = useMemo(
    () => (
      trendValues.length > 0
        ? trendValues
        : sessionTrack.lastAttempt
          ? [sessionTrack.lastAttempt.score]
          : []
    ),
    [sessionTrack.lastAttempt, trendValues],
  )
  const trend = useMemo(() => (chartValues.length > 0 ? buildTrendPath(chartValues) : null), [chartValues])
  const activeTrendIndex = chartValues.length === 0
    ? -1
    : hoveredTrendIndex !== null && hoveredTrendIndex >= 0 && hoveredTrendIndex < chartValues.length
      ? hoveredTrendIndex
      : chartValues.length - 1
  const activeTrendPoint = trend && activeTrendIndex >= 0 ? trend.coords[activeTrendIndex] : null
  const activeTrendScore = activeTrendIndex >= 0 ? chartValues[activeTrendIndex] : null
  const previousTrendScore = activeTrendIndex > 0 ? chartValues[activeTrendIndex - 1] : null
  const trendDelta = activeTrendScore !== null && previousTrendScore !== null
    ? activeTrendScore - previousTrendScore
    : null
  const trendSuggestion = activeTrendScore === null
    ? 'Complete a round to start tracking.'
    : trendDelta === null
      ? 'First tracked score. Keep stacking clean runs.'
      : trendDelta > 0
        ? 'Your score trend is improving. Keep the pressure.'
        : trendDelta < 0
          ? 'Scores slipped. Slow down, then rebuild speed.'
          : 'Score held steady. Push for the next jump.'
  const weakestCategory = [...codeSetBreakdown]
    .filter((entry) => entry.attempts > 0)
    .sort((left, right) => left.accuracyPercent - right.accuracyPercent)[0]
  const bestCategory = [...codeSetBreakdown]
    .filter((entry) => entry.attempts > 0)
    .sort((left, right) => right.accuracyPercent - left.accuracyPercent)[0]

  return (
    <div className="game-start-panel">
      <div className="card game-start-cta-card">
        <button className="primary game-start-button" onClick={onStart} disabled={disabled}>
          <AppIcon name={icon} className="button-icon" />
          {startLabel}
        </button>
        <p className="muted tiny game-start-note">
          {duration}s • {filter === 'all' ? 'All Codes' : codeSetLabel[filter]}
        </p>
        {disabled && disabledHint ? <p className="muted tiny game-start-note">{disabledHint}</p> : null}
      </div>

      <div className="card game-start-stats-card">
        <div className="game-insight-grid">
          <article className="game-insight-card">
            <p className="game-insight-label">Last attempt</p>
            {sessionTrack.lastAttempt ? (
              <>
                <p className="game-insight-value">{sessionTrack.lastAttempt.score} pts</p>
                <p className="muted tiny">
                  {sessionTrack.lastAttempt.correct} correct / {sessionTrack.lastAttempt.incorrect} incorrect
                </p>
              </>
            ) : (
              <p className="muted tiny">No attempt yet for this mode.</p>
            )}
          </article>

          <article className="game-insight-card">
            <p className="game-insight-label">Focus recommendation</p>
            <p className="game-insight-value">
              {weakestCategory
                ? `${codeSetLabel[weakestCategory.codeSet]} (${weakestCategory.accuracyPercent}% avg)`
                : 'Play a round to generate focus targets'}
            </p>
            {focusTips.length > 0 ? (
              <p className="muted tiny">Focus: {focusTips.join(' • ')}</p>
            ) : null}
          </article>
        </div>

        <article className="game-trend-card">
          <div className="game-trend-head">
            <p className="game-insight-label">{title} progress trend</p>
            <span className="muted tiny">{chartValues.length > 0 ? `${chartValues.length} points` : 'No data yet'}</span>
          </div>
          {trend && activeTrendPoint && activeTrendScore !== null ? (
            <svg
              viewBox={`0 0 ${trend.width} ${trend.height}`}
              className="game-trend-chart"
              role="img"
              aria-label={`${title} score trend`}
              onMouseLeave={() => setHoveredTrendIndex(null)}
            >
              <path d={trend.path} className="session-trend-glow" />
              <path d={trend.path} className="session-trend-line" />
              {trend.coords.map((point, index) => (
                <g key={`${title}-trend-point-${index}`}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={hoveredTrendIndex === index ? 3.8 : 3}
                    className={hoveredTrendIndex === index ? 'game-trend-point game-trend-point-active' : 'game-trend-point'}
                  />
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={9}
                    className="game-trend-point-hit"
                    onMouseEnter={() => setHoveredTrendIndex(index)}
                    onFocus={() => setHoveredTrendIndex(index)}
                    onClick={() => setHoveredTrendIndex(index)}
                    aria-label={`Attempt ${index + 1}: ${Math.round(chartValues[index])} points`}
                  />
                </g>
              ))}
              <line
                x1={activeTrendPoint.x}
                y1={activeTrendPoint.y}
                x2={activeTrendPoint.x}
                y2={trend.height - 8}
                className="game-trend-hover-line"
              />
              <circle cx={activeTrendPoint.x} cy={activeTrendPoint.y} r="5" className="session-trend-dot game-trend-dot-active" />
              <text
                x={Math.min(trend.width - 38, Math.max(12, activeTrendPoint.x + 8))}
                y={Math.max(16, activeTrendPoint.y - 10)}
                className="game-trend-hover-label"
              >
                {Math.round(activeTrendScore)} pts
              </text>
            </svg>
          ) : (
            <p className="muted tiny">Your graph appears after your first completed run.</p>
          )}
          {activeTrendScore !== null ? (
            <div className="game-trend-insight">
              <span className="game-trend-insight-item">
                Attempt {activeTrendIndex + 1}: <strong>{Math.round(activeTrendScore)} pts</strong>
              </span>
              <span className="game-trend-insight-item">
                {trendDelta === null
                  ? 'No prior point yet.'
                  : trendDelta >= 0
                    ? `+${Math.round(trendDelta)} pts vs previous`
                    : `${Math.round(trendDelta)} pts vs previous`}
              </span>
              <span className="game-trend-insight-item">{trendSuggestion}</span>
            </div>
          ) : null}
        </article>

        <div className="game-category-focus">
          {codeSetBreakdown.map((entry) => (
            <div
              key={`${title}-focus-${entry.codeSet}`}
              className="game-category-row"
              title={`${codeSetLabel[entry.codeSet]}: ${entry.attempts > 0 ? `${entry.accuracyPercent}% accuracy (${entry.attempts} attempts)` : 'No attempts yet'}`}
            >
              <span className="game-category-name">{codeSetLabel[entry.codeSet]}</span>
              <div className="game-category-track">
                <div
                  className="game-category-fill"
                  style={{ width: `${entry.attempts > 0 ? Math.max(6, entry.accuracyPercent) : 6}%` }}
                  aria-hidden
                />
              </div>
              <span className="game-category-metric">
                {entry.attempts > 0 ? `${entry.accuracyPercent}%` : '—'}
              </span>
            </div>
          ))}
        </div>

        <p className="muted tiny game-motivation-line">
          {bestCategory
            ? `${codeSetLabel[bestCategory.codeSet]} is currently your strongest set. Keep pushing consistency in weaker areas.`
            : 'Start a session to unlock personalized coaching insights.'}
        </p>
      </div>
    </div>
  )
}

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const [routePath, setRoutePath] = useState(() => normalizeRoutePath(location.pathname))

  const [sections, setSections] = useState<CodeSection[]>([])
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [scenarioItems, setScenarioItems] = useState<ScenarioBankItem[]>([])
  const [activeTab, setActiveTab] = useState<AppTab>('home')
  const [leaderboardsScope, setLeaderboardsScope] = useState<'weekly' | 'alltime'>('weekly')
  const [gameModeLeaderboardsScope, setGameModeLeaderboardsScope] = useState<'weekly' | 'alltime'>('alltime')
  const [leaderboardViewGame, setLeaderboardViewGame] = useState<'Matching' | 'Speed Test'>('Matching')
  const [leaderboardViewDuration, setLeaderboardViewDuration] = useState<HomeDurationFilter>(15)
  const [leaderboardViewFilter, setLeaderboardViewFilter] = useState<CodeFilter>('all')
  const [onlineUsersCount, setOnlineUsersCount] = useState(0)
  const [onlinePresenceByUserId, setOnlinePresenceByUserId] = useState<Record<string, PresenceStatus>>({})
  const [studyFlashFilter, setStudyFlashFilter] = useState<CodeFilter>('all')
  const [studyTestFilter, setStudyTestFilter] = useState<CodeFilter>('all')
  const [studyTestWrongness, setStudyTestWrongness] = useState<StudyWrongness>('needs_work')
  const [studyTestAnswerMode, setStudyTestAnswerMode] = useState<StudyAnswerMode>('multiple')
  const [studyTestQuestionCount, setStudyTestQuestionCount] = useState(20)
  const [studyFlashSessionOpen, setStudyFlashSessionOpen] = useState(false)
  const [studyFlashSessionFilter, setStudyFlashSessionFilter] = useState<CodeFilter>('all')
  const [studyFlashSessionOrder, setStudyFlashSessionOrder] = useState<string[]>([])
  const [studyFlashSessionIndex, setStudyFlashSessionIndex] = useState(0)
  const [studyFlashSessionFlipped, setStudyFlashSessionFlipped] = useState(false)
  const [studyTestSessionOpen, setStudyTestSessionOpen] = useState(false)
  const [studyTestSessionDone, setStudyTestSessionDone] = useState(false)
  const [studyTestSessionFilter, setStudyTestSessionFilter] = useState<CodeFilter>('all')
  const [studyTestSessionTotal, setStudyTestSessionTotal] = useState(0)
  const [studyTestSessionAnswered, setStudyTestSessionAnswered] = useState(0)
  const [studyTestSessionCorrect, setStudyTestSessionCorrect] = useState(0)
  const [studyTestReport, setStudyTestReport] = useState<SessionPerformanceReport | null>(null)
  const [libraryFilter, setLibraryFilter] = useState<CodeSet>('penal')

  const [authReady, setAuthReady] = useState(false)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authPasswordConfirm, setAuthPasswordConfirm] = useState('')
  const [showSignInPassword, setShowSignInPassword] = useState(false)
  const [showSignUpPassword, setShowSignUpPassword] = useState(false)
  const [showSignUpPasswordConfirm, setShowSignUpPasswordConfirm] = useState(false)
  const [profileUsername, setProfileUsername] = useState('')
  const [profileAvatar, setProfileAvatar] = useState<File | null>(null)
  const [profileAvatarPreviewUrl, setProfileAvatarPreviewUrl] = useState('')
  const [avatarCropSourceUrl, setAvatarCropSourceUrl] = useState('')
  const [avatarCropSourceName, setAvatarCropSourceName] = useState('')
  const [avatarCropOpen, setAvatarCropOpen] = useState(false)
  const [avatarCropZoom, setAvatarCropZoom] = useState(1)
  const [avatarCropX, setAvatarCropX] = useState(0)
  const [avatarCropY, setAvatarCropY] = useState(0)
  const [accountNewPassword, setAccountNewPassword] = useState('')
  const [accountConfirmPassword, setAccountConfirmPassword] = useState('')
  const [showAccountPassword, setShowAccountPassword] = useState(false)
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false)
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [authError, setAuthError] = useState('')
  const [authSuccess, setAuthSuccess] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [clockNowMs, setClockNowMs] = useState<number>(() => Date.now())
  
  // Track online users - update last_active and fetch active/away presence
  useEffect(() => {
    const client = supabase
    if (!client || !currentUserId) return
    const activeThresholdMs = 10 * 60 * 1000

    const updateLastActive = async () => {
      try {
        await client.from('profiles').update({ last_active: new Date().toISOString() }).eq('user_id', currentUserId)
      } catch { /* ignore */ }
    }

    const fetchOnlinePresence = async () => {
      try {
        const { data, error } = await client.rpc('list_online_1v1_users', { p_minutes_interval: 60 })
        if (!error && Array.isArray(data)) {
          const now = Date.now()
          const presence: Record<string, PresenceStatus> = {}
          for (const row of data) {
            const value = row as Record<string, unknown>
            const userId = String(value.user_id || '').trim()
            if (!userId) continue
            const parsedMs = Date.parse(String(value.last_active || ''))
            if (!Number.isFinite(parsedMs)) continue
            const elapsedMs = Math.max(0, now - parsedMs)
            presence[userId] = elapsedMs <= activeThresholdMs ? 'active' : 'away'
          }
          presence[currentUserId] = 'active'
          setOnlinePresenceByUserId(presence)
          setOnlineUsersCount(
            Object.values(presence).filter((status) => status === 'active').length,
          )
          return
        }
      } catch {
        // Ignore and try fallback count
      }

      setOnlinePresenceByUserId({ [currentUserId]: 'active' })
      try {
        const { data } = await client.rpc('get_online_users_count', { minutes_interval: 10 })
        const fallbackCount = Number(data || 0)
        setOnlineUsersCount(Number.isFinite(fallbackCount) ? fallbackCount : 0)
      } catch {
        setOnlineUsersCount(0)
      }
    }

    updateLastActive()
    const interval = setInterval(() => {
      updateLastActive()
      fetchOnlinePresence()
    }, 30000)
    fetchOnlinePresence()

    return () => clearInterval(interval)
  }, [currentUserId, supabase])

  const [currentUserEmail, setCurrentUserEmail] = useState('')
  const [currentUserProvider, setCurrentUserProvider] = useState('email')
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('profile')
  const [agencyOptions, setAgencyOptions] = useState<string[]>(() => sanitizeAgencyOptions(fallbackAgencyOptions))
  const [agencySettingsId, setAgencySettingsId] = useState(appSettingsRowId)
  const [agencyNewName, setAgencyNewName] = useState('')
  const [agencyEditingOriginal, setAgencyEditingOriginal] = useState<string | null>(null)
  const [agencyEditingValue, setAgencyEditingValue] = useState('')
  const [agencySaving, setAgencySaving] = useState(false)
  const [agencyError, setAgencyError] = useState('')
  const [agencySuccess, setAgencySuccess] = useState('')
  const [appBannerSettings, setAppBannerSettings] = useState<AppBannerSettings>({ ...defaultAppBannerSettings })
  const [ownerBannerDraft, setOwnerBannerDraft] = useState<AppBannerSettings>({ ...defaultAppBannerSettings })
  const [ownerBannerSaving, setOwnerBannerSaving] = useState(false)
  const [ownerBannerError, setOwnerBannerError] = useState('')
  const [ownerBannerSuccess, setOwnerBannerSuccess] = useState('')
  const [bugReportPagePath, setBugReportPagePath] = useState('/home')
  const [bugReportSeverity, setBugReportSeverity] = useState<BugSeverity>('medium')
  const [bugReportSummary, setBugReportSummary] = useState('')
  const [bugReportDetails, setBugReportDetails] = useState('')
  const [bugReportSending, setBugReportSending] = useState(false)
  const [bugReportError, setBugReportError] = useState('')
  const [bugReportSuccess, setBugReportSuccess] = useState('')
  const [ownerBugReports, setOwnerBugReports] = useState<BugReport[]>([])
  const [ownerBugReportsLoading, setOwnerBugReportsLoading] = useState(false)
  const [ownerBugReportsError, setOwnerBugReportsError] = useState('')
  const [ownerBugReportsSuccess, setOwnerBugReportsSuccess] = useState('')
  const [forceProfileSetup, setForceProfileSetup] = useState(false)
  const [profileDetails, setProfileDetails] = useState<ProfileDetails>({
    bio: '',
    agency: defaultAgency,
    displayMode: 'dark',
    homeLeaderboardRotationMs: defaultLeaderboardRotationMs,
    homeLeaderboardPreferences: { ...defaultHomeLeaderboardPreferences, visibleCards: [...defaultHomeLeaderboardPreferences.visibleCards] },
    themeId: appThemePresets[0].id,
    nameStyle: { ...defaultNameStyle },
    namePresets: [],
    systemNoticesSeen: [],
    stats: { ...defaultUserStats, gamePlays: { ...defaultUserStats.gamePlays }, studyModeCounts: { ...defaultUserStats.studyModeCounts } },
    currentActivity: null,
  })
  const [leaderboardRotateMs, setLeaderboardRotateMs] = useState(defaultLeaderboardRotationMs)
  const [newPresetName, setNewPresetName] = useState('')
  const [editorItems, setEditorItems] = useState<ContentEditorItem[]>([])
  const [editorLoading, setEditorLoading] = useState(false)
  const [editorError, setEditorError] = useState('')
  const [editorSuccess, setEditorSuccess] = useState('')
  const [editorCategoryFilter, setEditorCategoryFilter] = useState('all')
  const [editorTypeFilter, setEditorTypeFilter] = useState<'all' | 'code' | 'scenario' | 'question'>('all')
  const [editorSelectedId, setEditorSelectedId] = useState('')
  const [editorDraft, setEditorDraft] = useState<ContentEditorItem>(createEmptyEditorItem())
  const [scenarioAnswerMode, setScenarioAnswerMode] = useState<'choices' | 'truefalse'>('choices')
  const [scenarioOptionInputs, setScenarioOptionInputs] = useState<string[]>(['', '', '', ''])
  const [scenarioCorrectChoice, setScenarioCorrectChoice] = useState('')
  const [contentWarning, setContentWarning] = useState('')
  const [contentLoadRetryToken, setContentLoadRetryToken] = useState(0)
  const [globalBannerOffset, setGlobalBannerOffset] = useState(0)

  const [performance, setPerformance] = useState<Record<string, CodePerformance>>({})
  const [highScores, setHighScores] = useState(gameHighScoreSeed)
  const [bestStreak, setBestStreak] = useState(0)
  const [remoteTrackScoreHistory, setRemoteTrackScoreHistory] = useState<Record<string, number[]>>({})
  const [remoteScoreTimeline, setRemoteScoreTimeline] = useState<ScoreTimelinePoint[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [weeklyLeaderboard, setWeeklyLeaderboard] = useState<LeaderboardEntry[]>([])
  const [leaderboardError, setLeaderboardError] = useState('')
  const [selectedLeaderboardEntry, setSelectedLeaderboardEntry] = useState<LeaderboardEntry | null>(null)
  const [selectedLeaderboardIsTop, setSelectedLeaderboardIsTop] = useState(false)
  const [stateHydrated, setStateHydrated] = useState(false)
  const [celebration, setCelebration] = useState<{ title: string; subtitle: string; burst: number } | null>(null)
  const [homeStudyTimeLeaders, setHomeStudyTimeLeaders] = useState<HomeLeaderboardEntry[]>([])
  const [homeStudyStreakLeaders, setHomeStudyStreakLeaders] = useState<HomeLeaderboardEntry[]>([])
  const [homeMostMasteredLeaders, setHomeMostMasteredLeaders] = useState<HomeLeaderboardEntry[]>([])
  const [homeDuelWinsLeadersByMode, setHomeDuelWinsLeadersByMode] = useState<Record<DuelLeaderboardMode, HomeLeaderboardEntry[]>>({
    all: [],
    matching: [],
    quiz: [],
  })
  const [homeDuelStreakLeadersByMode, setHomeDuelStreakLeadersByMode] = useState<Record<DuelLeaderboardMode, HomeLeaderboardEntry[]>>({
    all: [],
    matching: [],
    quiz: [],
  })
  const [homeMatchingDurationFilter, setHomeMatchingDurationFilter] = useState<HomeDurationFilter>(15)
  const [homeMatchingCodeFilter, setHomeMatchingCodeFilter] = useState<CodeFilter>('all')
  const [homeSpeedDurationFilter, setHomeSpeedDurationFilter] = useState<HomeDurationFilter>(15)
  const [homeSpeedCodeFilter, setHomeSpeedCodeFilter] = useState<CodeFilter>('all')
  const [homeMatchingConfigOpen, setHomeMatchingConfigOpen] = useState(false)
  const [homeSpeedConfigOpen, setHomeSpeedConfigOpen] = useState(false)
  const [homeLeaderboardSettingsOpen, setHomeLeaderboardSettingsOpen] = useState(false)
  const [homeLeaderboardSettingsDraft, setHomeLeaderboardSettingsDraft] = useState<HomeLeaderboardPreferences>(() => ({
    visibleCards: [...defaultHomeLeaderboardPreferences.visibleCards],
    duelWinsMode: defaultHomeLeaderboardPreferences.duelWinsMode,
    duelStreakMode: defaultHomeLeaderboardPreferences.duelStreakMode,
  }))
  const [homeLeaderboardSettingsSaving, setHomeLeaderboardSettingsSaving] = useState(false)
  const [homeLeaderboardSettingsError, setHomeLeaderboardSettingsError] = useState('')
  const [homeMasteredInfoOpen, setHomeMasteredInfoOpen] = useState(false)
  const [departmentRankingInfoOpen, setDepartmentRankingInfoOpen] = useState(false)
  const [homeWhatsNewOpen, setHomeWhatsNewOpen] = useState(false)
  const [studyInsightWindowDays, setStudyInsightWindowDays] = useState<7 | 14 | 30>(14)
  const [assistedLearningEnabled, setAssistedLearningEnabled] = useState(true)
  const [showAssistedLearningInfo, setShowAssistedLearningInfo] = useState(false)
  const [showDevNotice, setShowDevNotice] = useState(false)
  const [reduceVisualEffects, setReduceVisualEffects] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [mobileNavMenuOpen, setMobileNavMenuOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement | null>(null)
  const streakLossNoticeRef = useRef('')

  const [quizDeck, setQuizDeck] = useState<QuizQuestion[]>([])
  const [currentQuestion, setCurrentQuestion] = useState<QuizQuestion | null>(null)
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null)
  const [feedback, setFeedback] = useState('')
  const [streak, setStreak] = useState(0)

  const [gamesSelection, setGamesSelection] = useState<GameModeSelection>(() => loadStoredGameModeSelection())
  const [matchRemaining, setMatchRemaining] = useState(30)
  const [matchRound, setMatchRound] = useState(1)
  const [matchScore, setMatchScore] = useState(0)
  const [matchRunning, setMatchRunning] = useState(false)
  const [matchCards, setMatchCards] = useState<MatchCard[]>([])
  const [selectedCards, setSelectedCards] = useState<string[]>([])
  const [wrongCardIds, setWrongCardIds] = useState<string[]>([])
  const [matchedPairIds, setMatchedPairIds] = useState<string[]>([])
  const [recentMatchSections, setRecentMatchSections] = useState<string[]>([])
  const [matchDone, setMatchDone] = useState(false)
  const [matchCorrectCount, setMatchCorrectCount] = useState(0)
  const [matchIncorrectCount, setMatchIncorrectCount] = useState(0)
  const [matchingReport, setMatchingReport] = useState<SessionPerformanceReport | null>(null)
  const [showMatchSetupModal, setShowMatchSetupModal] = useState(false)

  const [speedRemaining, setSpeedRemaining] = useState(30)
  const [speedRunning, setSpeedRunning] = useState(false)
  const [speedDone, setSpeedDone] = useState(false)
  const [speedScore, setSpeedScore] = useState(0)
  const [speedAnsweredCount, setSpeedAnsweredCount] = useState(0)
  const [speedCorrectCount, setSpeedCorrectCount] = useState(0)
  const [speedIncorrectCount, setSpeedIncorrectCount] = useState(0)
  const [speedReport, setSpeedReport] = useState<SessionPerformanceReport | null>(null)
  const [speedCurrentQuestion, setSpeedCurrentQuestion] = useState<QuizQuestion | null>(null)
  const [speedDeck, setSpeedDeck] = useState<QuizQuestion[]>([])
  const [speedSessionQuestions, setSpeedSessionQuestions] = useState<QuizQuestion[]>([])
  const [showSpeedSetupModal, setShowSpeedSetupModal] = useState(false)
  const [speedFeedback, setSpeedFeedback] = useState('')
  const [speedAnswerLocked, setSpeedAnswerLocked] = useState(false)
  const [scenarioTrainingSection, setScenarioTrainingSection] = useState<ScenarioTrainingSection>('tmas1')
  const [scenarioDeck, setScenarioDeck] = useState<ScenarioQuestion[]>([])
  const [scenarioCurrentQuestion, setScenarioCurrentQuestion] = useState<ScenarioQuestion | null>(null)
  const [scenarioResult, setScenarioResult] = useState<string>('')
  const [scenarioSelectedChoice, setScenarioSelectedChoice] = useState<number | null>(null)
  const [scenarioStreak, setScenarioStreak] = useState(0)
  const [duelInviteJoinRoomId, setDuelInviteJoinRoomId] = useState<string | null>(null)
  const homeMatchingRotationIndexRef = useRef(0)
  const homeSpeedRotationIndexRef = useRef(0)
  const lastAppStateUpdateRef = useRef(0)
  const highScoresRef = useRef(gameHighScoreSeed)
  const leaderboardRef = useRef<LeaderboardEntry[]>([])
  const weeklyLeaderboardRef = useRef<LeaderboardEntry[]>([])
  const leaderboardAnnouncementDedupRef = useRef<Map<string, number>>(new Map())
  const leaderboardRefreshMetaRef = useRef<{ lastAt: number; promise: Promise<LeaderboardRefreshResult> | null }>({ lastAt: 0, promise: null })
  const homeLeaderboardRefreshMetaRef = useRef<{ lastAt: number; promise: Promise<void> | null }>({ lastAt: 0, promise: null })
  const matchScoreRef = useRef(0)
  const matchRoundRef = useRef(1)
  const matchSessionDurationRef = useRef(30)
  const matchSessionFilterRef = useRef<CodeFilter>('all')
  const speedScoreRef = useRef(0)
  const speedAnsweredCountRef = useRef(0)
  const speedSessionDurationRef = useRef(30)
  const speedSessionFilterRef = useRef<CodeFilter>('all')
  const matchCorrectCountRef = useRef(0)
  const matchIncorrectCountRef = useRef(0)
  const speedCorrectCountRef = useRef(0)
  const speedIncorrectCountRef = useRef(0)
  const speedAnswerLockRef = useRef(false)
  const speedAdvanceTimerRef = useRef<number | null>(null)
  const speedSpamFeedbackTimerRef = useRef<number | null>(null)
  const speedSpamAttemptsRef = useRef<Array<{ at: number; choice: number }>>([])
  const speedSpamCooldownUntilRef = useRef(0)
  const performanceRef = useRef<Record<string, CodePerformance>>({})
  const matchWrongResetTimerRef = useRef<number | null>(null)
  const matchTimerDeadlineRef = useRef(0)
  const matchTimerFinishedRef = useRef(false)
  const finalizeMatchingSessionRef = useRef<() => void>(() => {})
  const recentSpeedSectionsRef = useRef<string[]>([])
  const scenarioDeckRef = useRef<ScenarioQuestion[]>([])
  const globalBannerRef = useRef<HTMLElement | null>(null)
  const quizFireHostRef = useRef<HTMLDivElement | null>(null)
  const scenarioFireHostRef = useRef<HTMLDivElement | null>(null)
  const scenarioNextRef = useRef<HTMLDivElement | null>(null)
  const scenarioPromptRef = useRef<HTMLHeadingElement | null>(null)
  const quizNextRef = useRef<HTMLButtonElement | null>(null)
  const studyActivityBySourceRef = useRef<Record<StudyActivitySource, number>>({
    flashcards: 0,
    study_test: 0,
    study_guide: 0,
    study_practice: 0,
    matching: 0,
    speed: 0,
    duel: 0,
  })
  const [quizFireWidth, setQuizFireWidth] = useState(0)
  const [scenarioFireWidth, setScenarioFireWidth] = useState(0)
  const { isOwner, loading: ownerLoading } = useOwner(currentUserId || null)

  const markStudyActivity = useCallback((source: StudyActivitySource) => {
    studyActivityBySourceRef.current[source] = Date.now()
  }, [])

  const resetSpeedSpamState = useCallback(() => {
    speedSpamAttemptsRef.current = []
    speedSpamCooldownUntilRef.current = 0
    if (speedSpamFeedbackTimerRef.current !== null) {
      window.clearTimeout(speedSpamFeedbackTimerRef.current)
      speedSpamFeedbackTimerRef.current = null
    }
  }, [])

  const triggerSpeedSpamPenalty = useCallback(() => {
    const penaltyAmount = 8
    speedSpamCooldownUntilRef.current = Date.now() + 900
    setSpeedScore((score) => Math.max(0, score - penaltyAmount))
    setSpeedFeedback(`Spam penalty: -${penaltyAmount}`)
    if (speedSpamFeedbackTimerRef.current !== null) {
      window.clearTimeout(speedSpamFeedbackTimerRef.current)
      speedSpamFeedbackTimerRef.current = null
    }
    speedSpamFeedbackTimerRef.current = window.setTimeout(() => {
      setSpeedFeedback((current) => (current.startsWith('Spam penalty:') ? '' : current))
      speedSpamFeedbackTimerRef.current = null
    }, 700)
  }, [])

  const isSpeedSpamAttempt = useCallback((choiceIndex: number) => {
    const now = Date.now()
    if (now < speedSpamCooldownUntilRef.current) return true
    const recentAttempts = speedSpamAttemptsRef.current
      .filter((attempt) => now - attempt.at <= 2400)
      .concat({ at: now, choice: choiceIndex })
    speedSpamAttemptsRef.current = recentAttempts

    const recentFive = recentAttempts.slice(-5)
    const ultraFastIntervals = recentFive.slice(1).filter((attempt, index) => attempt.at - recentFive[index].at <= 260).length
    const recentFour = recentAttempts.slice(-4)
    const sameChoiceRapidBurst = recentFour.length === 4 &&
      recentFour.every((attempt) => attempt.choice === choiceIndex) &&
      recentFour.slice(1).every((attempt, index) => attempt.at - recentFour[index].at <= 700)

    if (ultraFastIntervals >= 4 || sameChoiceRapidBurst) {
      triggerSpeedSpamPenalty()
      return true
    }
    return false
  }, [triggerSpeedSpamPenalty])

  useEffect(() => {
    return () => {
      if (speedAdvanceTimerRef.current !== null) {
        window.clearTimeout(speedAdvanceTimerRef.current)
        speedAdvanceTimerRef.current = null
      }
      if (speedSpamFeedbackTimerRef.current !== null) {
        window.clearTimeout(speedSpamFeedbackTimerRef.current)
        speedSpamFeedbackTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    scenarioDeckRef.current = scenarioDeck
  }, [scenarioDeck])

  useEffect(() => {
    performanceRef.current = performance
  }, [performance])

  useEffect(() => () => {
    if (matchWrongResetTimerRef.current !== null) {
      window.clearTimeout(matchWrongResetTimerRef.current)
      matchWrongResetTimerRef.current = null
    }
  }, [])

  const persistAgencyOptions = async (nextOptions: string[]) => {
    if (!supabase || !isOwner) return false
    setAgencySaving(true)
    setAgencyError('')
    setAgencySuccess('')
    const sanitized = sanitizeAgencyOptions(nextOptions)
    const { data, error } = await supabase
      .from('app_settings')
      .upsert(
        {
          id: agencySettingsId || appSettingsRowId,
          agencies: sanitized,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      )
      .select('id')
      .single()

    if (error) {
      const message = String(error.message || 'Could not save agencies.')
      const migrationHint = message.toLowerCase().includes('app_settings')
        ? ' Run /supabase/migrations/20260219_app_settings.sql first.'
        : ''
      setAgencyError(`${message}${migrationHint}`)
      setAgencySaving(false)
      return false
    }

    setAgencyOptions(sanitized)
    setAgencySettingsId(String(data?.id || appSettingsRowId))
    setAgencySaving(false)
    setAgencySuccess('Agencies saved.')
    return true
  }

  const addAgencyOption = async () => {
    const nextName = agencyNewName.trim()
    if (!nextName) {
      setAgencyError('Enter an agency name.')
      setAgencySuccess('')
      return
    }
    if (agencyOptions.some((agency) => agency.toLowerCase() === nextName.toLowerCase())) {
      setAgencyError('Agency already exists.')
      setAgencySuccess('')
      return
    }
    const saved = await persistAgencyOptions([...agencyOptions, nextName])
    if (saved) setAgencyNewName('')
  }

  const beginEditAgencyOption = (agency: string) => {
    if (agency === defaultAgency) return
    setAgencyError('')
    setAgencySuccess('')
    setAgencyEditingOriginal(agency)
    setAgencyEditingValue(agency)
  }

  const saveEditedAgencyOption = async () => {
    if (!agencyEditingOriginal) return
    const nextName = agencyEditingValue.trim()
    if (!nextName) {
      setAgencyError('Agency name cannot be empty.')
      setAgencySuccess('')
      return
    }
    const duplicate = agencyOptions.some(
      (agency) => agency.toLowerCase() === nextName.toLowerCase() && agency.toLowerCase() !== agencyEditingOriginal.toLowerCase(),
    )
    if (duplicate) {
      setAgencyError('Agency already exists.')
      setAgencySuccess('')
      return
    }
    const updated = agencyOptions.map((agency) => (agency === agencyEditingOriginal ? nextName : agency))
    const saved = await persistAgencyOptions(updated)
    if (saved) {
      setAgencyEditingOriginal(null)
      setAgencyEditingValue('')
    }
  }

  const cancelEditAgencyOption = () => {
    setAgencyEditingOriginal(null)
    setAgencyEditingValue('')
    setAgencyError('')
    setAgencySuccess('')
  }

  const deleteAgencyOption = async (agency: string) => {
    if (agency === defaultAgency) {
      setAgencyError(`"${defaultAgency}" cannot be deleted.`)
      setAgencySuccess('')
      return
    }
    if (!window.confirm(`Delete "${agency}"?`)) return
    const filtered = agencyOptions.filter((entry) => entry !== agency)
    const saved = await persistAgencyOptions(filtered)
    if (saved && agencyEditingOriginal === agency) {
      setAgencyEditingOriginal(null)
      setAgencyEditingValue('')
    }
  }

  const saveOwnerBannerSettings = async () => {
    if (!supabase || !isOwner) return false
    setOwnerBannerSaving(true)
    setOwnerBannerError('')
    setOwnerBannerSuccess('')
    const sanitized = sanitizeAppBannerSettings(ownerBannerDraft)

    if (sanitized.enabled && sanitized.message.trim().length === 0) {
      setOwnerBannerError('Message text is required when banner is enabled.')
      setOwnerBannerSaving(false)
      return false
    }

    const { data, error } = await supabase
      .from('app_settings')
      .upsert(
        {
          id: agencySettingsId || appSettingsRowId,
          banner_enabled: sanitized.enabled,
          banner_level: sanitized.tone,
          banner_message: sanitized.message,
          banner_scroll: sanitized.scroll,
          banner_scroll_speed: sanitized.scrollSpeed,
          banner_scroll_repeat: sanitized.scrollRepeat,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      )
      .select('id,banner_enabled,banner_level,banner_message,banner_scroll,banner_scroll_speed,banner_scroll_repeat')
      .single()

    if (error) {
      const message = String(error.message || 'Could not save banner settings.')
      const migrationHint = message.toLowerCase().includes('banner_') || message.toLowerCase().includes('app_settings')
        ? ' Run /supabase/migrations/20260226_app_settings_global_banner.sql and /supabase/migrations/20260226_app_settings_global_banner_scroll_controls.sql first.'
        : ''
      setOwnerBannerError(`${message}${migrationHint}`)
      setOwnerBannerSaving(false)
      return false
    }

    const nextSettings = sanitizeAppBannerSettings(data || sanitized)
    setAppBannerSettings(nextSettings)
    setOwnerBannerDraft(nextSettings)
    setAgencySettingsId(String(data?.id || appSettingsRowId))
    setOwnerBannerSaving(false)
    setOwnerBannerSuccess('Banner settings saved.')
    return true
  }

  const loadOwnerBugReports = useCallback(async () => {
    if (!supabase || !isOwner) {
      setOwnerBugReports([])
      setOwnerBugReportsLoading(false)
      setOwnerBugReportsError('')
      return
    }
    setOwnerBugReportsLoading(true)
    setOwnerBugReportsError('')
    const { data, error } = await supabase
      .from('bug_reports')
      .select(
        'id,reporter_user_id,reporter_name,reporter_email,page_path,severity,summary,details,status,owner_note,user_agent,viewport,created_at,updated_at',
      )
      .order('created_at', { ascending: false })
      .limit(250)

    if (error) {
      const message = String(error.message || 'Could not load bug reports.')
      const migrationHint = message.toLowerCase().includes('bug_reports')
        ? ' Run /supabase/migrations/20260227_bug_reports.sql first.'
        : ''
      setOwnerBugReports([])
      setOwnerBugReportsError(`${message}${migrationHint}`)
      setOwnerBugReportsLoading(false)
      return
    }

    const mapped = (data || [])
      .map((row) => rowToBugReport((row || {}) as Record<string, unknown>))
      .filter((row): row is BugReport => Boolean(row))
    setOwnerBugReports(mapped)
    setOwnerBugReportsLoading(false)
  }, [isOwner])

  const submitBugReport = useCallback(async () => {
    if (!supabase || !currentUserId) {
      setBugReportError('Sign in is required to submit a bug report.')
      setBugReportSuccess('')
      return
    }

    const summary = bugReportSummary.trim()
    const details = bugReportDetails.trim()
    const pagePath = bugReportPagePath.trim() || routePath || '/home'

    if (summary.length < 6) {
      setBugReportError('Add a short summary (at least 6 characters).')
      setBugReportSuccess('')
      return
    }
    if (details.length < 12) {
      setBugReportError('Add a little more detail so we can reproduce it.')
      setBugReportSuccess('')
      return
    }

    setBugReportSending(true)
    setBugReportError('')
    setBugReportSuccess('')
    try {
      const { error } = await supabase
        .from('bug_reports')
        .insert({
          reporter_user_id: currentUserId,
          reporter_name: String(profile?.username || 'User').trim() || 'User',
          reporter_email: currentUserEmail || null,
          page_path: pagePath.slice(0, 120),
          severity: bugReportSeverity,
          summary: summary.slice(0, 160),
          details: details.slice(0, 5000),
          user_agent: typeof navigator !== 'undefined' ? String(navigator.userAgent || '').slice(0, 500) : null,
          viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : null,
        })
        .select('id')
        .single()

      if (error) throw error

      setBugReportSummary('')
      setBugReportDetails('')
      setBugReportSuccess('Thanks — your bug report was sent.')
      if (isOwner) {
        void loadOwnerBugReports()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not submit bug report.'
      const migrationHint = message.toLowerCase().includes('bug_reports')
        ? ' Run /supabase/migrations/20260227_bug_reports.sql first.'
        : ''
      setBugReportError(`${message}${migrationHint}`)
    } finally {
      setBugReportSending(false)
    }
  }, [
    bugReportDetails,
    bugReportPagePath,
    bugReportSeverity,
    bugReportSummary,
    currentUserEmail,
    currentUserId,
    isOwner,
    loadOwnerBugReports,
    profile?.username,
    routePath,
  ])

  const updateOwnerBugReport = useCallback(async (reportId: string, updates: Partial<Pick<BugReport, 'status' | 'ownerNote'>>) => {
    if (!supabase || !isOwner || !reportId) return
    setOwnerBugReportsError('')
    setOwnerBugReportsSuccess('')
    const payload: Record<string, unknown> = {}
    if (updates.status) payload.status = sanitizeBugStatus(updates.status)
    if (typeof updates.ownerNote === 'string') payload.owner_note = updates.ownerNote.trim().slice(0, 2000)
    if (Object.keys(payload).length === 0) return

    const { data, error } = await supabase
      .from('bug_reports')
      .update(payload)
      .eq('id', reportId)
      .select(
        'id,reporter_user_id,reporter_name,reporter_email,page_path,severity,summary,details,status,owner_note,user_agent,viewport,created_at,updated_at',
      )
      .maybeSingle()

    if (error) {
      setOwnerBugReportsError(error.message || 'Could not update bug report.')
      return
    }
    const mapped = data ? rowToBugReport(data as Record<string, unknown>) : null
    if (mapped) {
      setOwnerBugReports((previous) => previous.map((report) => (report.id === reportId ? mapped : report)))
      setOwnerBugReportsSuccess('Bug report updated.')
    }
  }, [isOwner])

  const deleteOwnerBugReport = useCallback(async (reportId: string) => {
    if (!supabase || !isOwner || !reportId) return
    if (!window.confirm('Delete this bug report?')) return
    setOwnerBugReportsError('')
    setOwnerBugReportsSuccess('')
    const { error } = await supabase
      .from('bug_reports')
      .delete()
      .eq('id', reportId)
    if (error) {
      setOwnerBugReportsError(error.message || 'Could not delete bug report.')
      return
    }
    setOwnerBugReports((previous) => previous.filter((report) => report.id !== reportId))
    setOwnerBugReportsSuccess('Bug report deleted.')
  }, [isOwner])

  const applyLoadedContentToRuntime = (codeItems: ContentBankItem[], scenarios: ScenarioBankItem[]) => {
    const sectionsFromItems = codeItems
      .map((item) => {
        const section = contentItemToSection(item)
        if (!section) {
          console.warn(`[content] skipping item "${item.id}" because it is missing/invalid codeSection or category.`)
        }
        return section
      })
      .filter((item): item is CodeSection => Boolean(item))
    const finalSections = dedupeSections(sectionsFromItems).filter((item) => item.sectionNumber && item.title)
    setSections(finalSections)
    setQuestions(buildQuestions(finalSections))
    setScenarioItems(scenarios)
  }

  useEffect(() => {
    document.title = 'LEO Study'
  }, [])

  useEffect(() => {
    if (!supabase || !currentUserId) return
    const client = supabase
    let cancelled = false
    const applyAppSettingsRow = (row: Record<string, unknown> | null | undefined) => {
      const savedAgencies = sanitizeAgencyOptions(row?.agencies)
      setAgencyOptions(savedAgencies)
      setAgencySettingsId(String(row?.id || appSettingsRowId))
      const nextBanner = sanitizeAppBannerSettings({
        banner_enabled: row?.banner_enabled,
        banner_level: row?.banner_level,
        banner_message: row?.banner_message,
        banner_scroll: row?.banner_scroll,
        banner_scroll_speed: row?.banner_scroll_speed,
        banner_scroll_repeat: row?.banner_scroll_repeat,
      })
      setAppBannerSettings(nextBanner)
      setOwnerBannerDraft(nextBanner)
    }

    const loadAppSettings = async () => {
      const { data, error } = await client
        .from('app_settings')
        .select('id,agencies,banner_enabled,banner_level,banner_message,banner_scroll,banner_scroll_speed,banner_scroll_repeat')
        .eq('id', appSettingsRowId)
        .maybeSingle()
      if (cancelled) return
      if (error) {
        console.warn('[app_settings] failed loading agency settings:', error.message)
        return
      }
      applyAppSettingsRow((data || null) as Record<string, unknown> | null)
    }
    loadAppSettings().catch((error) => {
      console.warn('[app_settings] load crashed:', error)
    })

    const channel = client
      .channel(`app-settings-${currentUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_settings', filter: `id=eq.${appSettingsRowId}` },
        (payload) => {
          if (cancelled) return
          applyAppSettingsRow((payload.new || null) as Record<string, unknown> | null)
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      client.removeChannel(channel)
    }
  }, [currentUserId, supabase])

  useEffect(() => {
    setProfileDetails((previous) => {
      const normalized = normalizeAgency(previous.agency, agencyOptions)
      if (normalized === previous.agency) return previous
      return { ...previous, agency: normalized }
    })
  }, [agencyOptions])

  useEffect(() => {
    if (isOwner) return
    if (settingsTab === 'editor' || settingsTab === 'agencies' || settingsTab === 'banner' || settingsTab === 'bug_inbox') {
      setSettingsTab('profile')
    }
  }, [isOwner, settingsTab])

  useEffect(() => {
    if (!isOwner || settingsTab !== 'bug_inbox') return
    void loadOwnerBugReports()
  }, [isOwner, loadOwnerBugReports, settingsTab])

  useEffect(() => {
    if (!supabase || !currentUserId || !isOwner) return
    const client = supabase
    const channel = client
      .channel(`bug-reports-owner-${currentUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bug_reports' },
        () => {
          void loadOwnerBugReports()
        },
      )
      .subscribe()

    return () => {
      client.removeChannel(channel)
    }
  }, [currentUserId, isOwner, loadOwnerBugReports])

  useEffect(() => {
    try {
      window.localStorage.setItem(gamesModeStorageKey, JSON.stringify(gamesSelection))
    } catch {
      // Ignore storage failures.
    }
  }, [gamesSelection])

  useEffect(() => {
    const nav = navigator as Navigator & { deviceMemory?: number }
    const lowCpu = typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 4
    const lowMemory = typeof nav.deviceMemory === 'number' && nav.deviceMemory > 0 && nav.deviceMemory <= 4
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let intelGpu = false
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      if (gl) {
        const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info')
        if (debugInfo) {
          const renderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
          intelGpu = typeof renderer === 'string' && renderer.toLowerCase().includes('intel')
        }
      }
    } catch {
      intelGpu = false
    }
    setReduceVisualEffects(lowCpu || lowMemory || prefersReducedMotion || intelGpu)
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockNowMs(Date.now())
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const pendingSetup = window.localStorage.getItem('pending_profile_setup') === '1'
    if (pendingSetup) {
      setForceProfileSetup(true)
      window.localStorage.removeItem('pending_profile_setup')
    }
  }, [])

  useEffect(
    () => () => {
      if (avatarCropSourceUrl) URL.revokeObjectURL(avatarCropSourceUrl)
      if (profileAvatarPreviewUrl) URL.revokeObjectURL(profileAvatarPreviewUrl)
    },
    [avatarCropSourceUrl, profileAvatarPreviewUrl],
  )

  useEffect(() => {
    if (!profileMenuOpen) return
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (profileMenuRef.current && target && !profileMenuRef.current.contains(target)) {
        setProfileMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', handleOutside)
    return () => window.removeEventListener('mousedown', handleOutside)
  }, [profileMenuOpen])

  useEffect(() => {
    if (!appBannerSettings.enabled || !appBannerSettings.message) {
      setGlobalBannerOffset(0)
      return
    }
    const banner = globalBannerRef.current
    if (!banner) {
      setGlobalBannerOffset(0)
      return
    }

    const measure = () => {
      const styles = window.getComputedStyle(banner)
      const marginBottom = Number.parseFloat(styles.marginBottom || '0') || 0
      const nextOffset = Math.ceil(banner.getBoundingClientRect().height + marginBottom)
      setGlobalBannerOffset(nextOffset)
    }

    measure()
    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(banner)
    window.addEventListener('resize', measure)
    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [
    appBannerSettings.enabled,
    appBannerSettings.message,
    appBannerSettings.scroll,
    appBannerSettings.scrollRepeat,
    appBannerSettings.scrollSpeed,
    appBannerSettings.tone,
  ])

  useEffect(() => {
    let cancelled = false
    let retryTimer: number | null = null
    const queueRetry = () => {
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      retryTimer = window.setTimeout(() => {
        if (cancelled) return
        setContentLoadRetryToken((current) => current + 1)
      }, 15_000)
    }

    const loadFromSupabase = async () => {
      if (!supabase) throw new Error('supabase client is not configured')
      const { data: rows, error } = await supabase
        .from('content_items')
        .select('*')
        .eq('is_published', true)
        .order('updated_at', { ascending: false })

      if (error) throw new Error(error.message || 'failed loading content_items from supabase')

      const codeItems = (rows || []).reduce<ContentBankItem[]>((accumulator, row, index) => {
        const value = row as Record<string, unknown>
        const type = String(value.type || 'code').trim().toLowerCase()
        if (type === 'scenario') return accumulator

        const id = String(value.id || '').trim()
        const category = String(value.category || '').trim().toLowerCase()
        const title = String(value.title || '').trim()
        const question = String(value.question || '').trim()
        if (!id || !category || !title || !question) {
          console.warn(`[content] supabase content_items(code)[${index}] missing required fields, skipping.`)
          return accumulator
        }

        accumulator.push({
          id,
          category,
          title,
          question,
          answer: String(value.answer || '').trim() || undefined,
          tags: Array.isArray(value.tags) ? value.tags.map((entry) => String(entry).trim()).filter(Boolean) : [],
          difficulty: String(value.difficulty || '').trim() || undefined,
          codeSection: String(value.code_section || '').trim() || undefined,
          explanation: String(value.explanation || '').trim() || undefined,
          sourceUrl: String(value.source_url || '').trim() || undefined,
        })
        return accumulator
      }, [])

      const scenarios = (rows || []).reduce<ScenarioBankItem[]>((accumulator, row, index) => {
        const value = row as Record<string, unknown>
        const type = String(value.type || 'code').trim().toLowerCase()
        if (type !== 'scenario') return accumulator

        const id = String(value.id || '').trim()
        const category = String(value.category || 'scenario').trim().toLowerCase()
        const title = String(value.title || '').trim()
        const scenario = String(value.scenario || '').trim()
        const questions = Array.isArray(value.scenario_questions)
          ? value.scenario_questions.map((entry) => String(entry).trim()).filter(Boolean)
          : []
        const subQuestions = Array.isArray(value.scenario_sub_questions)
          ? value.scenario_sub_questions.reduce<ScenarioBankSubQuestion[]>((items, entry) => {
              if (!entry || typeof entry !== 'object') return items
              const record = entry as Record<string, unknown>
              const subQuestionId = String(record.id || '').trim()
              const prompt = String(record.prompt || '').trim()
              const choices = Array.isArray(record.choices)
                ? record.choices.map((choice) => String(choice).trim()).filter(Boolean)
                : []
              const expectedAnswer = String(record.expectedAnswer || record.expected_answer || '').trim()
              if (!subQuestionId || !prompt || choices.length < 2 || !expectedAnswer || !choices.includes(expectedAnswer)) {
                return items
              }
              items.push({
                id: subQuestionId,
                prompt,
                choices,
                expectedAnswer,
                explanation: String(record.explanation || '').trim() || undefined,
              })
              return items
            }, [])
          : []
        if (!id || !category || !title || !scenario || (questions.length === 0 && subQuestions.length === 0)) {
          console.warn(`[content] supabase content_items(scenario)[${index}] missing required fields, skipping.`)
          return accumulator
        }

        accumulator.push({
          id,
          category,
          title,
          scenario,
          questions,
          tmasSet: String(value.tmas_set || '').trim().toLowerCase() === 'tmas2' ? 'tmas2' : 'tmas1',
          subQuestions: subQuestions.length > 0 ? subQuestions : undefined,
          expectedAnswer: String(value.answer || '').trim() || undefined,
          keyPoints: Array.isArray(value.key_points) ? value.key_points.map((entry) => String(entry).trim()).filter(Boolean) : [],
          tags: Array.isArray(value.tags) ? value.tags.map((entry) => String(entry).trim()).filter(Boolean) : [],
          difficulty: String(value.difficulty || '').trim() || undefined,
          codeSection: String(value.code_section || '').trim() || undefined,
          explanation: String(value.explanation || '').trim() || undefined,
          sourceUrl: String(value.source_url || '').trim() || undefined,
        })
        return accumulator
      }, [])

      if (codeItems.length === 0 && scenarios.length === 0) throw new Error('content_items is empty')
      return { codeItems, scenarios }
    }

    const loadContent = async () => {
      if (appContentSource === 'supabase') {
        if (!authReady) return
        if (!currentUserId) {
          setContentWarning('')
          return
        }
        try {
          const supabaseContent = await loadFromSupabase()
          const localBundle = loadLocalContentBundle()
          for (const warning of localBundle.warnings) console.warn(warning)
          const mergedCodeItems = mergeContentById(supabaseContent.codeItems, localBundle.codeItems)
          const mergedScenarios = mergeContentById(supabaseContent.scenarios, localBundle.scenarioItems)
          setContentWarning('')
          applyLoadedContentToRuntime(mergedCodeItems, mergedScenarios)
          return
        } catch (error) {
          console.warn('[content] supabase content unavailable, falling back to local content.', error)
          setContentWarning('Content editor source unavailable, retrying Supabase. Showing local content for now.')
        }

        const localBundle = loadLocalContentBundle()
        for (const warning of localBundle.warnings) console.warn(warning)
        applyLoadedContentToRuntime(localBundle.codeItems, localBundle.scenarioItems)
        queueRetry()
        return
      }

      setContentWarning('')
      const localBundle = loadLocalContentBundle()
      for (const warning of localBundle.warnings) console.warn(warning)
      applyLoadedContentToRuntime(localBundle.codeItems, localBundle.scenarioItems)
    }

    loadContent().catch((error) => {
      console.warn('[content] failed to load content source.', error)
      setSections([])
      setQuestions([])
      setScenarioItems([])
      setContentWarning('Could not load content source. Check local content files.')
    })
    return () => {
      cancelled = true
      if (retryTimer !== null) window.clearTimeout(retryTimer)
    }
  }, [authReady, currentUserId, contentLoadRetryToken])

  useEffect(() => {
    const measure = () => {
      const quizHost = quizFireHostRef.current
      if (quizHost) {
        const width = Math.floor(quizHost.getBoundingClientRect().width)
        if (width > 0) setQuizFireWidth(width)
      }
      const scenarioHost = scenarioFireHostRef.current
      if (scenarioHost) {
        const width = Math.floor(scenarioHost.getBoundingClientRect().width)
        if (width > 0) setScenarioFireWidth(width)
      }
    }
    measure()
    const raf = window.requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
    }
  }, [])

  useEffect(() => {
    matchScoreRef.current = matchScore
  }, [matchScore])

  useEffect(() => {
    highScoresRef.current = highScores
  }, [highScores])

  useEffect(() => {
    leaderboardRef.current = leaderboard
  }, [leaderboard])

  useEffect(() => {
    weeklyLeaderboardRef.current = weeklyLeaderboard
  }, [weeklyLeaderboard])

  useEffect(() => {
    matchRoundRef.current = matchRound
  }, [matchRound])

  useEffect(() => {
    speedScoreRef.current = speedScore
  }, [speedScore])

  useEffect(() => {
    speedAnsweredCountRef.current = speedAnsweredCount
  }, [speedAnsweredCount])

  useEffect(() => {
    matchCorrectCountRef.current = matchCorrectCount
  }, [matchCorrectCount])

  useEffect(() => {
    matchIncorrectCountRef.current = matchIncorrectCount
  }, [matchIncorrectCount])

  useEffect(() => {
    speedCorrectCountRef.current = speedCorrectCount
  }, [speedCorrectCount])

  useEffect(() => {
    speedIncorrectCountRef.current = speedIncorrectCount
  }, [speedIncorrectCount])

  const refreshLeaderboard = async (options: { force?: boolean } = {}): Promise<LeaderboardRefreshResult> => {
    if (!supabase) return { allTimeEntries: [], weeklyEntries: [] }
    const { force = false } = options
    const now = Date.now()
    const refreshMeta = leaderboardRefreshMetaRef.current
    if (!force) {
      if (refreshMeta.promise) return refreshMeta.promise
      if (now - refreshMeta.lastAt < leaderboardRefreshThrottleMs && leaderboardRef.current.length > 0) {
        return {
          allTimeEntries: leaderboardRef.current,
          weeklyEntries: weeklyLeaderboardRef.current,
        }
      }
    }

    const refreshPromise = (async (): Promise<LeaderboardRefreshResult> => {
      const weeklyWindow = getCurrentWeeklyWindowMs(Date.now())
      const currentWeekStartIso = new Date(weeklyWindow.weekStartMs).toISOString()

      const [{ data: allTimeRows, error: allTimeError }, { data: weeklyRows, error: weeklyError }] = await Promise.all([
        supabase
          .from('leaderboard')
          .select('id,user_id,game,score,round,created_at,match_duration,match_filter')
          .order('score', { ascending: false })
          .limit(300),
        supabase
          .from('weekly_leaderboard')
          .select('id,user_id,game,score,round,created_at,updated_at,match_duration,match_filter,week_start')
          .eq('week_start', currentWeekStartIso)
          .order('score', { ascending: false })
          .limit(300),
      ])

      const weeklyTableMissing =
        Boolean(weeklyError) &&
        ['42P01', 'PGRST205'].includes(String((weeklyError as { code?: string } | null)?.code || ''))
      if (allTimeError || !allTimeRows || (weeklyError && !weeklyTableMissing)) {
        setLeaderboardError(allTimeError?.message || weeklyError?.message || 'Could not load leaderboard.')
        return { allTimeEntries: [], weeklyEntries: [] }
      }
      setLeaderboardError('')

      const effectiveWeeklyRows = weeklyTableMissing
        ? allTimeRows.filter((entry) => {
            const createdAt = Date.parse(String(entry.created_at || '')) || 0
            return createdAt >= weeklyWindow.weekStartMs && createdAt < weeklyWindow.nextWeekStartMs
          })
        : (weeklyRows || [])

      const combinedRows = [...allTimeRows, ...effectiveWeeklyRows]
      const userIds = [...new Set(combinedRows.map((entry) => String(entry.user_id)).filter(Boolean))]
      let profilesByUserId: Record<string, { username: string; avatarUrl: string; supporterTier: SupporterTier }> = {}
      let detailsByUserId: Record<string, LeaderboardProfileSnapshot> = {}
      const masteredCodesByUserId: Record<string, number> = {}
      const studySecondsByUserId: Record<string, number> = {}
      const studyDayStreakByUserId: Record<string, number> = {}
      const mostStudiedModeByUserId: Record<string, CodeFilter | null> = {}
      let duelStatsByUserId: Record<string, Record<DuelLeaderboardMode, { wins: number; losses: number; currentWinStreak: number }>> = {}
      let ownerUserIds = new Set<string>()

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id,username,avatar_path,supporter_tier,bio,agency')
          .in('user_id', userIds)
        profilesByUserId = (profiles || []).reduce<Record<string, { username: string; avatarUrl: string; supporterTier: SupporterTier }>>(
          (accumulator, entry) => {
            accumulator[String(entry.user_id)] = {
              username: String(entry.username || ''),
              avatarUrl: toPublicAvatarUrl(String(entry.avatar_path || '')) || defaultAvatarUrl,
              supporterTier: (['free', 'tier2', 'tier5', 'tier10'].includes(String(entry.supporter_tier))
                ? String(entry.supporter_tier)
                : 'free') as SupporterTier,
            }
            return accumulator
          },
          {},
        )
        detailsByUserId = (profiles || []).reduce<Record<string, LeaderboardProfileSnapshot>>((accumulator, entry) => {
          accumulator[String(entry.user_id)] = {
            bio: String(entry.bio || ''),
            agency: String(entry.agency || defaultAgency),
            themeId: appThemePresets[0].id,
            nameStyle: { ...defaultNameStyle },
            homeLeaderboardRotationMs: defaultLeaderboardRotationMs,
            studySeconds: 0,
            studyDayStreak: 0,
            studyModeCounts: { ...defaultUserStats.studyModeCounts },
            masteredCodes: null,
            currentActivity: null,
          }
          return accumulator
        }, {})

        const { data: appStates } = await supabase
          .from('app_state')
          .select('user_id,profile_details')
          .in('user_id', userIds)

        const fallbackMasteryUserIds: string[] = []
        for (const row of appStates || []) {
          const userId = String(row.user_id || '')
          if (!userId) continue
          const parsedDetails = parseLeaderboardProfileSnapshot(row.profile_details)
          const existing = detailsByUserId[userId] ?? {
            bio: '',
            agency: defaultAgency,
            themeId: appThemePresets[0].id,
            nameStyle: { ...defaultNameStyle },
            homeLeaderboardRotationMs: defaultLeaderboardRotationMs,
            studySeconds: 0,
            studyDayStreak: 0,
            studyModeCounts: { ...defaultUserStats.studyModeCounts },
            masteredCodes: null,
            currentActivity: null,
          }
          detailsByUserId[userId] = {
            ...existing,
            bio: parsedDetails.bio || existing.bio,
            agency: existing.agency && existing.agency !== defaultAgency ? existing.agency : parsedDetails.agency,
            themeId: parsedDetails.themeId || existing.themeId,
            nameStyle: parsedDetails.nameStyle,
            homeLeaderboardRotationMs: parsedDetails.homeLeaderboardRotationMs,
            studySeconds: parsedDetails.studySeconds,
            studyDayStreak: parsedDetails.studyDayStreak,
            studyModeCounts: parsedDetails.studyModeCounts,
            masteredCodes: parsedDetails.masteredCodes,
            currentActivity: parsedDetails.currentActivity,
          }
          if (parsedDetails.masteredCodes === null) {
            fallbackMasteryUserIds.push(userId)
          } else {
            masteredCodesByUserId[userId] = parsedDetails.masteredCodes
          }
          studySecondsByUserId[userId] = parsedDetails.studySeconds
          studyDayStreakByUserId[userId] = parsedDetails.studyDayStreak
          mostStudiedModeByUserId[userId] = mostStudiedModeFromCounts(parsedDetails.studyModeCounts)
        }

        const uniqueFallbackMasteryUserIds = [...new Set(fallbackMasteryUserIds)]
        if (uniqueFallbackMasteryUserIds.length > 0) {
          const { data: fallbackRows } = await supabase
            .from('app_state')
            .select('user_id,performance')
            .in('user_id', uniqueFallbackMasteryUserIds)
          for (const row of fallbackRows || []) {
            const userId = String(row.user_id || '')
            if (!userId) continue
            masteredCodesByUserId[userId] = countMasteredCodesFromPerformanceMap((row as Record<string, unknown>).performance)
          }
          for (const userId of uniqueFallbackMasteryUserIds) {
            if (typeof masteredCodesByUserId[userId] !== 'number') masteredCodesByUserId[userId] = 0
          }
        }

        const { data: roleRows } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'owner')
          .in('user_id', userIds)
        ownerUserIds = new Set((roleRows || []).map((entry) => String(entry.user_id || '')))

        const { data: duelRows, error: duelError } = await supabase
          .from('duel_player_stats')
          .select('user_id,game_type,wins,losses,current_win_streak')
          .in('game_type', duelLeaderboardModeOrder)
          .in('user_id', userIds)
        if (!duelError) {
          duelStatsByUserId = (duelRows || []).reduce<Record<string, Record<DuelLeaderboardMode, { wins: number; losses: number; currentWinStreak: number }>>>((accumulator, entry) => {
            const userId = String(entry.user_id || '')
            const gameType = String((entry as Record<string, unknown>).game_type || 'all') as DuelLeaderboardMode
            if (!userId) return accumulator
            if (!duelLeaderboardModeOrder.includes(gameType)) return accumulator
            const current = accumulator[userId] || {
              all: { wins: 0, losses: 0, currentWinStreak: 0 },
              matching: { wins: 0, losses: 0, currentWinStreak: 0 },
              quiz: { wins: 0, losses: 0, currentWinStreak: 0 },
            }
            current[gameType] = {
              wins: Number(entry.wins || 0),
              losses: Number(entry.losses || 0),
              currentWinStreak: Number(entry.current_win_streak || 0),
            }
            accumulator[userId] = current
            return accumulator
          }, {})
        }
      }

      const mapEntries = (rows: Array<Record<string, unknown>>, useUpdatedAt = false) =>
        rows.map(
          (entry): LeaderboardEntry => {
            const userId = String(entry.user_id || '')
            const duelStats = duelStatsByUserId[userId]?.all
            const timestampSource = useUpdatedAt ? entry.updated_at || entry.created_at : entry.created_at
            return {
              id: String(entry.id),
              userId,
              game: String(entry.game),
              playerName: profilesByUserId[userId]?.username || 'Player',
              avatarUrl: profilesByUserId[userId]?.avatarUrl || defaultAvatarUrl,
              supporterTier: profilesByUserId[userId]?.supporterTier || 'free',
              bio: detailsByUserId[userId]?.bio || '',
              agency: detailsByUserId[userId]?.agency || '',
              nameStyle: detailsByUserId[userId]?.nameStyle || { ...defaultNameStyle },
              themeId: detailsByUserId[userId]?.themeId || appThemePresets[0].id,
              isOwner: ownerUserIds.has(userId),
              matchDuration: typeof entry.match_duration === 'number' ? entry.match_duration : null,
              matchFilter: (['all', 'penal', 'hs', 'vehicle'].includes(String(entry.match_filter))
                ? String(entry.match_filter)
                : null) as CodeFilter | null,
              score: Number(entry.score || 0),
              round: Number(entry.round || 0),
              createdAt: Date.parse(String(timestampSource || '')) || Date.now(),
              masteredCodes: masteredCodesByUserId[userId] || 0,
              studySeconds: studySecondsByUserId[userId] || 0,
              studyDayStreak: studyDayStreakByUserId[userId] || 0,
              mostStudiedMode: mostStudiedModeByUserId[userId] || null,
              duelWins: duelStats?.wins || 0,
              duelLosses: duelStats?.losses || 0,
              duelCurrentWinStreak: duelStats?.currentWinStreak || 0,
              currentActivity: detailsByUserId[userId]?.currentActivity || null,
            }
          },
        )

      const allTimeEntries = topEntryPerUserMode(mapEntries(allTimeRows as Array<Record<string, unknown>>))
      const weeklyEntries = topEntryPerUserMode(
        mapEntries(effectiveWeeklyRows as Array<Record<string, unknown>>, !weeklyTableMissing),
      )

      setLeaderboard(allTimeEntries)
      setWeeklyLeaderboard(weeklyEntries)
      leaderboardRef.current = allTimeEntries
      weeklyLeaderboardRef.current = weeklyEntries
      return { allTimeEntries, weeklyEntries }
    })()

    leaderboardRefreshMetaRef.current.promise = refreshPromise
    try {
      const result = await refreshPromise
      leaderboardRefreshMetaRef.current.lastAt = Date.now()
      return result
    } finally {
      if (leaderboardRefreshMetaRef.current.promise === refreshPromise) {
        leaderboardRefreshMetaRef.current.promise = null
      }
    }
  }

  const refreshHomeLeaderboards = async (options: { force?: boolean } = {}) => {
    if (!supabase) return
    const { force = false } = options
    const now = Date.now()
    const refreshMeta = homeLeaderboardRefreshMetaRef.current
    if (!force) {
      if (refreshMeta.promise) return refreshMeta.promise
      if (now - refreshMeta.lastAt < homeLeaderboardRefreshThrottleMs) return
    }

    const refreshPromise = (async () => {
      const { data: states, error } = await supabase
        .from('app_state')
        .select('user_id,profile_details')
        .limit(400)
      if (error || !states) return

      const userIds = [...new Set(states.map((entry) => String(entry.user_id || '')))].filter(Boolean)
      let profileMap: Record<string, { username: string; avatarUrl: string; supporterTier: SupporterTier }> = {}
      let duelStatsByUserId: Record<string, Record<DuelLeaderboardMode, { wins: number; losses: number; currentWinStreak: number }>> = {}
      let ownerUserIds = new Set<string>()
      const detailsByUserId: Record<string, LeaderboardProfileSnapshot> = {}
      const masteredCodesByUserId: Record<string, number> = {}

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id,username,avatar_path,supporter_tier')
          .in('user_id', userIds)
        profileMap = (profiles || []).reduce<Record<string, { username: string; avatarUrl: string; supporterTier: SupporterTier }>>((accumulator, entry) => {
          accumulator[String(entry.user_id)] = {
            username: String(entry.username || 'Player'),
            avatarUrl: toPublicAvatarUrl(String(entry.avatar_path || '')) || defaultAvatarUrl,
            supporterTier: (['free', 'tier2', 'tier5', 'tier10'].includes(String(entry.supporter_tier)) ? String(entry.supporter_tier) : 'free') as SupporterTier,
          }
          return accumulator
        }, {})

        const { data: roleRows } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'owner')
          .in('user_id', userIds)
        ownerUserIds = new Set((roleRows || []).map((entry) => String(entry.user_id || '')))

        const { data: duelRows, error: duelError } = await supabase
          .from('duel_player_stats')
          .select('user_id,game_type,wins,losses,current_win_streak')
          .in('game_type', duelLeaderboardModeOrder)
          .in('user_id', userIds)
        if (!duelError) {
          duelStatsByUserId = (duelRows || []).reduce<Record<string, Record<DuelLeaderboardMode, { wins: number; losses: number; currentWinStreak: number }>>>((accumulator, entry) => {
            const userId = String(entry.user_id || '')
            const gameType = String((entry as Record<string, unknown>).game_type || 'all') as DuelLeaderboardMode
            if (!userId) return accumulator
            if (!duelLeaderboardModeOrder.includes(gameType)) return accumulator
            const current = accumulator[userId] || {
              all: { wins: 0, losses: 0, currentWinStreak: 0 },
              matching: { wins: 0, losses: 0, currentWinStreak: 0 },
              quiz: { wins: 0, losses: 0, currentWinStreak: 0 },
            }
            current[gameType] = {
              wins: Number(entry.wins || 0),
              losses: Number(entry.losses || 0),
              currentWinStreak: Number(entry.current_win_streak || 0),
            }
            accumulator[userId] = current
            return accumulator
          }, {})
        }
      }

      const fallbackMasteryUserIds: string[] = []
      for (const row of states) {
        const userId = String(row.user_id || '')
        if (!userId) continue
        const parsedDetails = parseLeaderboardProfileSnapshot((row as Record<string, unknown>).profile_details)
        detailsByUserId[userId] = parsedDetails
        if (parsedDetails.masteredCodes === null) {
          fallbackMasteryUserIds.push(userId)
        } else {
          masteredCodesByUserId[userId] = parsedDetails.masteredCodes
        }
      }

      const uniqueFallbackMasteryUserIds = [...new Set(fallbackMasteryUserIds)]
      if (uniqueFallbackMasteryUserIds.length > 0) {
        const { data: fallbackRows } = await supabase
          .from('app_state')
          .select('user_id,performance')
          .in('user_id', uniqueFallbackMasteryUserIds)
        for (const row of fallbackRows || []) {
          const userId = String(row.user_id || '')
          if (!userId) continue
          masteredCodesByUserId[userId] = countMasteredCodesFromPerformanceMap((row as Record<string, unknown>).performance)
        }
        for (const userId of uniqueFallbackMasteryUserIds) {
          if (typeof masteredCodesByUserId[userId] !== 'number') masteredCodesByUserId[userId] = 0
        }
      }

      const studyRows: HomeLeaderboardEntry[] = []
      const studyStreakRows: HomeLeaderboardEntry[] = []
      const masteredRows: HomeLeaderboardEntry[] = []
      const duelWinsRowsByMode: Record<DuelLeaderboardMode, HomeLeaderboardEntry[]> = {
        all: [],
        matching: [],
        quiz: [],
      }
      const duelStreakRowsByMode: Record<DuelLeaderboardMode, HomeLeaderboardEntry[]> = {
        all: [],
        matching: [],
        quiz: [],
      }
      let ownerRotationMs: number | null = null
      for (const row of states) {
        const userId = String(row.user_id || '')
        if (!userId) continue
        const details = detailsByUserId[userId] || {
          bio: '',
          agency: defaultAgency,
          themeId: appThemePresets[0].id,
          nameStyle: { ...defaultNameStyle },
          homeLeaderboardRotationMs: defaultLeaderboardRotationMs,
          studySeconds: 0,
          studyDayStreak: 0,
          studyModeCounts: { ...defaultUserStats.studyModeCounts },
          masteredCodes: null,
          currentActivity: null,
        }
        if (ownerRotationMs === null && ownerUserIds.has(userId)) {
          ownerRotationMs = details.homeLeaderboardRotationMs
        }
        const profile = profileMap[userId] || { username: 'Player', avatarUrl: defaultAvatarUrl, supporterTier: 'free' as SupporterTier }
        const masteredCount = masteredCodesByUserId[userId] || 0
        const studySeconds = details.studySeconds
        const studyDayStreak = details.studyDayStreak
        const mostStudiedMode = mostStudiedModeFromCounts(details.studyModeCounts)
        const duelStatsByMode = duelStatsByUserId[userId] || {
          all: { wins: 0, losses: 0, currentWinStreak: 0 },
          matching: { wins: 0, losses: 0, currentWinStreak: 0 },
          quiz: { wins: 0, losses: 0, currentWinStreak: 0 },
        }
        const duelStats = duelStatsByMode.all
        studyRows.push({
          userId,
          playerName: profile.username,
          avatarUrl: profile.avatarUrl,
          supporterTier: profile.supporterTier,
          themeId: details.themeId || appThemePresets[0].id,
          nameStyle: details.nameStyle,
          bio: details.bio,
          agency: details.agency,
          isOwner: ownerUserIds.has(userId),
          value: studySeconds,
          masteredCodes: masteredCount,
          studySeconds,
          studyDayStreak,
          mostStudiedMode,
          duelWins: duelStats.wins,
          duelLosses: duelStats.losses,
          duelCurrentWinStreak: duelStats.currentWinStreak,
          currentActivity: details.currentActivity,
        })
        studyStreakRows.push({
          userId,
          playerName: profile.username,
          avatarUrl: profile.avatarUrl,
          supporterTier: profile.supporterTier,
          themeId: details.themeId || appThemePresets[0].id,
          nameStyle: details.nameStyle,
          bio: details.bio,
          agency: details.agency,
          isOwner: ownerUserIds.has(userId),
          value: studyDayStreak,
          masteredCodes: masteredCount,
          studySeconds,
          studyDayStreak,
          mostStudiedMode,
          duelWins: duelStats.wins,
          duelLosses: duelStats.losses,
          duelCurrentWinStreak: duelStats.currentWinStreak,
          currentActivity: details.currentActivity,
        })
        masteredRows.push({
          userId,
          playerName: profile.username,
          avatarUrl: profile.avatarUrl,
          supporterTier: profile.supporterTier,
          themeId: details.themeId || appThemePresets[0].id,
          nameStyle: details.nameStyle,
          bio: details.bio,
          agency: details.agency,
          isOwner: ownerUserIds.has(userId),
          value: masteredCount,
          masteredCodes: masteredCount,
          studySeconds,
          studyDayStreak,
          mostStudiedMode,
          duelWins: duelStats.wins,
          duelLosses: duelStats.losses,
          duelCurrentWinStreak: duelStats.currentWinStreak,
          currentActivity: details.currentActivity,
        })

        for (const mode of duelLeaderboardModeOrder) {
          const duelModeStats = duelStatsByMode[mode]
          if (duelModeStats.wins > 0) {
            duelWinsRowsByMode[mode].push({
              userId,
              playerName: profile.username,
              avatarUrl: profile.avatarUrl,
              supporterTier: profile.supporterTier,
              themeId: details.themeId || appThemePresets[0].id,
              nameStyle: details.nameStyle,
              bio: details.bio,
              agency: details.agency,
              isOwner: ownerUserIds.has(userId),
              value: duelModeStats.wins,
              masteredCodes: masteredCount,
              studySeconds,
              studyDayStreak,
              mostStudiedMode,
              duelWins: duelModeStats.wins,
              duelLosses: duelModeStats.losses,
              duelCurrentWinStreak: duelModeStats.currentWinStreak,
              currentActivity: details.currentActivity,
            })
          }
          if (duelModeStats.currentWinStreak > 0) {
            duelStreakRowsByMode[mode].push({
              userId,
              playerName: profile.username,
              avatarUrl: profile.avatarUrl,
              supporterTier: profile.supporterTier,
              themeId: details.themeId || appThemePresets[0].id,
              nameStyle: details.nameStyle,
              bio: details.bio,
              agency: details.agency,
              isOwner: ownerUserIds.has(userId),
              value: duelModeStats.currentWinStreak,
              masteredCodes: masteredCount,
              studySeconds,
              studyDayStreak,
              mostStudiedMode,
              duelWins: duelModeStats.wins,
              duelLosses: duelModeStats.losses,
              duelCurrentWinStreak: duelModeStats.currentWinStreak,
              currentActivity: details.currentActivity,
            })
          }
        }
      }

      setHomeStudyTimeLeaders(studyRows.filter((entry) => entry.value > 0).sort((left, right) => right.value - left.value).slice(0, 5))
      setHomeStudyStreakLeaders(studyStreakRows.filter((entry) => entry.value > 0).sort((left, right) => right.value - left.value).slice(0, 5))
      setHomeMostMasteredLeaders(masteredRows.filter((entry) => entry.value > 0).sort((left, right) => right.value - left.value).slice(0, 5))
      setHomeDuelWinsLeadersByMode({
        all: duelWinsRowsByMode.all
          .sort((left, right) => right.duelWins - left.duelWins || right.duelCurrentWinStreak - left.duelCurrentWinStreak || left.duelLosses - right.duelLosses)
          .slice(0, 5),
        matching: duelWinsRowsByMode.matching
          .sort((left, right) => right.duelWins - left.duelWins || right.duelCurrentWinStreak - left.duelCurrentWinStreak || left.duelLosses - right.duelLosses)
          .slice(0, 5),
        quiz: duelWinsRowsByMode.quiz
          .sort((left, right) => right.duelWins - left.duelWins || right.duelCurrentWinStreak - left.duelCurrentWinStreak || left.duelLosses - right.duelLosses)
          .slice(0, 5),
      })
      setHomeDuelStreakLeadersByMode({
        all: duelStreakRowsByMode.all
          .sort((left, right) => right.duelCurrentWinStreak - left.duelCurrentWinStreak || right.duelWins - left.duelWins || left.duelLosses - right.duelLosses)
          .slice(0, 5),
        matching: duelStreakRowsByMode.matching
          .sort((left, right) => right.duelCurrentWinStreak - left.duelCurrentWinStreak || right.duelWins - left.duelWins || left.duelLosses - right.duelLosses)
          .slice(0, 5),
        quiz: duelStreakRowsByMode.quiz
          .sort((left, right) => right.duelCurrentWinStreak - left.duelCurrentWinStreak || right.duelWins - left.duelWins || left.duelLosses - right.duelLosses)
          .slice(0, 5),
      })
      if (ownerRotationMs !== null) {
        setLeaderboardRotateMs(ownerRotationMs)
      }
    })()

    homeLeaderboardRefreshMetaRef.current.promise = refreshPromise
    try {
      await refreshPromise
      homeLeaderboardRefreshMetaRef.current.lastAt = Date.now()
    } finally {
      if (homeLeaderboardRefreshMetaRef.current.promise === refreshPromise) {
        homeLeaderboardRefreshMetaRef.current.promise = null
      }
    }
  }

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true)
      return
    }
    const client = supabase

    const init = async () => {
      const {
        data: { session },
      } = await client.auth.getSession()

      if (session?.user) {
        setCurrentUserId(session.user.id)
        setCurrentUserEmail(session.user.email || '')
        setCurrentUserProvider(String(session.user.app_metadata?.provider || 'email'))
      }

      setAuthReady(true)
    }

    init().catch(() => setAuthReady(true))

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setCurrentUserId(session.user.id)
        setCurrentUserEmail(session.user.email || '')
        setCurrentUserProvider(String(session.user.app_metadata?.provider || 'email'))
      } else {
        setCurrentUserId('')
        setCurrentUserEmail('')
        setCurrentUserProvider('email')
        setProfile(null)
        setRemoteTrackScoreHistory({})
        setRemoteScoreTimeline([])
        setStateHydrated(false)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabase || !currentUserId) {
      return
    }
    const client = supabase

    const hydrate = async () => {
      const { data: banRow, error: banLookupErrorRaw } = await client
        .from('banned_users')
        .select('user_id,reason')
        .eq('user_id', currentUserId)
        .maybeSingle()

      const banLookupError = banLookupErrorRaw as { code?: string; message?: string } | null
      const bannedTableMissing = banLookupError && ['42P01', '42703'].includes(String(banLookupError.code || ''))
      if (banLookupError && !bannedTableMissing) {
        console.warn('[banned_users] lookup failed:', banLookupError.message || banLookupError)
      }

      if (!banLookupError && banRow?.user_id) {
        const reason = String((banRow as Record<string, unknown>).reason || '').trim()
        setAuthError(reason ? `This account has been banned: ${reason}` : 'This account has been banned.')
        await client.auth.signOut()
        setCurrentUserId('')
        setCurrentUserEmail('')
        setCurrentUserProvider('email')
        setProfile(null)
        setStateHydrated(false)
        navigate('/signin', { replace: true })
        return
      }

      const { data: profileRow } = await client
        .from('profiles')
        .select('user_id,username,avatar_path,supporter_tier,bio,agency,created_at')
        .eq('user_id', currentUserId)
        .maybeSingle()

      if (profileRow) {
        const mapped = mapProfileRow(profileRow as Record<string, unknown>, currentUserId)
        setProfile(mapped)
        setProfileUsername(mapped.username)
        setForceProfileSetup(false)
      } else {
        setProfile({ userId: currentUserId, username: '', avatarPath: '', avatarUrl: defaultAvatarUrl, supporterTier: 'free', isOwner: false, createdAt: '' })
        setProfileUsername('')
        setForceProfileSetup(true)
      }

      const { data: stateRow } = await client
        .from('app_state')
        .select('performance,high_scores,best_streak,profile_details,updated_at')
        .eq('user_id', currentUserId)
        .maybeSingle()

      const nextState = sanitizeState(
        stateRow
          ? {
              performance: stateRow.performance,
              highScores: stateRow.high_scores,
              bestStreak: stateRow.best_streak,
              profileDetails: stateRow.profile_details,
            }
          : null,
      )

      setPerformance(nextState.performance)
      setHighScores(nextState.highScores)
      setBestStreak(nextState.bestStreak)
      const profileBio = String(profileRow?.bio || '')
      const profileAgency = String(profileRow?.agency || '')
      setProfileDetails({
        bio: profileBio || nextState.profileDetails.bio,
        agency: profileAgency || nextState.profileDetails.agency,
        displayMode: nextState.profileDetails.displayMode,
        homeLeaderboardRotationMs: nextState.profileDetails.homeLeaderboardRotationMs,
        homeLeaderboardPreferences: nextState.profileDetails.homeLeaderboardPreferences,
        themeId: nextState.profileDetails.themeId,
        nameStyle: nextState.profileDetails.nameStyle,
        namePresets: nextState.profileDetails.namePresets,
        systemNoticesSeen: nextState.profileDetails.systemNoticesSeen,
        stats: nextState.profileDetails.stats,
        currentActivity: nextState.profileDetails.currentActivity,
      })

      const { data: historyRows, error: historyError } = await client
        .from('game_attempt_history')
        .select('track_key,score,created_at')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: true })
        .limit(historyHydrateLimit)

      if (!historyError && Array.isArray(historyRows)) {
        const nextTrackHistory: Record<string, number[]> = {}
        const nextTimeline: ScoreTimelinePoint[] = []
        for (const rawRow of historyRows) {
          const row = rawRow as Record<string, unknown>
          const trackKey = String(row.track_key || '').trim()
          if (!trackKey) continue
          const score = Math.max(0, Math.round(Number(row.score || 0)))
          const at = Date.parse(String(row.created_at || '')) || Date.now()
          if (!nextTrackHistory[trackKey]) nextTrackHistory[trackKey] = []
          nextTrackHistory[trackKey].push(score)
          nextTimeline.push({ at, score })
        }
        const compactTrackHistory = Object.entries(nextTrackHistory).reduce<Record<string, number[]>>((accumulator, [trackKey, scores]) => {
          accumulator[trackKey] = compressTrendPoints(scores, remoteTrackHistoryMaxPoints)
          return accumulator
        }, {})
        setRemoteTrackScoreHistory(compactTrackHistory)
        setRemoteScoreTimeline(compressTimelinePoints(nextTimeline, remoteTimelineMaxPoints))
      } else {
        setRemoteTrackScoreHistory({})
        setRemoteScoreTimeline([])
      }

      lastAppStateUpdateRef.current = Date.parse(String(stateRow?.updated_at || '')) || Date.now()
      setStateHydrated(true)

      await refreshLeaderboard({ force: true })
      await refreshHomeLeaderboards({ force: true })
    }

    hydrate().catch(() => undefined)
  }, [currentUserId, navigate])

  useEffect(() => {
    if (!supabase || !stateHydrated || !currentUserId) return
    const client = supabase

    const timeout = setTimeout(() => {
      void (async () => {
        const algorithmSnapshot = buildAlgorithmSnapshot(sections, performance)
        const { data } = await client
          .from('app_state')
          .upsert(
            {
              user_id: currentUserId,
              performance,
              high_scores: highScores,
              best_streak: bestStreak,
              profile_details: {
                ...profileDetails,
                algorithmSnapshot,
              },
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' },
          )
          .select('updated_at')
          .maybeSingle()

        const next = Date.parse(String(data?.updated_at || '')) || Date.now()
        lastAppStateUpdateRef.current = Math.max(lastAppStateUpdateRef.current, next)
      })()
    }, 500)

    return () => clearTimeout(timeout)
  }, [currentUserId, stateHydrated, performance, highScores, bestStreak, profileDetails, sections])

  useEffect(() => {
    if (!supabase || !currentUserId) return
    const client = supabase
    const channel = client
      .channel(`sync-${currentUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_state', filter: `user_id=eq.${currentUserId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>
          const nextUpdatedAt = Date.parse(String(row.updated_at || '')) || 0
          if (nextUpdatedAt <= lastAppStateUpdateRef.current) return

          const nextState = sanitizeState({
            performance: row.performance,
            highScores: row.high_scores,
            bestStreak: row.best_streak,
            profileDetails: row.profile_details,
          })
          setPerformance(nextState.performance)
          setHighScores(nextState.highScores)
          setBestStreak(nextState.bestStreak)
          setProfileDetails(nextState.profileDetails)
          lastAppStateUpdateRef.current = nextUpdatedAt
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `user_id=eq.${currentUserId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>
          const mapped = mapProfileRow(row, currentUserId)
          setProfile(mapped)
          if (mapped.username) setProfileUsername(mapped.username)
          setProfileDetails((previous) => ({
            bio: String(row.bio || ''),
            agency: String(row.agency || ''),
            displayMode: previous.displayMode,
            homeLeaderboardRotationMs: previous.homeLeaderboardRotationMs,
            homeLeaderboardPreferences: previous.homeLeaderboardPreferences,
            themeId: previous.themeId,
            nameStyle: previous.nameStyle,
            namePresets: previous.namePresets,
            systemNoticesSeen: previous.systemNoticesSeen,
            stats: previous.stats,
            currentActivity: previous.currentActivity,
          }))
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'game_attempt_history', filter: `user_id=eq.${currentUserId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>
          const trackKey = String(row.track_key || '').trim()
          if (!trackKey) return
          const score = Math.max(0, Math.round(Number(row.score || 0)))
          const at = Date.parse(String(row.created_at || '')) || Date.now()
          setRemoteTrackScoreHistory((previous) => {
            const next = { ...previous }
            const appended = [...(next[trackKey] || []), score]
            next[trackKey] =
              appended.length > remoteTrackHistoryMaxPoints
                ? compressTrendPoints(appended, remoteTrackHistoryMaxPoints)
                : appended
            return next
          })
          setRemoteScoreTimeline((previous) => compressTimelinePoints([...previous, { at, score }], remoteTimelineMaxPoints))
        },
      )
      .subscribe()

    return () => {
      client.removeChannel(channel)
    }
  }, [currentUserId, supabase])

  useEffect(() => {
    if (!supabase || !currentUserId) return
    const client = supabase
    const timer = setInterval(async () => {
      const { data: profileRow } = await client
        .from('profiles')
        .select('user_id,username,avatar_path,supporter_tier,bio,agency,created_at')
        .eq('user_id', currentUserId)
        .maybeSingle()
      if (!profileRow) return
      const mapped = mapProfileRow(profileRow as Record<string, unknown>, currentUserId)
      setProfile(mapped)
    }, 20000)

    return () => clearInterval(timer)
  }, [currentUserId, supabase])

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let refreshTimer: number | null = null

    const queueRefresh = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null
        void refreshLeaderboard({ force: true })
        void refreshHomeLeaderboards({ force: true })
      }, 140)
    }

    const channel = client
      .channel('leaderboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leaderboard' }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_leaderboard' }, queueRefresh)
      .subscribe()

    return () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
      client.removeChannel(channel)
    }
  }, [currentUserId, supabase])

  const filteredSections = useMemo(
    () => sections.filter((section) => section.codeSet === libraryFilter),
    [sections, libraryFilter],
  )

  const studyFlashSessionCards = useMemo(() => {
    const list = studyFlashSessionFilter === 'all'
      ? sections
      : sections.filter((section) => section.codeSet === studyFlashSessionFilter)
    return list.map(
      (section) =>
        ({
          id: section.id,
          codeSet: section.codeSet,
          front: section.sectionNumber,
          back: `${section.title}\n\n${shortText(section.text, 260)}`,
        }) satisfies Flashcard,
    )
  }, [sections, studyFlashSessionFilter])
  const orderedStudyFlashSessionCards = useMemo(() => {
    if (studyFlashSessionCards.length === 0) return []
    if (studyFlashSessionOrder.length === 0) return studyFlashSessionCards
    const byId = new Map(studyFlashSessionCards.map((card) => [card.id, card]))
    const ordered = studyFlashSessionOrder.map((id) => byId.get(id)).filter(Boolean) as Flashcard[]
    return ordered.length > 0 ? ordered : studyFlashSessionCards
  }, [studyFlashSessionCards, studyFlashSessionOrder])

  const matchingLeaderboard = useMemo(
    () =>
      topEntryPerUser(
        leaderboard
          .filter((entry) => entry.game === 'Matching')
          .filter((entry) => entry.matchDuration === gamesSelection.duration && entry.matchFilter === gamesSelection.filter),
      )
        .slice(0, 8),
    [leaderboard, gamesSelection.duration, gamesSelection.filter],
  )

  const speedLeaderboard = useMemo(
    () =>
      topEntryPerUser(
        leaderboard
          .filter((entry) => entry.game === 'Speed Test')
          .filter((entry) => entry.matchDuration === gamesSelection.duration && entry.matchFilter === gamesSelection.filter),
      )
        .slice(0, 8),
    [leaderboard, gamesSelection.duration, gamesSelection.filter],
  )
  const duelHubLeaderboard = useMemo(() => {
    const perUser = new Map<string, LeaderboardEntry>()
    for (const entry of leaderboard) {
      if (entry.duelWins <= 0 && entry.duelCurrentWinStreak <= 0) continue
      const current = perUser.get(entry.userId)
      if (
        !current ||
        entry.duelWins > current.duelWins ||
        (entry.duelWins === current.duelWins && entry.duelCurrentWinStreak > current.duelCurrentWinStreak) ||
        (entry.duelWins === current.duelWins &&
          entry.duelCurrentWinStreak === current.duelCurrentWinStreak &&
          entry.duelLosses < current.duelLosses)
      ) {
        perUser.set(entry.userId, entry)
      }
    }
    return Array.from(perUser.values())
      .sort(
        (left, right) =>
          right.duelWins - left.duelWins ||
          right.duelCurrentWinStreak - left.duelCurrentWinStreak ||
          left.duelLosses - right.duelLosses,
      )
      .slice(0, 8)
  }, [leaderboard])
  const homeMatchingLeaders = useMemo(
    () =>
      topEntryPerUser(
        leaderboard
          .filter((entry) => entry.game === 'Matching')
          .filter((entry) => entry.score > 0)
          .filter((entry) => entry.matchDuration === homeMatchingDurationFilter)
          .filter((entry) => entry.matchFilter === homeMatchingCodeFilter),
      )
        .slice(0, 5),
    [leaderboard, homeMatchingDurationFilter, homeMatchingCodeFilter],
  )
  const homeSpeedLeaders = useMemo(
    () =>
      topEntryPerUser(
        leaderboard
          .filter((entry) => entry.game === 'Speed Test')
          .filter((entry) => entry.score > 0)
          .filter((entry) => entry.matchDuration === homeSpeedDurationFilter)
          .filter((entry) => entry.matchFilter === homeSpeedCodeFilter),
      )
        .slice(0, 5),
    [leaderboard, homeSpeedDurationFilter, homeSpeedCodeFilter],
  )
  const homeMatchingRotationSteps = useMemo(
    () =>
      homeLeaderboardRotationSteps.filter((step) =>
        leaderboard.some(
          (entry) =>
            entry.game === 'Matching' &&
            entry.score > 0 &&
            entry.matchDuration === step.duration &&
            entry.matchFilter === step.codeSet,
        ),
      ),
    [leaderboard],
  )
  const homeSpeedRotationSteps = useMemo(
    () =>
      homeLeaderboardRotationSteps.filter((step) =>
        leaderboard.some(
          (entry) =>
            entry.game === 'Speed Test' &&
            entry.score > 0 &&
            entry.matchDuration === step.duration &&
            entry.matchFilter === step.codeSet,
        ),
      ),
    [leaderboard],
  )
  const homeLeaderboardPreferences = useMemo(
    () => sanitizeHomeLeaderboardPreferences(profileDetails.homeLeaderboardPreferences),
    [profileDetails.homeLeaderboardPreferences],
  )
  const effectiveHomeLeaderboardPreferences = useMemo(
    () =>
      sanitizeHomeLeaderboardPreferences(
        homeLeaderboardSettingsOpen ? homeLeaderboardSettingsDraft : homeLeaderboardPreferences,
      ),
    [homeLeaderboardPreferences, homeLeaderboardSettingsDraft, homeLeaderboardSettingsOpen],
  )
  const homeVisibleLeaderboardCards = useMemo(() => {
    return homeLeaderboardCardOrder.filter((card) => effectiveHomeLeaderboardPreferences.visibleCards.includes(card))
  }, [effectiveHomeLeaderboardPreferences])
  const homeShowsStudyTimeLeaderboard = homeVisibleLeaderboardCards.includes('study_time')
  const homeShowsStudyStreakLeaderboard = homeVisibleLeaderboardCards.includes('study_streak')
  const homeShowsMatchingLeaderboard = homeVisibleLeaderboardCards.includes('matching')
  const homeShowsSpeedLeaderboard = homeVisibleLeaderboardCards.includes('speed')
  const homeShowsMasteredLeaderboard = homeVisibleLeaderboardCards.includes('mastered')
  const homeShowsDuelWinsLeaderboard = homeVisibleLeaderboardCards.includes('duel_wins')
  const homeShowsDuelStreakLeaderboard = homeVisibleLeaderboardCards.includes('duel_streak')
  const homeDuelWinsMode = effectiveHomeLeaderboardPreferences.duelWinsMode
  const homeDuelStreakMode = effectiveHomeLeaderboardPreferences.duelStreakMode
  const homeDuelWinsLeaders = homeDuelWinsLeadersByMode[homeDuelWinsMode] || []
  const homeDuelStreakLeaders = homeDuelStreakLeadersByMode[homeDuelStreakMode] || []
  const weeklyLeaderboardEntries = weeklyLeaderboard
  const gamesModeLeaderboardSource = useMemo(
    () => (gameModeLeaderboardsScope === 'weekly' ? weeklyLeaderboardEntries : leaderboard),
    [gameModeLeaderboardsScope, weeklyLeaderboardEntries, leaderboard],
  )
  const matchingModeLeaderboard = useMemo(
    () =>
      topEntryPerUser(
        gamesModeLeaderboardSource
          .filter((entry) => entry.game === 'Matching')
          .filter((entry) => entry.matchDuration === gamesSelection.duration && entry.matchFilter === gamesSelection.filter),
      ).slice(0, 8),
    [gamesModeLeaderboardSource, gamesSelection.duration, gamesSelection.filter],
  )
  const speedModeLeaderboard = useMemo(
    () =>
      topEntryPerUser(
        gamesModeLeaderboardSource
          .filter((entry) => entry.game === 'Speed Test')
          .filter((entry) => entry.matchDuration === gamesSelection.duration && entry.matchFilter === gamesSelection.filter),
      ).slice(0, 8),
    [gamesModeLeaderboardSource, gamesSelection.duration, gamesSelection.filter],
  )
  const allTimeLeaderboardBoards = useMemo(() => buildLeaderboardBoards(leaderboard), [leaderboard])
  const weeklyLeaderboardBoards = useMemo(
    () => buildLeaderboardBoards(weeklyLeaderboardEntries),
    [weeklyLeaderboardEntries],
  )
  const allTimeFirstSpotCountsByUser = useMemo(
    () => buildLeaderboardFirstPlaceCountMap(allTimeLeaderboardBoards),
    [allTimeLeaderboardBoards],
  )
  const weeklyFirstSpotCountsByUser = useMemo(
    () => buildLeaderboardFirstPlaceCountMap(weeklyLeaderboardBoards),
    [weeklyLeaderboardBoards],
  )
  const weeklyTopPerformer = useMemo<WeeklyPerformanceLeader | null>(() => {
    return buildWeeklyTopPerformer(weeklyLeaderboardEntries)
  }, [weeklyLeaderboardEntries])
  const weeklyDepartmentLeaders = useMemo(() => buildDepartmentLeaders(weeklyLeaderboardEntries), [weeklyLeaderboardEntries])
  const bestWeeklyDepartment = weeklyDepartmentLeaders[0] || null
  const visibleLeaderboardBoards = leaderboardsScope === 'weekly' ? weeklyLeaderboardBoards : allTimeLeaderboardBoards
  const visibleMatchingBoards = useMemo(
    () => visibleLeaderboardBoards.filter((board) => board.game === 'Matching'),
    [visibleLeaderboardBoards],
  )
  const visibleSpeedBoards = useMemo(
    () => visibleLeaderboardBoards.filter((board) => board.game === 'Speed Test'),
    [visibleLeaderboardBoards],
  )
  const scopedLeaderboardEntries = leaderboardsScope === 'weekly' ? weeklyLeaderboardEntries : leaderboard
  const leaderboardGameBoards = leaderboardViewGame === 'Matching' ? visibleMatchingBoards : visibleSpeedBoards
  const leaderboardSelectedBoard = useMemo(() => {
    if (leaderboardGameBoards.length === 0) return null
    return (
      leaderboardGameBoards.find(
        (board) => board.duration === leaderboardViewDuration && board.filter === leaderboardViewFilter,
      ) || leaderboardGameBoards[0]
    )
  }, [leaderboardGameBoards, leaderboardViewDuration, leaderboardViewFilter])
  const leaderboardSelectedEntries = useMemo(() => {
    if (!leaderboardSelectedBoard) return []
    return topEntryPerUser(
      scopedLeaderboardEntries
        .filter((entry) => entry.game === leaderboardSelectedBoard.game)
        .filter(
          (entry) =>
            entry.matchDuration === leaderboardSelectedBoard.duration && entry.matchFilter === leaderboardSelectedBoard.filter,
        ),
    ).slice(0, 5)
  }, [leaderboardSelectedBoard, scopedLeaderboardEntries])
  const leaderboardModeStats = useMemo(() => {
    const stats = new Map<string, { duration: HomeDurationFilter; filter: CodeFilter; attempts: number; topScore: number }>()
    for (const entry of scopedLeaderboardEntries) {
      if (entry.game !== leaderboardViewGame) continue
      if (entry.score <= 0) continue
      const duration = [15, 30, 60].includes(Number(entry.matchDuration))
        ? (Number(entry.matchDuration) as HomeDurationFilter)
        : 30
      const filter = (['all', 'penal', 'hs', 'vehicle'].includes(String(entry.matchFilter))
        ? String(entry.matchFilter)
        : 'all') as CodeFilter
      const key = `${duration}|${filter}`
      const current = stats.get(key) || { duration, filter, attempts: 0, topScore: 0 }
      current.attempts += 1
      current.topScore = Math.max(current.topScore, entry.score)
      stats.set(key, current)
    }
    return [...stats.values()].sort(
      (left, right) => right.attempts - left.attempts || right.topScore - left.topScore,
    )
  }, [scopedLeaderboardEntries, leaderboardViewGame])
  const leaderboardModeStatMap = useMemo(() => {
    const map = new Map<string, { duration: HomeDurationFilter; filter: CodeFilter; attempts: number; topScore: number }>()
    for (const stat of leaderboardModeStats) {
      map.set(`${stat.duration}|${stat.filter}`, stat)
    }
    return map
  }, [leaderboardModeStats])
  const leaderboardModeMatrix = useMemo(
    () =>
      ([15, 30, 60] as HomeDurationFilter[]).map((duration) => ({
        duration,
        modes: (['all', 'penal', 'hs', 'vehicle'] as CodeFilter[]).map((filter) => ({
          filter,
          stat: leaderboardModeStatMap.get(`${duration}|${filter}`) || null,
        })),
      })),
    [leaderboardModeStatMap],
  )

  const speedQuestionBank = useMemo(() => {
    const base = questions.filter((question) => question.prompt.startsWith('Which section number matches:'))
    return gamesSelection.filter === 'all' ? base : base.filter((question) => question.codeSet === gamesSelection.filter)
  }, [questions, gamesSelection.filter])
  const scenarioSectionStats = useMemo(
    () =>
      scenarioItems.reduce<Record<ScenarioTrainingSection, { scenarios: number; questions: number }>>(
        (accumulator, item) => {
          const section = normalizeScenarioSection(item.tmasSet)
          accumulator[section].scenarios += 1
          accumulator[section].questions += item.subQuestions?.length || 1
          return accumulator
        },
        {
          tmas1: { scenarios: 0, questions: 0 },
          tmas2: { scenarios: 0, questions: 0 },
        },
      ),
    [scenarioItems],
  )
  const activeScenarioSectionStats = scenarioSectionStats[scenarioTrainingSection]
  const buildScenarioDeckForCurrentSection = useCallback(
    () => buildScenarioDeck(scenarioItems, scenarioTrainingSection),
    [scenarioItems, scenarioTrainingSection],
  )
  const scenarioChoiceHint = useMemo(() => {
    if (!scenarioCurrentQuestion) return 'Press 1–4 to answer'
    return `Press 1–${scenarioCurrentQuestion.choices.length} to answer`
  }, [scenarioCurrentQuestion])
  const scenarioNextButtonLabel = useMemo(() => {
    if (!scenarioCurrentQuestion) return 'Next Scenario'
    if (scenarioCurrentQuestion.questionNumber < scenarioCurrentQuestion.questionCount) return 'Next Question'
    return 'Next Scenario'
  }, [scenarioCurrentQuestion])

  const buildStudyTestDeck = (
    filter: CodeFilter,
    wrongness: StudyWrongness,
    answerMode: StudyAnswerMode,
    questionCount: number,
  ) => {
    const pool = questions.filter((question) => filter === 'all' || question.codeSet === filter)
    if (pool.length === 0) return []
    const uniqueSections = Array.from(new Set(pool.map((question) => question.linkedSectionNumber.toLowerCase())))
    const sectionNeedMap = new Map<string, number>()

    for (const sectionId of uniqueSections) {
      const question = pool.find((entry) => entry.linkedSectionNumber.toLowerCase() === sectionId)
      if (!question) continue
      const stats = performance[performanceKey(question.codeSet, question.linkedSectionNumber)]
      const correct = stats?.correctCount ?? 0
      const incorrect = stats?.incorrectCount ?? 0
      const attempts = correct + incorrect
      const errorRate = attempts > 0 ? incorrect / attempts : 0.45
      const streakPenalty = Math.max(0, 1 - (stats?.correctStreak ?? 0) / 20)
      let score = 1 + errorRate * 3 + streakPenalty * 0.6
      if ((stats?.correctStreak ?? 0) >= 20) score = 0.15
      if (attempts === 0) score *= 0.72
      sectionNeedMap.set(sectionId, Math.max(0.1, score))
    }

    let candidatePool = [...pool]
    if (wrongness !== 'balanced' && sectionNeedMap.size > 0) {
      const rankedSections = [...sectionNeedMap.entries()].sort((left, right) => right[1] - left[1]).map(([key]) => key)
      const sectionTarget =
        wrongness === 'most_needs_work'
          ? Math.max(6, Math.ceil(rankedSections.length * 0.3))
          : Math.max(10, Math.ceil(rankedSections.length * 0.6))
      const focusSections = new Set(rankedSections.slice(0, sectionTarget))
      const focused = pool.filter((question) => focusSections.has(question.linkedSectionNumber.toLowerCase()))
      if (focused.length > 0) candidatePool = focused
    }

    const uniqueTarget = Math.max(1, Math.min(questionCount, candidatePool.length))
    const selected =
      wrongness === 'balanced'
        ? shuffle(candidatePool).slice(0, uniqueTarget)
        : weightedSampleUnique(candidatePool, uniqueTarget, (question) => {
            const score = sectionNeedMap.get(question.linkedSectionNumber.toLowerCase()) ?? 1
            return wrongness === 'most_needs_work' ? score * score : score
          })

    const grouped = new Map<string, QuizQuestion[]>()
    for (const question of shuffle(selected.length > 0 ? selected : candidatePool)) {
      const key = question.linkedSectionNumber.toLowerCase()
      const existing = grouped.get(key) ?? []
      existing.push(question)
      grouped.set(key, existing)
    }

    const sectionOrder = [...grouped.keys()].sort(
      (left, right) => (sectionNeedMap.get(right) ?? 1) - (sectionNeedMap.get(left) ?? 1),
    )
    const roundRobin: QuizQuestion[] = []
    while (grouped.size > 0) {
      for (const sectionId of sectionOrder) {
        const bucket = grouped.get(sectionId)
        if (!bucket || bucket.length === 0) {
          grouped.delete(sectionId)
          continue
        }
        const next = bucket.shift()
        if (next) roundRobin.push(next)
        if (bucket.length === 0) grouped.delete(sectionId)
      }
    }

    if (roundRobin.length > 1 && roundRobin[0].linkedSectionNumber === roundRobin[roundRobin.length - 1].linkedSectionNumber) {
      ;[roundRobin[0], roundRobin[1]] = [roundRobin[1], roundRobin[0]]
    }

    const deck: QuizQuestion[] = []
    const seed = roundRobin.length > 0 ? roundRobin : shuffle(candidatePool)
    for (let index = 0; index < questionCount; index += 1) {
      const question = seed[index % seed.length]
      if (!question) break
      if (answerMode === 'multiple') {
        const randomizedChoices = shuffle([...question.choices])
        deck.push({
          ...question,
          id: `${question.id}-mc-${index}`,
          choices: randomizedChoices,
          correctIndex: randomizedChoices.indexOf(question.choices[question.correctIndex]),
        })
        continue
      }

      const correctStatement = question.choices[question.correctIndex]
      const incorrectPool = question.choices.filter((_, choiceIndex) => choiceIndex !== question.correctIndex)
      const useTrue = Math.random() < 0.5 || incorrectPool.length === 0
      const statement = useTrue ? correctStatement : incorrectPool[Math.floor(Math.random() * incorrectPool.length)]
      deck.push({
        id: `${question.id}-tf-${index}`,
        codeSet: question.codeSet,
        linkedSectionNumber: question.linkedSectionNumber,
        prompt: `${question.prompt}\n\nStatement: ${statement}`,
        choices: ['True', 'False'],
        correctIndex: useTrue ? 0 : 1,
        explanation: `${question.explanation} ${useTrue ? 'This statement is true.' : 'This statement is false.'}`,
      })
    }
    if (filter === 'all') return deck
    return deck.filter((question) => question.codeSet === filter)
  }

  const beginStudyFlashcards = () => {
    const cards = studyFlashFilter === 'all'
      ? sections
      : sections.filter((section) => section.codeSet === studyFlashFilter)
    if (cards.length === 0) return
    const flashcards: Flashcard[] = cards.map((section) => ({
      id: section.id,
      codeSet: section.codeSet,
      front: section.sectionNumber,
      back: `${section.title}\n\n${shortText(section.text, 260)}`,
    }))
    const order = assistedLearningEnabled
      ? buildAdaptiveFlashcardOrder(flashcards, performance)
      : shuffle(flashcards.map((card) => card.id))
    setStudyFlashSessionFilter(studyFlashFilter)
    setStudyFlashSessionOrder(order)
    setStudyFlashSessionIndex(0)
    setStudyFlashSessionFlipped(false)
    setStudyFlashSessionOpen(true)
  }

  const beginStudyTest = () => {
    const deck = buildStudyTestDeck(studyTestFilter, studyTestWrongness, studyTestAnswerMode, studyTestQuestionCount)
    if (deck.length === 0) {
      setCurrentQuestion(null)
      setStudyTestSessionOpen(false)
      return
    }
    const [first, ...remaining] = deck
    setStudyTestSessionFilter(studyTestFilter)
    setStudyTestSessionTotal(deck.length)
    setStudyTestSessionAnswered(0)
    setStudyTestSessionCorrect(0)
    setStudyTestSessionDone(false)
    setStudyTestReport(null)
    setStudyTestSessionOpen(true)
    setQuizDeck(remaining)
    setCurrentQuestion(first)
    setSelectedChoice(null)
    setFeedback('')
    setStreak(0)
  }

  const incrementUserStats = useCallback((updater: (stats: UserStats) => UserStats, trackStudyDay = false) => {
    setProfileDetails((previous) => ({
      ...previous,
      stats: trackStudyDay ? applyStudyDayActivity(updater(previous.stats)) : updater(previous.stats),
    }))
  }, [])

  const triggerCelebration = useCallback((title: string, subtitle: string) => {
    const burst = Date.now()
    setCelebration({ title, subtitle, burst })
    window.setTimeout(() => {
      setCelebration((current) => (current?.burst === burst ? null : current))
    }, 2200)
  }, [])

  useEffect(() => {
    if (!stateHydrated || !currentUserId) return
    const lapse = studyStreakLapseInfo(profileDetails.stats)
    if (!lapse) return
    const noticeKey = `${currentUserId}:${profileDetails.stats.lastStudyDay}:${profileDetails.stats.studyDayStreak}`
    if (streakLossNoticeRef.current === noticeKey) return
    streakLossNoticeRef.current = noticeKey
    setProfileDetails((previous) => {
      const nextLapse = studyStreakLapseInfo(previous.stats)
      if (!nextLapse) return previous
      return {
        ...previous,
        stats: {
          ...previous.stats,
          studyDayStreak: 0,
        },
      }
    })
    triggerCelebration(
      'Streak lost',
      `You lost your study streak (${lapse.previousStreak} days). You’re back to 0.`,
    )
  }, [
    currentUserId,
    profileDetails.stats,
    stateHydrated,
    triggerCelebration,
  ])

  const postPublicChatAnnouncement = useCallback(async (message: string) => {
    if (!supabase || !currentUserId) return
    const trimmed = message.trim()
    if (!trimmed) return
    try {
      await supabase.from('public_messages').insert({
        user_id: currentUserId,
        display_name: '🔔 System',
        agency: null,
        message: trimmed.slice(0, 260),
      })
    } catch (error) {
      console.error('Could not post leaderboard announcement:', error)
    }
  }, [currentUserId, supabase])

  const shouldPostLeaderboardAnnouncement = useCallback((key: string) => {
    const now = Date.now()
    const cache = leaderboardAnnouncementDedupRef.current
    for (const [entryKey, timestamp] of cache) {
      if (now - timestamp > 2 * 60 * 60 * 1000) {
        cache.delete(entryKey)
      }
    }
    const lastPosted = cache.get(key)
    if (typeof lastPosted === 'number' && now - lastPosted < 10 * 60 * 1000) {
      return false
    }
    cache.set(key, now)
    return true
  }, [])

  const handleLeaderboardTopMilestones = useCallback(async (options: {
    game: 'Matching' | 'Speed Test'
    duration: number
    filter: CodeFilter
    beforeAllTimeEntries: LeaderboardEntry[]
    afterAllTimeEntries: LeaderboardEntry[]
    beforeWeeklyEntries: LeaderboardEntry[]
    afterWeeklyEntries: LeaderboardEntry[]
  }) => {
    if (!currentUserId) return { becameWeeklyTop: false, becameAllTimeTop: false }

    const weeklyWindow = getCurrentWeeklyWindowMs(Date.now())
    const beforeAllTimeTop = topLeaderboardEntryForMode(options.beforeAllTimeEntries, {
      game: options.game,
      duration: options.duration,
      filter: options.filter,
      scope: 'alltime',
    })
    const beforeWeeklyTop = topLeaderboardEntryForMode(options.beforeWeeklyEntries, {
      game: options.game,
      duration: options.duration,
      filter: options.filter,
      scope: 'alltime',
    })
    const afterAllTimeTop = topLeaderboardEntryForMode(options.afterAllTimeEntries, {
      game: options.game,
      duration: options.duration,
      filter: options.filter,
      scope: 'alltime',
    })
    const afterWeeklyTop = topLeaderboardEntryForMode(options.afterWeeklyEntries, {
      game: options.game,
      duration: options.duration,
      filter: options.filter,
      scope: 'alltime',
    })
    const beforeWeeklyDepartmentTop = buildDepartmentLeaders(options.beforeWeeklyEntries)[0] || null
    const afterWeeklyDepartmentTop = buildDepartmentLeaders(options.afterWeeklyEntries)[0] || null
    const beforeWeeklyTopPerformer = buildWeeklyTopPerformer(options.beforeWeeklyEntries)
    const afterWeeklyTopPerformer = buildWeeklyTopPerformer(options.afterWeeklyEntries)

    const becameAllTimeTop =
      Boolean(afterAllTimeTop) &&
      afterAllTimeTop?.userId === currentUserId &&
      beforeAllTimeTop?.userId !== currentUserId
    const becameWeeklyTop =
      Boolean(afterWeeklyTop) &&
      afterWeeklyTop?.userId === currentUserId &&
      beforeWeeklyTop?.userId !== currentUserId

    const leaderboardLabel = `${options.game} ${options.duration}s • ${leaderboardCodeSetLabel(options.filter)}`
    if (becameAllTimeTop && becameWeeklyTop) {
      triggerCelebration('🏆 You beat weekly + all-time high scores', `You are #1 on ${leaderboardLabel}`)
    } else if (becameAllTimeTop) {
      triggerCelebration('🏆 You beat the all-time high score', `You are #1 on ${leaderboardLabel}`)
    } else if (becameWeeklyTop) {
      triggerCelebration('🔥 You beat the weekly high score', `You are #1 on ${leaderboardLabel}`)
    }

    const actorName = String(profile?.username || currentUserEmail || 'Player').trim() || 'Player'
    const actorAgencyKey = normalizeAgencyKey(canonicalAgencyName(profileDetails.agency || '') || '')
    const weeklyKnockOff = becameWeeklyTop && beforeWeeklyTop && beforeWeeklyTop.userId !== currentUserId ? beforeWeeklyTop : null
    const allTimeKnockOff = becameAllTimeTop && beforeAllTimeTop && beforeAllTimeTop.userId !== currentUserId ? beforeAllTimeTop : null
    if (weeklyKnockOff && allTimeKnockOff && weeklyKnockOff.userId === allTimeKnockOff.userId) {
      const combinedAnnouncementKey = [
        'weekly+alltime',
        options.game,
        String(options.duration),
        options.filter,
        currentUserId,
        weeklyKnockOff.userId,
        String(afterWeeklyTop?.createdAt || 0),
        String(afterAllTimeTop?.createdAt || 0),
        String(afterWeeklyTop?.score || 0),
        String(afterAllTimeTop?.score || 0),
      ].join('|')
      if (shouldPostLeaderboardAnnouncement(combinedAnnouncementKey)) {
        await postPublicChatAnnouncement(
          `🔥 @${weeklyKnockOff.playerName} was knocked off #1 Weekly + All-Time (${leaderboardLabel}) by @${actorName}.`,
        )
      }
    } else {
      if (weeklyKnockOff) {
        const weeklyAnnouncementKey = [
          'weekly',
          options.game,
          String(options.duration),
          options.filter,
          currentUserId,
          weeklyKnockOff.userId,
          String(afterWeeklyTop?.createdAt || 0),
          String(afterWeeklyTop?.score || 0),
        ].join('|')
        if (shouldPostLeaderboardAnnouncement(weeklyAnnouncementKey)) {
          await postPublicChatAnnouncement(
            `🔥 @${weeklyKnockOff.playerName} was knocked off #1 Weekly (${leaderboardLabel}) by @${actorName}.`,
          )
        }
      }
      if (allTimeKnockOff) {
        const allTimeAnnouncementKey = [
          'alltime',
          options.game,
          String(options.duration),
          options.filter,
          currentUserId,
          allTimeKnockOff.userId,
          String(afterAllTimeTop?.createdAt || 0),
          String(afterAllTimeTop?.score || 0),
        ].join('|')
        if (shouldPostLeaderboardAnnouncement(allTimeAnnouncementKey)) {
          await postPublicChatAnnouncement(
            `🏆 @${allTimeKnockOff.playerName} was knocked off #1 All-Time (${leaderboardLabel}) by @${actorName}.`,
          )
        }
      }
    }

    const weeklyTopPerformerKnockOff =
      afterWeeklyTopPerformer &&
      beforeWeeklyTopPerformer &&
      afterWeeklyTopPerformer.entry.userId === currentUserId &&
      beforeWeeklyTopPerformer.entry.userId !== currentUserId
        ? beforeWeeklyTopPerformer
        : null
    if (weeklyTopPerformerKnockOff) {
      const topPerformerAnnouncementKey = [
        'top_performer_weekly',
        String(weeklyWindow.weekStartMs),
        currentUserId,
        weeklyTopPerformerKnockOff.entry.userId,
      ].join('|')
      if (shouldPostLeaderboardAnnouncement(topPerformerAnnouncementKey)) {
        await postPublicChatAnnouncement(
          `🌟 Top Performer of the Week: @${actorName} took #1 from @${weeklyTopPerformerKnockOff.entry.playerName}.`,
        )
      }
    }

    if (
      beforeWeeklyDepartmentTop &&
      afterWeeklyDepartmentTop &&
      beforeWeeklyDepartmentTop.key !== afterWeeklyDepartmentTop.key &&
      actorAgencyKey === afterWeeklyDepartmentTop.key
    ) {
      const departmentAnnouncementKey = [
        'department_weekly',
        afterWeeklyDepartmentTop.key,
        beforeWeeklyDepartmentTop.key,
        String(weeklyWindow.weekStartMs),
        currentUserId,
      ].join('|')
      if (shouldPostLeaderboardAnnouncement(departmentAnnouncementKey)) {
        await postPublicChatAnnouncement(
          `🏢 ${afterWeeklyDepartmentTop.agency} took #1 Weekly Department from ${beforeWeeklyDepartmentTop.agency} (by @${actorName}).`,
        )
      }
    }

    return { becameWeeklyTop, becameAllTimeTop }
  }, [currentUserEmail, currentUserId, postPublicChatAnnouncement, profile?.username, profileDetails.agency, shouldPostLeaderboardAnnouncement, triggerCelebration])

  const saveSessionAttempt = useCallback((trackKey: string, snapshot: SessionAttemptSnapshot) => {
    const mode: SessionMode = trackKey.startsWith('study_test|')
      ? 'study_test'
      : trackKey.startsWith('matching|')
        ? 'matching'
        : 'speed'

    setProfileDetails((previous) => {
      const currentTrack = previous.stats.sessionTracks[trackKey] || { lastAttempt: null, accuracyHistory: [], scoreHistory: [] }
      const nextHistory = [...currentTrack.accuracyHistory, snapshot.accuracy].slice(-12)
      const baseScoreHistory = currentTrack.scoreHistory && currentTrack.scoreHistory.length > 0
        ? currentTrack.scoreHistory
        : currentTrack.lastAttempt
          ? [currentTrack.lastAttempt.score]
          : []
      const nextScoreHistory = [...baseScoreHistory, snapshot.score].slice(-12)
      const timelinePoint: SessionTimelinePoint = {
        mode,
        filter: snapshot.filter,
        accuracy: snapshot.accuracy,
        score: snapshot.score,
        at: snapshot.at,
      }
      const nextTimeline = [...previous.stats.sessionTimeline, timelinePoint]
        .sort((left, right) => left.at - right.at)
        .slice(-320)
      return {
        ...previous,
        stats: {
          ...previous.stats,
          sessionTracks: {
            ...previous.stats.sessionTracks,
            [trackKey]: {
              lastAttempt: snapshot,
              accuracyHistory: nextHistory,
              scoreHistory: nextScoreHistory,
            },
          },
          sessionTimeline: nextTimeline,
        },
      }
    })

    setRemoteTrackScoreHistory((previous) => {
      const next = { ...previous }
      const appended = [...(next[trackKey] || []), snapshot.score]
      next[trackKey] =
        appended.length > remoteTrackHistoryMaxPoints
          ? compressTrendPoints(appended, remoteTrackHistoryMaxPoints)
          : appended
      return next
    })
    setRemoteScoreTimeline((previous) => compressTimelinePoints([...previous, { at: snapshot.at, score: snapshot.score }], remoteTimelineMaxPoints))

    if (supabase && currentUserId) {
      void supabase
        .from('game_attempt_history')
        .insert({
          user_id: currentUserId,
          mode,
          track_key: trackKey,
          filter: snapshot.filter,
          duration: snapshot.duration,
          score: snapshot.score,
          correct: snapshot.correct,
          incorrect: snapshot.incorrect,
          accuracy: snapshot.accuracy,
          rank: snapshot.rank,
          created_at: new Date(snapshot.at).toISOString(),
        })
        .then(({ error }) => {
          if (error) {
            console.error('Could not persist game attempt history:', error)
          }
        })
    }
  }, [currentUserId, supabase])

  const syncWeeklyLeaderboardEntry = useCallback(async (options: {
    game: 'Matching' | 'Speed Test'
    score: number
    round: number
    duration: number
    filter: CodeFilter
    attemptedAtMs?: number
  }) => {
    if (!supabase || !currentUserId) return
    const attemptedAtMs = options.attemptedAtMs ?? Date.now()
    const weeklyWindow = getCurrentWeeklyWindowMs(attemptedAtMs)
    const { error } = await supabase.rpc('upsert_weekly_leaderboard', {
      p_user_id: currentUserId,
      p_game: options.game,
      p_week_start: new Date(weeklyWindow.weekStartMs).toISOString(),
      p_match_duration: options.duration,
      p_match_filter: options.filter,
      p_score: options.score,
      p_round: options.round,
      p_attempted_at: new Date(attemptedAtMs).toISOString(),
    })
    if (error) {
      console.error('Weekly leaderboard save failed:', error)
    }
  }, [currentUserId])

  const getFocusTips = useCallback((filter: CodeFilter, mode: SessionMode) => {
    const prioritized = sections
      .filter((section) => filter === 'all' || section.codeSet === filter)
      .map((section) => {
        const stats = performance[performanceKey(section.codeSet, section.sectionNumber)]
        const weight = performanceNeedWorkWeight(stats)
        const attempts = (stats?.correctCount ?? 0) + (stats?.incorrectCount ?? 0)
        return { section, weight, attempts }
      })
      .filter((item) => item.attempts > 0 && item.weight >= 2)
      .sort((left, right) => right.weight - left.weight)
      .slice(0, 2)

    return prioritized.map((item) => {
      if (item.section.codeSet === 'penal') {
        return `${item.section.sectionNumber} scenarios`
      }
      if (item.section.codeSet === 'vehicle') {
        return `${item.section.sectionNumber} definitions`
      }
      return `${item.section.sectionNumber} elements`
    }).map((value) => (mode === 'speed' ? value : value))
  }, [sections, performance])

  const advanceStudyTestQuestion = useCallback(() => {
    if (!studyTestSessionOpen) return
    if (quizDeck.length === 0) {
      setStudyTestSessionDone(true)
      setCurrentQuestion(null)
      const total = studyTestSessionAnswered
      const correct = studyTestSessionCorrect
      const incorrect = Math.max(0, total - correct)
      const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0
      const trackKey = sessionTrackKey({
        mode: 'study_test',
        filter: studyTestSessionFilter,
        answerMode: studyTestAnswerMode,
        wrongness: studyTestWrongness,
        questionCount: studyTestQuestionCount,
      })
      const track = getSessionTrack(profileDetails.stats, trackKey)
      const previous = track.lastAttempt
      const trend = [...track.accuracyHistory, accuracy].slice(-8)
      const remoteTrend = remoteTrackScoreHistory[trackKey] || []
      const baseScoreTrend = remoteTrend.length > 0
        ? remoteTrend
        : track.scoreHistory && track.scoreHistory.length > 0
          ? track.scoreHistory
          : previous
            ? [previous.score]
            : []
      const scoreTrend = [...baseScoreTrend, correct]
      const delta = previous ? accuracy - previous.accuracy : null
      const deltaScore = previous ? correct - previous.score : null
      const focusTips = getFocusTips(studyTestSessionFilter, 'study_test')
      setStudyTestReport({
        mode: 'study_test',
        title: 'Study Test',
        contextLabel: `${studyTestSessionFilter === 'all' ? 'All' : codeSetLabel[studyTestSessionFilter]} • ${studyTestAnswerMode === 'multiple' ? 'Multiple Choice' : 'True/False'}`,
        accuracy,
        correct,
        incorrect,
        score: correct,
        deltaAccuracy: delta,
        deltaScore,
        trend,
        scoreTrend,
        focusTips,
        leaderboardPreview: [],
        currentRank: null,
        previousRank: previous?.rank ?? null,
      })
      saveSessionAttempt(trackKey, {
        accuracy,
        score: correct,
        correct,
        incorrect,
        rank: null,
        duration: null,
        filter: studyTestSessionFilter,
        at: Date.now(),
      })
      return
    }
    const [next, ...remaining] = quizDeck
    setCurrentQuestion(next)
    setQuizDeck(remaining)
    setSelectedChoice(null)
    setFeedback('')
  }, [
    getFocusTips,
    profileDetails.stats,
    quizDeck,
    remoteTrackScoreHistory,
    saveSessionAttempt,
    studyTestAnswerMode,
    studyTestQuestionCount,
    studyTestSessionAnswered,
    studyTestSessionCorrect,
    studyTestSessionFilter,
    studyTestSessionOpen,
    studyTestWrongness,
  ])

  const finalizeMatchingSession = useCallback(() => {
    const finalMatchScore = matchScoreRef.current
    const finalMatchRound = matchRoundRef.current
    const finalCorrect = matchCorrectCountRef.current
    const finalIncorrect = matchIncorrectCountRef.current
    const finalAttempts = finalCorrect + finalIncorrect
    const finalAccuracy = finalAttempts > 0 ? Math.round((finalCorrect / finalAttempts) * 100) : 0
    const sessionDuration = matchSessionDurationRef.current
    const sessionFilter = matchSessionFilterRef.current
    const trackKey = sessionTrackKey({ mode: 'matching', duration: sessionDuration, filter: sessionFilter })
    const track = getSessionTrack(profileDetails.stats, trackKey)
    const previousAttempt = track.lastAttempt
    const trend = [...track.accuracyHistory, finalAccuracy].slice(-8)
    const remoteTrend = remoteTrackScoreHistory[trackKey] || []
    const baseScoreTrend = remoteTrend.length > 0
      ? remoteTrend
      : track.scoreHistory && track.scoreHistory.length > 0
        ? track.scoreHistory
        : previousAttempt
          ? [previousAttempt.score]
          : []
    const scoreTrend = [...baseScoreTrend, finalMatchScore]
    const focusTips = getFocusTips(sessionFilter, 'matching')
    const previousBest = highScoresRef.current.matching
    const isPersonalBest = finalMatchScore > previousBest
    setHighScores((previous) => ({ ...previous, matching: Math.max(previous.matching, finalMatchScore) }))

    if (supabase && currentUserId) {
      void (async () => {
        const leaderboardBeforeSave = [...leaderboardRef.current]
        const weeklyLeaderboardBeforeSave = [...weeklyLeaderboardRef.current]
        const existingMatch = leaderboardRef.current.find(
          (e) => e.userId === currentUserId &&
            e.game === 'Matching' &&
            e.matchDuration === sessionDuration &&
            e.matchFilter === sessionFilter,
        )

        if (isLeaderboardScoreImprovement(finalMatchScore, finalMatchRound, existingMatch)) {
          const { error: insertError } = await supabase
            .from('leaderboard')
            .upsert({
              game: 'Matching',
              score: finalMatchScore,
              round: finalMatchRound,
              user_id: currentUserId,
              match_duration: sessionDuration,
              match_filter: sessionFilter,
              created_at: new Date().toISOString(),
            }, {
              onConflict: 'user_id,game,match_duration,match_filter',
              ignoreDuplicates: false,
            })

          if (insertError) {
            console.error('Matching leaderboard save failed:', insertError)
          }
        }

        await syncWeeklyLeaderboardEntry({
          game: 'Matching',
          score: finalMatchScore,
          round: finalMatchRound,
          duration: sessionDuration,
          filter: sessionFilter,
        })

        const refreshed = await refreshLeaderboard({ force: true })
        await refreshHomeLeaderboards({ force: true })
        const leaderboardAfterSave = refreshed.allTimeEntries.length > 0 ? refreshed.allTimeEntries : leaderboardRef.current
        const weeklyLeaderboardAfterSave = refreshed.weeklyEntries.length > 0 ? refreshed.weeklyEntries : weeklyLeaderboardRef.current
        const milestone = await handleLeaderboardTopMilestones({
          game: 'Matching',
          duration: sessionDuration,
          filter: sessionFilter,
          beforeAllTimeEntries: leaderboardBeforeSave,
          afterAllTimeEntries: leaderboardAfterSave,
          beforeWeeklyEntries: weeklyLeaderboardBeforeSave,
          afterWeeklyEntries: weeklyLeaderboardAfterSave,
        })
        if (!milestone.becameWeeklyTop && !milestone.becameAllTimeTop && isPersonalBest) {
          triggerCelebration('🎉 New Personal Best', `Matching: ${finalMatchScore} points`)
        }

        const { preview, currentRank } = getLeaderboardPreview(
          leaderboardAfterSave,
          'Matching',
          sessionDuration,
          sessionFilter,
          currentUserId,
        )
        setMatchingReport({
          mode: 'matching',
          title: 'Matching',
          contextLabel: `${sessionDuration}s • ${leaderboardCodeSetLabel(sessionFilter)}`,
          accuracy: finalAccuracy,
          correct: finalCorrect,
          incorrect: finalIncorrect,
          score: finalMatchScore,
          deltaAccuracy: previousAttempt ? finalAccuracy - previousAttempt.accuracy : null,
          deltaScore: previousAttempt ? finalMatchScore - previousAttempt.score : null,
          trend,
          scoreTrend,
          focusTips,
          leaderboardPreview: preview,
          currentRank,
          previousRank: previousAttempt?.rank ?? null,
        })
        saveSessionAttempt(trackKey, {
          accuracy: finalAccuracy,
          score: finalMatchScore,
          correct: finalCorrect,
          incorrect: finalIncorrect,
          rank: currentRank,
          duration: sessionDuration,
          filter: sessionFilter,
          at: Date.now(),
        })
      })()
    } else {
      setMatchingReport({
        mode: 'matching',
        title: 'Matching',
        contextLabel: `${sessionDuration}s • ${leaderboardCodeSetLabel(sessionFilter)}`,
        accuracy: finalAccuracy,
        correct: finalCorrect,
        incorrect: finalIncorrect,
        score: finalMatchScore,
        deltaAccuracy: previousAttempt ? finalAccuracy - previousAttempt.accuracy : null,
        deltaScore: previousAttempt ? finalMatchScore - previousAttempt.score : null,
        trend,
        scoreTrend,
        focusTips,
        leaderboardPreview: [],
        currentRank: null,
        previousRank: previousAttempt?.rank ?? null,
      })
      saveSessionAttempt(trackKey, {
        accuracy: finalAccuracy,
        score: finalMatchScore,
        correct: finalCorrect,
        incorrect: finalIncorrect,
        rank: null,
        duration: sessionDuration,
        filter: sessionFilter,
        at: Date.now(),
      })
    }
  }, [
    currentUserId,
    getFocusTips,
    handleLeaderboardTopMilestones,
    profileDetails.stats,
    remoteTrackScoreHistory,
    saveSessionAttempt,
    syncWeeklyLeaderboardEntry,
    supabase,
    triggerCelebration,
  ])

  useEffect(() => {
    finalizeMatchingSessionRef.current = finalizeMatchingSession
  }, [finalizeMatchingSession])

  useEffect(() => {
    if (!matchRunning) return
    if (matchTimerDeadlineRef.current <= 0) {
      matchTimerDeadlineRef.current = Date.now() + Math.max(0, matchSessionDurationRef.current) * 1000
    }
    matchTimerFinishedRef.current = false

    const tick = () => {
      if (!matchRunning) return
      const deadline = matchTimerDeadlineRef.current
      if (deadline <= 0) return

      const remainingMs = deadline - Date.now()
      const nextRemaining = Math.max(0, Math.ceil(remainingMs / 1000))
      setMatchRemaining((current) => (current === nextRemaining ? current : nextRemaining))

      if (remainingMs <= 0 && !matchTimerFinishedRef.current) {
        matchTimerFinishedRef.current = true
        matchTimerDeadlineRef.current = 0
        setMatchRunning(false)
        setMatchDone(true)
        finalizeMatchingSessionRef.current()
      }
    }

    tick()
    const timer = window.setInterval(tick, 120)
    return () => window.clearInterval(timer)
  }, [matchRunning])

  const markPerformance = useCallback((codeSet: CodeSet, sectionNumber: string, correct: boolean) => {
    const key = performanceKey(codeSet, sectionNumber)
    const current = performanceRef.current[key] ?? { correctCount: 0, incorrectCount: 0, correctStreak: 0 }
    const previousStatus = mastery(current)
    const updated: CodePerformance = {
      correctCount: current.correctCount + (correct ? 1 : 0),
      incorrectCount: current.incorrectCount + (correct ? 0 : 1),
      correctStreak: correct ? (current.correctStreak ?? 0) + 1 : 0,
    }
    const nextPerformance = { ...performanceRef.current, [key]: updated }
    performanceRef.current = nextPerformance
    setPerformance(nextPerformance)
    const nextStatus = mastery(updated)
    return nextStatus !== previousStatus ? nextStatus : ''
  }, [])

  const answerQuestion = useCallback((index: number) => {
    if (!studyTestSessionOpen || !currentQuestion || selectedChoice !== null || studyTestSessionDone) return
    markStudyActivity('study_test')
    setSelectedChoice(index)
    incrementUserStats((stats) => ({
      ...stats,
      studyModeCounts: {
        ...stats.studyModeCounts,
        [studyTestSessionFilter]: stats.studyModeCounts[studyTestSessionFilter] + 1,
      },
    }), true)

    const isCorrect = index === currentQuestion.correctIndex
    const stageUpdate = markPerformance(currentQuestion.codeSet, currentQuestion.linkedSectionNumber, isCorrect)
    setStudyTestSessionAnswered((value) => value + 1)

    if (isCorrect) {
      const nextStreak = streak + 1
      setStreak(nextStreak)
      setBestStreak((previous) => Math.max(previous, nextStreak))
      setStudyTestSessionCorrect((value) => value + 1)
      setFeedback(stageUpdate ? `Correct • ${stageUpdate}` : 'Correct answer.')
      return
    }

    if (streak > 0) {
      triggerCelebration('Streak broken', `Quick Quiz streak ended at ${streak}`)
    }
    setStreak(0)
    setFeedback('Incorrect answer.')
  }, [
    currentQuestion,
    incrementUserStats,
    markStudyActivity,
    markPerformance,
    selectedChoice,
    streak,
    studyTestSessionDone,
    studyTestSessionFilter,
    studyTestSessionOpen,
    triggerCelebration,
  ])

  const makeRoundCards = useCallback((targetFilter: CodeFilter) => {
    const basePool = targetFilter === 'all'
      ? sections
      : sections.filter((section) => section.codeSet === targetFilter)
    if (basePool.length === 0) {
      setMatchCards([])
      setMatchedPairIds([])
      setSelectedCards([])
      setWrongCardIds([])
      return
    }

    const freshPool = basePool.filter(
      (section) => !recentMatchSections.includes(section.sectionNumber.toLowerCase()),
    )
    const sourcePool = freshPool.length >= 3 ? freshPool : basePool
    const shuffledSource = shuffle(sourcePool)
    const selected: CodeSection[] = []
    while (selected.length < 3 && shuffledSource.length > 0) {
      selected.push(shuffledSource[selected.length % shuffledSource.length])
    }

    const cards = selected.flatMap((section) => {
      const pairId = crypto.randomUUID()
      return [
        {
          id: crypto.randomUUID(),
          pairId,
          sectionNumber: section.sectionNumber,
          codeSet: section.codeSet,
          text: section.sectionNumber,
          kind: 'code',
        },
        {
          id: crypto.randomUUID(),
          pairId,
          sectionNumber: section.sectionNumber,
          codeSet: section.codeSet,
          text: section.title,
          kind: 'definition',
        },
      ] as MatchCard[]
    })

    setMatchCards(shuffle(cards))
    setMatchedPairIds([])
    setSelectedCards([])
    setWrongCardIds([])
    setRecentMatchSections((previous) => [...previous, ...selected.map((item) => item.sectionNumber.toLowerCase())].slice(-18))
  }, [recentMatchSections, sections])

  const startMatching = () => {
    const selectedDuration = gamesSelection.duration
    const selectedFilter = gamesSelection.filter
    matchSessionDurationRef.current = selectedDuration
    matchSessionFilterRef.current = selectedFilter
    matchTimerDeadlineRef.current = Date.now() + selectedDuration * 1000
    matchTimerFinishedRef.current = false
    setMatchDone(false)
    setMatchScore(0)
    setMatchRound(1)
    matchScoreRef.current = 0
    matchRoundRef.current = 1
    setMatchRemaining(selectedDuration)
    setRecentMatchSections([])
    setMatchCorrectCount(0)
    setMatchIncorrectCount(0)
    setMatchingReport(null)
    matchCorrectCountRef.current = 0
    matchIncorrectCountRef.current = 0
    setMatchRunning(true)
    makeRoundCards(selectedFilter)
    incrementUserStats((stats) => ({
      ...stats,
      gamePlays: {
        ...stats.gamePlays,
        matching: stats.gamePlays.matching + 1,
      },
    }))
  }

  const beginMatchingFromSetup = () => {
    setShowMatchSetupModal(false)
    startMatching()
  }

  const exitMatchingSession = () => {
    setMatchRunning(false)
    setMatchDone(false)
    matchTimerDeadlineRef.current = 0
    matchTimerFinishedRef.current = false
    setSelectedCards([])
    setWrongCardIds([])
    setMatchedPairIds([])
  }

  const nextSpeedQuestion = useCallback((candidateDeck?: QuizQuestion[], previousId?: string) => {
    const source = Array.isArray(candidateDeck) ? candidateDeck : speedSessionQuestions
    speedAnswerLockRef.current = false
    setSpeedAnswerLocked(false)
    if (source.length === 0) {
      setSpeedCurrentQuestion(null)
      setSpeedDeck([])
      return
    }
    const deck = shuffle(source)
    if (previousId && deck.length > 1 && deck[0].id === previousId) {
      ;[deck[0], deck[1]] = [deck[1], deck[0]]
    }
    const [next, ...remaining] = deck
    setSpeedCurrentQuestion(next || null)
    setSpeedDeck(remaining)
    if (next) {
      recentSpeedSectionsRef.current = [...recentSpeedSectionsRef.current, next.linkedSectionNumber.toLowerCase()].slice(-5)
    }
  }, [speedSessionQuestions])

  const startSpeedTest = () => {
    const selectedDuration = gamesSelection.duration
    const selectedFilter = gamesSelection.filter
    const pool = selectedFilter === 'all'
      ? speedQuestionBank
      : speedQuestionBank.filter((question) => question.codeSet === selectedFilter)
    resetSpeedSpamState()
    if (speedAdvanceTimerRef.current !== null) {
      window.clearTimeout(speedAdvanceTimerRef.current)
      speedAdvanceTimerRef.current = null
    }
    speedAnswerLockRef.current = false
    setSpeedAnswerLocked(false)
    if (pool.length === 0) {
      setSpeedCurrentQuestion(null)
      setSpeedDeck([])
      setSpeedRunning(false)
      setSpeedDone(false)
      setSpeedFeedback('')
      return
    }
    setSpeedSessionQuestions(pool)
    speedSessionDurationRef.current = selectedDuration
    speedSessionFilterRef.current = selectedFilter
    setSpeedRemaining(selectedDuration)
    setSpeedScore(0)
    setSpeedAnsweredCount(0)
    setSpeedCorrectCount(0)
    setSpeedIncorrectCount(0)
    setSpeedReport(null)
    speedScoreRef.current = 0
    speedAnsweredCountRef.current = 0
    speedCorrectCountRef.current = 0
    speedIncorrectCountRef.current = 0
    setSpeedFeedback('')
    setSpeedDone(false)
    setSpeedRunning(true)
    recentSpeedSectionsRef.current = []
    nextSpeedQuestion(pool)
    incrementUserStats((stats) => ({
      ...stats,
      gamePlays: {
        ...stats.gamePlays,
        speed: stats.gamePlays.speed + 1,
      },
    }))
  }

  const beginSpeedFromSetup = () => {
    setShowSpeedSetupModal(false)
    startSpeedTest()
  }

  const exitSpeedSession = () => {
    resetSpeedSpamState()
    if (speedAdvanceTimerRef.current !== null) {
      window.clearTimeout(speedAdvanceTimerRef.current)
      speedAdvanceTimerRef.current = null
    }
    speedAnswerLockRef.current = false
    setSpeedAnswerLocked(false)
    setSpeedRunning(false)
    setSpeedDone(false)
    setSpeedFeedback('')
  }

  const answerSpeedQuestion = useCallback((choiceIndex: number) => {
    if (!speedRunning || !speedCurrentQuestion || speedAnswerLockRef.current) return
    if (isSpeedSpamAttempt(choiceIndex)) return
    speedAnswerLockRef.current = true
    setSpeedAnswerLocked(true)
    markStudyActivity('speed')
    const isCorrect = choiceIndex === speedCurrentQuestion.correctIndex
    setSpeedAnsweredCount((count) => count + 1)
    if (isCorrect) {
      setSpeedCorrectCount((count) => {
        const next = count + 1
        speedCorrectCountRef.current = next
        return next
      })
      setSpeedScore((score) => score + 10)
      setSpeedFeedback('Correct')
    } else {
      setSpeedIncorrectCount((count) => {
        const next = count + 1
        speedIncorrectCountRef.current = next
        return next
      })
      setSpeedScore((score) => Math.max(0, score - 5))
      setSpeedFeedback('Incorrect')
    }
    const previousId = speedCurrentQuestion.id
    if (speedAdvanceTimerRef.current !== null) {
      window.clearTimeout(speedAdvanceTimerRef.current)
      speedAdvanceTimerRef.current = null
    }
    speedAdvanceTimerRef.current = window.setTimeout(() => {
      nextSpeedQuestion(undefined, previousId)
      setSpeedFeedback('')
      speedAnswerLockRef.current = false
      setSpeedAnswerLocked(false)
      speedAdvanceTimerRef.current = null
    }, 150)
  }, [isSpeedSpamAttempt, nextSpeedQuestion, speedCurrentQuestion, speedRunning, markStudyActivity])

  const nextScenarioQuestion = useCallback((candidateDeck?: ScenarioQuestion[], previousId?: string) => {
    let deck = candidateDeck ? [...candidateDeck] : [...scenarioDeckRef.current]
    if (deck.length === 0) {
      deck = buildScenarioDeckForCurrentSection()
    }
    if (deck.length === 0) {
      setScenarioCurrentQuestion(null)
      scenarioDeckRef.current = []
      setScenarioDeck([])
      return
    }
    if (previousId && deck.length > 1 && deck[0].id === previousId) {
      ;[deck[0], deck[1]] = [deck[1], deck[0]]
    }
    const [next, ...remaining] = deck
    setScenarioCurrentQuestion(next)
    scenarioDeckRef.current = remaining
    setScenarioDeck(remaining)
    setScenarioResult('')
    setScenarioSelectedChoice(null)
    window.setTimeout(() => {
      const promptEl = scenarioPromptRef.current
      if (!promptEl) return
      const rect = promptEl.getBoundingClientRect()
      const topOffset = window.innerWidth < 768 ? 108 : 118
      const targetTop = Math.max(0, rect.top + window.scrollY - topOffset)
      window.scrollTo({ top: targetTop, behavior: 'smooth' })
    }, 40)
  }, [buildScenarioDeckForCurrentSection])

  const answerScenario = useCallback((choiceIndex: number) => {
    if (!scenarioCurrentQuestion) return
    setScenarioSelectedChoice(choiceIndex)
    const isCorrect = choiceIndex === scenarioCurrentQuestion.correctIndex
    incrementUserStats((stats) => ({ ...stats, scenariosReviewed: stats.scenariosReviewed + 1 }), true)
    if (isCorrect) {
      setScenarioStreak((current) => current + 1)
    } else {
      if (scenarioStreak > 0) {
        triggerCelebration('Streak broken', `Scenario streak ended at ${scenarioStreak}`)
      }
      setScenarioStreak(0)
    }
    setScenarioResult(isCorrect ? 'Correct' : `Incorrect • Correct answer: ${scenarioCurrentQuestion.choices[scenarioCurrentQuestion.correctIndex]}`)
  }, [incrementUserStats, scenarioCurrentQuestion, scenarioStreak, triggerCelebration])

  useEffect(() => {
    if (!scenarioResult) return
    const timeout = window.setTimeout(() => {
      const nextWrap = scenarioNextRef.current
      if (!nextWrap) return
      const rect = nextWrap.getBoundingClientRect()
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight
      const targetBottom = viewportHeight - (viewportHeight < 820 ? 168 : 130)
      if (rect.bottom > targetBottom) {
        const overflow = rect.bottom - targetBottom
        const delta = Math.min(420, Math.max(48, overflow + 28))
        window.scrollBy({ top: delta, behavior: 'smooth' })
      }
    }, 120)
    return () => window.clearTimeout(timeout)
  }, [scenarioResult])

  useEffect(() => {
    if (selectedChoice === null) return
    const timeout = window.setTimeout(() => {
      const button = quizNextRef.current
      if (!button) return
      const rect = button.getBoundingClientRect()
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight
      const targetBottom = viewportHeight - (viewportHeight < 820 ? 160 : 120)
      if (rect.bottom > targetBottom) {
        const delta = Math.min(120, Math.max(36, rect.bottom - targetBottom + 18))
        window.scrollBy({ top: delta, behavior: 'smooth' })
      }
    }, 120)
    return () => window.clearTimeout(timeout)
  }, [selectedChoice])

  useEffect(() => {
    if (selectedCards.length !== 2) return
    const selected = matchCards.filter((card) => selectedCards.includes(card.id))
    if (selected.length !== 2) return

    const isMatch = selected[0].pairId === selected[1].pairId && selected[0].kind !== selected[1].kind

    if (isMatch) {
      setMatchedPairIds((previous) => [...previous, selected[0].pairId])
      setMatchScore((score) => score + 10)
      setMatchCorrectCount((count) => {
        const next = count + 1
        matchCorrectCountRef.current = next
        return next
      })
      setWrongCardIds([])
      markPerformance(selected[0].codeSet, selected[0].sectionNumber, true)
      setSelectedCards([])
      return
    } else {
      setMatchScore((score) => Math.max(0, score - 5))
      setMatchIncorrectCount((count) => {
        const next = count + 1
        matchIncorrectCountRef.current = next
        return next
      })
      setWrongCardIds(selected.map((card) => card.id))
      markPerformance(selected[0].codeSet, selected[0].sectionNumber, false)
      markPerformance(selected[1].codeSet, selected[1].sectionNumber, false)
      if (matchWrongResetTimerRef.current !== null) {
        window.clearTimeout(matchWrongResetTimerRef.current)
      }
      matchWrongResetTimerRef.current = window.setTimeout(() => {
        setSelectedCards([])
        setWrongCardIds([])
        matchWrongResetTimerRef.current = null
      }, 260)
    }
  }, [markPerformance, matchCards, selectedCards])

  const handleMatchCardSelect = useCallback((cardId: string) => {
    setSelectedCards((previous) => {
      if (wrongCardIds.length > 0) return previous
      if (previous.includes(cardId)) return previous.filter((value) => value !== cardId)
      if (previous.length >= 2) return previous
      return [...previous, cardId]
    })
  }, [wrongCardIds.length])

  useEffect(() => {
    if (!matchRunning || matchCards.length === 0) return
    const uniquePairs = new Set(matchCards.map((card) => card.pairId))
    if (matchedPairIds.length !== uniquePairs.size) return
    setMatchRound((round) => round + 1)
    setMatchScore((score) => score + 20)
    makeRoundCards(matchSessionFilterRef.current)
  }, [makeRoundCards, matchCards, matchRunning, matchedPairIds])

  useEffect(() => {
    if (!speedRunning) return
    const timer = setInterval(() => {
      setSpeedRemaining((remaining) => {
        if (remaining <= 1) {
          clearInterval(timer)
          setSpeedRunning(false)
          setSpeedDone(true)
          resetSpeedSpamState()
          if (speedAdvanceTimerRef.current !== null) {
            window.clearTimeout(speedAdvanceTimerRef.current)
            speedAdvanceTimerRef.current = null
          }
          speedAnswerLockRef.current = false
          setSpeedAnswerLocked(false)
          const finalSpeedScore = speedScoreRef.current
          const finalAnswered = speedAnsweredCountRef.current
          const finalCorrect = speedCorrectCountRef.current
          const finalIncorrect = speedIncorrectCountRef.current
          const finalAccuracy = finalAnswered > 0 ? Math.round((finalCorrect / finalAnswered) * 100) : 0
          const sessionDuration = speedSessionDurationRef.current
          const sessionFilter = speedSessionFilterRef.current
          const trackKey = sessionTrackKey({ mode: 'speed', duration: sessionDuration, filter: sessionFilter })
          const track = getSessionTrack(profileDetails.stats, trackKey)
          const previousAttempt = track.lastAttempt
          const trend = [...track.accuracyHistory, finalAccuracy].slice(-8)
          const remoteTrend = remoteTrackScoreHistory[trackKey] || []
          const baseScoreTrend = remoteTrend.length > 0
            ? remoteTrend
            : track.scoreHistory && track.scoreHistory.length > 0
              ? track.scoreHistory
              : previousAttempt
                ? [previousAttempt.score]
                : []
          const scoreTrend = [...baseScoreTrend, finalSpeedScore]
          const focusTips = getFocusTips(sessionFilter, 'speed')
          const previousBest = highScoresRef.current.rapidFire
          const isPersonalBest = finalSpeedScore > previousBest
          setHighScores((previous) => ({ ...previous, rapidFire: Math.max(previous.rapidFire, finalSpeedScore) }))

          if (supabase && currentUserId) {
            void (async () => {
              const leaderboardBeforeSave = [...leaderboardRef.current]
              const weeklyLeaderboardBeforeSave = [...weeklyLeaderboardRef.current]
              const existing = leaderboardRef.current.find(
                (e) => e.userId === currentUserId && 
                       e.game === 'Speed Test' && 
                       e.matchDuration === sessionDuration && 
                       e.matchFilter === sessionFilter
              )
              
              if (isLeaderboardScoreImprovement(finalSpeedScore, finalAnswered, existing)) {
                const { error: insertError } = await supabase
                  .from('leaderboard')
                  .upsert({
                    game: 'Speed Test',
                    score: finalSpeedScore,
                    round: finalAnswered,
                    user_id: currentUserId,
                    match_duration: sessionDuration,
                    match_filter: sessionFilter,
                    created_at: new Date().toISOString(),
                  }, {
                    onConflict: 'user_id,game,match_duration,match_filter',
                    ignoreDuplicates: false,
                  })

                if (insertError) {
                  console.error('Leaderboard save failed:', insertError)
                }
              }

              await syncWeeklyLeaderboardEntry({
                game: 'Speed Test',
                score: finalSpeedScore,
                round: finalAnswered,
                duration: sessionDuration,
                filter: sessionFilter,
              })

              const refreshed = await refreshLeaderboard({ force: true })
              await refreshHomeLeaderboards({ force: true })
              const leaderboardAfterSave = refreshed.allTimeEntries.length > 0 ? refreshed.allTimeEntries : leaderboardRef.current
              const weeklyLeaderboardAfterSave = refreshed.weeklyEntries.length > 0 ? refreshed.weeklyEntries : weeklyLeaderboardRef.current
              const milestone = await handleLeaderboardTopMilestones({
                game: 'Speed Test',
                duration: sessionDuration,
                filter: sessionFilter,
                beforeAllTimeEntries: leaderboardBeforeSave,
                afterAllTimeEntries: leaderboardAfterSave,
                beforeWeeklyEntries: weeklyLeaderboardBeforeSave,
                afterWeeklyEntries: weeklyLeaderboardAfterSave,
              })
              if (!milestone.becameWeeklyTop && !milestone.becameAllTimeTop && isPersonalBest) {
                triggerCelebration('🎉 New Personal Best', `Speed: ${finalSpeedScore} points`)
              }

              const { preview, currentRank } = getLeaderboardPreview(
                leaderboardAfterSave,
                'Speed Test',
                sessionDuration,
                sessionFilter,
                currentUserId,
              )
              setSpeedReport({
                mode: 'speed',
                title: 'Speed Test',
                contextLabel: `${sessionDuration}s • ${leaderboardCodeSetLabel(sessionFilter)}`,
                accuracy: finalAccuracy,
                correct: finalCorrect,
                incorrect: finalIncorrect,
                score: finalSpeedScore,
                deltaAccuracy: previousAttempt ? finalAccuracy - previousAttempt.accuracy : null,
                deltaScore: previousAttempt ? finalSpeedScore - previousAttempt.score : null,
                trend,
                scoreTrend,
                focusTips,
                leaderboardPreview: preview,
                currentRank,
                previousRank: previousAttempt?.rank ?? null,
              })
              saveSessionAttempt(trackKey, {
                accuracy: finalAccuracy,
                score: finalSpeedScore,
                correct: finalCorrect,
                incorrect: finalIncorrect,
                rank: currentRank,
                duration: sessionDuration,
                filter: sessionFilter,
                at: Date.now(),
              })
            })()
          } else {
            setSpeedReport({
              mode: 'speed',
              title: 'Speed Test',
              contextLabel: `${sessionDuration}s • ${leaderboardCodeSetLabel(sessionFilter)}`,
              accuracy: finalAccuracy,
              correct: finalCorrect,
              incorrect: finalIncorrect,
              score: finalSpeedScore,
              deltaAccuracy: previousAttempt ? finalAccuracy - previousAttempt.accuracy : null,
              deltaScore: previousAttempt ? finalSpeedScore - previousAttempt.score : null,
              trend,
              scoreTrend,
              focusTips,
              leaderboardPreview: [],
              currentRank: null,
              previousRank: previousAttempt?.rank ?? null,
            })
            saveSessionAttempt(trackKey, {
              accuracy: finalAccuracy,
              score: finalSpeedScore,
              correct: finalCorrect,
              incorrect: finalIncorrect,
              rank: null,
              duration: sessionDuration,
              filter: sessionFilter,
              at: Date.now(),
            })
          }
          return 0
        }
        return remaining - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [
    currentUserId,
    getFocusTips,
    handleLeaderboardTopMilestones,
    profileDetails.stats,
    remoteTrackScoreHistory,
    saveSessionAttempt,
    resetSpeedSpamState,
    syncWeeklyLeaderboardEntry,
    speedRunning,
    triggerCelebration,
  ])

  useEffect(() => {
    scenarioDeckRef.current = []
    setScenarioDeck([])
    setScenarioCurrentQuestion(null)
    setScenarioResult('')
    setScenarioSelectedChoice(null)
    setScenarioStreak(0)
    nextScenarioQuestion([])
  }, [nextScenarioQuestion, scenarioTrainingSection, scenarioItems])

  const submitSignIn = async () => {
    if (!supabase) return
    setAuthLoading(true)
    setAuthError('')
    setAuthSuccess('')

    const { data, error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: authPassword,
    })

    if (error) {
      setAuthError(error.message)
      setAuthLoading(false)
      return
    }

    if (data.user) {
      setCurrentUserId(data.user.id)
      setCurrentUserEmail(data.user.email || '')
      setCurrentUserProvider(String(data.user.app_metadata?.provider || 'email'))
    }

    setAuthLoading(false)
  }

  const handleSignInEnterKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (authLoading) return
    void submitSignIn()
  }

  const submitSignUp = async () => {
    if (!supabase) return
    const normalizedEmail = authEmail.trim().toLowerCase()
    if (authPassword !== authPasswordConfirm) {
      setAuthError('Passwords do not match.')
      return
    }
    if (!normalizedEmail) {
      setAuthError('Enter an email address.')
      return
    }
    setAuthLoading(true)
    setAuthError('')
    setAuthSuccess('')
    window.localStorage.removeItem('pending_profile_setup')

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: authPassword,
    })

    if (error) {
      const message = error.message.toLowerCase()
      if (message.includes('already registered') || message.includes('already exists')) {
        setAuthError('This email is already in use. If you used Google before, sign in with Google.')
      } else {
        setAuthError(error.message)
      }
      setAuthLoading(false)
      return
    }

    const hasIdentity = Boolean(data?.user?.identities && data.user.identities.length > 0)
    if (!hasIdentity) {
      setAuthError('This email is already in use. If you used Google before, sign in with Google.')
      setAuthLoading(false)
      return
    }

    window.localStorage.setItem('pending_profile_setup', '1')
    window.localStorage.setItem('pending_dev_notice', '1')
    setForceProfileSetup(true)
    setAuthEmail(normalizedEmail)
    setAuthSuccess('Account created. You can sign in now.')
    setAuthPassword('')
    setAuthPasswordConfirm('')
    setShowSignUpPassword(false)
    setShowSignUpPasswordConfirm(false)
    navigate('/signin', { replace: true })

    setAuthLoading(false)
  }

  const submitGoogle = async () => {
    if (!supabase) return
    setAuthLoading(true)
    setAuthError('')
    if (isSignUpPage) {
      window.localStorage.setItem('pending_profile_setup', '1')
      window.localStorage.setItem('pending_dev_notice', '1')
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })

    if (error) {
      setAuthError(error.message)
      setAuthLoading(false)
    }
  }

  const submitProfile = async () => {
    if (!supabase || !currentUserId) return
    setAuthLoading(true)
    setAuthError('')
    setAuthSuccess('')

    const usernameTakenMessage = 'Username already exists. Try another.'
    const normalizedUsername = profileUsername.trim()
    if (!normalizedUsername) {
      setAuthError('Please enter a username.')
      setAuthLoading(false)
      return
    }

    try {
      const { data: existingUsernameRow, error: existingUsernameError } = await supabase
        .from('profiles')
        .select('user_id')
        .ilike('username', normalizedUsername)
        .neq('user_id', currentUserId)
        .limit(1)
        .maybeSingle()
      if (existingUsernameError) {
        console.warn('[profiles] username availability check failed:', existingUsernameError.message)
      }
      if (existingUsernameRow?.user_id) {
        setAuthError(usernameTakenMessage)
        setAuthLoading(false)
        return
      }
    } catch (error) {
      console.warn('[profiles] username availability check crashed:', error)
    }

    let avatarPath = profile?.avatarPath || ''

    if (profileAvatar) {
      const extension = profileAvatar.name.split('.').pop() || 'jpg'
      const fileName = `${currentUserId}/${crypto.randomUUID()}.${extension}`
      const uploadResult = await supabase.storage.from(avatarBucket).upload(fileName, profileAvatar, { upsert: true })
      if (uploadResult.error) {
        setAuthError(uploadResult.error.message || `Could not upload image to '${avatarBucket}' bucket.`)
        setAuthLoading(false)
        return
      }
      avatarPath = fileName
    }

    const { data: savedProfileRow, error } = await supabase
      .from('profiles')
      .upsert(
        {
          user_id: currentUserId,
          username: normalizedUsername,
          avatar_path: avatarPath,
          supporter_tier: profile?.supporterTier || 'free',
          bio: profileDetails.bio,
          agency: normalizeAgency(profileDetails.agency, agencyOptions),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
      .select('user_id,username,avatar_path,supporter_tier,bio,agency,created_at')
      .single()

    if (error) {
      const typed = error as unknown as { message?: string; code?: string; details?: string }
      const message = String(typed.message || 'Could not save profile.')
      const code = String(typed.code || '')
      const details = String(typed.details || '')
      const isUsernameUniqueViolation =
        code === '23505' ||
        message.toLowerCase().includes('duplicate key') ||
        message.toLowerCase().includes('unique constraint') ||
        message.toLowerCase().includes('profiles_username_lower_unique') ||
        details.toLowerCase().includes('profiles_username_lower_unique')

      setAuthError(isUsernameUniqueViolation ? usernameTakenMessage : message)
      setAuthLoading(false)
      return
    }

    const mapped = mapProfileRow(savedProfileRow as Record<string, unknown>, currentUserId)
    setProfile(mapped)
    setProfileUsername(mapped.username)
    setForceProfileSetup(false)

    const pendingDevNotice = window.localStorage.getItem('pending_dev_notice') === '1'
    window.localStorage.removeItem('pending_dev_notice')
    if (pendingDevNotice) {
      const dismissedKey = `dev_notice_dismissed_${currentUserId}`
      const dismissed = window.localStorage.getItem(dismissedKey) === '1'
      if (!dismissed) setShowDevNotice(true)
    }

    setProfileAvatar(null)
    if (profileAvatarPreviewUrl) URL.revokeObjectURL(profileAvatarPreviewUrl)
    setProfileAvatarPreviewUrl('')
    const { data: appStateRow, error: appStateError } = await supabase
      .from('app_state')
      .upsert(
        {
          user_id: currentUserId,
          performance,
          high_scores: highScores,
          best_streak: bestStreak,
          profile_details: {
            ...profileDetails,
            algorithmSnapshot: buildAlgorithmSnapshot(sections, performance),
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
      .select('updated_at')
      .maybeSingle()
    if (appStateError) {
      setAuthError(`Profile saved, but theme/settings persistence failed: ${appStateError.message || 'Could not update app state.'}`)
      setAuthLoading(false)
      return
    }
    const nextUpdatedAt = Date.parse(String(appStateRow?.updated_at || '')) || Date.now()
    lastAppStateUpdateRef.current = Math.max(lastAppStateUpdateRef.current, nextUpdatedAt)
    await refreshLeaderboard({ force: true })
    await refreshHomeLeaderboards({ force: true })
    setAuthSuccess('All changes saved')
    setTimeout(() => setAuthSuccess(''), 1600)
    setAuthLoading(false)
  }

  const updateAccountPassword = async () => {
    if (!supabase) return
    if (accountNewPassword.length < 6) {
      setAuthError('Password must be at least 6 characters.')
      return
    }
    if (accountNewPassword !== accountConfirmPassword) {
      setAuthError('Passwords do not match.')
      return
    }

    setAuthLoading(true)
    setAuthError('')
    setAuthSuccess('')

    const { error } = await supabase.auth.updateUser({ password: accountNewPassword })
    if (error) {
      setAuthError(error.message)
      setAuthLoading(false)
      return
    }

    setAccountNewPassword('')
    setAccountConfirmPassword('')
    setShowAccountPassword(false)
    setAuthSuccess('Password updated.')
    setTimeout(() => setAuthSuccess(''), 1600)
    setAuthLoading(false)
  }

  const linkGoogleAccount = async () => {
    if (!supabase) return
    if (currentUserProvider.toLowerCase() === 'google') {
      setAuthSuccess('Google is already linked to this account.')
      setTimeout(() => setAuthSuccess(''), 1600)
      return
    }

    setAuthLoading(true)
    setAuthError('')
    setAuthSuccess('')

    const authApi = supabase.auth as unknown as {
      linkIdentity?: (params: { provider: 'google'; options?: { redirectTo?: string } }) => Promise<{ error: { message?: string } | null }>
    }
    if (typeof authApi.linkIdentity !== 'function') {
      setAuthError('Account linking is not available in this build of Supabase auth.')
      setAuthLoading(false)
      return
    }

    const { error } = await authApi.linkIdentity({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/profile` },
    })

    if (error) {
      setAuthError(error.message || 'Could not link Google account.')
      setAuthLoading(false)
      return
    }

    setAuthSuccess('Continue with Google to finish linking your account.')
    setAuthLoading(false)
  }

  const startTierCheckout = (tier: Exclude<SupporterTier, 'free'>) => {
    const checkoutUrl = stripeTierLinks[tier]
    if (!checkoutUrl) {
      setAuthError(`Missing checkout link for ${tierLabel[tier]}. Add it in .env.`)
      return
    }
    const url = new URL(checkoutUrl)
    if (currentUserEmail) url.searchParams.set('prefilled_email', currentUserEmail)
    if (currentUserId) url.searchParams.set('client_reference_id', currentUserId)
    window.location.href = url.toString()
  }

  const signOut = async () => {
    if (!supabase) return
    setProfileMenuOpen(false)
    await supabase.auth.signOut()
    setCurrentUserId('')
    setCurrentUserEmail('')
    setCurrentUserProvider('email')
    setProfile(null)
    setForceProfileSetup(false)
    setAuthEmail('')
    setAuthPassword('')
    setAuthPasswordConfirm('')
    setShowSignInPassword(false)
    setShowSignUpPassword(false)
    setShowSignUpPasswordConfirm(false)
    setProfileAvatar(null)
    if (profileAvatarPreviewUrl) URL.revokeObjectURL(profileAvatarPreviewUrl)
    setProfileAvatarPreviewUrl('')
    if (avatarCropSourceUrl) URL.revokeObjectURL(avatarCropSourceUrl)
    setAvatarCropSourceUrl('')
    setAvatarCropSourceName('')
    setAvatarCropOpen(false)
    setAvatarCropZoom(1)
    setAvatarCropX(0)
    setAvatarCropY(0)
    setAccountNewPassword('')
    setAccountConfirmPassword('')
    setShowAccountPassword(false)
    setProfileUsername('')
    setProfileDetails({
      bio: '',
      agency: defaultAgency,
      displayMode: 'dark',
      homeLeaderboardRotationMs: defaultLeaderboardRotationMs,
      homeLeaderboardPreferences: { ...defaultHomeLeaderboardPreferences, visibleCards: [...defaultHomeLeaderboardPreferences.visibleCards] },
      themeId: appThemePresets[0].id,
      nameStyle: { ...defaultNameStyle },
      namePresets: [],
      systemNoticesSeen: [],
      stats: { ...defaultUserStats, gamePlays: { ...defaultUserStats.gamePlays }, studyModeCounts: { ...defaultUserStats.studyModeCounts } },
      currentActivity: null,
    })
    setNewPresetName('')
    setStateHydrated(false)
    setRemoteTrackScoreHistory({})
    setRemoteScoreTimeline([])
    recentSpeedSectionsRef.current = []
    setStudyFlashSessionOpen(false)
    setStudyTestSessionOpen(false)
    setStudyTestSessionDone(false)
  }

  const resetEverything = async () => {
    if (!currentUserId) return

    setAuthError('')
    setAuthSuccess('')
    setAuthLoading(true)

    if (supabase) {
      const { error: resetRpcErrorRaw } = await supabase.rpc('reset_user_progress_data')
      const resetRpcError = resetRpcErrorRaw as { code?: string; message?: string } | null
      const rpcMissing = String(resetRpcError?.code || '') === '42883'

      if (resetRpcError && !rpcMissing) {
        setAuthError(resetRpcError.message || 'Could not reset data.')
        setAuthLoading(false)
        return
      }

      if (rpcMissing) {
        const [{ error: stateError }, { error: leaderboardError }, { error: weeklyLeaderboardErrorRaw }, { error: historyErrorRaw }] = await Promise.all([
          supabase.from('app_state').delete().eq('user_id', currentUserId),
          supabase.from('leaderboard').delete().eq('user_id', currentUserId),
          supabase.from('weekly_leaderboard').delete().eq('user_id', currentUserId),
          supabase.from('game_attempt_history').delete().eq('user_id', currentUserId),
        ])
        const weeklyLeaderboardError =
          weeklyLeaderboardErrorRaw && String((weeklyLeaderboardErrorRaw as { code?: string }).code || '') !== '42P01'
            ? weeklyLeaderboardErrorRaw
            : null
        const historyError = historyErrorRaw && String((historyErrorRaw as { code?: string }).code || '') !== '42P01'
          ? historyErrorRaw
          : null

        if (stateError || leaderboardError || weeklyLeaderboardError || historyError) {
          setAuthError(
            stateError?.message ||
            leaderboardError?.message ||
            weeklyLeaderboardError?.message ||
            historyError?.message ||
            'Could not reset data.',
          )
          setAuthLoading(false)
          return
        }
      }
    }

    setPerformance({})
    setHighScores(gameHighScoreSeed)
    setBestStreak(0)
    setRemoteTrackScoreHistory({})
    setRemoteScoreTimeline([])
    setLeaderboard([])
    setWeeklyLeaderboard([])
    setQuizDeck([])
    setCurrentQuestion(null)
    setSelectedChoice(null)
    setFeedback('')
    setStreak(0)
    setScenarioDeck([])
    setScenarioCurrentQuestion(null)
    setScenarioResult('')
    setScenarioStreak(0)
    setMatchDone(false)
    setMatchRunning(false)
    setMatchCards([])
    setSelectedCards([])
    setWrongCardIds([])
    setMatchedPairIds([])
    setRecentMatchSections([])
    setMatchRemaining(gamesSelection.duration)
    setSpeedDone(false)
    setSpeedRunning(false)
    setSpeedDeck([])
    setSpeedSessionQuestions([])
    setSpeedCurrentQuestion(null)
    setSpeedRemaining(gamesSelection.duration)
    setSpeedFeedback('')
    setSpeedScore(0)
    setSpeedAnsweredCount(0)
    setMatchScore(0)
    setMatchRound(1)
    setStudyFlashSessionOpen(false)
    setStudyTestSessionOpen(false)
    setStudyTestSessionDone(false)
    setStudyTestSessionAnswered(0)
    setStudyTestSessionCorrect(0)
    setStudyTestSessionTotal(0)
    setStudyFlashSessionIndex(0)
    setStudyFlashSessionOrder([])
    setStudyFlashSessionFlipped(false)
    setProfileDetails((previous) => ({
      ...previous,
      namePresets: [],
      stats: { ...defaultUserStats, gamePlays: { ...defaultUserStats.gamePlays }, studyModeCounts: { ...defaultUserStats.studyModeCounts } },
    }))
    recentSpeedSectionsRef.current = []
    await refreshLeaderboard({ force: true })
    await refreshHomeLeaderboards({ force: true })
    setAuthSuccess('All scores and progress were reset.')
    setTimeout(() => setAuthSuccess(''), 1800)
    setShowResetConfirmModal(false)
    setResetConfirmText('')
    setAuthLoading(false)
  }

  const fireLevel = streakToFireLevel(streak)
  const fireOption = useMemo<FireFlameOption | undefined>(() => {
    return buildFireOption(fireLevel, quizFireWidth)
  }, [fireLevel, quizFireWidth])
  const fireParticles = useMemo(() => {
    return buildFireParticles(fireLevel)
  }, [fireLevel])
  const scenarioFireLevel = streakToFireLevel(scenarioStreak)
  const scenarioFireOption = useMemo<FireFlameOption | undefined>(() => {
    return buildFireOption(scenarioFireLevel, scenarioFireWidth || quizFireWidth)
  }, [scenarioFireLevel, scenarioFireWidth, quizFireWidth])
  const scenarioFireParticles = useMemo(() => {
    return buildFireParticles(scenarioFireLevel)
  }, [scenarioFireLevel])

  useEffect(() => {
    const nextPath = normalizeRoutePath(location.pathname)
    setRoutePath((current) => (current === nextPath ? current : nextPath))
  }, [location.pathname])

  const currentPath = routePath
  const isSignInPage = currentPath === '/signin'
  const isSignUpPage = currentPath === '/signup'
  const isHomePage = currentPath === '/home'
  const isStudyHubPage = currentPath === '/study'
  const isStudyGuidePage = currentPath === '/study/guide'
  const isStudyPracticeTestPage = currentPath === '/study/practice-test'
  const isStudyFlashcardsPage = currentPath === '/study/flashcards'
  const isStudyTestPage = currentPath === '/study/test'
  const isStudyPage = isStudyHubPage || isStudyGuidePage || isStudyPracticeTestPage || isStudyFlashcardsPage || isStudyTestPage
  const isGamesHubPage = currentPath === '/games'
  const isGamesMatchingPage = currentPath === '/games/matching'
  const isGamesSpeedPage = currentPath === '/games/speed'
  const isGamesDuelPage = currentPath === '/games/duel'
  const isGamesPage = isGamesHubPage || isGamesMatchingPage || isGamesSpeedPage || isGamesDuelPage
  const isScenariosPage = currentPath === '/scenarios'
  const isLibraryPage = currentPath === '/library'
  const isLeaderboardsPage = currentPath === '/leaderboards'
  const isChatPage = currentPath === '/chat'
  const isSupportPage = currentPath === '/support'
  const isProfilePage = currentPath === '/profile'
  const isStatsPage = currentPath === '/stats'
  useEffect(() => {
    if (isProfilePage) return
    setBugReportPagePath(currentPath)
  }, [currentPath, isProfilePage])
  const activeStudyActivitySource: StudyActivitySource | null =
    isStudyGuidePage
      ? 'study_guide'
      : isStudyPracticeTestPage
        ? 'study_practice'
      : isStudyFlashcardsPage && studyFlashSessionOpen && orderedStudyFlashSessionCards.length > 0
      ? 'flashcards'
      : isStudyTestPage && studyTestSessionOpen && !studyTestSessionDone && Boolean(currentQuestion)
        ? 'study_test'
        : isGamesMatchingPage && matchRunning && !matchDone
          ? 'matching'
          : isGamesSpeedPage && speedRunning && !speedDone && Boolean(speedCurrentQuestion)
            ? 'speed'
            : isGamesDuelPage
              ? 'duel'
              : null
  const isKnownAuthedPage =
    isHomePage ||
    isStudyPage ||
    isGamesPage ||
    isScenariosPage ||
    isLibraryPage ||
    isLeaderboardsPage ||
    isChatPage ||
    isSupportPage ||
    isProfilePage ||
    isStatsPage
  const needsProfileSetup = Boolean(authReady && currentUserId && profile && !profile.username && forceProfileSetup)

  const goToPath = useCallback(
    (path: string, options?: { tab?: AppTab; replace?: boolean }) => {
      const normalizedPath = normalizeRoutePath(path)
      setRoutePath(normalizedPath)
      if (options?.tab) {
        setActiveTab(options.tab)
      }
      navigate(path, options?.replace ? { replace: true } : undefined)
    },
    [navigate],
  )

  const openSettingsTab = useCallback((nextTab: SettingsTab) => {
    setSettingsTab(nextTab)
    goToPath('/profile')
  }, [goToPath])

  // Flashcard keyboard controls: Space to flip, Arrow keys to navigate
  useEffect(() => {
    if (!isStudyFlashcardsPage || !studyFlashSessionOpen || orderedStudyFlashSessionCards.length === 0) return

    const goToPreviousCard = () => {
      markStudyActivity('flashcards')
      setStudyFlashSessionFlipped(false)
      setStudyFlashSessionIndex((current) => {
        if (orderedStudyFlashSessionCards.length === 0) return 0
        return current === 0 ? orderedStudyFlashSessionCards.length - 1 : current - 1
      })
      incrementUserStats((stats) => ({ ...stats, flashcardsReviewed: stats.flashcardsReviewed + 1 }), true)
    }

    const goToNextCard = () => {
      markStudyActivity('flashcards')
      setStudyFlashSessionFlipped(false)
      setStudyFlashSessionIndex((current) => {
        if (orderedStudyFlashSessionCards.length === 0) return 0
        if (current < orderedStudyFlashSessionCards.length - 1) return current + 1
        const lastCardId = orderedStudyFlashSessionCards[current]?.id
        const reshuffled = shuffle(studyFlashSessionCards.map((card) => card.id))
        if (reshuffled.length > 1 && reshuffled[0] === lastCardId) {
          ;[reshuffled[0], reshuffled[1]] = [reshuffled[1], reshuffled[0]]
        }
        setStudyFlashSessionOrder(reshuffled)
        return 0
      })
      incrementUserStats((stats) => ({ ...stats, flashcardsReviewed: stats.flashcardsReviewed + 1 }), true)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle keys when not in an input field
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
        return
      }

      if (event.key === ' ' || event.code === 'Space') {
        event.preventDefault()
        markStudyActivity('flashcards')
        setStudyFlashSessionFlipped((value) => !value)
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goToPreviousCard()
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        goToNextCard()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [incrementUserStats, isStudyFlashcardsPage, studyFlashSessionOpen, orderedStudyFlashSessionCards, studyFlashSessionCards, markStudyActivity])

  // Keyboard shortcuts for answering multiple-choice questions (1-4 keys)
  useEffect(() => {
    if (!isStudyTestPage) return
    if (!currentQuestion || selectedChoice !== null) return

    // Spam detection: track recent keypresses
    const lastKeyPress = { key: '', time: 0 }
    const SPAM_THRESHOLD_MS = 250 // Same key within 250ms = spam

    const handleAnswerKeyDown = (event: KeyboardEvent) => {
      // Don't trigger when typing in input fields
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
        return
      }

      // Check for number keys 1-4
      const key = event.key
      if (key >= '1' && key <= '4') {
        const now = Date.now()
        
        // Detect spam: same key pressed within threshold
        if (key === lastKeyPress.key && now - lastKeyPress.time < SPAM_THRESHOLD_MS) {
          // Penalty for spamming - ignore the input
          return
        }
        
        lastKeyPress.key = key
        lastKeyPress.time = now

        const index = parseInt(key) - 1
        if (currentQuestion.choices && index < currentQuestion.choices.length) {
          event.preventDefault()
          answerQuestion(index)
        }
      }
    }

    window.addEventListener('keydown', handleAnswerKeyDown)
    return () => window.removeEventListener('keydown', handleAnswerKeyDown)
  }, [currentQuestion, selectedChoice, answerQuestion, isStudyTestPage])

  // Enter key to advance study test question
  useEffect(() => {
    if (!isStudyTestPage) return
    if (!currentQuestion || selectedChoice === null || studyTestSessionDone) return

    const handleEnterKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        advanceStudyTestQuestion()
      }
    }

    window.addEventListener('keydown', handleEnterKey)
    return () => window.removeEventListener('keydown', handleEnterKey)
  }, [currentQuestion, selectedChoice, studyTestSessionDone, advanceStudyTestQuestion, isStudyTestPage])

  // Keyboard shortcuts for speed test questions (1-4 keys)
  useEffect(() => {
    if (!speedCurrentQuestion || speedFeedback || speedAnswerLocked) return

    const handleSpeedAnswerKeyDown = (event: KeyboardEvent) => {
      // Don't trigger when typing in input fields
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
        return
      }

      // Check for number keys 1-4
      const key = event.key
      if (key >= '1' && key <= '4') {
        if (event.repeat) {
          event.preventDefault()
          return
        }

        const index = parseInt(key) - 1
        if (speedCurrentQuestion.choices && index < speedCurrentQuestion.choices.length) {
          event.preventDefault()
          answerSpeedQuestion(index)
        }
      }
    }

    window.addEventListener('keydown', handleSpeedAnswerKeyDown)
    return () => window.removeEventListener('keydown', handleSpeedAnswerKeyDown)
  }, [speedCurrentQuestion, speedFeedback, speedAnswerLocked, answerSpeedQuestion])

  // Keyboard shortcuts for scenario questions (1-4 keys)
  useEffect(() => {
    if (!scenarioCurrentQuestion || scenarioSelectedChoice !== null || scenarioResult) return

    // Spam detection
    const lastKeyPress = { key: '', time: 0 }
    const SPAM_THRESHOLD_MS = 250

    const handleScenarioAnswerKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
        return
      }

      const key = event.key
      if (key >= '1' && key <= '4') {
        const now = Date.now()
        
        // Detect spam
        if (key === lastKeyPress.key && now - lastKeyPress.time < SPAM_THRESHOLD_MS) {
          return
        }
        
        lastKeyPress.key = key
        lastKeyPress.time = now

        const index = parseInt(key) - 1
        if (scenarioCurrentQuestion.choices && index < scenarioCurrentQuestion.choices.length) {
          event.preventDefault()
          answerScenario(index)
        }
      }
    }

    window.addEventListener('keydown', handleScenarioAnswerKeyDown)
    return () => window.removeEventListener('keydown', handleScenarioAnswerKeyDown)
  }, [scenarioCurrentQuestion, scenarioSelectedChoice, scenarioResult, answerScenario])

  // Enter key to advance scenario question
  useEffect(() => {
    if (!scenarioCurrentQuestion || !scenarioResult) return

    const handleEnterKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        nextScenarioQuestion(undefined, scenarioCurrentQuestion.id)
      }
    }

    window.addEventListener('keydown', handleEnterKey)
    return () => window.removeEventListener('keydown', handleEnterKey)
  }, [scenarioCurrentQuestion, scenarioResult, nextScenarioQuestion])

  useEffect(() => {
    if (!authReady || !currentUserId) return
    if (currentPath === '/') {
      goToPath('/home', { replace: true, tab: 'home' })
    }
  }, [authReady, currentUserId, currentPath, goToPath])

  useEffect(() => {
    if (isHomePage) {
      setActiveTab('home')
      return
    }
    if (isStudyPage) {
      setActiveTab('study')
      return
    }
    if (isGamesPage) {
      setActiveTab('games')
      return
    }
    if (isScenariosPage) {
      setActiveTab('scenarios')
      return
    }
    if (isLibraryPage) {
      setActiveTab('library')
      return
    }
    if (isLeaderboardsPage) {
      setActiveTab('leaderboards')
      return
    }
    if (isChatPage) {
      setActiveTab('chat')
    }
  }, [isHomePage, isStudyPage, isGamesPage, isScenariosPage, isLibraryPage, isLeaderboardsPage, isChatPage])

  useEffect(() => {
    if (!authReady || !currentUserId) return
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [authReady, currentPath, currentUserId])

  useEffect(() => {
    if (!isStudyFlashcardsPage) {
      setStudyFlashSessionOpen(false)
      return
    }
  }, [isStudyFlashcardsPage])

  useEffect(() => {
    if (!isStudyTestPage) {
      setStudyTestSessionOpen(false)
      setStudyTestSessionDone(false)
      setCurrentQuestion(null)
      setQuizDeck([])
      setSelectedChoice(null)
      setFeedback('')
      setStreak(0)
      return
    }
  }, [isStudyTestPage])

  useEffect(() => {
    if (!isGamesMatchingPage && !isGamesSpeedPage) return
    const scrollToTop = () => {
      window.scrollTo({ top: 0, behavior: 'auto' })
    }
    scrollToTop()
    const raf = window.requestAnimationFrame(scrollToTop)
    const timer = window.setTimeout(scrollToTop, 120)
    return () => {
      window.cancelAnimationFrame(raf)
      window.clearTimeout(timer)
    }
  }, [isGamesMatchingPage, isGamesSpeedPage, matchRunning, speedRunning, matchDone, speedDone])

  useEffect(() => {
    if (homeMatchingRotationSteps.length === 0) return
    const hasCurrent = homeMatchingRotationSteps.some(
      (step) => step.duration === homeMatchingDurationFilter && step.codeSet === homeMatchingCodeFilter,
    )
    if (hasCurrent) return
    const first = homeMatchingRotationSteps[0]
    homeMatchingRotationIndexRef.current = 0
    setHomeMatchingDurationFilter(first.duration)
    setHomeMatchingCodeFilter(first.codeSet)
  }, [homeMatchingRotationSteps, homeMatchingDurationFilter, homeMatchingCodeFilter])

  useEffect(() => {
    if (homeSpeedRotationSteps.length === 0) return
    const hasCurrent = homeSpeedRotationSteps.some(
      (step) => step.duration === homeSpeedDurationFilter && step.codeSet === homeSpeedCodeFilter,
    )
    if (hasCurrent) return
    const first = homeSpeedRotationSteps[0]
    homeSpeedRotationIndexRef.current = 0
    setHomeSpeedDurationFilter(first.duration)
    setHomeSpeedCodeFilter(first.codeSet)
  }, [homeSpeedRotationSteps, homeSpeedDurationFilter, homeSpeedCodeFilter])

  useEffect(() => {
    if (!isHomePage || !homeShowsMatchingLeaderboard || homeMatchingConfigOpen || homeMatchingRotationSteps.length === 0) return

    const currentIndex = homeMatchingRotationSteps.findIndex(
      (step) => step.duration === homeMatchingDurationFilter && step.codeSet === homeMatchingCodeFilter,
    )
    if (currentIndex >= 0) homeMatchingRotationIndexRef.current = currentIndex

    const timer = window.setInterval(() => {
      const nextIndex = (homeMatchingRotationIndexRef.current + 1) % homeMatchingRotationSteps.length
      homeMatchingRotationIndexRef.current = nextIndex
      const nextStep = homeMatchingRotationSteps[nextIndex]
      setHomeMatchingDurationFilter(nextStep.duration)
      setHomeMatchingCodeFilter(nextStep.codeSet)
    }, leaderboardRotateMs)

    return () => window.clearInterval(timer)
  }, [isHomePage, homeShowsMatchingLeaderboard, homeMatchingConfigOpen, homeMatchingDurationFilter, homeMatchingCodeFilter, homeMatchingRotationSteps, leaderboardRotateMs])

  useEffect(() => {
    if (!isHomePage || !homeShowsSpeedLeaderboard || homeSpeedConfigOpen || homeSpeedRotationSteps.length === 0) return

    const currentIndex = homeSpeedRotationSteps.findIndex(
      (step) => step.duration === homeSpeedDurationFilter && step.codeSet === homeSpeedCodeFilter,
    )
    if (currentIndex >= 0) homeSpeedRotationIndexRef.current = currentIndex

    const timer = window.setInterval(() => {
      const nextIndex = (homeSpeedRotationIndexRef.current + 1) % homeSpeedRotationSteps.length
      homeSpeedRotationIndexRef.current = nextIndex
      const nextStep = homeSpeedRotationSteps[nextIndex]
      setHomeSpeedDurationFilter(nextStep.duration)
      setHomeSpeedCodeFilter(nextStep.codeSet)
    }, leaderboardRotateMs)

    return () => window.clearInterval(timer)
  }, [isHomePage, homeShowsSpeedLeaderboard, homeSpeedConfigOpen, homeSpeedDurationFilter, homeSpeedCodeFilter, homeSpeedRotationSteps, leaderboardRotateMs])

  useEffect(() => {
    if (homeShowsMatchingLeaderboard) return
    if (homeMatchingConfigOpen) setHomeMatchingConfigOpen(false)
  }, [homeShowsMatchingLeaderboard, homeMatchingConfigOpen])

  useEffect(() => {
    if (homeShowsSpeedLeaderboard) return
    if (homeSpeedConfigOpen) setHomeSpeedConfigOpen(false)
  }, [homeShowsSpeedLeaderboard, homeSpeedConfigOpen])

  useEffect(() => {
    if (!homeLeaderboardSettingsOpen) return
    setHomeLeaderboardSettingsDraft(homeLeaderboardPreferences)
    setHomeLeaderboardSettingsError('')
  }, [homeLeaderboardPreferences, homeLeaderboardSettingsOpen])

  useEffect(() => {
    if (isHomePage) return
    setHomeLeaderboardSettingsOpen(false)
    setHomeLeaderboardSettingsError('')
  }, [isHomePage])

  useEffect(() => {
    if (!mobileNavMenuOpen) return
    setMobileNavMenuOpen(false)
  }, [currentPath, mobileNavMenuOpen])

  useEffect(() => {
    if (!leaderboardSelectedBoard) return
    if (
      leaderboardViewDuration === leaderboardSelectedBoard.duration &&
      leaderboardViewFilter === leaderboardSelectedBoard.filter
    ) {
      return
    }
    setLeaderboardViewDuration(leaderboardSelectedBoard.duration)
    setLeaderboardViewFilter(leaderboardSelectedBoard.filter)
  }, [leaderboardSelectedBoard, leaderboardViewDuration, leaderboardViewFilter])

  const refreshSupporterTier = async () => {
    if (!supabase || !currentUserId || !profile) return
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('user_id,username,avatar_path,supporter_tier,bio,agency,created_at')
      .eq('user_id', currentUserId)
      .maybeSingle()

    if (!profileRow) return
    const mapped = mapProfileRow(profileRow as Record<string, unknown>, currentUserId)
    setProfile(mapped)
  }

  const toggleDisplayMode = async () => {
    const nextMode: DisplayMode = profileDetails.displayMode === 'light' ? 'dark' : 'light'
    setProfileDetails((previous) => ({
      ...previous,
      displayMode: nextMode,
    }))

    if (!supabase || !currentUserId || !stateHydrated) return
    const algorithmSnapshot = buildAlgorithmSnapshot(sections, performance)
    const { data } = await supabase
      .from('app_state')
      .upsert(
        {
          user_id: currentUserId,
          performance,
          high_scores: highScores,
          best_streak: bestStreak,
          profile_details: {
            ...profileDetails,
            displayMode: nextMode,
            algorithmSnapshot,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
      .select('updated_at')
      .maybeSingle()
    const nextUpdatedAt = Date.parse(String(data?.updated_at || '')) || Date.now()
    lastAppStateUpdateRef.current = Math.max(lastAppStateUpdateRef.current, nextUpdatedAt)
  }

  const canCustomizeName = profile?.supporterTier === 'tier10'
  const canUseThemes = tierRank(profile?.supporterTier || 'free') >= tierRank('tier5')
  const selectedTheme = getThemePreset(canUseThemes ? profileDetails.themeId : appThemePresets[0].id)
  const isUiLightMode = profileDetails.displayMode === 'light'
  const activeProfileTier: SupporterTier = profile?.supporterTier || 'free'
  const activeProfileName = profile?.username || 'Officer'
  const pageTitle = isProfilePage
    ? 'Settings'
    : isStatsPage
    ? 'Stats'
    : isSupportPage
        ? 'Support Creator'
        : isStudyGuidePage
          ? 'Study Guide'
        : isStudyPracticeTestPage
          ? 'Practice Test'
        : isStudyFlashcardsPage
          ? 'Study Flashcards'
          : isStudyTestPage
            ? 'Study Test'
        : isLeaderboardsPage
          ? 'Leaderboards'
          : isChatPage
            ? 'Chat'
          : activeTab === 'study'
            ? 'Study'
            : activeTab === 'library'
              ? 'Library'
              : activeTab === 'games'
                ? 'Games'
                : activeTab === 'scenarios'
                  ? 'Scenarios'
                  : 'Home'
  const publicCurrentActivity = useMemo(() => {
    if (isGamesDuelPage) return { key: 'duel', label: 'In 1v1' }
    if (isGamesMatchingPage) return { key: 'matching', label: matchRunning && !matchDone ? 'Playing Matching' : 'In Matching Setup' }
    if (isGamesSpeedPage) return { key: 'speed', label: speedRunning && !speedDone && Boolean(speedCurrentQuestion) ? 'Playing Speed Test' : 'In Speed Test Setup' }
    if (isStudyPracticeTestPage) return { key: 'study_practice', label: 'On Practice Test' }
    if (isStudyGuidePage) return { key: 'study_guide', label: 'Reading Study Guide' }
    if (isStudyFlashcardsPage) return {
      key: 'flashcards',
      label: studyFlashSessionOpen && orderedStudyFlashSessionCards.length > 0 ? 'Studying Flashcards' : 'On Flashcards',
    }
    if (isStudyTestPage) return {
      key: 'study_test',
      label: studyTestSessionOpen && !studyTestSessionDone && Boolean(currentQuestion) ? 'Taking Study Test' : 'On Study Test',
    }
    if (isStudyHubPage) return { key: 'study_hub', label: 'In Study Hub' }
    if (isLeaderboardsPage) return { key: 'leaderboards', label: 'Viewing Leaderboards' }
    if (isChatPage) return { key: 'chat', label: 'In Chat' }
    if (isSupportPage) return { key: 'support', label: 'On Support' }
    if (isProfilePage) return { key: 'settings', label: 'In Settings' }
    if (isStatsPage) return { key: 'stats', label: 'Viewing Stats' }
    if (activeTab === 'scenarios') return { key: 'scenarios', label: 'Reviewing Scenarios' }
    if (activeTab === 'library') return { key: 'library', label: 'Browsing Library' }
    return { key: 'home', label: 'On Home' }
  }, [
    activeTab,
    currentQuestion,
    isChatPage,
    isGamesDuelPage,
    isGamesMatchingPage,
    isGamesSpeedPage,
    isLeaderboardsPage,
    isProfilePage,
    isStatsPage,
    isStudyFlashcardsPage,
    isStudyGuidePage,
    isStudyHubPage,
    isStudyPracticeTestPage,
    isStudyTestPage,
    isSupportPage,
    matchDone,
    matchRunning,
    orderedStudyFlashSessionCards.length,
    speedCurrentQuestion,
    speedDone,
    speedRunning,
    studyFlashSessionOpen,
    studyTestSessionDone,
    studyTestSessionOpen,
  ])
  useEffect(() => {
    if (!currentUserId || !stateHydrated) return

    const syncCurrentActivity = () => {
      if (document.visibilityState !== 'visible') return
      setProfileDetails((previous) => {
        const nextUpdatedAt = new Date().toISOString()
        const previousUpdatedAtMs = Date.parse(previous.currentActivity?.updatedAt || '')
        if (
          previous.currentActivity?.key === publicCurrentActivity.key &&
          previous.currentActivity?.label === publicCurrentActivity.label &&
          Number.isFinite(previousUpdatedAtMs) &&
          Date.now() - previousUpdatedAtMs < 12_000
        ) {
          return previous
        }
        return {
          ...previous,
          currentActivity: {
            key: publicCurrentActivity.key,
            label: publicCurrentActivity.label,
            updatedAt: nextUpdatedAt,
          },
        }
      })
    }

    syncCurrentActivity()
    const interval = window.setInterval(syncCurrentActivity, 15_000)
    return () => window.clearInterval(interval)
  }, [currentUserId, publicCurrentActivity.key, publicCurrentActivity.label, stateHydrated])
  const toggleHomeLeaderboardDraftCard = useCallback((card: HomeLeaderboardCardKey) => {
    setHomeLeaderboardSettingsDraft((current) => {
      const visibleCards = current.visibleCards.includes(card)
        ? current.visibleCards.filter((value) => value !== card)
        : [...current.visibleCards, card]
      return sanitizeHomeLeaderboardPreferences({ ...current, visibleCards })
    })
  }, [])
  const setHomeLeaderboardDraftMode = useCallback((target: 'duelWinsMode' | 'duelStreakMode', mode: DuelLeaderboardMode) => {
    setHomeLeaderboardSettingsDraft((current) =>
      sanitizeHomeLeaderboardPreferences({
        ...current,
        [target]: mode,
      }),
    )
  }, [])
  const selectAllHomeLeaderboardCards = useCallback(() => {
    setHomeLeaderboardSettingsDraft((current) =>
      sanitizeHomeLeaderboardPreferences({
        ...current,
        visibleCards: [...homeLeaderboardCardOrder],
      }),
    )
  }, [])
  const clearAllHomeLeaderboardCards = useCallback(() => {
    setHomeLeaderboardSettingsDraft((current) =>
      sanitizeHomeLeaderboardPreferences({
        ...current,
        visibleCards: [],
      }),
    )
  }, [])
  const resetHomeLeaderboardDraftDefaults = useCallback(() => {
    setHomeLeaderboardSettingsDraft({
      visibleCards: [...defaultHomeLeaderboardPreferences.visibleCards],
      duelWinsMode: defaultHomeLeaderboardPreferences.duelWinsMode,
      duelStreakMode: defaultHomeLeaderboardPreferences.duelStreakMode,
    })
  }, [])
  const closeHomeLeaderboardSettings = useCallback(() => {
    if (homeLeaderboardSettingsSaving) return
    setHomeLeaderboardSettingsOpen(false)
    setHomeLeaderboardSettingsError('')
  }, [homeLeaderboardSettingsSaving])
  const saveHomeLeaderboardSettings = useCallback(async () => {
    const nextPreferences = sanitizeHomeLeaderboardPreferences(homeLeaderboardSettingsDraft)
    const nextProfileDetails = {
      ...profileDetails,
      homeLeaderboardPreferences: nextPreferences,
    }

    if (!supabase || !currentUserId || !stateHydrated) {
      setProfileDetails(nextProfileDetails)
      setHomeLeaderboardSettingsOpen(false)
      setHomeLeaderboardSettingsError('')
      return
    }

    setHomeLeaderboardSettingsSaving(true)
    setHomeLeaderboardSettingsError('')
    try {
      const algorithmSnapshot = buildAlgorithmSnapshot(sections, performance)
      const { data, error } = await supabase
        .from('app_state')
        .upsert(
          {
            user_id: currentUserId,
            performance,
            high_scores: highScores,
            best_streak: bestStreak,
            profile_details: {
              ...nextProfileDetails,
              algorithmSnapshot,
            },
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        )
        .select('updated_at')
        .maybeSingle()
      if (error) {
        throw error
      }
      setProfileDetails(nextProfileDetails)
      const nextUpdatedAt = Date.parse(String(data?.updated_at || '')) || Date.now()
      lastAppStateUpdateRef.current = Math.max(lastAppStateUpdateRef.current, nextUpdatedAt)
      setHomeLeaderboardSettingsOpen(false)
    } catch (error) {
      setHomeLeaderboardSettingsError(error instanceof Error ? error.message : 'Could not save leaderboard settings.')
    } finally {
      setHomeLeaderboardSettingsSaving(false)
    }
  }, [
    bestStreak,
    currentUserId,
    highScores,
    homeLeaderboardSettingsDraft,
    performance,
    profileDetails,
    sections,
    stateHydrated,
  ])
  const navigateToTab = useCallback(
    (tab: AppTab) => {
      setMobileNavMenuOpen(false)
      const pathByTab: Record<AppTab, string> = {
        home: '/home',
        study: '/study',
        games: '/games',
        scenarios: '/scenarios',
        library: '/library',
        leaderboards: '/leaderboards',
        chat: '/chat',
      }
      goToPath(pathByTab[tab], { tab })
      if (tab === 'chat') {
        const requestScrollToLatest = () => {
          window.dispatchEvent(new Event('scrollGlobalChatToBottom'))
        }
        requestScrollToLatest()
        window.requestAnimationFrame(requestScrollToLatest)
        window.setTimeout(requestScrollToLatest, 120)
        window.setTimeout(requestScrollToLatest, 320)
      }
    },
    [goToPath],
  )
  const openStudyFlashcardsPage = useCallback(() => {
    goToPath('/study/flashcards', { tab: 'study' })
  }, [goToPath])

  const openStudyGuidePage = useCallback(() => {
    goToPath('/study/guide', { tab: 'study' })
  }, [goToPath])

  const openStudyPracticeTestPage = useCallback(() => {
    goToPath('/study/practice-test', { tab: 'study' })
  }, [goToPath])

  const openStudyTestPage = useCallback(() => {
    goToPath('/study/test', { tab: 'study' })
  }, [goToPath])
  const mobileQuickLinks = useMemo(
    () =>
      [
        {
          key: 'leaderboards',
          label: 'Leaderboards',
          icon: 'leaderboards' as AppIconName,
          active: isLeaderboardsPage,
          onClick: () => navigateToTab('leaderboards'),
        },
        {
          key: 'stats',
          label: 'Stats',
          icon: 'stats' as AppIconName,
          active: isStatsPage,
          onClick: () => {
            setMobileNavMenuOpen(false)
            goToPath('/stats')
          },
        },
        {
          key: 'chat',
          label: 'Chat',
          icon: 'chat' as AppIconName,
          active: isChatPage,
          onClick: () => navigateToTab('chat'),
        },
        {
          key: 'profile',
          label: 'Settings',
          icon: 'settings' as AppIconName,
          active: isProfilePage,
          onClick: () => {
            setMobileNavMenuOpen(false)
            goToPath('/profile')
          },
        },
        {
          key: 'support',
          label: 'Support',
          icon: 'support' as AppIconName,
          active: isSupportPage,
          onClick: () => {
            setMobileNavMenuOpen(false)
            goToPath('/support')
          },
        },
      ].concat(
        isStudyPage
          ? [
              {
                key: 'study-hub',
                label: 'Study Hub',
                icon: 'study' as AppIconName,
                active: isStudyHubPage,
                onClick: () => navigateToTab('study'),
              },
              {
                key: 'study-guide',
                label: 'Study Guide',
                icon: 'study' as AppIconName,
                active: isStudyGuidePage,
                onClick: () => {
                  setMobileNavMenuOpen(false)
                  openStudyGuidePage()
                },
              },
              {
                key: 'study-practice-test',
                label: 'Practice Test',
                icon: 'test' as AppIconName,
                active: isStudyPracticeTestPage,
                onClick: () => {
                  setMobileNavMenuOpen(false)
                  openStudyPracticeTestPage()
                },
              },
              {
                key: 'study-flashcards',
                label: 'Flashcards',
                icon: 'flashcards' as AppIconName,
                active: isStudyFlashcardsPage,
                onClick: () => {
                  setMobileNavMenuOpen(false)
                  openStudyFlashcardsPage()
                },
              },
              {
                key: 'study-test',
                label: 'Test',
                icon: 'test' as AppIconName,
                active: isStudyTestPage,
                onClick: () => {
                  setMobileNavMenuOpen(false)
                  openStudyTestPage()
                },
              },
            ]
          : [],
      )
      .concat(
        isGamesPage
          ? [
              {
                key: 'games-hub',
                label: 'Games Hub',
                icon: 'games' as AppIconName,
                active: isGamesHubPage,
                onClick: () => navigateToTab('games'),
              },
              {
                key: 'games-speed',
                label: 'Speed Test',
                icon: 'speed' as AppIconName,
                active: isGamesSpeedPage,
                onClick: () => {
                  setMobileNavMenuOpen(false)
                  goToPath('/games/speed', { tab: 'games' })
                },
              },
              {
                key: 'games-matching',
                label: 'Matching',
                icon: 'games' as AppIconName,
                active: isGamesMatchingPage,
                onClick: () => {
                  setMobileNavMenuOpen(false)
                  goToPath('/games/matching', { tab: 'games' })
                },
              },
              {
                key: 'games-duel',
                label: '1v1',
                icon: 'duel' as AppIconName,
                active: isGamesDuelPage,
                onClick: () => {
                  setMobileNavMenuOpen(false)
                  goToPath('/games/duel', { tab: 'games' })
                },
              },
            ]
          : [],
      ),
    [
      goToPath,
      isChatPage,
      isGamesDuelPage,
      isGamesHubPage,
      isGamesMatchingPage,
      isGamesPage,
      isGamesSpeedPage,
      isLeaderboardsPage,
      isProfilePage,
      isStatsPage,
      isStudyFlashcardsPage,
      isStudyGuidePage,
      isStudyPracticeTestPage,
      isStudyHubPage,
      isStudyPage,
      isStudyTestPage,
      isSupportPage,
      navigateToTab,
      openStudyFlashcardsPage,
      openStudyGuidePage,
      openStudyPracticeTestPage,
      openStudyTestPage,
    ],
  )
  const selectedLeaderboardTheme = selectedLeaderboardEntry
    ? getThemePreset(selectedLeaderboardEntry.themeId)
    : appThemePresets[0]
  const selectedLeaderboardThemeStyle = {
    ['--leader-panel' as string]: selectedLeaderboardTheme.vars.panelStrong,
    ['--leader-border' as string]: selectedLeaderboardTheme.vars.border,
    ['--leader-text' as string]: selectedLeaderboardTheme.vars.text,
    ['--leader-muted' as string]: selectedLeaderboardTheme.vars.muted,
    ['--leader-accent' as string]: selectedLeaderboardTheme.vars.accent,
    ['--leader-body-radial' as string]: selectedLeaderboardTheme.vars.bodyRadial,
    ['--leader-body-base' as string]: selectedLeaderboardTheme.vars.bodyBase,
  } as CSSProperties
  const selectedLeaderboardThemeCardClass =
    selectedLeaderboardTheme.id === 'golden'
      ? 'profile-modal-theme-dynamic profile-modal-theme-dynamic-gold'
      : 'profile-modal-theme-dynamic'
  const leaderboardProfileNameStyle: CSSProperties | undefined = selectedLeaderboardEntry
    ? displayNameStyle(selectedLeaderboardEntry.nameStyle, selectedLeaderboardEntry.supporterTier) ?? {
      color: selectedLeaderboardTheme.vars.text,
      WebkitTextFillColor: selectedLeaderboardTheme.vars.text,
      textShadow: 'none',
    }
    : undefined
  const selectedLeaderboardAllTimeFirstSpots = selectedLeaderboardEntry
    ? allTimeFirstSpotCountsByUser[selectedLeaderboardEntry.userId] || 0
    : 0
  const selectedLeaderboardWeeklyFirstSpots = selectedLeaderboardEntry
    ? weeklyFirstSpotCountsByUser[selectedLeaderboardEntry.userId] || 0
    : 0
  const selectedLeaderboardCurrentActivity = selectedLeaderboardEntry
    ? describeProfileCurrentActivity(
      selectedLeaderboardEntry.currentActivity,
      clockNowMs,
      onlinePresenceByUserId[selectedLeaderboardEntry.userId],
    )
    : {
      state: 'offline',
      statusLabel: 'Offline',
      mainLabel: 'Offline',
      subLabel: 'No recent activity',
    }
  const leaderAvatarFrameClass = (userId?: string, extraClassName?: string) => {
    const classes = ['leader-avatar-frame']
    if (extraClassName) classes.push(extraClassName)
    if (userId) {
      const presence = onlinePresenceByUserId[userId]
      if (presence === 'active') classes.push('leader-avatar-frame-online')
      if (presence === 'away') classes.push('leader-avatar-frame-away')
    }
    return classes.join(' ')
  }
  const avatarFor = (rawValue?: string) => {
    const value = String(rawValue || '').trim()
    return value.length > 0 ? value : defaultAvatarUrl
  }
  const handleAvatarImageError = (event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget
    const stage = image.dataset.fallbackApplied || '0'
    if (stage === '0') {
      image.dataset.fallbackApplied = '1'
      image.src = defaultAvatarUrl
      return
    }
    if (stage === '1') {
      image.dataset.fallbackApplied = '2'
      image.src = defaultAvatarPngUrl
    }
  }
  useEffect(() => {
    const root = document.documentElement
    const vars = isUiLightMode
      ? {
        ...lightModeVars,
        bg: `color-mix(in srgb, ${selectedTheme.vars.bodyBase} 10%, #f6f9ff)`,
        panel: `color-mix(in srgb, ${selectedTheme.vars.panelStrong} 14%, #ffffff)`,
        panelStrong: `color-mix(in srgb, ${selectedTheme.vars.panelStrong} 20%, #f2f6ff)`,
        sidebar: `color-mix(in srgb, ${selectedTheme.vars.bodyBase} 12%, #f9fbff)`,
        border: `color-mix(in srgb, ${selectedTheme.vars.accent} 30%, #d5deef)`,
        text: '#18233d',
        muted: `color-mix(in srgb, ${selectedTheme.vars.accent} 24%, #5f7193)`,
        textMuted: `color-mix(in srgb, ${selectedTheme.vars.accent} 18%, #7f91b3)`,
        accent: selectedTheme.vars.accent,
        good: selectedTheme.vars.good,
        bad: selectedTheme.vars.bad,
        gold: selectedTheme.vars.accent,
        bodyRadial: `color-mix(in srgb, ${selectedTheme.vars.bodyRadial} 16%, #eaf1fc)`,
        bodyBase: `color-mix(in srgb, ${selectedTheme.vars.bodyBase} 10%, #f6f9ff)`,
      }
      : {
        ...darkModeVars,
        ...selectedTheme.vars,
        sidebar: selectedTheme.vars.panelStrong,
        textMuted: selectedTheme.vars.muted,
        gold: selectedTheme.vars.accent,
      }
    root.style.setProperty('--bg-main', vars.bg)
    root.style.setProperty('--bg-panel', vars.panelStrong)
    root.style.setProperty('--bg-sidebar', vars.sidebar)
    root.style.setProperty('--card-bg', vars.panel)
    root.style.setProperty('--card-border', vars.border)
    root.style.setProperty('--text-primary', vars.text)
    root.style.setProperty('--text-secondary', vars.muted)
    root.style.setProperty('--text-muted', vars.textMuted)
    root.style.setProperty('--success', vars.good)
    root.style.setProperty('--danger', vars.bad)
    root.style.setProperty('--gold', vars.gold)
    root.style.setProperty('--bg', vars.bg)
    root.style.setProperty('--panel', vars.panel)
    root.style.setProperty('--panel-strong', vars.panelStrong)
    root.style.setProperty('--border', vars.border)
    root.style.setProperty('--text', vars.text)
    root.style.setProperty('--muted', vars.muted)
    root.style.setProperty('--accent', vars.accent)
    root.style.setProperty('--good', vars.good)
    root.style.setProperty('--bad', vars.bad)
    root.style.setProperty('--body-radial', vars.bodyRadial)
    root.style.setProperty('--body-base', vars.bodyBase)
  }, [isUiLightMode, selectedTheme])

  useEffect(() => {
    if (!isOwner) return
    setLeaderboardRotateMs(sanitizeLeaderboardRotationMs(profileDetails.homeLeaderboardRotationMs))
  }, [isOwner, profileDetails.homeLeaderboardRotationMs])
  const loadOwnerEditorItems = useCallback(async () => {
    if (!currentUserId || !isOwner) return
    setEditorLoading(true)
    setEditorError('')
    setEditorSuccess('')

    if (!supabase) {
      setEditorItems(localBundleToEditorItems())
      setEditorError('Supabase not configured. Showing local content only.')
      setEditorLoading(false)
      return
    }

    const { data, error } = await supabase.from('content_items').select('*').order('updated_at', { ascending: false }).limit(1000)
    if (error) {
      setEditorItems(localBundleToEditorItems())
      setEditorError(`${error.message || 'Could not load content items.'} Showing local fallback content.`)
      setEditorLoading(false)
      return
    }

    const mapped = (data || [])
      .map((row) => rowToEditorItem(row as Record<string, unknown>))
      .filter((item): item is ContentEditorItem => Boolean(item))

    if (mapped.length === 0) {
      setEditorItems(localBundleToEditorItems())
      setEditorSuccess('No Supabase content yet. Showing local content so you can edit/import.')
      setEditorLoading(false)
      return
    }

    setEditorItems(mapped)
    setEditorLoading(false)
  }, [currentUserId, isOwner])
  useEffect(() => {
    if (!supabase || !currentUserId || !isOwner) {
      setEditorItems([])
      return
    }
    void loadOwnerEditorItems()
  }, [currentUserId, isOwner, loadOwnerEditorItems])
  const selectEditorItem = (item: ContentEditorItem) => {
    setEditorSelectedId(item.id)
    setEditorDraft({ ...item })
    const normalizedOptions = item.scenarioQuestions.slice(0, 4)
    while (normalizedOptions.length < 4) normalizedOptions.push('')
    const isTrueFalse =
      normalizedOptions.filter(Boolean).length === 2 &&
      normalizedOptions.map((option) => option.trim().toLowerCase()).includes('true') &&
      normalizedOptions.map((option) => option.trim().toLowerCase()).includes('false')
    setScenarioAnswerMode(isTrueFalse ? 'truefalse' : 'choices')
    setScenarioOptionInputs(normalizedOptions)
    setScenarioCorrectChoice(item.answer || '')
    setEditorError('')
    setEditorSuccess('')
  }
  const startNewEditorItem = (category?: string) => {
    const next = createEmptyEditorItem()
    next.category = category && category !== 'all' ? category : 'pc'
    setEditorSelectedId('')
    setEditorDraft(next)
    setScenarioAnswerMode('choices')
    setScenarioOptionInputs(['', '', '', ''])
    setScenarioCorrectChoice('')
    setEditorError('')
    setEditorSuccess('')
  }
  const saveEditorItem = async () => {
    if (!supabase || !currentUserId || !isOwner) return
    setEditorLoading(true)
    setEditorError('')
    setEditorSuccess('')

    const id = editorDraft.id.trim() || crypto.randomUUID()
    const category = editorDraft.category.trim().toLowerCase()
    const type = editorDraft.type === 'scenario' ? 'scenario' : 'code'
    const normalizedCodeSection = editorDraft.codeSection.trim()
    const normalizedName = editorDraft.title.trim()
    const normalizedDefinition = editorDraft.explanation.trim()
    const scenarioPrompt = editorDraft.scenario.trim()

    if (!category) {
      setEditorError('Category is required.')
      setEditorLoading(false)
      return
    }

    const choiceOptions =
      scenarioAnswerMode === 'truefalse'
        ? ['True', 'False']
        : scenarioOptionInputs
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 4)

    const normalizedCorrectChoice = scenarioCorrectChoice.trim()
    const normalizedCodeSectionKey = normalizedCodeSection.toLowerCase()
    const normalizedScenarioKey = scenarioPrompt.toLowerCase()

    if (type === 'scenario') {
      if (!scenarioPrompt) {
        setEditorError('Scenario text is required for scenario type.')
        setEditorLoading(false)
        return
      }
      if (choiceOptions.length < 2) {
        setEditorError('Add at least two answer choices for scenario.')
        setEditorLoading(false)
        return
      }
      if (!normalizedCorrectChoice || !choiceOptions.includes(normalizedCorrectChoice)) {
        setEditorError('Pick the correct scenario answer from your choices.')
        setEditorLoading(false)
        return
      }
    } else {
      if (!normalizedCodeSection) {
        setEditorError('Code section is required.')
        setEditorLoading(false)
        return
      }
      if (!normalizedName) {
        setEditorError('Name is required.')
        setEditorLoading(false)
        return
      }
      if (!normalizedDefinition) {
        setEditorError('Definition is required.')
        setEditorLoading(false)
        return
      }
    }

    const localDuplicate = editorItems.find((item) => {
      if (item.id === id) return false
      if (type === 'scenario') {
        return item.type === 'scenario' && item.category === category && item.scenario.trim().toLowerCase() === normalizedScenarioKey
      }
      return item.type !== 'scenario' && item.category === category && item.codeSection.trim().toLowerCase() === normalizedCodeSectionKey
    })
    if (localDuplicate) {
      setEditorError(
        type === 'scenario'
          ? 'Duplicate scenario detected in this category. Please change the scenario text.'
          : `Duplicate code section detected: ${normalizedCodeSection}.`,
      )
      setEditorLoading(false)
      return
    }

    if (supabase) {
      if (type === 'scenario') {
        const { data: duplicateRows, error: duplicateError } = await supabase
          .from('content_items')
          .select('id')
          .eq('type', 'scenario')
          .eq('category', category)
          .eq('scenario', scenarioPrompt)
          .neq('id', id)
          .limit(1)
        if (duplicateError) {
          setEditorError(duplicateError.message || 'Could not verify duplicate scenario.')
          setEditorLoading(false)
          return
        }
        if ((duplicateRows || []).length > 0) {
          setEditorError('Duplicate scenario already exists in Supabase for this category.')
          setEditorLoading(false)
          return
        }
      } else {
        const { data: duplicateRows, error: duplicateError } = await supabase
          .from('content_items')
          .select('id')
          .neq('type', 'scenario')
          .eq('category', category)
          .eq('code_section', normalizedCodeSection)
          .neq('id', id)
          .limit(1)
        if (duplicateError) {
          setEditorError(duplicateError.message || 'Could not verify duplicate code section.')
          setEditorLoading(false)
          return
        }
        if ((duplicateRows || []).length > 0) {
          setEditorError(`Duplicate code section already exists in Supabase: ${normalizedCodeSection}.`)
          setEditorLoading(false)
          return
        }
      }
    }

    const title = type === 'scenario' ? editorDraft.title.trim() || 'Scenario' : normalizedName
    const question = type === 'scenario' ? `${scenarioPrompt}\n\nChoose the best answer.` : `Which section number matches: ${title}?`
    const answer = type === 'scenario' ? normalizedCorrectChoice : normalizedCodeSection
    const explanation = type === 'scenario' ? editorDraft.explanation.trim() || undefined : normalizedDefinition

    const payload = {
      id,
      category,
      type,
      title,
      question,
      answer,
      tags: [],
      difficulty: editorDraft.difficulty.trim() || null,
      code_section: type === 'scenario' ? null : normalizedCodeSection,
      explanation: explanation || null,
      source_url: editorDraft.sourceUrl.trim() || null,
      scenario: type === 'scenario' ? scenarioPrompt : null,
      scenario_questions: type === 'scenario' ? choiceOptions : [],
      scenario_sub_questions: [],
      tmas_set: 'tmas1',
      key_points: [],
      is_published: editorDraft.isPublished,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase.from('content_items').upsert(payload, { onConflict: 'id' })
    if (error) {
      const message = error.message || 'Could not save content item.'
      const hint = message.toLowerCase().includes('content_items')
        ? ' Run /supabase/migrations/20260215_owner_roles_and_content_items.sql first.'
        : ''
      setEditorError(`${message}${hint}`)
      setEditorLoading(false)
      return
    }

    setEditorSuccess('Content item saved.')
    // Reload page so Library tab shows new content
    setTimeout(() => window.location.reload(), 1000)

    const updatedItem: ContentEditorItem = {
      ...editorDraft,
      id,
      category,
      type,
      title,
      question,
      answer,
      tags: [],
      difficulty: editorDraft.difficulty.trim(),
      codeSection: type === 'scenario' ? '' : normalizedCodeSection,
      explanation: explanation || '',
      sourceUrl: editorDraft.sourceUrl.trim(),
      scenario: type === 'scenario' ? scenarioPrompt : '',
      scenarioQuestions: type === 'scenario' ? choiceOptions : [],
      keyPoints: [],
      isPublished: editorDraft.isPublished,
    }
    setEditorDraft(updatedItem)
    setEditorSelectedId(id)
    await loadOwnerEditorItems()

    if (appContentSource === 'supabase') {
      const mergedItems = editorItems
        .map((item) => (item.id === id ? updatedItem : item))
        .concat(editorItems.some((item) => item.id === id) ? [] : [updatedItem])
      const nextCodeItems = mergedItems
        .filter((item) => item.isPublished && item.type !== 'scenario')
        .map(
          (item) =>
            ({
              id: item.id,
              category: item.category,
              title: item.title,
              question: item.question,
              answer: item.answer || undefined,
              tags: item.tags,
              difficulty: item.difficulty || undefined,
              codeSection: item.codeSection || undefined,
              explanation: item.explanation || undefined,
              sourceUrl: item.sourceUrl || undefined,
            }) satisfies ContentBankItem,
        )
      const nextScenarios = mergedItems
        .filter((item) => item.isPublished && item.type === 'scenario')
        .map(
          (item) =>
            ({
              id: item.id,
              category: item.category,
              title: item.title,
              scenario: item.scenario,
              questions: item.scenarioQuestions,
              expectedAnswer: item.answer || undefined,
              keyPoints: item.keyPoints,
              tags: item.tags,
              difficulty: item.difficulty || undefined,
              codeSection: item.codeSection || undefined,
              explanation: item.explanation || undefined,
              sourceUrl: item.sourceUrl || undefined,
            }) satisfies ScenarioBankItem,
        )
      applyLoadedContentToRuntime(nextCodeItems, nextScenarios)
    }
    setEditorLoading(false)
  }
  const deleteEditorItem = async (id: string) => {
    if (!supabase || !currentUserId || !isOwner) return
    const confirmed = window.confirm('Delete this content item? This cannot be undone.')
    if (!confirmed) return
    setEditorLoading(true)
    setEditorError('')
    setEditorSuccess('')
    const { error } = await supabase.from('content_items').delete().eq('id', id)
    if (error) {
      const message = error.message || 'Could not delete content item.'
      const hint = message.toLowerCase().includes('content_items')
        ? ' Run /supabase/migrations/20260215_owner_roles_and_content_items.sql first.'
        : ''
      setEditorError(`${message}${hint}`)
      setEditorLoading(false)
      return
    }
    const remaining = editorItems.filter((item) => item.id !== id)
    setEditorItems(remaining)
    if (editorSelectedId === id) startNewEditorItem(editorCategoryFilter)
    setEditorSuccess('Content item deleted.')
    // Reload page so Library tab updates
    setTimeout(() => window.location.reload(), 1000)

    if (appContentSource === 'supabase') {
      const nextCodeItems = remaining
        .filter((item) => item.isPublished && item.type !== 'scenario')
        .map(
          (item) =>
            ({
              id: item.id,
              category: item.category,
              title: item.title,
              question: item.question,
              answer: item.answer || undefined,
              tags: item.tags,
              difficulty: item.difficulty || undefined,
              codeSection: item.codeSection || undefined,
              explanation: item.explanation || undefined,
              sourceUrl: item.sourceUrl || undefined,
            }) satisfies ContentBankItem,
        )
      const nextScenarios = remaining
        .filter((item) => item.isPublished && item.type === 'scenario')
        .map(
          (item) =>
            ({
              id: item.id,
              category: item.category,
              title: item.title,
              scenario: item.scenario,
              questions: item.scenarioQuestions,
              expectedAnswer: item.answer || undefined,
              keyPoints: item.keyPoints,
              tags: item.tags,
              difficulty: item.difficulty || undefined,
              codeSection: item.codeSection || undefined,
              explanation: item.explanation || undefined,
              sourceUrl: item.sourceUrl || undefined,
            }) satisfies ScenarioBankItem,
        )
      applyLoadedContentToRuntime(nextCodeItems, nextScenarios)
    }
    setEditorLoading(false)
  }
  const editorCategoryOptions = useMemo(
    () =>
      Array.from(
        new Set(
          ['pc', 'hs', 'vc', 'scenario', ...editorItems.map((item) => item.category.trim().toLowerCase()).filter(Boolean)],
        ),
      ).sort(),
    [editorItems],
  )
  const filteredEditorItems = useMemo(() => {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
    return editorItems
      .filter((item) => {
        const categoryMatch = editorCategoryFilter === 'all' || item.category === editorCategoryFilter
        const typeMatch = editorTypeFilter === 'all' || item.type === editorTypeFilter
        return categoryMatch && typeMatch
      })
      .sort((left, right) => {
        const categoryOrder = collator.compare(left.category, right.category)
        if (categoryOrder !== 0) return categoryOrder
        const typeOrder = collator.compare(left.type, right.type)
        if (typeOrder !== 0) return typeOrder
        const leftLabel = left.type === 'scenario' ? left.title : left.codeSection || left.title
        const rightLabel = right.type === 'scenario' ? right.title : right.codeSection || right.title
        const labelOrder = collator.compare(leftLabel, rightLabel)
        if (labelOrder !== 0) return labelOrder
        return collator.compare(left.id, right.id)
      })
  }, [editorItems, editorCategoryFilter, editorTypeFilter])
  const openAvatarCropper = (file: File | null) => {
    if (!file) return
    const sourceUrl = URL.createObjectURL(file)
    if (avatarCropSourceUrl) URL.revokeObjectURL(avatarCropSourceUrl)
    setAvatarCropSourceUrl(sourceUrl)
    setAvatarCropSourceName(file.name)
    setAvatarCropZoom(1)
    setAvatarCropX(0)
    setAvatarCropY(0)
    setAvatarCropOpen(true)
  }
  const cancelAvatarCrop = () => {
    if (avatarCropSourceUrl) URL.revokeObjectURL(avatarCropSourceUrl)
    setAvatarCropSourceUrl('')
    setAvatarCropSourceName('')
    setAvatarCropOpen(false)
  }
  const applyAvatarCrop = async () => {
    if (!avatarCropSourceUrl) return
    try {
      const cropped = await createCroppedAvatarFile(avatarCropSourceUrl, avatarCropZoom, avatarCropX, avatarCropY, avatarCropSourceName)
      if (profileAvatarPreviewUrl) URL.revokeObjectURL(profileAvatarPreviewUrl)
      const previewUrl = URL.createObjectURL(cropped)
      setProfileAvatar(cropped)
      setProfileAvatarPreviewUrl(previewUrl)
      cancelAvatarCrop()
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Could not crop image.')
    }
  }
  const openHomeProfile = (entry: HomeLeaderboardEntry, metric: string, isTop: boolean) => {
    setSelectedLeaderboardEntry({
      id: `home-${metric}-${entry.userId}`,
      userId: entry.userId,
      game: metric,
      playerName: entry.playerName,
      avatarUrl: entry.avatarUrl,
      supporterTier: entry.supporterTier,
      themeId: entry.themeId,
      bio: entry.bio,
      agency: entry.agency,
      nameStyle: entry.nameStyle,
      isOwner: entry.isOwner,
      matchDuration: null,
      matchFilter: null,
      score: entry.value,
      round: 0,
      createdAt: clockNowMs,
      masteredCodes: entry.masteredCodes,
      studySeconds: entry.studySeconds,
      studyDayStreak: entry.studyDayStreak,
      mostStudiedMode: entry.mostStudiedMode,
      duelWins: entry.duelWins,
      duelLosses: entry.duelLosses,
      duelCurrentWinStreak: entry.duelCurrentWinStreak,
      currentActivity: entry.currentActivity,
    })
    setSelectedLeaderboardIsTop(isTop)
  }

  useEffect(() => {
    if (!currentUserId) return
    if (!activeStudyActivitySource) return
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      const lastActivityAt = studyActivityBySourceRef.current[activeStudyActivitySource] || 0
      if (Date.now() - lastActivityAt > studyActivityWindowMs) return
      incrementUserStats((stats) => ({ ...stats, studySeconds: stats.studySeconds + studyTrackingTickMs / 1000 }), true)
    }, studyTrackingTickMs)
    return () => window.clearInterval(interval)
  }, [incrementUserStats, currentUserId, activeStudyActivitySource])
  const saveCurrentNamePreset = () => {
    const name = newPresetName.trim()
    if (!name) return
    setProfileDetails((previous) => ({
      ...previous,
      namePresets: [{ id: crypto.randomUUID(), name: name.slice(0, 24), style: { ...previous.nameStyle } }, ...previous.namePresets].slice(0, 8),
    }))
    setNewPresetName('')
  }

  const applyNamePreset = (preset: NameStylePreset) => {
    setProfileDetails((previous) => ({ ...previous, nameStyle: { ...preset.style } }))
  }

  const deleteNamePreset = (presetId: string) => {
    setProfileDetails((previous) => ({ ...previous, namePresets: previous.namePresets.filter((preset) => preset.id !== presetId) }))
  }

  const masteredSections = useMemo(
    () =>
      sections.filter((section) => {
        const item = performance[performanceKey(section.codeSet, section.sectionNumber)]
        return mastery(item) === 'Mastered'
      }),
    [sections, performance],
  )
  const masteredWordsCount = useMemo(
    () =>
      masteredSections.reduce((total, section) => {
        const words = section.title.trim().split(/\s+/).filter(Boolean).length
        return total + words
      }, 0),
    [masteredSections],
  )
  const penalMasteredCount = useMemo(
    () => masteredSections.filter((section) => section.codeSet === 'penal').length,
    [masteredSections],
  )
  const mostPlayedGame = useMemo(() => {
    const entries = Object.entries(profileDetails.stats.gamePlays) as Array<[keyof UserStats['gamePlays'], number]>
    return entries.sort((left, right) => right[1] - left[1])[0]
  }, [profileDetails.stats.gamePlays])
  const mostStudiedMode = useMemo(() => {
    const entries = Object.entries(profileDetails.stats.studyModeCounts) as Array<[CodeFilter, number]>
    return entries.sort((left, right) => right[1] - left[1])[0]
  }, [profileDetails.stats.studyModeCounts])
  const studyNeedsSummary = useMemo(() => {
    const map: Record<CodeSet, { attempts: number; weightedNeed: number; correct: number; incorrect: number }> = {
      penal: { attempts: 0, weightedNeed: 0, correct: 0, incorrect: 0 },
      hs: { attempts: 0, weightedNeed: 0, correct: 0, incorrect: 0 },
      vehicle: { attempts: 0, weightedNeed: 0, correct: 0, incorrect: 0 },
    }

    for (const section of sections) {
      const stats = performance[performanceKey(section.codeSet, section.sectionNumber)]
      const correct = stats?.correctCount ?? 0
      const incorrect = stats?.incorrectCount ?? 0
      const attempts = correct + incorrect
      if (attempts === 0) continue
      map[section.codeSet].attempts += attempts
      map[section.codeSet].correct += correct
      map[section.codeSet].incorrect += incorrect
      map[section.codeSet].weightedNeed += performanceNeedWorkWeight(stats)
    }

    return (['penal', 'hs', 'vehicle'] as CodeSet[]).map((codeSet) => {
      const attempts = map[codeSet].attempts
      const needScore = attempts > 0 ? map[codeSet].weightedNeed / attempts : 0
      const accuracyPercent = attempts > 0 ? Math.round((map[codeSet].correct / attempts) * 100) : 0
      return { codeSet, attempts, needScore, accuracyPercent }
    }).sort((left, right) => left.accuracyPercent - right.accuracyPercent)
  }, [sections, performance])
  const studyFlashSelectionCount = useMemo(
    () => sections.filter((section) => studyFlashFilter === 'all' || section.codeSet === studyFlashFilter).length,
    [sections, studyFlashFilter],
  )
  const studyTestSelectionCount = useMemo(
    () => questions.filter((question) => studyTestFilter === 'all' || question.codeSet === studyTestFilter).length,
    [questions, studyTestFilter],
  )
  const flashcardSetupInsights = useMemo(() => {
    const availableSections = sections.filter((section) => studyFlashFilter === 'all' || section.codeSet === studyFlashFilter)
    const analyzed = availableSections.map((section) => {
      const stats = performance[performanceKey(section.codeSet, section.sectionNumber)]
      const correct = stats?.correctCount ?? 0
      const incorrect = stats?.incorrectCount ?? 0
      const attempts = correct + incorrect
      const accuracyPercent = attempts > 0 ? Math.round((correct / attempts) * 100) : null
      const needScore = performanceNeedWorkWeight(stats)
      return { section, attempts, accuracyPercent, needScore }
    })
    const tracked = analyzed.filter((item) => item.attempts > 0)
    const totalAttempts = tracked.reduce((sum, item) => sum + item.attempts, 0)
    const totalCorrect = tracked.reduce((sum, item) => {
      if (item.accuracyPercent === null) return sum
      return sum + Math.round((item.accuracyPercent / 100) * item.attempts)
    }, 0)
    const averageAccuracyPercent = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : null
    const topFocus = [...tracked]
      .sort((left, right) =>
        (left.accuracyPercent ?? 100) - (right.accuracyPercent ?? 100) ||
        right.needScore - left.needScore ||
        right.attempts - left.attempts,
      )
      .slice(0, 8)
    const recommendation =
      topFocus.length > 0
        ? `Start with ${topFocus[0].section.sectionNumber} first (${topFocus[0].accuracyPercent ?? 0}% accuracy).`
        : 'Start a few rounds to generate personalized flashcard priorities.'
    return {
      totalCards: availableSections.length,
      trackedCards: tracked.length,
      totalAttempts,
      averageAccuracyPercent,
      topFocus,
      recommendation,
    }
  }, [sections, performance, studyFlashFilter])
  const algorithmInsights = useMemo(() => {
    const analyzed = sections.map((section) => {
      const stats = performance[performanceKey(section.codeSet, section.sectionNumber)]
      const correct = stats?.correctCount ?? 0
      const incorrect = stats?.incorrectCount ?? 0
      const attempts = correct + incorrect
      const accuracy = attempts > 0 ? correct / attempts : 0
      const weight = performanceNeedWorkWeight(stats)
      const masteredState = mastery(stats)
      return { section, correct, incorrect, attempts, accuracy, weight, masteredState, streak: stats?.correctStreak ?? 0 }
    })

    const attempted = analyzed.filter((item) => item.attempts > 0)
    const totalAttempts = attempted.reduce((sum, item) => sum + item.attempts, 0)
    const averageAccuracy =
      attempted.length === 0
        ? 0
        : attempted.reduce((sum, item) => sum + item.accuracy, 0) / attempted.length
    const needsMoreWork = attempted.filter((item) => item.masteredState !== 'Mastered' && item.weight >= 2.0)
    const stabilized = attempted.filter((item) => item.streak >= 5 || item.accuracy >= 0.8)
    const mastered = analyzed.filter((item) => item.masteredState === 'Mastered')
    const focusLoadPercent =
      totalAttempts === 0
        ? 0
        : (needsMoreWork.reduce((sum, item) => sum + item.attempts, 0) / totalAttempts) * 100
    const topFocusCodes = needsMoreWork
      .sort((left, right) => right.weight - left.weight || left.accuracy - right.accuracy)
      .slice(0, 5)
      .map((item) => item.section.sectionNumber)

    return {
      trackedCodes: attempted.length,
      averageAccuracy,
      needsMoreWorkCount: needsMoreWork.length,
      stabilizedCount: stabilized.length,
      masteredCount: mastered.length,
      focusLoadPercent,
      topFocusCodes,
    }
  }, [sections, performance])

  const gameCodeSetBreakdown = useMemo(() => {
    const bySet: Record<CodeSet, { attempts: number; accuracyPercent: number }> = {
      penal: { attempts: 0, accuracyPercent: 0 },
      hs: { attempts: 0, accuracyPercent: 0 },
      vehicle: { attempts: 0, accuracyPercent: 0 },
    }
    for (const item of studyNeedsSummary) {
      bySet[item.codeSet] = { attempts: item.attempts, accuracyPercent: item.accuracyPercent }
    }
    return (['penal', 'hs', 'vehicle'] as CodeSet[]).map((codeSet) => ({
      codeSet,
      attempts: bySet[codeSet].attempts,
      accuracyPercent: bySet[codeSet].accuracyPercent,
    }))
  }, [studyNeedsSummary])
  const effectiveScoreTimeline = useMemo<ScoreTimelinePoint[]>(() => {
    if (remoteScoreTimeline.length > 0) {
      return remoteScoreTimeline
    }
    const mapped = profileDetails.stats.sessionTimeline
      .filter((point) => Number.isFinite(point.at))
      .map((point) => ({
        at: point.at,
        score: Math.max(0, Math.round(typeof point.score === 'number' ? point.score : point.accuracy)),
      }))
    return compressTimelinePoints(mapped, remoteTimelineMaxPoints)
  }, [profileDetails.stats.sessionTimeline, remoteScoreTimeline])
  const statsAnalytics = useMemo(() => {
    const analyzed = sections.map((section) => {
      const stats = performance[performanceKey(section.codeSet, section.sectionNumber)]
      const correct = stats?.correctCount ?? 0
      const incorrect = stats?.incorrectCount ?? 0
      const attempts = correct + incorrect
      const accuracyPercent = attempts > 0 ? Math.round((correct / attempts) * 100) : 0
      const status = mastery(stats)
      return {
        section,
        stats,
        correct,
        incorrect,
        attempts,
        accuracyPercent,
        status,
        needScore: performanceNeedWorkWeight(stats),
      }
    })

    const attempted = analyzed.filter((item) => item.attempts > 0)
    const totalCorrect = attempted.reduce((sum, item) => sum + item.correct, 0)
    const totalIncorrect = attempted.reduce((sum, item) => sum + item.incorrect, 0)
    const totalAttempts = totalCorrect + totalIncorrect
    const overallAccuracyPercent = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0

    const masteryCounts: Record<Exclude<MasteryStatus, ''>, number> = {
      'Needs Work': 0,
      'Getting There': 0,
      'On Track': 0,
      'Almost Mastered': 0,
      'Mastered': 0,
    }

    for (const item of attempted) {
      if (!item.status) continue
      masteryCounts[item.status] += 1
    }

    const codeSetMap: Record<CodeSet, { attempts: number; trackedCodes: number; correct: number; mastered: number; needsWork: number }> = {
      penal: { attempts: 0, trackedCodes: 0, correct: 0, mastered: 0, needsWork: 0 },
      hs: { attempts: 0, trackedCodes: 0, correct: 0, mastered: 0, needsWork: 0 },
      vehicle: { attempts: 0, trackedCodes: 0, correct: 0, mastered: 0, needsWork: 0 },
    }

    for (const item of attempted) {
      const bucket = codeSetMap[item.section.codeSet]
      bucket.attempts += item.attempts
      bucket.trackedCodes += 1
      bucket.correct += item.correct
      if (item.status === 'Mastered') bucket.mastered += 1
      if (item.status === 'Needs Work') bucket.needsWork += 1
    }

    const codeSetBreakdown = (['penal', 'hs', 'vehicle'] as CodeSet[]).map((codeSet) => {
      const bucket = codeSetMap[codeSet]
      const accuracyPercent = bucket.attempts > 0 ? Math.round((bucket.correct / bucket.attempts) * 100) : 0
      return {
        codeSet,
        attempts: bucket.attempts,
        trackedCodes: bucket.trackedCodes,
        accuracyPercent,
        mastered: bucket.mastered,
        needsWork: bucket.needsWork,
      }
    })

    const needsWorkCodes = [...attempted]
      .filter((item) => item.status !== 'Mastered')
      .sort((left, right) =>
        left.accuracyPercent - right.accuracyPercent ||
        right.needScore - left.needScore ||
        right.attempts - left.attempts,
      )
      .slice(0, 12)

    const strongestCodes = [...attempted]
      .filter((item) => item.attempts >= 2)
      .sort((left, right) =>
        right.accuracyPercent - left.accuracyPercent ||
        right.attempts - left.attempts ||
        right.needScore - left.needScore,
      )
      .slice(0, 12)

    const modeBuckets: Record<SessionMode, { points: number[] }> = {
      study_test: { points: [] },
      matching: { points: [] },
      speed: { points: [] },
    }

    const combinedTrackScores: Record<string, number[]> = {}
    for (const [trackKey, track] of Object.entries(profileDetails.stats.sessionTracks)) {
      if (!track || typeof track !== 'object') continue
      const localScores = Array.isArray(track.scoreHistory) && track.scoreHistory.length > 0
        ? track.scoreHistory
        : track.lastAttempt && typeof track.lastAttempt.score === 'number'
          ? [track.lastAttempt.score]
          : []
      if (localScores.length > 0) combinedTrackScores[trackKey] = localScores
    }
    for (const [trackKey, scores] of Object.entries(remoteTrackScoreHistory)) {
      if (Array.isArray(scores) && scores.length > 0) {
        combinedTrackScores[trackKey] = scores
      }
    }

    for (const [trackKey, scores] of Object.entries(combinedTrackScores)) {
      const mode = trackKey.startsWith('study_test|')
        ? 'study_test'
        : trackKey.startsWith('matching|')
          ? 'matching'
          : trackKey.startsWith('speed|')
            ? 'speed'
            : null
      if (!mode) continue
      if (Array.isArray(scores) && scores.length > 0) {
        modeBuckets[mode].points.push(...scores.filter((value) => Number.isFinite(value)))
      }
    }

    const modePerformance = (['study_test', 'matching', 'speed'] as SessionMode[]).map((mode) => {
      const points = modeBuckets[mode].points.filter((value) => Number.isFinite(value))
      const runs = points.length
      const averageScore = runs > 0 ? Math.round(points.reduce((sum, value) => sum + value, 0) / runs) : 0
      const bestScore = runs > 0 ? Math.max(...points) : 0
      const scoreDelta = runs > 1 ? points[points.length - 1] - points[0] : 0
      return { mode, runs, averageScore, bestScore, scoreDelta, recent: points.slice(-8) }
    })

    const fullScoreTrend = effectiveScoreTimeline
      .map((point) => Math.max(0, Math.round(point.score)))

    const trend = fullScoreTrend.length > 0
      ? fullScoreTrend
      : totalAttempts > 0
        ? [totalCorrect]
        : []

    const weakestCategory = codeSetBreakdown
      .filter((item) => item.attempts > 0)
      .sort((left, right) => left.accuracyPercent - right.accuracyPercent)[0] || null
    const strongestCategory = codeSetBreakdown
      .filter((item) => item.attempts > 0)
      .sort((left, right) => right.accuracyPercent - left.accuracyPercent)[0] || null

    const recommendation =
      needsWorkCodes.length > 0
        ? `Focus on ${needsWorkCodes[0].section.sectionNumber} first (${needsWorkCodes[0].accuracyPercent}% accuracy).`
        : strongestCategory
          ? `${codeSetLabel[strongestCategory.codeSet]} is stable right now. Keep rotating through all sets to maintain retention.`
          : 'Start a study session to generate personalized coaching insights.'

    return {
      totalTrackedCodes: attempted.length,
      totalAttempts,
      totalCorrect,
      totalIncorrect,
      overallAccuracyPercent,
      unattemptedCodes: Math.max(0, sections.length - attempted.length),
      masteryCounts,
      codeSetBreakdown,
      modePerformance,
      recentScoreTrend: trend,
      needsWorkCodes,
      strongestCodes,
      weakestCategory,
      strongestCategory,
      recommendation,
    }
  }, [effectiveScoreTimeline, sections, performance, profileDetails.stats.sessionTracks, remoteTrackScoreHistory])
  const studyHubInsights = useMemo(() => {
    const windowMs = studyInsightWindowDays * 24 * 60 * 60 * 1000
    const now = clockNowMs
    const currentStart = now - windowMs
    const previousStart = currentStart - windowMs
    const timeline = effectiveScoreTimeline

    const currentPoints = timeline.filter((point) => point.at >= currentStart)
    const previousPoints = timeline.filter((point) => point.at >= previousStart && point.at < currentStart)

    const averageScore = (points: ScoreTimelinePoint[]) =>
      points.length > 0 ? Math.round(points.reduce((sum, point) => sum + point.score, 0) / points.length) : null
    const currentAverageScore = averageScore(currentPoints)
    const previousAverageScore = averageScore(previousPoints)
    const scoreDelta =
      currentAverageScore !== null && previousAverageScore !== null
        ? currentAverageScore - previousAverageScore
        : null

    const dailyBuckets = new Map<string, ScoreTimelinePoint[]>()
    for (const point of currentPoints) {
      const day = new Date(point.at).toISOString().slice(0, 10)
      const bucket = dailyBuckets.get(day) || []
      bucket.push(point)
      dailyBuckets.set(day, bucket)
    }
    const dailyTrend = [...dailyBuckets.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, points]) => Math.round(points.reduce((sum, point) => sum + point.score, 0) / points.length))

    const trendValues = dailyTrend.length > 0 ? dailyTrend : statsAnalytics.recentScoreTrend.slice(-8)
    const weakCodes = statsAnalytics.needsWorkCodes.slice(0, 10)
    const weakBySet = {
      penal: weakCodes.filter((item) => item.section.codeSet === 'penal').slice(0, 4),
      hs: weakCodes.filter((item) => item.section.codeSet === 'hs').slice(0, 4),
      vehicle: weakCodes.filter((item) => item.section.codeSet === 'vehicle').slice(0, 4),
    }

    const tracked = statsAnalytics.totalTrackedCodes || 0
    const mastered = statsAnalytics.masteryCounts.Mastered
    const gettingThere =
      statsAnalytics.masteryCounts['Getting There'] +
      statsAnalytics.masteryCounts['On Track'] +
      statsAnalytics.masteryCounts['Almost Mastered']
    const masteryRatePercent = tracked > 0 ? Math.round((mastered / tracked) * 100) : 0
    const progressRatePercent = tracked > 0 ? Math.round((gettingThere / tracked) * 100) : 0
    const recommendation =
      weakCodes.length > 0
        ? `${weakCodes[0].section.sectionNumber} is your highest-priority code. Review its elements and retest it today.`
        : 'Keep rotating through all code sets to build long-term retention.'

    return {
      trendValues,
      currentAverageScore,
      previousAverageScore,
      scoreDelta,
      currentAttempts: currentPoints.length,
      previousAttempts: previousPoints.length,
      weakCodes,
      weakBySet,
      masteryRatePercent,
      progressRatePercent,
      recommendation,
    }
  }, [clockNowMs, effectiveScoreTimeline, statsAnalytics, studyInsightWindowDays])
  const studyMomentumTrendValues = useMemo(
    () => compressTrendPoints(studyHubInsights.trendValues, 42),
    [studyHubInsights.trendValues],
  )
  const statsRecentTrendValues = useMemo(
    () => compressTrendPoints(statsAnalytics.recentScoreTrend, 72),
    [statsAnalytics.recentScoreTrend],
  )

  const matchingTrackKey = useMemo(
    () => sessionTrackKey({ mode: 'matching', duration: gamesSelection.duration, filter: gamesSelection.filter }),
    [gamesSelection.duration, gamesSelection.filter],
  )
  const speedTrackKey = useMemo(
    () => sessionTrackKey({ mode: 'speed', duration: gamesSelection.duration, filter: gamesSelection.filter }),
    [gamesSelection.duration, gamesSelection.filter],
  )
  const mergeTrackWithRemoteHistory = useCallback((trackKey: string, track: SessionTrack): SessionTrack => {
    const remoteScores = remoteTrackScoreHistory[trackKey] || []
    if (remoteScores.length === 0) return track
    return {
      ...track,
      scoreHistory: remoteScores,
    }
  }, [remoteTrackScoreHistory])
  const matchingSessionTrack = useMemo(
    () => mergeTrackWithRemoteHistory(matchingTrackKey, getSessionTrack(profileDetails.stats, matchingTrackKey)),
    [mergeTrackWithRemoteHistory, profileDetails.stats, matchingTrackKey],
  )
  const speedSessionTrack = useMemo(
    () => mergeTrackWithRemoteHistory(speedTrackKey, getSessionTrack(profileDetails.stats, speedTrackKey)),
    [mergeTrackWithRemoteHistory, profileDetails.stats, speedTrackKey],
  )
  const matchingFocusTips = useMemo(
    () => getFocusTips(gamesSelection.filter, 'matching').slice(0, 3),
    [gamesSelection.filter, getFocusTips],
  )
  const speedFocusTips = useMemo(
    () => getFocusTips(gamesSelection.filter, 'speed').slice(0, 3),
    [gamesSelection.filter, getFocusTips],
  )
  const homeDailyQuote = useMemo(() => {
    const seed = `${currentUserId || 'guest'}-${dayKeyUtc()}-${profileDetails.stats.studyDayStreak}`
    let hash = 0
    for (let index = 0; index < seed.length; index += 1) {
      hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
    }
    return homeEncouragementQuotes[hash % homeEncouragementQuotes.length]
  }, [currentUserId, profileDetails.stats.studyDayStreak])
  const nextStreakMilestone = useMemo(() => {
    const streak = profileDetails.stats.studyDayStreak
    const next = studyStreakMilestones.find((value) => value > streak)
    if (next) return next
    return Math.ceil((Math.max(streak, 1) + 1) / 7) * 7
  }, [profileDetails.stats.studyDayStreak])
  const homeLeaderboardChase = useMemo(() => {
    if (!currentUserId) return null
    const candidates: Array<{
      game: 'Matching' | 'Speed Test'
      duration: HomeDurationFilter
      filter: CodeFilter
      topScore: number
      yourScore: number
      gap: number
      status: 'leading' | 'chasing' | 'unranked'
    }> = []

    for (const game of ['Matching', 'Speed Test'] as const) {
      for (const step of homeLeaderboardRotationSteps) {
        const scoped = topEntryPerUser(
          leaderboard
            .filter((entry) => entry.game === game)
            .filter((entry) => entry.matchDuration === step.duration && entry.matchFilter === step.codeSet)
            .filter((entry) => entry.score > 0),
        )
        if (scoped.length === 0) continue
        const topScore = scoped[0].score
        const mine = scoped.find((entry) => entry.userId === currentUserId)
        const yourScore = mine?.score ?? 0
        const status: 'leading' | 'chasing' | 'unranked' = !mine
          ? 'unranked'
          : mine.score >= topScore
            ? 'leading'
            : 'chasing'
        const gap = status === 'leading' ? 0 : Math.max(1, topScore - yourScore)
        candidates.push({
          game,
          duration: step.duration,
          filter: step.codeSet,
          topScore,
          yourScore,
          gap,
          status,
        })
      }
    }

    if (candidates.length === 0) return null
    const chasing = candidates
      .filter((item) => item.status === 'chasing')
      .sort((left, right) => left.gap - right.gap || right.yourScore - left.yourScore)
    if (chasing.length > 0) return chasing[0]
    const unranked = candidates
      .filter((item) => item.status === 'unranked')
      .sort((left, right) => left.topScore - right.topScore)
    if (unranked.length > 0) return unranked[0]
    return candidates
      .filter((item) => item.status === 'leading')
      .sort((left, right) => right.topScore - left.topScore)[0] || null
  }, [leaderboard, currentUserId])
  const homePrimaryNeed = studyNeedsSummary[0] || null
  const homePersonalizedPlan = useMemo(
    () => {
      const actionItems: Array<{
        title: string
        detail: string
        cta: string
        target: HomeActionTarget
        gamePreset?: GameModeSelection
      }> = []

      if (homePrimaryNeed) {
        const detail = homePrimaryNeed.attempts > 0
          ? `${codeSetLabel[homePrimaryNeed.codeSet]} accuracy is ${homePrimaryNeed.accuracyPercent}%. Reps here give your biggest gain right now.`
          : `Start with ${codeSetLabel[homePrimaryNeed.codeSet]} to build your baseline and unlock algorithm coaching.`
        actionItems.push({
          title: `Focus ${codeSetLabel[homePrimaryNeed.codeSet]} first`,
          detail,
          cta: 'Start Study',
          target: 'study',
        })
      }

      if (homeLeaderboardChase) {
        const label = `${homeLeaderboardChase.duration}s • ${leaderboardCodeSetLabel(homeLeaderboardChase.filter)}`
        const chasePreset: GameModeSelection = {
          duration: homeLeaderboardChase.duration,
          filter: homeLeaderboardChase.filter,
        }
        if (homeLeaderboardChase.status === 'leading') {
          actionItems.push({
            title: `You’re holding #1 in ${homeLeaderboardChase.game}`,
            detail: `Defend your lead in ${label}. One more run increases your cushion.`,
            cta: `Defend ${homeLeaderboardChase.game}`,
            target: homeLeaderboardChase.game === 'Matching' ? 'games-matching' : 'games-speed',
            gamePreset: chasePreset,
          })
        } else {
          actionItems.push({
            title: `${homeLeaderboardChase.gap} points to #1`,
            detail: `${homeLeaderboardChase.game} ${label} is your closest jump target right now.`,
            cta: `Chase #1`,
            target: homeLeaderboardChase.game === 'Matching' ? 'games-matching' : 'games-speed',
            gamePreset: chasePreset,
          })
        }
      }

      const focusCodes = algorithmInsights.topFocusCodes.slice(0, 2)
      if (focusCodes.length > 0) {
        actionItems.push({
          title: 'Priority review items',
          detail: `Review ${focusCodes.join(' and ')} next. These are causing the most misses.`,
          cta: 'Run Scenarios',
          target: 'scenarios',
        })
      }

      return actionItems.slice(0, 3)
    },
    [homePrimaryNeed, homeLeaderboardChase, algorithmInsights.topFocusCodes],
  )
  const handleHomeAction = (target: HomeActionTarget, options?: HomeActionOptions) => {
    const preset = options?.gamePreset
    if (preset) {
      setGamesSelection((previous) => {
        if (previous.duration === preset.duration && previous.filter === preset.filter) return previous
        return {
          ...previous,
          duration: preset.duration,
          filter: preset.filter,
        }
      })
    }
    if (options?.forceAllTime) {
      setGameModeLeaderboardsScope('alltime')
    }
    if (target === 'study') {
      setActiveTab('study')
      navigate('/study')
      return
    }
    if (target === 'games-matching') {
      setActiveTab('games')
      navigate('/games/matching')
      return
    }
    if (target === 'games-speed') {
      setActiveTab('games')
      navigate('/games/speed')
      return
    }
    setActiveTab('scenarios')
    navigate('/scenarios')
  }

  return (
    <div
      className={`app-shell ${isHomePage ? 'home-page' : ''} ${isUiLightMode ? 'ui-light-mode theme-light theme-glass' : ''} ${!isUiLightMode && selectedTheme.id === 'golden' ? 'theme-gold' : ''} ${reduceVisualEffects ? 'reduced-effects' : ''}`}
      style={{ ['--global-banner-offset' as string]: `${globalBannerOffset}px` } as CSSProperties}
    >
      {!isSupabaseConfigured ? (
        <div className="onboarding-overlay">
          <div className="onboarding-card">
            <h1>LEO Study</h1>
            <p className="bad">Supabase is not configured.</p>
            <p className="muted">Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`.</p>
          </div>
        </div>
      ) : null}

      {!authReady ? (
        <div className="onboarding-overlay">
          <div className="onboarding-card">
            <p className="eyebrow">Welcome to</p>
            <h1>LEO Study</h1>
            <p className="muted">Checking session...</p>
          </div>
        </div>
      ) : null}

      {authReady && currentUserId ? (
        <DuelInviteBanner
          currentUserId={currentUserId}
          onJoinRoom={(nextRoomId) => {
            setActiveTab('games')
            setDuelInviteJoinRoomId(nextRoomId)
            if (!isGamesDuelPage) {
              navigate('/games/duel')
            }
          }}
        />
      ) : null}

      {authReady && !currentUserId && isSignInPage ? (
        <div className="onboarding-overlay">
          <div className="onboarding-card">
            <p className="eyebrow">Welcome to</p>
            <h1>LEO Study</h1>
            <label>
              Email
              <input value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} onKeyDown={handleSignInEnterKey} />
            </label>
            <label>
              Password
              <div className="password-row">
                <input
                  type={showSignInPassword ? 'text' : 'password'}
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  onKeyDown={handleSignInEnterKey}
                />
                <button type="button" className="password-eye" onClick={() => setShowSignInPassword((value) => !value)} aria-label="Toggle password visibility">
                  {showSignInPassword ? (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M3 3l18 18" />
                      <path d="M10.6 10.7A3 3 0 0013.3 13.4" />
                      <path d="M9.5 4.6A11.3 11.3 0 0112 4.3c6.7 0 10.5 7.7 10.5 7.7a16.9 16.9 0 01-4 5.2" />
                      <path d="M6.1 6.2A16.8 16.8 0 001.5 12s3.8 7.7 10.5 7.7a11 11 0 004.2-.8" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M1.5 12S5.3 4.3 12 4.3 22.5 12 22.5 12 18.7 19.7 12 19.7 1.5 12 1.5 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </label>
            <button className="primary" onClick={submitSignIn} disabled={authLoading}>
              Sign In
            </button>
            <button className="secondary" onClick={submitGoogle} disabled={authLoading}>
              <span className="google-mark" aria-hidden>
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.24 1.26-.96 2.33-2.04 3.04l3.3 2.56c1.92-1.77 3.03-4.38 3.03-7.49 0-.71-.06-1.4-.18-2.06H12z" />
                  <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.63-2.44l-3.3-2.56c-.9.61-2.06.97-3.33.97-2.56 0-4.73-1.73-5.5-4.05l-3.4 2.63C4.75 19.82 8.12 22 12 22z" />
                  <path fill="#4A90E2" d="M6.5 13.92c-.2-.6-.32-1.24-.32-1.92s.12-1.32.32-1.92l-3.4-2.63A9.99 9.99 0 0 0 2 12c0 1.62.39 3.15 1.1 4.55l3.4-2.63z" />
                  <path fill="#FBBC05" d="M12 6.03c1.47 0 2.8.5 3.85 1.48l2.89-2.9C16.96 2.95 14.7 2 12 2 8.12 2 4.75 4.18 3.1 7.45l3.4 2.63c.77-2.32 2.94-4.05 5.5-4.05z" />
                </svg>
              </span>
              Continue with Google
            </button>
            <p className="muted tiny">Need an account? <Link to="/signup">Create one</Link></p>
            {authError ? <p className="bad">{authError}</p> : null}
            {authSuccess ? <p className="good">{authSuccess}</p> : null}
          </div>
        </div>
      ) : null}

      {authReady && !currentUserId && isSignUpPage ? (
        <div className="onboarding-overlay">
          <div className="onboarding-card">
            <p className="eyebrow">Create account</p>
            <h1>LEO Study</h1>
            <label>
              Email
              <input value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} />
            </label>
            <label>
              Password
              <div className="password-row">
                <input
                  type={showSignUpPassword ? 'text' : 'password'}
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                />
                <button type="button" className="password-eye" onClick={() => setShowSignUpPassword((value) => !value)} aria-label="Toggle password visibility">
                  {showSignUpPassword ? (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M3 3l18 18" />
                      <path d="M10.6 10.7A3 3 0 0013.3 13.4" />
                      <path d="M9.5 4.6A11.3 11.3 0 0112 4.3c6.7 0 10.5 7.7 10.5 7.7a16.9 16.9 0 01-4 5.2" />
                      <path d="M6.1 6.2A16.8 16.8 0 001.5 12s3.8 7.7 10.5 7.7a11 11 0 004.2-.8" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M1.5 12S5.3 4.3 12 4.3 22.5 12 22.5 12 18.7 19.7 12 19.7 1.5 12 1.5 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </label>
            <label>
              Verify Password
              <div className="password-row">
                <input
                  type={showSignUpPasswordConfirm ? 'text' : 'password'}
                  value={authPasswordConfirm}
                  onChange={(event) => setAuthPasswordConfirm(event.target.value)}
                />
                <button
                  type="button"
                  className="password-eye"
                  onClick={() => setShowSignUpPasswordConfirm((value) => !value)}
                  aria-label="Toggle verify password visibility"
                >
                  {showSignUpPasswordConfirm ? (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M3 3l18 18" />
                      <path d="M10.6 10.7A3 3 0 0013.3 13.4" />
                      <path d="M9.5 4.6A11.3 11.3 0 0112 4.3c6.7 0 10.5 7.7 10.5 7.7a16.9 16.9 0 01-4 5.2" />
                      <path d="M6.1 6.2A16.8 16.8 0 001.5 12s3.8 7.7 10.5 7.7a11 11 0 004.2-.8" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M1.5 12S5.3 4.3 12 4.3 22.5 12 22.5 12 18.7 19.7 12 19.7 1.5 12 1.5 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </label>
            {authPasswordConfirm.length > 0 && authPassword !== authPasswordConfirm ? <p className="bad">Passwords do not match.</p> : null}
            <button className="primary" onClick={submitSignUp} disabled={authLoading || authPassword.length === 0 || authPassword !== authPasswordConfirm}>
              Create Account
            </button>
            <button className="secondary" onClick={submitGoogle} disabled={authLoading}>
              <span className="google-mark" aria-hidden>
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.24 1.26-.96 2.33-2.04 3.04l3.3 2.56c1.92-1.77 3.03-4.38 3.03-7.49 0-.71-.06-1.4-.18-2.06H12z" />
                  <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.63-2.44l-3.3-2.56c-.9.61-2.06.97-3.33.97-2.56 0-4.73-1.73-5.5-4.05l-3.4 2.63C4.75 19.82 8.12 22 12 22z" />
                  <path fill="#4A90E2" d="M6.5 13.92c-.2-.6-.32-1.24-.32-1.92s.12-1.32.32-1.92l-3.4-2.63A9.99 9.99 0 0 0 2 12c0 1.62.39 3.15 1.1 4.55l3.4-2.63z" />
                  <path fill="#FBBC05" d="M12 6.03c1.47 0 2.8.5 3.85 1.48l2.89-2.9C16.96 2.95 14.7 2 12 2 8.12 2 4.75 4.18 3.1 7.45l3.4 2.63c.77-2.32 2.94-4.05 5.5-4.05z" />
                </svg>
              </span>
              Continue with Google
            </button>
            <p className="muted tiny">Already have an account? <Link to="/signin">Sign in</Link></p>
            {authError ? <p className="bad">{authError}</p> : null}
            {authSuccess ? <p className="good">{authSuccess}</p> : null}
          </div>
        </div>
      ) : null}

      {authReady && !currentUserId && !isSignInPage && !isSignUpPage ? <Navigate to="/signup" replace /> : null}
      {authReady && currentUserId && (isSignInPage || isSignUpPage) ? <Navigate to="/home" replace /> : null}
      {authReady && currentUserId && !isKnownAuthedPage ? <Navigate to="/home" replace /> : null}
      {needsProfileSetup ? (
        <div className="onboarding-overlay">
          <div className="onboarding-card">
            <p className="eyebrow">One more step</p>
            <h1>Set up your profile</h1>
            <label>
              Username
              <input
                value={profileUsername}
                onChange={(event) => {
                  setProfileUsername(event.target.value)
                  if (authError.toLowerCase().includes('username already exists')) setAuthError('')
                }}
              />
            </label>
            <label>
              Profile picture
              <input
                type="file"
                accept="image/*"
                onChange={(event) => openAvatarCropper(event.target.files?.[0] || null)}
              />
            </label>
            <label>
              Agency (Optional)
              <select
                value={profileDetails.agency}
                onChange={(event) => setProfileDetails((previous) => ({ ...previous, agency: event.target.value }))}
              >
                {agencyOptions.map((agency) => (
                  <option key={agency} value={agency}>
                    {agency}
                  </option>
                ))}
              </select>
            </label>
            <label>
              About Me (Optional)
              <textarea
                rows={3}
                value={profileDetails.bio}
                onChange={(event) => setProfileDetails((previous) => ({ ...previous, bio: event.target.value }))}
              />
            </label>
            <button className="primary" onClick={submitProfile} disabled={authLoading || profileUsername.trim().length < 1}>
              Save Profile
            </button>
            {authError ? <p className="bad">{authError}</p> : null}
          </div>
        </div>
      ) : null}

      {authReady && currentUserId ? (
        <>
        {appBannerSettings.enabled && appBannerSettings.message ? (
          <section
            ref={globalBannerRef}
            className={`global-owner-banner global-owner-banner-${appBannerSettings.tone} global-owner-banner-live${
              appBannerSettings.scroll ? ' global-owner-banner-scrolling' : ''
            }`}
            role={appBannerSettings.tone === 'urgent' ? 'alert' : 'status'}
            aria-live={appBannerSettings.tone === 'urgent' ? 'assertive' : 'polite'}
          >
            <span className="global-owner-banner-label">{bannerToneLabel[appBannerSettings.tone]}</span>
            {appBannerSettings.scroll ? (
              <div className="global-owner-banner-marquee" aria-label={appBannerSettings.message}>
                <div
                  className="global-owner-banner-marquee-track"
                  style={{ ['--banner-scroll-duration' as string]: `${appBannerSettings.scrollSpeed}s` } as CSSProperties}
                >
                  {buildBannerMarqueeSegments(appBannerSettings.message, appBannerSettings.scrollRepeat).map((segment, index) => (
                    <span key={`banner-live-${index}`}>{segment}</span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="global-owner-banner-text">{appBannerSettings.message}</p>
            )}
            <span className="global-owner-banner-spacer" aria-hidden />
          </section>
        ) : null}
        <div className="workspace-layout">
          <aside className="left-taskbar">
            <div className="taskbar-section">
              <button className={isHomePage ? 'taskbar-nav-btn active' : 'taskbar-nav-btn'} onClick={() => navigateToTab('home')}>
                <AppIcon name="home" className="taskbar-icon" />
                Home
              </button>
              <button className={isLeaderboardsPage ? 'taskbar-nav-btn active' : 'taskbar-nav-btn'} onClick={() => navigateToTab('leaderboards')}>
                <AppIcon name="leaderboards" className="taskbar-icon" />
                Leaderboards
              </button>
              <button className={isLibraryPage ? 'taskbar-nav-btn active' : 'taskbar-nav-btn'} onClick={() => navigateToTab('library')}>
                <AppIcon name="library" className="taskbar-icon" />
                Library
              </button>
              <button className={isScenariosPage ? 'taskbar-nav-btn active' : 'taskbar-nav-btn'} onClick={() => navigateToTab('scenarios')}>
                <AppIcon name="scenarios" className="taskbar-icon" />
                Scenarios
              </button>
              <button className={isStatsPage ? 'taskbar-nav-btn active' : 'taskbar-nav-btn'} onClick={() => goToPath('/stats')}>
                <AppIcon name="stats" className="taskbar-icon" />
                Stats
              </button>
              <button className={isChatPage ? 'taskbar-nav-btn active' : 'taskbar-nav-btn'} onClick={() => navigateToTab('chat')}>
                <AppIcon name="chat" className="taskbar-icon" />
                Chat
              </button>
            </div>

            <div className="taskbar-section">
              <p className="taskbar-label">Study</p>
              <button className={isStudyPage ? 'taskbar-nav-btn active' : 'taskbar-nav-btn'} onClick={() => navigateToTab('study')}>
                <AppIcon name="study" className="taskbar-icon" />
                Study Hub
              </button>
              <div className="taskbar-submenu">
                <button
                  className={isStudyGuidePage ? 'taskbar-sub-btn active' : 'taskbar-sub-btn'}
                  onClick={openStudyGuidePage}
                >
                  <AppIcon name="study" className="taskbar-sub-icon" />
                  Study Guide
                </button>
                <button
                  className={isStudyPracticeTestPage ? 'taskbar-sub-btn active' : 'taskbar-sub-btn'}
                  onClick={openStudyPracticeTestPage}
                >
                  <AppIcon name="test" className="taskbar-sub-icon" />
                  Practice Test
                </button>
                <button
                  className={isStudyFlashcardsPage ? 'taskbar-sub-btn active' : 'taskbar-sub-btn'}
                  onClick={openStudyFlashcardsPage}
                >
                  <AppIcon name="flashcards" className="taskbar-sub-icon" />
                  Flashcards
                </button>
                <button
                  className={isStudyTestPage ? 'taskbar-sub-btn active' : 'taskbar-sub-btn'}
                  onClick={openStudyTestPage}
                >
                  <AppIcon name="test" className="taskbar-sub-icon" />
                  Test
                </button>
              </div>
            </div>

            <div className="taskbar-section">
              <p className="taskbar-label">Games</p>
              <button className={isGamesPage ? 'taskbar-nav-btn active' : 'taskbar-nav-btn'} onClick={() => navigateToTab('games')}>
                <AppIcon name="games" className="taskbar-icon" />
                Games Hub
              </button>
              <div className="taskbar-submenu">
                <button
                  className={isGamesSpeedPage ? 'taskbar-sub-btn active' : 'taskbar-sub-btn'}
                  onClick={() => {
                    goToPath('/games/speed', { tab: 'games' })
                  }}
                >
                  <AppIcon name="speed" className="taskbar-sub-icon" />
                  Speed Test
                </button>
                <button
                  className={isGamesMatchingPage ? 'taskbar-sub-btn active' : 'taskbar-sub-btn'}
                  onClick={() => {
                    goToPath('/games/matching', { tab: 'games' })
                  }}
                >
                  <AppIcon name="games" className="taskbar-sub-icon" />
                  Matching
                </button>
                <button
                  className={isGamesDuelPage ? 'taskbar-sub-btn active' : 'taskbar-sub-btn'}
                  onClick={() => {
                    goToPath('/games/duel', { tab: 'games' })
                  }}
                >
                  <AppIcon name="duel" className="taskbar-sub-icon" />
                  1v1
                </button>
              </div>
            </div>

            <div className="home-online-indicator taskbar-online-indicator">
              <span className="online-dot"></span>
              <span className="online-count">{onlineUsersCount}</span>
              <span className="online-label">studying now</span>
            </div>

            {profile ? (
              <div className="taskbar-profile-wrap" ref={profileMenuRef}>
                <button className="taskbar-profile" onClick={() => setProfileMenuOpen((value) => !value)} aria-label="Open profile menu">
                  <img src={avatarFor(profileAvatarPreviewUrl || profile.avatarUrl)} alt={profile.username} className="taskbar-profile-image" onError={handleAvatarImageError} />
                  <span className="taskbar-profile-info">
                    <span className={`taskbar-profile-name ${displayNameClass(profile.supporterTier, true)}`} style={displayNameStyle(profileDetails.nameStyle, profile.supporterTier)}>
                      {profile.username || 'Profile'}
                    </span>
                    <span className="taskbar-profile-tier">{tierLabel[activeProfileTier]}</span>
                  </span>
                </button>
                {profileMenuOpen ? (
                  <div className="profile-menu profile-menu-sidebar">
                    <button className="profile-menu-item" onClick={() => { setProfileMenuOpen(false); openSettingsTab('profile') }}>Settings</button>
                    <button className="profile-menu-item" onClick={() => { setProfileMenuOpen(false); openSettingsTab('bug_report') }}>Report Bug</button>
                    <button className="profile-menu-item" onClick={() => { setProfileMenuOpen(false); goToPath('/support') }}>Support</button>
                    <button
                      className="profile-menu-item"
                      onClick={() => {
                        setProfileMenuOpen(false)
                        void toggleDisplayMode()
                      }}
                    >
                      {isUiLightMode ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
                    </button>
                    <button className="profile-menu-item danger-item" onClick={signOut}>Sign Out</button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </aside>

          <div className="workspace-main">
            {!isHomePage ? (
              <header className="top-header app-page-header">
                <div className="header-left">
                  <h1>{pageTitle}</h1>
                </div>
              </header>
            ) : null}

            <main className="content-area" key={currentPath}>
        {contentWarning ? <p className="muted content-warning">{contentWarning}</p> : null}
        {!isProfilePage && !isStatsPage && isHomePage && (
          <section className="home-section">
            <div className="card home-hero">
              <div className="home-hero-head">
                <div>
                  <p className="eyebrow">Welcome</p>
                  <h2 className={displayNameClass(activeProfileTier, true)} style={displayNameStyle(profileDetails.nameStyle, activeProfileTier)}>
                    {activeProfileName}
                  </h2>
                  <p className="muted">Pick your focus and keep building momentum.</p>
                  <p className="home-quote-line">“{homeDailyQuote}”</p>
                  <div className={profileDetails.stats.studyDayStreak >= 7 ? 'day-streak-chip day-streak-chip-fire' : 'day-streak-chip'}>
                    <span className="day-streak-label">Study Streak</span>
                    <strong>{profileDetails.stats.studyDayStreak} day{profileDetails.stats.studyDayStreak === 1 ? '' : 's'}</strong>
                    {profileDetails.stats.studyDayStreak >= 7 ? <span className="day-streak-fire" aria-hidden>🔥</span> : null}
                  </div>
                </div>
                <div className="home-hero-actions">
                  <button
                    className={`secondary home-whats-new-btn ${homeWhatsNewOpen ? 'active' : ''}`}
                    onClick={() => setHomeWhatsNewOpen(true)}
                    aria-label="Open what's new for version 0.40"
                  >
                    <AppIcon name="updates" className="button-icon" />
                    What's New · v0.40
                  </button>
                  <button
                    className={`icon-menu-button home-leaderboard-gear ${homeLeaderboardSettingsOpen ? 'active' : ''}`}
                    onClick={() => setHomeLeaderboardSettingsOpen((value) => !value)}
                    aria-label="Customize home leaderboards"
                    aria-expanded={homeLeaderboardSettingsOpen}
                  >
                    <AppIcon name="settings" className="button-icon" />
                  </button>
                </div>
              </div>
              <button className="home-tmas-cta" type="button" onClick={openStudyPracticeTestPage}>
                <div className="home-tmas-cta-copy">
                  <span className="home-tmas-cta-kicker">Priority Focus</span>
                  <strong>Study for TMAS 2 now. Get ready for Tuesday.</strong>
                  <span className="home-tmas-cta-subtitle">Open the TMAS 2 practice test and start a full scenario-based run.</span>
                </div>
                <span className="home-tmas-cta-button">
                  <AppIcon name="test" className="button-icon" />
                  TMAS 2 Practice Test
                </span>
              </button>
              <div className="home-actions">
                <button className="primary" onClick={() => { setActiveTab('study'); navigate('/study') }}>
                  <AppIcon name="flashcards" className="button-icon" />
                  Go Study
                </button>
                <button className="secondary" onClick={() => { setActiveTab('games'); navigate('/games') }}>
                  <AppIcon name="games" className="button-icon" />
                  Play Games
                </button>
                <button className="secondary" onClick={() => { setActiveTab('scenarios'); navigate('/scenarios') }}>
                  <AppIcon name="scenarios" className="button-icon" />
                  Run Scenarios
                </button>
                <button className="secondary" onClick={() => navigate('/support')}>
                  <AppIcon name="support" className="button-icon" />
                  Support Creator
                </button>
              </div>
            </div>

            <div className="home-guidance-grid">
              <article className="card home-guidance-card">
                <div className="home-guidance-head">
                  <p className="eyebrow">Progress Signal</p>
                  <strong>Next streak goal: {nextStreakMilestone} days</strong>
                </div>
                <p className="muted">
                  {profileDetails.stats.studyDayStreak >= nextStreakMilestone
                    ? 'You hit the current streak target. Keep the momentum alive.'
                    : `${Math.max(1, nextStreakMilestone - profileDetails.stats.studyDayStreak)} more day${Math.max(1, nextStreakMilestone - profileDetails.stats.studyDayStreak) === 1 ? '' : 's'} to the next streak milestone.`}
                </p>
                <div className="home-guidance-metric-row">
                  <span>Tracked codes</span>
                  <strong>{algorithmInsights.trackedCodes}</strong>
                </div>
                <div className="home-guidance-metric-row">
                  <span>Average accuracy</span>
                  <strong>{Math.round(algorithmInsights.averageAccuracy * 100)}%</strong>
                </div>
              </article>

              <article className="card home-guidance-card">
                <div className="home-guidance-head">
                  <p className="eyebrow">Leaderboard Chase</p>
                  <strong>
                    {homeLeaderboardChase
                      ? `${homeLeaderboardChase.game} • ${homeLeaderboardChase.duration}s • ${leaderboardCodeSetLabel(homeLeaderboardChase.filter)}`
                      : 'No active board yet'}
                  </strong>
                </div>
                {homeLeaderboardChase ? (
                  <>
                    <p className="muted">
                      {homeLeaderboardChase.status === 'leading'
                        ? `You hold #1 in this mode. Keep building separation with one more run.`
                        : `You are ${homeLeaderboardChase.gap} points away from #1 in this mode.`}
                    </p>
                    <button
                      className="primary"
                      onClick={() => handleHomeAction(
                        homeLeaderboardChase.game === 'Matching' ? 'games-matching' : 'games-speed',
                        {
                          gamePreset: {
                            duration: homeLeaderboardChase.duration,
                            filter: homeLeaderboardChase.filter,
                          },
                          forceAllTime: true,
                        },
                      )}
                    >
                      {homeLeaderboardChase.status === 'leading' ? 'Defend #1' : 'Go for #1'}
                    </button>
                  </>
                ) : (
                  <p className="muted">Complete a matching or speed run to unlock your chase target.</p>
                )}
              </article>

              <article className="card home-guidance-card">
                <div className="home-guidance-head">
                  <p className="eyebrow">What to do next</p>
                  <strong>Personalized action plan</strong>
                </div>
                {homePersonalizedPlan.length === 0 ? (
                  <p className="muted">Start one study session to generate personalized guidance.</p>
                ) : (
                  <div className="home-guidance-actions">
                    {homePersonalizedPlan.map((item) => (
                      <div key={`home-plan-${item.title}`} className="home-guidance-action-row">
                        <div>
                          <p className="home-guidance-action-title">{item.title}</p>
                          <p className="muted tiny">{item.detail}</p>
                        </div>
                        <button
                          className="secondary"
                          onClick={() => handleHomeAction(
                            item.target,
                            item.gamePreset
                              ? { gamePreset: item.gamePreset, forceAllTime: true }
                              : undefined,
                          )}
                        >
                          {item.cta}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </div>

            <div className="home-leaderboard-grid">
              {homeVisibleLeaderboardCards.length === 0 ? (
                <div className="card leaderboard-card home-leaderboard-empty-card">
                  <h3>Home Leaderboards Hidden</h3>
                  <p className="muted">Use the settings gear above to choose which leaderboards to show.</p>
                </div>
              ) : null}

              {homeShowsStudyTimeLeaderboard ? (
              <div className="card leaderboard-card">
                <div className="leaderboard-card-head">
                  <h3>Most Study Time</h3>
                  <p className="leaderboard-card-subtitle">Top total study minutes</p>
                </div>
                {homeStudyTimeLeaders.length === 0 ? <p className="muted">No data yet.</p> : (
                  <div className="leaderboard-list">
                    {homeStudyTimeLeaders.map((entry, index) => (
                      <button
                        key={`home-hours-${entry.userId}-${index}`}
                        type="button"
                        className="leader-row leader-row-button leader-row-rich"
                        onClick={() => openHomeProfile(entry, 'Study Time', index === 0)}
                      >
                        <span className="leader-rank">#{index + 1}</span>
                        <span className="leader-player">
                          <span className="leader-avatar-wrap">
                            {index === 0 ? <span className="leader-crown" aria-label="Top Player">👑</span> : null}
                            <span className={leaderAvatarFrameClass(entry.userId)}>
                              <img src={avatarFor(entry.avatarUrl)} alt={entry.playerName} className="leader-avatar" onError={handleAvatarImageError} />
                            </span>
                          </span>
                          <LeaderboardPlayerName entry={entry} />
                        </span>
                        <span className="leader-result">
                          <small>Study Time</small>
                          <strong>{formatStudyTime(entry.value)}</strong>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              ) : null}

              {homeShowsStudyStreakLeaderboard ? (
              <div className="card leaderboard-card">
                <div className="leaderboard-card-head">
                  <h3>Best Study Streak</h3>
                  <p className="leaderboard-card-subtitle">Most days in a row</p>
                </div>
                {homeStudyStreakLeaders.length === 0 ? <p className="muted">No streak data yet.</p> : (
                  <div className="leaderboard-list">
                    {homeStudyStreakLeaders.map((entry, index) => (
                      <button
                        key={`home-streak-${entry.userId}-${index}`}
                        type="button"
                        className="leader-row leader-row-button leader-row-rich"
                        onClick={() => openHomeProfile(entry, 'Study Streak', index === 0)}
                      >
                        <span className="leader-rank">#{index + 1}</span>
                        <span className="leader-player">
                          <span className="leader-avatar-wrap">
                            {index === 0 ? <span className="leader-crown" aria-label="Top Player">👑</span> : null}
                            <span className={leaderAvatarFrameClass(entry.userId)}>
                              <img src={avatarFor(entry.avatarUrl)} alt={entry.playerName} className="leader-avatar" onError={handleAvatarImageError} />
                            </span>
                          </span>
                          <LeaderboardPlayerName entry={entry} />
                        </span>
                        <span className="leader-result">
                          <small>Day Streak</small>
                          <strong>{entry.value} day{entry.value === 1 ? '' : 's'}</strong>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              ) : null}

              {homeShowsMatchingLeaderboard ? (
              <div className="card leaderboard-card">
                <div className="card-menu-head">
                  <div className="leaderboard-card-head">
                    <h3>Best Matching Score</h3>
                    <p className="leaderboard-card-subtitle">Top score by player</p>
                  </div>
                  <button className="icon-menu-button" onClick={() => setHomeMatchingConfigOpen((value) => !value)} aria-label="Configure matching leaderboard">⋯</button>
                </div>
                {homeMatchingConfigOpen ? (
                  <div className="home-score-config">
                    <label>Time</label>
                    <div className="mini-chip-row">
                      {([15, 30, 60] as HomeDurationFilter[]).map((value) => (
                        <button
                          key={`home-match-time-${value}`}
                          className={homeMatchingDurationFilter === value ? 'chip chip-active' : 'chip'}
                          onClick={() => setHomeMatchingDurationFilter(value)}
                        >
                          {`${value}s`}
                        </button>
                      ))}
                    </div>
                    <label>Code Set</label>
                    <div className="mini-chip-row">
                      {(['all', 'penal', 'hs', 'vehicle'] as CodeFilter[]).map((value) => (
                        <button
                          key={`home-match-code-${value}`}
                          className={homeMatchingCodeFilter === value ? 'chip chip-active' : 'chip'}
                          onClick={() => setHomeMatchingCodeFilter(value)}
                        >
                          {value === 'all' ? 'All' : codeSetLabel[value]}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {homeMatchingRotationSteps.length === 0 ? <p className="muted">No matching leaderboard data yet.</p> : null}
                {homeMatchingLeaders.length === 0 ? <p className="muted">No scores yet.</p> : (
                  <div
                    key={`home-match-rotation-${homeMatchingDurationFilter}-${homeMatchingCodeFilter}`}
                    className="leaderboard-list leaderboard-rotate-list"
                  >
                    {homeMatchingLeaders.map((entry, index) => (
                      <button
                        key={`home-match-${entry.id}`}
                        type="button"
                        className="leader-row leader-row-button leader-row-rich"
                        onClick={() => {
                          setSelectedLeaderboardEntry(entry)
                          setSelectedLeaderboardIsTop(index === 0)
                        }}
                      >
                        <span className="leader-rank">#{index + 1}</span>
                        <span className="leader-player">
                          <span className="leader-avatar-wrap">
                            {index === 0 ? <span className="leader-crown" aria-label="Top Player">👑</span> : null}
                            <span className={leaderAvatarFrameClass(entry.userId)}>
                              <img src={avatarFor(entry.avatarUrl)} alt={entry.playerName} className="leader-avatar" onError={handleAvatarImageError} />
                            </span>
                          </span>
                          <LeaderboardPlayerName entry={entry} />
                        </span>
                        <span className="leader-result">
                          <small>{entry.matchDuration}s • {leaderboardCodeSetLabel(entry.matchFilter)}</small>
                          <strong>{entry.score} pts</strong>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              ) : null}

              {homeShowsSpeedLeaderboard ? (
              <div className="card leaderboard-card">
                <div className="card-menu-head">
                  <div className="leaderboard-card-head">
                    <h3>Best Speed Test Score</h3>
                    <p className="leaderboard-card-subtitle">Top score by player</p>
                  </div>
                  <button className="icon-menu-button" onClick={() => setHomeSpeedConfigOpen((value) => !value)} aria-label="Configure speed leaderboard">⋯</button>
                </div>
                {homeSpeedConfigOpen ? (
                  <div className="home-score-config">
                    <label>Time</label>
                    <div className="mini-chip-row">
                      {([15, 30, 60] as HomeDurationFilter[]).map((value) => (
                        <button
                          key={`home-speed-time-${value}`}
                          className={homeSpeedDurationFilter === value ? 'chip chip-active' : 'chip'}
                          onClick={() => setHomeSpeedDurationFilter(value)}
                        >
                          {`${value}s`}
                        </button>
                      ))}
                    </div>
                    <label>Code Set</label>
                    <div className="mini-chip-row">
                      {(['all', 'penal', 'hs', 'vehicle'] as CodeFilter[]).map((value) => (
                        <button
                          key={`home-speed-code-${value}`}
                          className={homeSpeedCodeFilter === value ? 'chip chip-active' : 'chip'}
                          onClick={() => setHomeSpeedCodeFilter(value)}
                        >
                          {value === 'all' ? 'All' : codeSetLabel[value]}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {homeSpeedRotationSteps.length === 0 ? <p className="muted">No speed leaderboard data yet.</p> : null}
                {homeSpeedLeaders.length === 0 ? <p className="muted">No scores yet.</p> : (
                  <div
                    key={`home-speed-rotation-${homeSpeedDurationFilter}-${homeSpeedCodeFilter}`}
                    className="leaderboard-list leaderboard-rotate-list"
                  >
                    {homeSpeedLeaders.map((entry, index) => (
                      <button
                        key={`home-speed-${entry.id}`}
                        type="button"
                        className="leader-row leader-row-button leader-row-rich"
                        onClick={() => {
                          setSelectedLeaderboardEntry(entry)
                          setSelectedLeaderboardIsTop(index === 0)
                        }}
                      >
                        <span className="leader-rank">#{index + 1}</span>
                        <span className="leader-player">
                          <span className="leader-avatar-wrap">
                            {index === 0 ? <span className="leader-crown" aria-label="Top Player">👑</span> : null}
                            <span className={leaderAvatarFrameClass(entry.userId)}>
                              <img src={avatarFor(entry.avatarUrl)} alt={entry.playerName} className="leader-avatar" onError={handleAvatarImageError} />
                            </span>
                          </span>
                          <LeaderboardPlayerName entry={entry} />
                        </span>
                        <span className="leader-result">
                          <small>{entry.matchDuration}s • {leaderboardCodeSetLabel(entry.matchFilter)}</small>
                          <strong>{entry.score} pts</strong>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              ) : null}

              {homeShowsDuelWinsLeaderboard ? (
              <div className="card leaderboard-card">
                <div className="leaderboard-card-head">
                  <h3>1v1 Most Wins</h3>
                  <p className="leaderboard-card-subtitle">{duelLeaderboardModeLabel[homeDuelWinsMode]} mode</p>
                </div>
                {homeDuelWinsLeaders.length === 0 ? <p className="muted">No 1v1 wins yet for this mode.</p> : (
                  <div className="leaderboard-list">
                    {homeDuelWinsLeaders.map((entry, index) => (
                      <button
                        key={`home-duel-wins-${homeDuelWinsMode}-${entry.userId}-${index}`}
                        type="button"
                        className="leader-row leader-row-button leader-row-rich"
                        onClick={() => openHomeProfile(entry, `1v1 ${duelLeaderboardModeLabel[homeDuelWinsMode]} Wins`, index === 0)}
                      >
                        <span className="leader-rank">#{index + 1}</span>
                        <span className="leader-player">
                          <span className="leader-avatar-wrap">
                            {index === 0 ? <span className="leader-crown" aria-label="Top Player">👑</span> : null}
                            <span className={leaderAvatarFrameClass(entry.userId)}>
                              <img src={avatarFor(entry.avatarUrl)} alt={entry.playerName} className="leader-avatar" onError={handleAvatarImageError} />
                            </span>
                          </span>
                          <LeaderboardPlayerName entry={entry} />
                        </span>
                        <span className="leader-result">
                          <small>{entry.duelCurrentWinStreak > 0 ? `🔥 ${entry.duelCurrentWinStreak} streak` : 'No active streak'}</small>
                          <strong>{entry.duelWins} wins</strong>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              ) : null}

              {homeShowsDuelStreakLeaderboard ? (
              <div className="card leaderboard-card">
                <div className="leaderboard-card-head">
                  <h3>1v1 Streak Leaderboard</h3>
                  <p className="leaderboard-card-subtitle">{duelLeaderboardModeLabel[homeDuelStreakMode]} mode</p>
                </div>
                {homeDuelStreakLeaders.length === 0 ? <p className="muted">No active 1v1 streaks yet for this mode.</p> : (
                  <div className="leaderboard-list">
                    {homeDuelStreakLeaders.map((entry, index) => (
                      <button
                        key={`home-duel-streak-${homeDuelStreakMode}-${entry.userId}-${index}`}
                        type="button"
                        className="leader-row leader-row-button leader-row-rich"
                        onClick={() => openHomeProfile(entry, `1v1 ${duelLeaderboardModeLabel[homeDuelStreakMode]} Streak`, index === 0)}
                      >
                        <span className="leader-rank">#{index + 1}</span>
                        <span className="leader-player">
                          <span className="leader-avatar-wrap">
                            {index === 0 ? <span className="leader-crown" aria-label="Top Player">👑</span> : null}
                            <span className={leaderAvatarFrameClass(entry.userId)}>
                              <img src={avatarFor(entry.avatarUrl)} alt={entry.playerName} className="leader-avatar" onError={handleAvatarImageError} />
                            </span>
                          </span>
                          <LeaderboardPlayerName entry={entry} />
                        </span>
                        <span className="leader-result">
                          <small>{entry.duelWins} wins • {entry.duelLosses} losses</small>
                          <strong>{entry.duelCurrentWinStreak} streak</strong>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              ) : null}

              {homeShowsMasteredLeaderboard ? (
              <div className="card leaderboard-card">
                <div className="card-menu-head">
                  <div className="leaderboard-card-head">
                    <h3>Most Mastered Codes</h3>
                    <p className="leaderboard-card-subtitle">Most 20-streak code masters</p>
                  </div>
                  <button className="assisted-learning-info-button" onClick={() => setHomeMasteredInfoOpen((value) => !value)} aria-label="What is mastered code">
                    ⓘ
                  </button>
                </div>
                {homeMasteredInfoOpen ? (
                  <div className="home-mastery-help">
                    A code is mastered only after you answer it correctly 20 times in a row. One wrong answer resets that code’s streak to zero.
                  </div>
                ) : null}
                {homeMostMasteredLeaders.length === 0 ? <p className="muted">Be the first to master a code.</p> : (
                  <div className="leaderboard-list">
                    {homeMostMasteredLeaders.map((entry, index) => (
                      <button
                        key={`home-mastered-${entry.userId}-${index}`}
                        type="button"
                        className="leader-row leader-row-button leader-row-rich"
                        onClick={() => openHomeProfile(entry, 'Mastered Codes', index === 0)}
                      >
                        <span className="leader-rank">#{index + 1}</span>
                        <span className="leader-player">
                          <span className="leader-avatar-wrap">
                            {index === 0 ? <span className="leader-crown" aria-label="Top Player">👑</span> : null}
                            <span className={leaderAvatarFrameClass(entry.userId)}>
                              <img src={avatarFor(entry.avatarUrl)} alt={entry.playerName} className="leader-avatar" onError={handleAvatarImageError} />
                            </span>
                          </span>
                          <LeaderboardPlayerName entry={entry} />
                        </span>
                        <span className="leader-result">
                          <small>Mastered Codes</small>
                          <strong>{entry.value}</strong>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              ) : null}
            </div>
          </section>
        )}

        {!isProfilePage && !isStatsPage && isLeaderboardsPage && (
          <section className="leaderboards-section">
            <div className="leaderboards-overview-grid">
              <article className="card leaderboard-summary-card leaderboard-summary-card-condensed">
                <div className="leaderboard-card-head">
                  <h3>Top Performer This Week</h3>
                  <p className="leaderboard-card-subtitle">Combined across all weekly leaderboards</p>
                </div>
                {!weeklyTopPerformer ? (
                  <p className="muted">No weekly scores yet.</p>
                ) : (
                  <>
                    <button
                      type="button"
                      className="leader-row leader-row-button leader-row-rich leader-row-summary"
                      onClick={() => {
                        setSelectedLeaderboardEntry(weeklyTopPerformer.entry)
                        setSelectedLeaderboardIsTop(true)
                      }}
                    >
                      <span className="leader-rank">#1</span>
                      <span className="leader-player">
                        <span className="leader-avatar-wrap">
                          <span className="leader-crown" aria-label="Top Player">👑</span>
                          <span className={leaderAvatarFrameClass(weeklyTopPerformer.entry.userId)}>
                            <img src={avatarFor(weeklyTopPerformer.entry.avatarUrl)} alt={weeklyTopPerformer.entry.playerName} className="leader-avatar" onError={handleAvatarImageError} />
                          </span>
                        </span>
                        <LeaderboardPlayerName entry={weeklyTopPerformer.entry} />
                      </span>
                      <span className="leader-result">
                        <small>Weekly total</small>
                        <strong>{weeklyTopPerformer.totalScore} pts</strong>
                      </span>
                    </button>
                    <div className="leaderboard-summary-metrics">
                      <div className="leaderboard-summary-metric">
                        <strong>{weeklyTopPerformer.firstPlaceCount}</strong>
                        <span>#1 spots</span>
                      </div>
                      <div className="leaderboard-summary-metric">
                        <strong>{weeklyTopPerformer.leaderboardAppearances}</strong>
                        <span>board appearances</span>
                      </div>
                      <div className="leaderboard-summary-metric">
                        <strong>{weeklyTopPerformer.bestSingleScore}</strong>
                        <span>best single score</span>
                      </div>
                    </div>
                  </>
                )}
              </article>

              <article className="card leaderboard-summary-card">
                <div className="card-menu-head">
                  <div className="leaderboard-card-head">
                    <h3>Best Department This Week</h3>
                    <p className="leaderboard-card-subtitle">Ranked by normalized Top-K player performance (fair by department size)</p>
                  </div>
                  <button
                    className="assisted-learning-info-button"
                    onClick={() => setDepartmentRankingInfoOpen((value) => !value)}
                    aria-label="Department ranking info"
                  >
                    ⓘ
                  </button>
                </div>
                {departmentRankingInfoOpen ? (
                  <div className="home-mastery-help">
                    <strong>How department ranking works:</strong>
                    <ul>
                      <li>Each game mode is normalized independently using percentile rank, so high-scoring modes do not outweigh others.</li>
                      <li>Each player gets a performance score from their top mode results.</li>
                      <li>Departments are ranked by averaging only their Top-K players, which prevents larger departments from winning by size alone.</li>
                      <li>The displayed Top N value shows how many players were used for that department&apos;s average (up to K).</li>
                    </ul>
                  </div>
                ) : null}
                {!bestWeeklyDepartment ? (
                  <p className="muted">No department data yet.</p>
                ) : (
                  <div className="leaderboard-department-list">
                    {weeklyDepartmentLeaders.slice(0, 5).map((entry, index) => (
                      <div key={`weekly-department-${entry.key}`} className="leaderboard-department-item">
                        <span className="leader-rank">#{index + 1}</span>
                        <span>{entry.agency}</span>
                        <small>
                          {entry.balancedScore} rating • Top {entry.topKUsed} avg • {entry.playerCount} player{entry.playerCount === 1 ? '' : 's'}
                        </small>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </div>

            <article className="card leaderboard-block-card">
              <div className="card-menu-head">
                <div className="leaderboard-card-head">
                  <h3>{leaderboardsScope === 'weekly' ? 'Weekly Leaderboards' : 'All-Time Leaderboards'}</h3>
                  <p className="leaderboard-card-subtitle">
                    {leaderboardsScope === 'weekly'
                      ? 'Matching and Speed Test boards by mode • resets every Monday at 12:00 AM'
                      : 'Matching and Speed Test boards by mode'}
                  </p>
                </div>
                <div className="segmented compact-segmented leaderboards-scope-switch">
                  <button
                    className={leaderboardsScope === 'weekly' ? 'seg active compact-seg' : 'seg compact-seg'}
                    onClick={() => setLeaderboardsScope('weekly')}
                  >
                    Weekly
                  </button>
                  <button
                    className={leaderboardsScope === 'alltime' ? 'seg active compact-seg' : 'seg compact-seg'}
                    onClick={() => setLeaderboardsScope('alltime')}
                  >
                    All-Time
                  </button>
                </div>
              </div>
              {visibleLeaderboardBoards.length === 0 ? (
                <p className="muted">{leaderboardsScope === 'weekly' ? 'No weekly game scores yet.' : 'No all-time game scores yet.'}</p>
              ) : (
                <div className="leaderboards-mode-explorer">
                  <div className="leaderboards-toolbar">
                    <div className="segmented compact-segmented leaderboards-game-switch">
                      <button
                        className={leaderboardViewGame === 'Matching' ? 'seg active compact-seg' : 'seg compact-seg'}
                        onClick={() => setLeaderboardViewGame('Matching')}
                      >
                        Matching
                      </button>
                      <button
                        className={leaderboardViewGame === 'Speed Test' ? 'seg active compact-seg' : 'seg compact-seg'}
                        onClick={() => setLeaderboardViewGame('Speed Test')}
                      >
                        Speed Test
                      </button>
                    </div>
                  </div>

                  <div className="leaderboards-mode-matrix">
                    {leaderboardModeMatrix.map((group) => (
                      <div key={`leaderboard-mode-group-${group.duration}`} className="leaderboards-duration-group">
                        <p className="leaderboards-duration-label">{group.duration}s</p>
                        <div className="leaderboards-duration-modes">
                          {group.modes.map(({ filter, stat }) => {
                            const isSelected = Boolean(
                              leaderboardSelectedBoard &&
                                leaderboardSelectedBoard.duration === group.duration &&
                                leaderboardSelectedBoard.filter === filter &&
                                leaderboardSelectedBoard.game === leaderboardViewGame,
                            )
                            return (
                              <button
                                key={`leaderboard-mode-${leaderboardViewGame}-${group.duration}-${filter}`}
                                type="button"
                                className={
                                  isSelected
                                    ? 'leaderboards-mode-chip leaderboards-mode-chip-active'
                                    : stat
                                      ? 'leaderboards-mode-chip'
                                      : 'leaderboards-mode-chip leaderboards-mode-chip-empty'
                                }
                                disabled={!stat}
                                onClick={() => {
                                  if (!stat) return
                                  setLeaderboardViewDuration(group.duration)
                                  setLeaderboardViewFilter(filter)
                                }}
                              >
                                <span>{leaderboardCodeSetLabel(filter)}</span>
                                <small>{stat ? `${stat.attempts} run${stat.attempts === 1 ? '' : 's'}` : 'No scores'}</small>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="leaderboards-mode-card">
                    <div className="leaderboards-mode-head">
                      <strong>{leaderboardViewGame}</strong>
                      <small>
                        {leaderboardSelectedBoard
                          ? `${leaderboardSelectedBoard.duration}s • ${leaderboardCodeSetLabel(leaderboardSelectedBoard.filter)}`
                          : 'No board selected'}
                      </small>
                    </div>
                    {leaderboardSelectedEntries.length > 0 ? (
                      <div
                        key={`leaderboard-selected-${leaderboardsScope}-${leaderboardViewGame}-${leaderboardSelectedBoard?.duration}-${leaderboardSelectedBoard?.filter}`}
                        className="leaderboards-mode-list"
                      >
                        {leaderboardSelectedEntries.map((entry, index) => (
                          <button
                            key={`leaderboard-selected-entry-${entry.id}-${index}`}
                            type="button"
                            className="leader-row leader-row-button leader-row-compact"
                            onClick={() => {
                              setSelectedLeaderboardEntry(entry)
                              setSelectedLeaderboardIsTop(index === 0)
                            }}
                          >
                            <span className="leader-rank">#{index + 1}</span>
                            <span className="leader-player">
                              <span className="leader-avatar-wrap">
                                {index === 0 ? <span className="leader-crown" aria-label="Top Player">👑</span> : null}
                                <span className={leaderAvatarFrameClass(entry.userId)}>
                                  <img src={avatarFor(entry.avatarUrl)} alt={entry.playerName} className="leader-avatar" onError={handleAvatarImageError} />
                                </span>
                              </span>
                              <LeaderboardPlayerName entry={entry} />
                            </span>
                            <span className="leader-result">
                              <strong>{entry.score} pts</strong>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="muted">No scores yet for this mode.</p>
                    )}
                  </div>
                </div>
              )}
            </article>
          </section>
        )}

        {!isProfilePage && !isStatsPage && isChatPage && currentUserId ? (
          <section className="chat-page-section">
            <div className="card chat-page-card">
              <GlobalChatWidget
                currentUserId={currentUserId}
                currentUsername={profileUsername}
                userAgency={profileDetails?.agency}
                isOwner={isOwner}
                leaderboardFirstSpotCounts={{
                  allTime: allTimeFirstSpotCountsByUser,
                  weekly: weeklyFirstSpotCountsByUser,
                }}
                mode="full"
              />
            </div>
          </section>
        ) : null}

        {!isProfilePage && !isStatsPage && isSupportPage && profile ? (
          <section className="support-section">
            <div className="card support-intro">
              <p className="eyebrow">Support LEO Study</p>
              <h2>Choose a Supporter Tier</h2>
              <p className="muted">Support helps us keep building features, question banks, and new training tools.</p>
              <p className="muted">Current tier: {tierLabel[activeProfileTier]}</p>
            </div>

            <div className="support-grid">
              <article className={tierRank(activeProfileTier) >= tierRank('tier2') ? 'card support-card tier-locked' : 'card support-card'}>
                <h3>$2 Supporter</h3>
                <ul>
                  <li>Support the project and roadmap</li>
                  <li>Supporter badge on your account</li>
                  <li>More perks planned soon</li>
                </ul>
                <button className="primary" onClick={() => startTierCheckout('tier2')} disabled={tierRank(activeProfileTier) >= tierRank('tier2')}>
                  {tierRank(activeProfileTier) >= tierRank('tier2') ? 'Included' : 'Upgrade'}
                </button>
              </article>

              <article className={tierRank(activeProfileTier) >= tierRank('tier5') ? 'card support-card tier-locked' : 'card support-card'}>
                <h3>$5 Supporter+</h3>
                <ul>
                  <li>Everything in $2 tier</li>
                  <li>Unlock all website themes</li>
                  <li>Priority access to upcoming features</li>
                  <li>More perks planned soon</li>
                </ul>
                <button className="primary" onClick={() => startTierCheckout('tier5')} disabled={tierRank(activeProfileTier) >= tierRank('tier5')}>
                  {tierRank(activeProfileTier) >= tierRank('tier5') ? 'Included' : 'Upgrade'}
                </button>
              </article>

              <article className={tierRank(activeProfileTier) >= tierRank('tier10') ? 'card support-card tier-locked' : 'card support-card'}>
                <h3>$10 Pro Supporter</h3>
                <ul>
                  <li>Everything in $2 and $5 tiers</li>
                  <li>Name customization (color, font, glow)</li>
                  <li>More perks planned soon</li>
                </ul>
                <button className="primary" onClick={() => startTierCheckout('tier10')} disabled={tierRank(activeProfileTier) >= tierRank('tier10')}>
                  {tierRank(activeProfileTier) >= tierRank('tier10') ? 'Current Tier' : 'Upgrade'}
                </button>
              </article>
            </div>
          </section>
        ) : null}

        {!isProfilePage && !isStatsPage && !isHomePage && !isSupportPage && isLibraryPage && (
          <section>
            <div className="segmented">
              {(['penal', 'hs', 'vehicle'] as CodeSet[]).map((filter) => (
                <button
                  key={filter}
                  className={libraryFilter === filter ? 'seg active' : 'seg'}
                  onClick={() => setLibraryFilter(filter)}
                >
                  {codeSetLabel[filter]}
                </button>
              ))}
            </div>
            <div className="list">
              {filteredSections.map((section) => {
                const stats = performance[performanceKey(section.codeSet, section.sectionNumber)]
                const correct = stats?.correctCount ?? 0
                const incorrect = stats?.incorrectCount ?? 0
                const attempts = correct + incorrect
                const accuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : null
                const status = mastery(stats)
                return (
                  <article key={section.id} className="section-row">
                    <div>
                      <h3>{section.sectionNumber}</h3>
                      <p>{section.title}</p>
                      <p className="section-row-meta">
                        Accuracy: {accuracy === null ? '--' : `${accuracy}%`} • Attempts: {attempts}
                      </p>
                    </div>
                    {status ? <span className={`badge ${masteryBadgeClass(status)}`}>{status}</span> : null}
                  </article>
                )
              })}
            </div>
          </section>
        )}

        {!isProfilePage && !isStatsPage && !isHomePage && !isSupportPage && isStudyHubPage && (
          <section className="study-section study-hub">
            <div className="study-actions-grid">
              <button className="card study-action-card" onClick={openStudyGuidePage}>
                <div className="study-action-icon">
                  <AppIcon name="study" className="button-icon" />
                </div>
                <div>
                  <h3>Study Guide</h3>
                  <p className="muted">Review the uploaded TMAS guides by full module or by individual learning domain.</p>
                </div>
              </button>
              <button className="card study-action-card" onClick={openStudyPracticeTestPage}>
                <div className="study-action-icon">
                  <AppIcon name="test" className="button-icon" />
                </div>
                <div>
                  <h3>Practice Test</h3>
                  <p className="muted">Run the TMAS-style scenario-based practice exam and review your LD breakdown after each attempt.</p>
                </div>
              </button>
              <button className="card study-action-card" onClick={openStudyFlashcardsPage}>
                <div className="study-action-icon">
                  <AppIcon name="flashcards" className="button-icon" />
                </div>
                <div>
                  <h3>Flashcards</h3>
                  <p className="muted">Open a full-screen flashcard session with smart ordering.</p>
                </div>
              </button>
              <button className="card study-action-card" onClick={openStudyTestPage}>
                <div className="study-action-icon">
                  <AppIcon name="test" className="button-icon" />
                </div>
                <div>
                  <h3>Test</h3>
                  <p className="muted">Build a full-screen test by subject, mode, and length.</p>
                </div>
              </button>
            </div>

            <article className="card study-focus-block">
              <div className="study-focus-head">
                <h3>What To Focus On</h3>
                <p className="muted">Average correct percentage by category.</p>
              </div>
              <div className="study-focus-grid">
                {studyNeedsSummary.map((item, index) => (
                  <div key={`study-focus-${item.codeSet}`} className="study-focus-item">
                    <span className="study-focus-rank">#{index + 1}</span>
                    <div>
                      <p className="study-focus-title">{codeSetLabel[item.codeSet]}</p>
                      <p className="study-focus-meta">
                        {item.attempts > 0
                          ? `Average correct: ${item.accuracyPercent}%`
                          : 'Average correct: --'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="card study-momentum-card">
              <div className="study-momentum-head">
                <div>
                  <h3>Study Momentum</h3>
                  <p className="muted">
                    Score trend over the last {studyInsightWindowDays} days.
                  </p>
                </div>
                <div className="segmented compact-segmented">
                  {([7, 14, 30] as const).map((days) => (
                    <button
                      key={`study-window-${days}`}
                      className={studyInsightWindowDays === days ? 'seg active compact-seg' : 'seg compact-seg'}
                      onClick={() => setStudyInsightWindowDays(days)}
                    >
                      {days}d
                    </button>
                  ))}
                </div>
              </div>
              <InteractiveTrendChart
                chartId={`study-momentum-${studyInsightWindowDays}`}
                values={studyMomentumTrendValues}
                ariaLabel="Study momentum trend"
                pointLabel="Day"
                valueSuffix=" pts"
                className="study-momentum-chart"
                emptyMessage="Complete more sessions to build your trend graph."
                describePoint={(index, total) => `Day ${index + 1} of ${total}`}
              />
              <div className="study-momentum-metrics">
                <div className="study-momentum-item">
                  <small>Current average score</small>
                  <strong>{studyHubInsights.currentAverageScore !== null ? `${studyHubInsights.currentAverageScore} pts` : '--'}</strong>
                </div>
                <div className="study-momentum-item">
                  <small>Previous average score</small>
                  <strong>{studyHubInsights.previousAverageScore !== null ? `${studyHubInsights.previousAverageScore} pts` : '--'}</strong>
                </div>
                <div className="study-momentum-item">
                  <small>Improvement</small>
                  <strong>
                    {studyHubInsights.scoreDelta === null
                      ? '--'
                      : `${studyHubInsights.scoreDelta >= 0 ? '+' : ''}${studyHubInsights.scoreDelta} pts`}
                  </strong>
                </div>
                <div className="study-momentum-item">
                  <small>Tracked attempts</small>
                  <strong>{studyHubInsights.currentAttempts}</strong>
                </div>
              </div>
            </article>

            <div className="study-insights-grid">
              <article className="card study-priority-card">
                <h3>Priority Codes</h3>
                <p className="muted">Lowest-performing codes that should be reviewed first.</p>
                <div className="study-priority-groups">
                  {(['penal', 'hs', 'vehicle'] as CodeSet[]).map((codeSet) => {
                    const list = studyHubInsights.weakBySet[codeSet]
                    return (
                      <div key={`priority-${codeSet}`} className="study-priority-group">
                        <p className="study-priority-group-title">{codeSetLabel[codeSet]}</p>
                        {list.length === 0 ? (
                          <p className="study-priority-empty">No weak codes tracked yet.</p>
                        ) : (
                          list.map((item) => (
                            <div key={`priority-${codeSet}-${item.section.id}`} className="study-priority-item">
                              <span>{item.section.sectionNumber}</span>
                              <small>{item.accuracyPercent}% • {item.attempts} attempts</small>
                            </div>
                          ))
                        )}
                      </div>
                    )
                  })}
                </div>
                <p className="study-priority-recommendation">{studyHubInsights.recommendation}</p>
              </article>

              <article className="card study-priority-card">
                <h3>Mastery Pipeline</h3>
                <p className="muted">How your tracked codes are progressing through each level.</p>
                <div className="stats-bar-list">
                  {(['Needs Work', 'Getting There', 'On Track', 'Almost Mastered', 'Mastered'] as Array<Exclude<MasteryStatus, ''>>).map((status) => {
                    const count = statsAnalytics.masteryCounts[status]
                    const tracked = statsAnalytics.totalTrackedCodes
                    const width = tracked > 0 ? Math.max(4, Math.round((count / tracked) * 100)) : 0
                    return (
                      <div
                        key={`study-mastery-${status}`}
                        className="stats-bar-row"
                        title={`${status}: ${count} code${count === 1 ? '' : 's'} (${tracked > 0 ? Math.round((count / tracked) * 100) : 0}%)`}
                      >
                        <div className="stats-bar-meta">
                          <strong>{status}</strong>
                          <small>{count} code{count === 1 ? '' : 's'}</small>
                        </div>
                        <div className="stats-bar-track">
                          <div className={`stats-bar-fill stats-bar-fill-${status.toLowerCase().replace(/\s+/g, '-')}`} style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="study-momentum-metrics">
                  <div className="study-momentum-item">
                    <small>Mastered rate</small>
                    <strong>{studyHubInsights.masteryRatePercent}%</strong>
                  </div>
                  <div className="study-momentum-item">
                    <small>Getting there+</small>
                    <strong>{studyHubInsights.progressRatePercent}%</strong>
                  </div>
                  <div className="study-momentum-item">
                    <small>Codes tracked</small>
                    <strong>{statsAnalytics.totalTrackedCodes}</strong>
                  </div>
                </div>
              </article>
            </div>
          </section>
        )}

        {isStudyGuidePage ? (
          <StudyGuidePage
            onOpenFlashcards={openStudyFlashcardsPage}
            onOpenTest={openStudyTestPage}
            onStudyActivity={() => markStudyActivity('study_guide')}
          />
        ) : null}

        {isStudyPracticeTestPage ? (
          <StudyPracticeTestPage
            onStudyActivity={() => markStudyActivity('study_practice')}
          />
        ) : null}

        {isStudyFlashcardsPage ? (
          <section className="study-session-page">
            <div className="study-session-shell study-session-shell-page">
              <div className={`study-session-top study-session-top-compact study-session-top-rich ${studyFlashSessionOpen ? 'study-session-top-flash-open' : ''}`}>
                <div className="study-session-top-copy">
                  <strong>{studyFlashSessionOpen ? 'Flashcards Session' : 'Flashcards Setup'}</strong>
                  <small>
                    {studyFlashSessionOpen
                      ? `${studyFlashSessionFilter === 'all' ? 'All Codes' : codeSetLabel[studyFlashSessionFilter]} • ${orderedStudyFlashSessionCards.length > 0 ? studyFlashSessionIndex + 1 : 0}/${orderedStudyFlashSessionCards.length}`
                      : `${studyFlashSelectionCount} cards available • ${(studyFlashFilter === 'all' ? 'All Codes' : codeSetLabel[studyFlashFilter])}`}
                  </small>
                </div>
                {studyFlashSessionOpen ? (
                  <button
                    className="secondary study-session-exit-btn"
                    onClick={() => {
                      setStudyFlashSessionOpen(false)
                      setStudyFlashSessionFlipped(false)
                      navigate('/study')
                    }}
                  >
                    Exit
                  </button>
                ) : (
                  <div className="study-session-top-actions study-session-top-actions-centered">
                    <button className="primary study-session-top-action study-session-top-action-start" onClick={beginStudyFlashcards} disabled={studyFlashSelectionCount === 0}>
                      Start Flashcards
                    </button>
                  </div>
                )}
              </div>
              {!studyFlashSessionOpen ? (
                <article className="card study-priority-card study-setup-card study-setup-card-rich">
                  <h3>Choose flashcard set</h3>
                  <label className="game-control">
                    Subject
                    <div className="segmented">
                      {(['all', 'penal', 'hs', 'vehicle'] as CodeFilter[]).map((filter) => (
                        <button
                          key={`study-flash-filter-page-${filter}`}
                          className={studyFlashFilter === filter ? 'seg active' : 'seg'}
                          onClick={() => setStudyFlashFilter(filter)}
                        >
                          {filter === 'all' ? 'All' : codeSetLabel[filter]}
                        </button>
                      ))}
                    </div>
                  </label>
                  <div className="study-momentum-metrics">
                    <div className="study-momentum-item">
                      <small>Cards available</small>
                      <strong>{flashcardSetupInsights.totalCards}</strong>
                    </div>
                    <div className="study-momentum-item">
                      <small>Cards tracked</small>
                      <strong>{flashcardSetupInsights.trackedCards}</strong>
                    </div>
                    <div className="study-momentum-item">
                      <small>Average accuracy</small>
                      <strong>{flashcardSetupInsights.averageAccuracyPercent === null ? '--' : `${flashcardSetupInsights.averageAccuracyPercent}%`}</strong>
                    </div>
                    <div className="study-momentum-item">
                      <small>Total attempts</small>
                      <strong>{flashcardSetupInsights.totalAttempts}</strong>
                    </div>
                  </div>
                  <div className="study-setup-divider" />
                  <div className="study-setup-focus">
                    <h3>What to focus on</h3>
                    <p className="muted">Flashcards with lowest accuracy are listed first.</p>
                    {flashcardSetupInsights.topFocus.length === 0 ? (
                      <p className="study-priority-empty">No flashcard attempts yet. Run a few rounds and this list will personalize.</p>
                    ) : (
                      <div className="study-priority-groups">
                        <div className="study-priority-group">
                          {flashcardSetupInsights.topFocus.map((item) => (
                            <div key={`flash-priority-${item.section.id}`} className="study-priority-item">
                              <span>{item.section.sectionNumber} · {shortText(item.section.title, 34)}</span>
                              <small>{item.accuracyPercent}% • {item.attempts} attempts</small>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="study-priority-recommendation">{flashcardSetupInsights.recommendation}</p>
                  </div>
                </article>
              ) : orderedStudyFlashSessionCards.length === 0 ? (
                <div className="card study-session-empty">
                  <p>No flashcards found for this selection.</p>
                </div>
              ) : (
                <>
                  <button
                    tabIndex={0}
                    className="study-session-flashcard"
                    onClick={(e) => {
                      e.stopPropagation()
                      markStudyActivity('flashcards')
                      setStudyFlashSessionFlipped((value) => !value)
                    }}
                  >
                    <div className={studyFlashSessionFlipped ? 'study-session-flashcard-inner flipped' : 'study-session-flashcard-inner'}>
                      <div className="study-session-face study-session-face-front">{orderedStudyFlashSessionCards[studyFlashSessionIndex]?.front}</div>
                      <div className="study-session-face study-session-face-back">{orderedStudyFlashSessionCards[studyFlashSessionIndex]?.back}</div>
                    </div>
                  </button>
                  <div className="study-session-actions">
                    <button
                      className="secondary study-session-nav"
                      onClick={() => {
                        markStudyActivity('flashcards')
                        setStudyFlashSessionFlipped(false)
                        setStudyFlashSessionIndex((current) => {
                          if (orderedStudyFlashSessionCards.length === 0) return 0
                          return current === 0 ? orderedStudyFlashSessionCards.length - 1 : current - 1
                        })
                        incrementUserStats((stats) => ({ ...stats, flashcardsReviewed: stats.flashcardsReviewed + 1 }), true)
                      }}
                    >
                      Previous
                    </button>
                    <button className="secondary study-session-nav" onClick={() => {
                      markStudyActivity('flashcards')
                      setStudyFlashSessionFlipped((value) => !value)
                    }}>
                      Flip
                    </button>
                    <button
                      className="primary study-session-nav"
                      onClick={() => {
                        markStudyActivity('flashcards')
                        setStudyFlashSessionFlipped(false)
                        setStudyFlashSessionIndex((current) => {
                          if (orderedStudyFlashSessionCards.length === 0) return 0
                          if (current < orderedStudyFlashSessionCards.length - 1) return current + 1
                          const lastCardId = orderedStudyFlashSessionCards[current]?.id
                          const reshuffled = shuffle(studyFlashSessionCards.map((card) => card.id))
                          if (reshuffled.length > 1 && reshuffled[0] === lastCardId) {
                            ;[reshuffled[0], reshuffled[1]] = [reshuffled[1], reshuffled[0]]
                          }
                          setStudyFlashSessionOrder(reshuffled)
                          return 0
                        })
                        incrementUserStats((stats) => ({ ...stats, flashcardsReviewed: stats.flashcardsReviewed + 1 }), true)
                      }}
                    >
                      Next
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
        ) : null}

        {isStudyTestPage ? (
          <section className="study-session-page">
            <div className="study-session-shell study-session-shell-page study-test-shell">
              <div className="study-session-top study-session-top-compact study-session-top-rich">
                <div className="study-session-top-copy">
                  <strong>{studyTestSessionOpen ? 'Study Test Session' : 'Test Setup'}</strong>
                  <small>
                    {studyTestSessionOpen
                      ? `${studyTestSessionFilter === 'all' ? 'All Codes' : codeSetLabel[studyTestSessionFilter]} • ${studyTestSessionAnswered}/${studyTestSessionTotal}`
                      : `${studyTestSelectionCount} source questions • ${studyTestQuestionCount} target`}
                  </small>
                </div>
                {!studyTestSessionOpen ? (
                  <div className="study-session-top-actions study-session-top-actions-centered">
                    <button className="primary study-session-top-action study-session-top-action-start" onClick={beginStudyTest} disabled={studyTestSelectionCount === 0}>
                      Start Test
                    </button>
                  </div>
                ) : null}
              </div>

              {!studyTestSessionOpen ? (
                <article className="card study-priority-card study-setup-card study-setup-card-rich">
                  <h3>Build your test</h3>
                  <label className="game-control">
                    Subject
                    <div className="segmented">
                      {(['all', 'penal', 'hs', 'vehicle'] as CodeFilter[]).map((filter) => (
                        <button
                          key={`study-test-filter-page-${filter}`}
                          className={studyTestFilter === filter ? 'seg active' : 'seg'}
                          onClick={() => setStudyTestFilter(filter)}
                        >
                          {filter === 'all' ? 'All' : codeSetLabel[filter]}
                        </button>
                      ))}
                    </div>
                  </label>
                  <label className="game-control">
                    Focus Level
                    <div className="segmented">
                      {(
                        [
                          { value: 'balanced', label: 'Balanced' },
                          { value: 'needs_work', label: 'Needs Work' },
                          { value: 'most_needs_work', label: 'Most Wrong' },
                        ] as Array<{ value: StudyWrongness; label: string }>
                      ).map((option) => (
                        <button
                          key={`study-test-wrongness-page-${option.value}`}
                          className={studyTestWrongness === option.value ? 'seg active' : 'seg'}
                          onClick={() => setStudyTestWrongness(option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </label>
                  <label className="game-control">
                    Answer Type
                    <div className="segmented">
                      {(
                        [
                          { value: 'multiple', label: 'Multiple Choice' },
                          { value: 'truefalse', label: 'True / False' },
                        ] as Array<{ value: StudyAnswerMode; label: string }>
                      ).map((option) => (
                        <button
                          key={`study-test-answer-mode-page-${option.value}`}
                          className={studyTestAnswerMode === option.value ? 'seg active' : 'seg'}
                          onClick={() => setStudyTestAnswerMode(option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </label>
                  <label className="game-control">
                    Question Count
                    <div className="segmented">
                      {[20, 30, 50, 100].map((size) => (
                        <button
                          key={`study-test-count-page-${size}`}
                          className={studyTestQuestionCount === size ? 'seg active' : 'seg'}
                          onClick={() => setStudyTestQuestionCount(size)}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </label>
                  <div className="study-momentum-metrics">
                    <div className="study-momentum-item">
                      <small>Questions available</small>
                      <strong>{studyTestSelectionCount}</strong>
                    </div>
                    <div className="study-momentum-item">
                      <small>Tracked codes</small>
                      <strong>{algorithmInsights.trackedCodes}</strong>
                    </div>
                    <div className="study-momentum-item">
                      <small>Average accuracy</small>
                      <strong>{Math.round(algorithmInsights.averageAccuracy * 100)}%</strong>
                    </div>
                  </div>
                </article>
              ) : !studyTestSessionDone && currentQuestion ? (
                <div className="quiz-wrap study-test-quiz-wrap">
                  <div
                    className={`quiz-fire-host level-${fireLevel}`}
                    ref={(node) => {
                      quizFireHostRef.current = node
                      if (!node) return
                      const width = Math.floor(node.getBoundingClientRect().width)
                      if (width > 0 && width !== quizFireWidth) setQuizFireWidth(width)
                    }}
                    aria-hidden
                  >
                    {fireOption ? (
                      <FireFlame key={`quiz-fire-${fireLevel}-${quizFireWidth}`} option={fireOption} />
                    ) : (
                      <div className="quiz-fire-anchor-line" />
                    )}
                    {fireLevel > 0 ? (
                      <div className="quiz-fire-particles">
                        {fireParticles.map((particle) => (
                          <span
                            key={`quiz-fire-particle-${particle.id}`}
                            className="quiz-fire-particle"
                            style={{
                              left: particle.left,
                              width: `${particle.size}px`,
                              height: `${Math.round(particle.size * 1.5)}px`,
                              animationDelay: particle.delay,
                              animationDuration: particle.duration,
                              ['--particle-drift' as string]: particle.drift,
                            }}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {fireLevel > 0 ? <div className="quiz-fire-line-glow" aria-hidden /> : null}

                  <div className="card quiz-card study-test-card">
                    <div className="quiz-top">
                      <span>Best: {bestStreak}</span>
                      <span>Streak: {streak}</span>
                    </div>
                    <h3>{currentQuestion.prompt}</h3>
                    <div className="choices">
                      <span className="choice-hint">Press 1–4 to answer</span>
                      {currentQuestion.choices.map((choice, index) => {
                        const chosen = selectedChoice === index
                        const correct = selectedChoice !== null && index === currentQuestion.correctIndex
                        return (
                          <button
                            key={`${choice}-${index}`}
                            className={`choice ${chosen ? 'choice-selected' : ''} ${correct ? 'choice-correct' : ''}`}
                            onClick={() => answerQuestion(index)}
                          >
                            <span className="choice-key">{index + 1}</span>
                            {choice}
                          </button>
                        )
                      })}
                    </div>
                    {selectedChoice !== null ? (
                      <>
                        <p className={feedback.startsWith('Correct') ? 'good' : 'bad'}>{feedback}</p>
                        <p className="muted">{currentQuestion.explanation}</p>
                        <button ref={quizNextRef} className="primary" onClick={advanceStudyTestQuestion}>
                          Next Question
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {studyTestSessionDone ? (
                studyTestReport ? (
                  <div className="study-test-complete study-test-complete-single">
                    <SessionPerformanceReportCard report={studyTestReport} />
                    <div className="actions-row study-test-complete-actions">
                      <button className="primary" onClick={beginStudyTest}>Retake Test</button>
                    </div>
                  </div>
                ) : (
                  <div className="card study-test-complete">
                    <h3>Test Complete</h3>
                    <p className="muted">
                      Score: {studyTestSessionCorrect}/{studyTestSessionTotal} ({studyTestSessionTotal > 0 ? Math.round((studyTestSessionCorrect / studyTestSessionTotal) * 100) : 0}%)
                    </p>
                    <div className="actions-row">
                      <button className="primary" onClick={beginStudyTest}>Retake Test</button>
                    </div>
                  </div>
                )
              ) : null}
            </div>
          </section>
        ) : null}

        {!isProfilePage && !isStatsPage && !isHomePage && !isSupportPage && isGamesPage && (
          <section className="games-section">
            {isGamesHubPage ? (
              <>
                <div className="games-hub-grid">
                  <button
                    type="button"
                    className="card compact game-mode-card games-hub-game-card"
                    onClick={() => {
                      navigate('/games/matching')
                    }}
                  >
                    <span className="game-mode-title"><AppIcon name="games" className="button-icon" /> Matching</span>
                    <span className="muted tiny">Match code sections fast</span>
                  </button>
                  <button
                    type="button"
                    className="card compact game-mode-card games-hub-game-card"
                    onClick={() => {
                      navigate('/games/speed')
                    }}
                  >
                    <span className="game-mode-title"><AppIcon name="study" className="button-icon" /> Speed Test</span>
                    <span className="muted tiny">Answer as many as possible</span>
                  </button>
                  <button
                    type="button"
                    className="card compact game-mode-card games-hub-game-card"
                    onClick={() => {
                      navigate('/games/duel')
                    }}
                  >
                    <span className="game-mode-title"><AppIcon name="duel" className="button-icon" /> 1v1</span>
                    <span className="muted tiny">Realtime head-to-head</span>
                  </button>
                </div>

                <div className="card games-hub-filter-card">
                  <div className="game-leaderboard-filters">
                    <div className="game-filter-group">
                      <span className="game-filter-label">Time</span>
                      <div className="segmented compact-segmented">
                        {[15, 30, 60].map((duration) => (
                          <button
                            key={`hub-leader-time-${duration}`}
                            className={gamesSelection.duration === duration ? 'seg active compact-seg' : 'seg compact-seg'}
                            onClick={() => setGamesSelection((prev) => ({ ...prev, duration: duration as HomeDurationFilter }))}
                          >
                            {duration}s
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="game-filter-group">
                      <span className="game-filter-label">Code Set</span>
                      <div className="segmented compact-segmented">
                        {(['all', 'penal', 'hs', 'vehicle'] as CodeFilter[]).map((filter) => (
                          <button
                            key={`hub-leader-filter-${filter}`}
                            className={gamesSelection.filter === filter ? 'seg active compact-seg' : 'seg compact-seg'}
                            onClick={() => setGamesSelection((prev) => ({ ...prev, filter }))}
                          >
                            {filter === 'all' ? 'All' : codeSetLabel[filter]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="games-hub-leaderboards">
                  <article className="card leaderboard-card game-leader-panel">
                    {leaderboardError ? <p className="bad">{leaderboardError}</p> : null}
                    <div className="leaderboard-card-head">
                      <h3>Matching Leaderboard</h3>
                      <p className="leaderboard-card-subtitle">Top scores for the selected mode</p>
                    </div>
                    {matchingLeaderboard.length === 0 ? (
                      <p className="muted">No matching scores submitted yet.</p>
                    ) : (
                      matchingLeaderboard.map((entry, index) => (
                        <button
                          key={`hub-matching-${entry.id}`}
                          type="button"
                          className="leader-row leader-row-button game-leader-row leader-row-rich"
                          onClick={() => {
                            setSelectedLeaderboardEntry(entry)
                            setSelectedLeaderboardIsTop(index === 0)
                          }}
                        >
                          <span className="leader-rank">#{index + 1}</span>
                          <span className="leader-player">
                            <span className="leader-avatar-wrap">
                              {index === 0 ? <span className="leader-crown" aria-label="Top Player">👑</span> : null}
                              <span className={leaderAvatarFrameClass(entry.userId)}>
                                <img src={avatarFor(entry.avatarUrl)} alt={entry.playerName} className="leader-avatar" onError={handleAvatarImageError} />
                              </span>
                            </span>
                            <LeaderboardPlayerName entry={entry} />
                          </span>
                          <span className="leader-result">
                            <small>{entry.matchDuration}s • {leaderboardCodeSetLabel(entry.matchFilter)}</small>
                            <strong>{entry.score} pts</strong>
                          </span>
                        </button>
                      ))
                    )}
                  </article>

                  <article className="card leaderboard-card game-leader-panel">
                    {leaderboardError ? <p className="bad">{leaderboardError}</p> : null}
                    <div className="leaderboard-card-head">
                      <h3>Speed Test Leaderboard</h3>
                      <p className="leaderboard-card-subtitle">Top scores for the selected mode</p>
                    </div>
                    {speedLeaderboard.length === 0 ? (
                      <p className="muted">No speed test scores submitted yet.</p>
                    ) : (
                      speedLeaderboard.map((entry, index) => (
                        <button
                          key={`hub-speed-${entry.id}`}
                          type="button"
                          className="leader-row leader-row-button game-leader-row leader-row-rich"
                          onClick={() => {
                            setSelectedLeaderboardEntry(entry)
                            setSelectedLeaderboardIsTop(index === 0)
                          }}
                        >
                          <span className="leader-rank">#{index + 1}</span>
                          <span className="leader-player">
                            <span className="leader-avatar-wrap">
                              {index === 0 ? <span className="leader-crown" aria-label="Top Player">👑</span> : null}
                              <span className={leaderAvatarFrameClass(entry.userId)}>
                                <img src={avatarFor(entry.avatarUrl)} alt={entry.playerName} className="leader-avatar" onError={handleAvatarImageError} />
                              </span>
                            </span>
                            <LeaderboardPlayerName entry={entry} />
                          </span>
                          <span className="leader-result">
                            <small>{entry.matchDuration}s • {leaderboardCodeSetLabel(entry.matchFilter)}</small>
                            <strong>{entry.score} pts</strong>
                          </span>
                        </button>
                      ))
                    )}
                  </article>

                  <article className="card leaderboard-card game-leader-panel">
                    <div className="leaderboard-card-head">
                      <h3>1v1 Leaderboard</h3>
                      <p className="leaderboard-card-subtitle">Most wins and current streaks</p>
                    </div>
                    {duelHubLeaderboard.length === 0 ? (
                      <p className="muted">No 1v1 records yet. Play a duel to get ranked.</p>
                    ) : (
                      duelHubLeaderboard.map((entry, index) => (
                        <button
                          key={`hub-duel-${entry.userId}-${index}`}
                          type="button"
                          className="leader-row leader-row-button game-leader-row leader-row-rich"
                          onClick={() => {
                            setSelectedLeaderboardEntry(entry)
                            setSelectedLeaderboardIsTop(index === 0)
                          }}
                        >
                          <span className="leader-rank">#{index + 1}</span>
                          <span className="leader-player">
                            <span className="leader-avatar-wrap">
                              {index === 0 ? <span className="leader-crown" aria-label="Top Player">👑</span> : null}
                              <span className={leaderAvatarFrameClass(entry.userId)}>
                                <img src={avatarFor(entry.avatarUrl)} alt={entry.playerName} className="leader-avatar" onError={handleAvatarImageError} />
                              </span>
                            </span>
                            <LeaderboardPlayerName entry={entry} />
                          </span>
                          <span className="leader-result">
                            <small>{entry.duelCurrentWinStreak > 0 ? `🔥 ${entry.duelCurrentWinStreak} streak` : 'No active streak'}</small>
                            <strong>{entry.duelWins}-{entry.duelLosses}</strong>
                          </span>
                        </button>
                      ))
                    )}
                  </article>
                </div>
              </>
            ) : null}

            {isGamesMatchingPage ? (
              <>
            <h2>Matching</h2>
            {!matchRunning && !matchDone ? (
              <div className="games-mode-layout">
                <div className="card leaderboard-card game-leader-panel">
                  {leaderboardError ? <p className="bad">{leaderboardError}</p> : null}
                  <div className="leaderboard-card-head leaderboard-card-head-split">
                    <div>
                      <h3>Matching Leaderboard</h3>
                      <p className="leaderboard-card-subtitle">
                        {gameModeLeaderboardsScope === 'weekly'
                          ? 'Top weekly scores for the selected mode'
                          : 'Top all-time scores for the selected mode'}
                      </p>
                    </div>
                    <div className="segmented compact-segmented game-mode-scope-switch">
                      <button
                        className={gameModeLeaderboardsScope === 'weekly' ? 'seg active compact-seg' : 'seg compact-seg'}
                        onClick={() => setGameModeLeaderboardsScope('weekly')}
                      >
                        Weekly
                      </button>
                      <button
                        className={gameModeLeaderboardsScope === 'alltime' ? 'seg active compact-seg' : 'seg compact-seg'}
                        onClick={() => setGameModeLeaderboardsScope('alltime')}
                      >
                        All Time
                      </button>
                    </div>
                  </div>
                  <div className="game-leaderboard-filters">
                    <div className="game-filter-group">
                      <span className="game-filter-label">Time</span>
                      <div className="segmented compact-segmented">
                        {[15, 30, 60].map((duration) => (
                          <button
                            key={duration}
                            className={gamesSelection.duration === duration ? 'seg active compact-seg' : 'seg compact-seg'}
                            onClick={() => setGamesSelection((prev) => ({ ...prev, duration: duration as HomeDurationFilter }))}
                          >
                            {duration}s
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="game-filter-group">
                      <span className="game-filter-label">Code Set</span>
                      <div className="segmented compact-segmented">
                        {(['all', 'penal', 'hs', 'vehicle'] as CodeFilter[]).map((filter) => (
                          <button
                            key={filter}
                            className={gamesSelection.filter === filter ? 'seg active compact-seg' : 'seg compact-seg'}
                            onClick={() => setGamesSelection((prev) => ({ ...prev, filter }))}
                          >
                            {filter === 'all' ? 'All' : codeSetLabel[filter]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  {matchingModeLeaderboard.length === 0 ? (
                    <p className="muted">
                      {gameModeLeaderboardsScope === 'weekly'
                        ? 'No weekly scores submitted yet.'
                        : 'No all-time scores submitted yet.'}
                    </p>
                  ) : (
                    matchingModeLeaderboard.map((entry, index) => (
                      <button
                        key={entry.id}
                        type="button"
                        className="leader-row leader-row-button game-leader-row leader-row-rich"
                        onClick={() => {
                          setSelectedLeaderboardEntry(entry)
                          setSelectedLeaderboardIsTop(index === 0)
                        }}
                      >
                        <span className="leader-rank">#{index + 1}</span>
                        <span className="leader-player">
                          <span className="leader-avatar-wrap">
                            {index === 0 ? <span className="leader-crown" aria-label="Top Player">👑</span> : null}
                            <span className={leaderAvatarFrameClass(entry.userId)}>
                              <img src={avatarFor(entry.avatarUrl)} alt={entry.playerName} className="leader-avatar" onError={handleAvatarImageError} />
                            </span>
                          </span>
                          <LeaderboardPlayerName entry={entry} />
                        </span>
                        <span className="leader-result">
                          <small>{entry.matchDuration}s • {leaderboardCodeSetLabel(entry.matchFilter)}</small>
                          <strong>{entry.score} pts</strong>
                        </span>
                      </button>
                    ))
                  )}
                </div>

                <GameStartInsightsPanel
                  title="Matching"
                  icon="games"
                  startLabel="Start Matching"
                  onStart={() => setShowMatchSetupModal(true)}
                  duration={gamesSelection.duration}
                  filter={gamesSelection.filter}
                  sessionTrack={matchingSessionTrack}
                  focusTips={matchingFocusTips}
                  codeSetBreakdown={gameCodeSetBreakdown}
                />
              </div>
            ) : null}

            {(matchRunning || matchDone) ? (
              <div className="match-session-overlay">
                <div
                  className={[
                    'match-session-shell',
                    matchRunning ? 'match-session-shell-running' : '',
                    matchDone && !matchRunning ? 'match-session-shell-done' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {matchRunning ? (
                    <>
                  <div className="match-session-top">
                    <span>Time: {matchRemaining}s</span>
                    <span>Round: {matchRound}</span>
                    <span>Score: {matchScore}</span>
                  </div>
                  <div className="match-session-controls">
                    <button
                      className="secondary match-exit-button"
                      onClick={() => {
                        const confirmed = window.confirm('Exit current matching game? This round will end.')
                        if (confirmed) exitMatchingSession()
                      }}
                    >
                      Exit Match
                    </button>
                  </div>
                    </>
                  ) : null}
                  {matchRunning ? (
                    <div className="match-grid match-grid-session">
                      {matchCards.map((card) => {
                        const selected = selectedCards.includes(card.id)
                        const matched = matchedPairIds.includes(card.pairId)
                        return (
                          <button
                            key={card.id}
                            className={`match-card ${selected ? 'match-selected' : ''} ${matched ? 'match-done' : ''} ${wrongCardIds.includes(card.id) ? 'match-wrong' : ''}`}
                            disabled={matched || (!selected && selectedCards.length >= 2)}
                            onClick={() => {
                              markStudyActivity('matching')
                              handleMatchCardSelect(card.id)
                            }}
                          >
                            <small>{card.kind === 'code' ? 'Penal code' : 'Definition'}</small>
                            <strong>{card.text}</strong>
                          </button>
                        )
                      })}
                    </div>
                  ) : null}
                  {matchDone && !matchRunning ? (
                    <div className="card session-card">
                      <h3>Session Complete</h3>
                      <div className="match-session-top match-session-top-finished">
                        <span>Time: {matchRemaining}s</span>
                        <span>Round: {matchRound}</span>
                        <span>Score: {matchScore}</span>
                      </div>
                      {matchingReport ? <SessionPerformanceReportCard report={matchingReport} /> : (
                        <>
                          <p>Your score: {matchScore}</p>
                          <p>High score: {Math.max(highScores.matching, matchScore)}</p>
                          <p>Round reached: {matchRound}</p>
                        </>
                      )}
                      <div className="actions-row">
                        <button className="primary" onClick={startMatching}>
                          Retry
                        </button>
                        <button className="secondary" onClick={exitMatchingSession}>
                          Exit
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
              </>
            ) : null}

            {isGamesSpeedPage ? (
              <>
            <h2>Speed Test</h2>
            {!speedRunning && !speedDone ? (
              <div className="games-mode-layout">
                <div className="card leaderboard-card game-leader-panel">
                  {leaderboardError ? <p className="bad">{leaderboardError}</p> : null}
                  <div className="leaderboard-card-head leaderboard-card-head-split">
                    <div>
                      <h3>Speed Test Leaderboard</h3>
                      <p className="leaderboard-card-subtitle">
                        {gameModeLeaderboardsScope === 'weekly'
                          ? 'Top weekly scores for the selected mode'
                          : 'Top all-time scores for the selected mode'}
                      </p>
                    </div>
                    <div className="segmented compact-segmented game-mode-scope-switch">
                      <button
                        className={gameModeLeaderboardsScope === 'weekly' ? 'seg active compact-seg' : 'seg compact-seg'}
                        onClick={() => setGameModeLeaderboardsScope('weekly')}
                      >
                        Weekly
                      </button>
                      <button
                        className={gameModeLeaderboardsScope === 'alltime' ? 'seg active compact-seg' : 'seg compact-seg'}
                        onClick={() => setGameModeLeaderboardsScope('alltime')}
                      >
                        All Time
                      </button>
                    </div>
                  </div>
                  <div className="game-leaderboard-filters">
                    <div className="game-filter-group">
                      <span className="game-filter-label">Time</span>
                      <div className="segmented compact-segmented">
                        {[15, 30, 60].map((duration) => (
                          <button
                            key={`speed-leader-time-${duration}`}
                            className={gamesSelection.duration === duration ? 'seg active compact-seg' : 'seg compact-seg'}
                            onClick={() => setGamesSelection((prev) => ({ ...prev, duration: duration as HomeDurationFilter }))}
                          >
                            {duration}s
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="game-filter-group">
                      <span className="game-filter-label">Code Set</span>
                      <div className="segmented compact-segmented">
                        {(['all', 'penal', 'hs', 'vehicle'] as CodeFilter[]).map((filter) => (
                          <button
                            key={`speed-leader-filter-${filter}`}
                            className={gamesSelection.filter === filter ? 'seg active compact-seg' : 'seg compact-seg'}
                            onClick={() => setGamesSelection((prev) => ({ ...prev, filter }))}
                          >
                            {filter === 'all' ? 'All' : codeSetLabel[filter]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  {speedModeLeaderboard.length === 0 ? (
                    <p className="muted">
                      {gameModeLeaderboardsScope === 'weekly'
                        ? 'No weekly speed test scores submitted yet.'
                        : 'No all-time speed test scores submitted yet.'}
                    </p>
                  ) : (
                    speedModeLeaderboard.map((entry, index) => (
                      <button
                        key={`speed-${entry.id}`}
                        type="button"
                        className="leader-row leader-row-button game-leader-row leader-row-rich"
                        onClick={() => {
                          setSelectedLeaderboardEntry(entry)
                          setSelectedLeaderboardIsTop(index === 0)
                        }}
                      >
                        <span className="leader-rank">#{index + 1}</span>
                        <span className="leader-player">
                          <span className="leader-avatar-wrap">
                            {index === 0 ? <span className="leader-crown" aria-label="Top Player">👑</span> : null}
                            <span className={leaderAvatarFrameClass(entry.userId)}>
                              <img src={avatarFor(entry.avatarUrl)} alt={entry.playerName} className="leader-avatar" onError={handleAvatarImageError} />
                            </span>
                          </span>
                          <LeaderboardPlayerName entry={entry} />
                        </span>
                        <span className="leader-result">
                          <small>{entry.matchDuration}s • {leaderboardCodeSetLabel(entry.matchFilter)}</small>
                          <strong>{entry.score} pts</strong>
                        </span>
                      </button>
                    ))
                  )}
                </div>

                <GameStartInsightsPanel
                  title="Speed Test"
                  icon="study"
                  startLabel="Start Speed Test"
                  disabled={speedQuestionBank.length === 0}
                  disabledHint={speedQuestionBank.length === 0 ? 'No speed test questions loaded.' : null}
                  onStart={() => setShowSpeedSetupModal(true)}
                  duration={gamesSelection.duration}
                  filter={gamesSelection.filter}
                  sessionTrack={speedSessionTrack}
                  focusTips={speedFocusTips}
                  codeSetBreakdown={gameCodeSetBreakdown}
                />
              </div>
            ) : null}

            {(speedRunning || speedDone) ? (
              <div className="speed-session-overlay">
                <div className={speedDone && !speedRunning ? 'speed-session-shell speed-session-shell-done' : 'speed-session-shell'}>
                  {speedRunning ? (
                    <>
                      <div className="speed-session-controls">
                        <button
                          className="secondary speed-exit-button"
                          onClick={() => {
                            const confirmed = window.confirm('Exit current speed test? This session will end.')
                            if (confirmed) exitSpeedSession()
                          }}
                        >
                          Exit Test
                        </button>
                      </div>
                      <div className="speed-session-top">
                        <span>Time: {speedRemaining}s</span>
                        <span>Score: {speedScore}</span>
                        <span>Answered: {speedAnsweredCount}</span>
                      </div>
                    </>
                  ) : null}
                  {speedRunning && speedCurrentQuestion ? (
                    <div className="card quiz-card speed-session-card" data-remaining-questions={speedDeck.length}>
                      <h3>{speedCurrentQuestion.prompt}</h3>
                      <div className="choices">
                        <span className="choice-hint">Press 1–4 to answer</span>
                        {speedCurrentQuestion.choices.map((choice, index) => (
                          <button
                            key={`speed-choice-${speedCurrentQuestion.id}-${index}`}
                            className="choice"
                            onClick={() => answerSpeedQuestion(index)}
                            disabled={speedAnswerLocked}
                          >
                            <span className="choice-key">{index + 1}</span>
                            {choice}
                          </button>
                        ))}
                      </div>
                      {speedFeedback ? <p className={speedFeedback.startsWith('Correct') ? 'good' : 'bad'}>{speedFeedback}</p> : null}
                    </div>
                  ) : null}

                  {speedDone && !speedRunning ? (
                    <div className="card session-card">
                      <h3>Session Complete</h3>
                      <div className="speed-session-top speed-session-top-finished">
                        <span>Time: {speedRemaining}s</span>
                        <span>Score: {speedScore}</span>
                        <span>Answered: {speedAnsweredCount}</span>
                      </div>
                      {speedReport ? <SessionPerformanceReportCard report={speedReport} /> : (
                        <>
                          <p>Your score: {speedScore}</p>
                          <p>Questions answered: {speedAnsweredCount}</p>
                        </>
                      )}
                      <div className="actions-row">
                        <button className="primary" onClick={startSpeedTest}>Replay</button>
                        <button className="secondary" onClick={exitSpeedSession}>Exit</button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
              </>
            ) : null}

            {isGamesDuelPage ? (
              <OneVsOnePanel
                currentUserId={currentUserId}
                currentUsername={profile?.username || currentUserEmail || 'You'}
                isOwner={isOwner}
                externalJoinRoomId={duelInviteJoinRoomId}
                onExternalJoinHandled={() => setDuelInviteJoinRoomId(null)}
                onStudyActivity={() => markStudyActivity('duel')}
              />
            ) : null}
          </section>
        )}

        {!isProfilePage && !isStatsPage && !isHomePage && !isSupportPage && isScenariosPage && (
          <section className="scenario-section">
            <div className="card compact scenario-section-switcher">
              <div className="segmented compact-segmented">
                <button
                  className={scenarioTrainingSection === 'tmas1' ? 'seg active' : 'seg'}
                  onClick={() => setScenarioTrainingSection('tmas1')}
                >
                  TMAS 1
                </button>
                <button
                  className={scenarioTrainingSection === 'tmas2' ? 'seg active' : 'seg'}
                  onClick={() => setScenarioTrainingSection('tmas2')}
                >
                  TMAS 2
                </button>
              </div>
              <p className="muted scenario-section-meta">
                {activeScenarioSectionStats.scenarios} scenarios • {activeScenarioSectionStats.questions} questions
              </p>
            </div>
            <div className="quiz-wrap">
              <div
                className={`quiz-fire-host level-${scenarioFireLevel}`}
                ref={(node) => {
                  scenarioFireHostRef.current = node
                  if (!node) return
                  const width = Math.floor(node.getBoundingClientRect().width)
                  if (width > 0 && width !== scenarioFireWidth) setScenarioFireWidth(width)
                }}
                aria-hidden
              >
                {scenarioFireOption ? (
                  <FireFlame key={`scenario-fire-${scenarioFireLevel}-${scenarioFireWidth || quizFireWidth}`} option={scenarioFireOption} />
                ) : (
                  <div className="quiz-fire-anchor-line" />
                )}
                {scenarioFireLevel > 0 ? (
                  <div className="quiz-fire-particles">
                    {scenarioFireParticles.map((particle) => (
                      <span
                        key={`scenario-fire-particle-${particle.id}`}
                        className="quiz-fire-particle"
                        style={{
                          left: particle.left,
                          width: `${particle.size}px`,
                          height: `${Math.round(particle.size * 1.5)}px`,
                          animationDelay: particle.delay,
                          animationDuration: particle.duration,
                          ['--particle-drift' as string]: particle.drift,
                        }}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
              {scenarioFireLevel > 0 ? (
                <div className="quiz-fire-line-glow" aria-hidden />
              ) : null}
              <div className="card scenario-card">
                {scenarioCurrentQuestion ? (
                  <>
                    <div className="quiz-top">
                      <span>Scenario Streak: {scenarioStreak}</span>
                      <span>{scenarioCurrentQuestion.scenarioTitle}</span>
                    </div>
                    {scenarioCurrentQuestion.questionCount > 1 ? (
                      <>
                        <p className="scenario-series-label">
                          {scenarioCurrentQuestion.tmasSet === 'tmas2' ? 'TMAS 2' : 'TMAS 1'} • Question {scenarioCurrentQuestion.questionNumber} of {scenarioCurrentQuestion.questionCount}
                        </p>
                        <h3 ref={scenarioPromptRef}>{scenarioCurrentQuestion.scenarioStem}</h3>
                        <p className="scenario-subprompt">{scenarioCurrentQuestion.prompt}</p>
                      </>
                    ) : (
                      <>
                        <p className="scenario-series-label">
                          {scenarioCurrentQuestion.tmasSet === 'tmas2' ? 'TMAS 2' : 'TMAS 1'}
                        </p>
                        <h3 ref={scenarioPromptRef}>{scenarioCurrentQuestion.prompt}</h3>
                      </>
                    )}
                    <div className="scenario-actions">
                      <span className="choice-hint">{scenarioChoiceHint}</span>
                      {scenarioCurrentQuestion.choices.map((choice, index) => (
                        <button
                          key={`scenario-choice-${scenarioCurrentQuestion.id}-${index}`}
                          className={`scenario-answer-btn ${
                            scenarioResult
                              ? index === scenarioCurrentQuestion.correctIndex
                                ? 'scenario-correct'
                                : scenarioSelectedChoice === index
                                  ? 'scenario-wrong'
                                  : ''
                              : scenarioSelectedChoice === index
                                ? 'scenario-selected'
                                : ''
                          }`}
                          onClick={() => answerScenario(index)}
                          disabled={Boolean(scenarioResult)}
                        >
                          <span className="choice-key">{index + 1}</span>
                          {choice}
                        </button>
                      ))}
                    </div>
                    {scenarioResult ? <p className={scenarioResult.startsWith('Correct') ? 'good' : 'bad'}>{scenarioResult}</p> : null}
                    {scenarioResult ? (
                      <div className="card compact">
                        <p><strong>Answer:</strong> {scenarioCurrentQuestion.choices[scenarioCurrentQuestion.correctIndex]}</p>
                        {scenarioCurrentQuestion.explanation ? <p className="muted">{scenarioCurrentQuestion.explanation}</p> : null}
                      </div>
                    ) : null}
                    <div className="scenario-next-wrap" ref={scenarioNextRef}>
                      <button className="secondary scenario-next" onClick={() => nextScenarioQuestion(undefined, scenarioCurrentQuestion.id)}>
                        {scenarioNextButtonLabel}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="muted">No scenario questions loaded.</p>
                )}
              </div>
            </div>
          </section>
        )}

        {isStatsPage && profile ? (
          <section>
            <div className="card profile-page-card">
              <div className="stats-heading">
                <span className="stats-heading-icon" aria-hidden>
                  <StatsIcon name="overview" className="stats-icon-svg" />
                </span>
                <h3>Study Stats</h3>
              </div>
              <p className="muted">Track your progress across study, games, and scenarios with detailed coaching analytics.</p>
              <div className="stats-grid">
                <article className="stats-item">
                  <p className="stats-icon" aria-hidden>
                    <StatsIcon name="time" className="stats-icon-svg" />
                  </p>
                  <p className="stats-label">Total Study Time</p>
                  <p className="stats-value">{formatStudyTime(profileDetails.stats.studySeconds)}</p>
                </article>
                <article className="stats-item">
                  <p className="stats-icon" aria-hidden>
                    <StatsIcon name="words" className="stats-icon-svg" />
                  </p>
                  <p className="stats-label">Words Mastered</p>
                  <p className="stats-value">{masteredWordsCount}</p>
                </article>
                <article className="stats-item">
                  <p className="stats-icon" aria-hidden>
                    <StatsIcon name="penal" className="stats-icon-svg" />
                  </p>
                  <p className="stats-label">Penal Codes Mastered</p>
                  <p className="stats-value">{penalMasteredCount}</p>
                </article>
                <article className="stats-item">
                  <p className="stats-icon" aria-hidden>
                    <StatsIcon name="flashcards" className="stats-icon-svg" />
                  </p>
                  <p className="stats-label">Flashcards Reviewed</p>
                  <p className="stats-value">{profileDetails.stats.flashcardsReviewed}</p>
                </article>
                <article className="stats-item">
                  <p className="stats-icon" aria-hidden>
                    <StatsIcon name="scenarios" className="stats-icon-svg" />
                  </p>
                  <p className="stats-label">Scenarios Completed</p>
                  <p className="stats-value">{profileDetails.stats.scenariosReviewed}</p>
                </article>
                <article className="stats-item">
                  <p className="stats-icon" aria-hidden>
                    <StatsIcon name="streak" className="stats-icon-svg" />
                  </p>
                  <p className="stats-label">Best Quiz Streak</p>
                  <p className="stats-value">{bestStreak}</p>
                </article>
                <article className="stats-item">
                  <p className="stats-icon" aria-hidden>
                    <StatsIcon name="overview" className="stats-icon-svg" />
                  </p>
                  <p className="stats-label">Overall Accuracy</p>
                  <p className="stats-value">{statsAnalytics.overallAccuracyPercent}%</p>
                </article>
                <article className="stats-item">
                  <p className="stats-icon" aria-hidden>
                    <StatsIcon name="studyset" className="stats-icon-svg" />
                  </p>
                  <p className="stats-label">Codes Tracked</p>
                  <p className="stats-value">{statsAnalytics.totalTrackedCodes}</p>
                </article>
                <article className="stats-item">
                  <p className="stats-icon" aria-hidden>
                    <StatsIcon name="game" className="stats-icon-svg" />
                  </p>
                  <p className="stats-label">Total Answers</p>
                  <p className="stats-value">{statsAnalytics.totalAttempts}</p>
                </article>
                <article className="stats-item">
                  <p className="stats-icon" aria-hidden>
                    <StatsIcon name="words" className="stats-icon-svg" />
                  </p>
                  <p className="stats-label">Unattempted Codes</p>
                  <p className="stats-value">{statsAnalytics.unattemptedCodes}</p>
                </article>
              </div>
              <div className="stats-highlight-row">
                <article className="stats-highlight">
                  <p className="stats-highlight-icon" aria-hidden>
                    <StatsIcon name="game" className="stats-icon-svg" />
                  </p>
                  <p className="stats-label">Most Played Game</p>
                  <p className="stats-value">
                    {mostPlayedGame && mostPlayedGame[1] > 0 ? `${mostPlayedGame[0] === 'speed' ? 'Speed Test' : 'Matching'} (${mostPlayedGame[1]} plays)` : 'No games yet'}
                  </p>
                </article>
                <article className="stats-highlight">
                  <p className="stats-highlight-icon" aria-hidden>
                    <StatsIcon name="studyset" className="stats-icon-svg" />
                  </p>
                  <p className="stats-label">Most Studied Set</p>
                  <p className="stats-value">
                    {mostStudiedMode && mostStudiedMode[1] > 0
                      ? `${mostStudiedMode[0] === 'all' ? 'All' : codeSetLabel[mostStudiedMode[0] as CodeSet]} (${mostStudiedMode[1]} quiz answers)`
                      : 'No study data yet'}
                  </p>
                </article>
              </div>
              <div className="stats-analytics-grid">
                <article className="card compact stats-chart-card">
                  <div className="stats-chart-head">
                    <h4>Recent Score Trend</h4>
                    <p className="stats-focus-meta">Latest session scores across all study and game modes</p>
                  </div>
                  <InteractiveTrendChart
                    chartId="stats-recent-accuracy"
                    values={statsRecentTrendValues}
                    ariaLabel="Recent score trend"
                    pointLabel="Attempt"
                    valueSuffix=" pts"
                    className="stats-trend-chart"
                    emptyMessage="Complete more sessions to unlock trend analytics."
                  />
                </article>

                <article className="card compact stats-chart-card">
                  <div className="stats-chart-head">
                    <h4>Accuracy by Code Set</h4>
                    <p className="stats-focus-meta">Shows where you should focus next</p>
                  </div>
                  <div className="stats-bar-list">
                    {statsAnalytics.codeSetBreakdown.map((item) => (
                      <div
                        key={`stats-codeset-${item.codeSet}`}
                        className="stats-bar-row"
                        title={`${codeSetLabel[item.codeSet]}: ${item.accuracyPercent}% accuracy • ${item.attempts} attempts • ${item.trackedCodes} codes`}
                      >
                        <div className="stats-bar-meta">
                          <strong>{codeSetLabel[item.codeSet]}</strong>
                          <small>{item.accuracyPercent}% • {item.attempts} attempts • {item.trackedCodes} codes</small>
                        </div>
                        <div className="stats-bar-track">
                          <div className="stats-bar-fill" style={{ width: `${Math.max(4, item.accuracyPercent)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="stats-focus-meta">
                    {statsAnalytics.weakestCategory
                      ? `Needs attention: ${codeSetLabel[statsAnalytics.weakestCategory.codeSet]} (${statsAnalytics.weakestCategory.accuracyPercent}% average).`
                      : 'No category data yet.'}
                  </p>
                </article>

                <article className="card compact stats-chart-card">
                  <div className="stats-chart-head">
                    <h4>Mastery Progress</h4>
                    <p className="stats-focus-meta">Distribution of your current code mastery levels</p>
                  </div>
                  <div className="stats-bar-list">
                    {(['Needs Work', 'Getting There', 'On Track', 'Almost Mastered', 'Mastered'] as Array<Exclude<MasteryStatus, ''>>).map((status) => {
                      const count = statsAnalytics.masteryCounts[status]
                      const width = statsAnalytics.totalTrackedCodes > 0 ? Math.max(4, Math.round((count / statsAnalytics.totalTrackedCodes) * 100)) : 0
                      return (
                        <div
                          key={`stats-mastery-${status}`}
                          className="stats-bar-row"
                          title={`${status}: ${count} code${count === 1 ? '' : 's'} (${statsAnalytics.totalTrackedCodes > 0 ? Math.round((count / statsAnalytics.totalTrackedCodes) * 100) : 0}%)`}
                        >
                          <div className="stats-bar-meta">
                            <strong>{status}</strong>
                            <small>{count} code{count === 1 ? '' : 's'}</small>
                          </div>
                          <div className="stats-bar-track">
                            <div className={`stats-bar-fill stats-bar-fill-${status.toLowerCase().replace(/\s+/g, '-')}`} style={{ width: `${width}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </article>

                <article className="card compact stats-chart-card">
                  <div className="stats-chart-head">
                    <h4>Mode Performance</h4>
                    <p className="stats-focus-meta">Average and best score by mode</p>
                  </div>
                  <div className="stats-mode-grid">
                    {statsAnalytics.modePerformance.map((mode) => (
                      <div key={`stats-mode-${mode.mode}`} className="stats-mode-item">
                        <p className="stats-mode-title">{sessionModeLabel(mode.mode)}</p>
                        <p className="stats-mode-metric">
                          <strong>{mode.averageScore} pts</strong> avg • {mode.bestScore} pts best
                        </p>
                        <p className="stats-mode-meta">
                          {mode.runs} runs • {mode.scoreDelta >= 0 ? '+' : ''}{mode.scoreDelta} pts trend
                        </p>
                      </div>
                    ))}
                  </div>
                </article>
              </div>

              <div className="stats-code-list-grid">
                <article className="card compact stats-focus-card">
                  <h4>Needs Work First</h4>
                  <p className="stats-focus-meta">Lowest-accuracy codes the algorithm recommends reviewing now.</p>
                  <div className="stats-code-list">
                    {statsAnalytics.needsWorkCodes.length === 0 ? (
                      <p className="muted">No weak codes identified yet.</p>
                    ) : (
                      statsAnalytics.needsWorkCodes.map((item) => (
                        <article key={`stats-needs-${item.section.id}`} className="stats-code-item">
                          <div>
                            <p className="stats-code-title">{item.section.sectionNumber} • {item.section.title}</p>
                            <p className="stats-code-meta">{codeSetLabel[item.section.codeSet]} • {item.attempts} attempts</p>
                          </div>
                          <span className="badge badge-work">{item.accuracyPercent}%</span>
                        </article>
                      ))
                    )}
                  </div>
                </article>

                <article className="card compact stats-focus-card">
                  <h4>Strongest Codes</h4>
                  <p className="stats-focus-meta">Codes you currently know best, based on accuracy and attempts.</p>
                  <div className="stats-code-list">
                    {statsAnalytics.strongestCodes.length === 0 ? (
                      <p className="muted">No strong-code data yet.</p>
                    ) : (
                      statsAnalytics.strongestCodes.map((item) => (
                        <article key={`stats-strong-${item.section.id}`} className="stats-code-item">
                          <div>
                            <p className="stats-code-title">{item.section.sectionNumber} • {item.section.title}</p>
                            <p className="stats-code-meta">{codeSetLabel[item.section.codeSet]} • {item.attempts} attempts</p>
                          </div>
                          <span className="badge badge-mastered">{item.accuracyPercent}%</span>
                        </article>
                      ))
                    )}
                  </div>
                </article>
              </div>

              <div className="card compact stats-focus-card">
                <h4>Assisted Learning Insights</h4>
                <p className="muted">
                  Assisted Learning increases exposure to weaker codes and eases repetition on stabilized/mastered codes to keep you progressing across the full library.
                </p>
                <div className="stats-focus-list">
                  <article className="stats-focus-item">
                    <div>
                      <p className="stats-focus-title">Codes tracked by algorithm</p>
                      <p className="stats-focus-meta">Codes with at least one attempt</p>
                    </div>
                    <span className="badge">{algorithmInsights.trackedCodes}</span>
                  </article>
                  <article className="stats-focus-item">
                    <div>
                      <p className="stats-focus-title">Current average accuracy</p>
                      <p className="stats-focus-meta">Across all tracked codes</p>
                    </div>
                    <span className="badge">{Math.round(algorithmInsights.averageAccuracy * 100)}%</span>
                  </article>
                  <article className="stats-focus-item">
                    <div>
                      <p className="stats-focus-title">Active focus codes</p>
                      <p className="stats-focus-meta">High-priority “needs work” items</p>
                    </div>
                    <span className="badge badge-work">{algorithmInsights.needsMoreWorkCount}</span>
                  </article>
                  <article className="stats-focus-item">
                    <div>
                      <p className="stats-focus-title">Stabilized codes</p>
                      <p className="stats-focus-meta">Strong accuracy or streak performance</p>
                    </div>
                    <span className="badge badge-mastered">{algorithmInsights.stabilizedCount}</span>
                  </article>
                  <article className="stats-focus-item">
                    <div>
                      <p className="stats-focus-title">Mastered codes</p>
                      <p className="stats-focus-meta">20+ correct streak achieved</p>
                    </div>
                    <span className="badge badge-mastered">{algorithmInsights.masteredCount}</span>
                  </article>
                  <article className="stats-focus-item">
                    <div>
                      <p className="stats-focus-title">Focus load</p>
                      <p className="stats-focus-meta">Share of attempts spent on weak codes</p>
                    </div>
                    <span className="badge">{Math.round(algorithmInsights.focusLoadPercent)}%</span>
                  </article>
                </div>
                <p className="stats-focus-meta">
                  Current top focus: {algorithmInsights.topFocusCodes.length > 0 ? algorithmInsights.topFocusCodes.join(', ') : 'No current weak-code targets'}
                </p>
                <p className="stats-focus-meta">{statsAnalytics.recommendation}</p>
              </div>
            </div>
          </section>
        ) : null}

        {isProfilePage && profile && (
          <section>
            <div className="card profile-page-shell">
              <aside className="settings-sidebar">
                <button className={settingsTab === 'profile' ? 'settings-nav-btn active' : 'settings-nav-btn'} onClick={() => setSettingsTab('profile')}>
                  Profile
                </button>
                <button className={settingsTab === 'customization' ? 'settings-nav-btn active' : 'settings-nav-btn'} onClick={() => setSettingsTab('customization')}>
                  Customization
                </button>
                <button className={settingsTab === 'bug_report' ? 'settings-nav-btn active' : 'settings-nav-btn'} onClick={() => setSettingsTab('bug_report')}>
                  Report Bug
                </button>
                {isOwner ? (
                  <button className={settingsTab === 'editor' ? 'settings-nav-btn active' : 'settings-nav-btn'} onClick={() => setSettingsTab('editor')}>
                    Content Editor
                  </button>
                ) : null}
                {isOwner ? (
                  <button className={settingsTab === 'agencies' ? 'settings-nav-btn active' : 'settings-nav-btn'} onClick={() => setSettingsTab('agencies')}>
                    Agencies
                  </button>
                ) : null}
                {isOwner ? (
                  <button className={settingsTab === 'banner' ? 'settings-nav-btn active' : 'settings-nav-btn'} onClick={() => setSettingsTab('banner')}>
                    Site Banner
                  </button>
                ) : null}
                {isOwner ? (
                  <button className={settingsTab === 'bug_inbox' ? 'settings-nav-btn active' : 'settings-nav-btn'} onClick={() => setSettingsTab('bug_inbox')}>
                    Bug Inbox
                  </button>
                ) : null}
                <button className={settingsTab === 'support' ? 'settings-nav-btn active' : 'settings-nav-btn'} onClick={() => setSettingsTab('support')}>
                  Support
                </button>
                <button className={settingsTab === 'security' ? 'settings-nav-btn active' : 'settings-nav-btn'} onClick={() => setSettingsTab('security')}>
                  Account Security
                </button>
              </aside>

              <div className="settings-panel">
              {settingsTab === 'profile' ? (
                <div className="settings-section-card">
                  <div className="avatar-frame">
                    <img src={avatarFor(profileAvatarPreviewUrl || profile.avatarUrl)} alt={profile.username} className="avatar" onError={handleAvatarImageError} />
                  </div>
                  {isOwner ? <p className="owner-pill">Owner</p> : null}
                  <label>
                    Username
                    <input
                      value={profileUsername}
                      onChange={(event) => {
                        setProfileUsername(event.target.value)
                        if (authError.toLowerCase().includes('username already exists')) setAuthError('')
                      }}
                    />
                  </label>
                  <label>
                    Profile picture
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => openAvatarCropper(event.target.files?.[0] || null)}
                    />
                  </label>
                  <label>
                    About me
                    <textarea
                      rows={4}
                      value={profileDetails.bio}
                      onChange={(event) => setProfileDetails((previous) => ({ ...previous, bio: event.target.value }))}
                    />
                  </label>
                  <label>
                    Agency
                    <select
                      value={profileDetails.agency}
                      onChange={(event) => setProfileDetails((previous) => ({ ...previous, agency: event.target.value }))}
                    >
                      {agencyOptions.map((agency) => (
                        <option key={agency} value={agency}>
                          {agency}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="assisted-learning-inline">
                    <label className="assisted-learning-toggle">
                      <input
                        type="checkbox"
                        checked={assistedLearningEnabled}
                        onChange={(event) => setAssistedLearningEnabled(event.target.checked)}
                      />
                      Assisted Learning
                    </label>
                    <button
                      className="assisted-learning-info-button"
                      onClick={() => setShowAssistedLearningInfo(true)}
                      aria-label="Assisted Learning info"
                    >
                      ⓘ
                    </button>
                  </div>
                  {isOwner ? (
                    <div className="owner-rotation-control">
                      <div className="glow-control-row">
                        <p className="tiny">Leaderboard rotate interval</p>
                        <span className="range-value-pill">{(sanitizeLeaderboardRotationMs(profileDetails.homeLeaderboardRotationMs) / 1000).toFixed(1)}s</span>
                      </div>
                      <input
                        className="modern-range"
                        type="range"
                        min={2}
                        max={12}
                        step={0.5}
                        value={sanitizeLeaderboardRotationMs(profileDetails.homeLeaderboardRotationMs) / 1000}
                        onChange={(event) => {
                          const seconds = Number(event.target.value)
                          const ms = sanitizeLeaderboardRotationMs(seconds * 1000)
                          setProfileDetails((previous) => ({ ...previous, homeLeaderboardRotationMs: ms }))
                        }}
                      />
                      <p className="tiny">Controls how long each rotating leaderboard view stays visible.</p>
                    </div>
                  ) : null}
                  <button className="primary" onClick={submitProfile} disabled={authLoading || profileUsername.trim().length < 1}>
                    Save Profile Details
                  </button>
                  {authSuccess ? <p className="saved-pill">{authSuccess}</p> : null}
                  {authError ? <p className="bad">{authError}</p> : null}
                </div>
              ) : null}

              {settingsTab === 'customization' ? (
                <div className="settings-section-card">
                  <h3>Name Customization</h3>
                  {canCustomizeName ? (
                    <div className="customization-grid">
                      <div className="card compact customization-card">
                        <p className="customization-card-title">Style</p>
                        <label>
                          Font
                          <select
                            value={profileDetails.nameStyle.fontFamily}
                            onChange={(event) =>
                              setProfileDetails((previous) => ({
                                ...previous,
                                nameStyle: { ...previous.nameStyle, fontFamily: event.target.value },
                              }))
                            }
                          >
                            {profileFontOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="actions-row">
                          <button
                            className={profileDetails.nameStyle.fontWeight === 700 ? 'primary' : 'secondary'}
                            onClick={() =>
                              setProfileDetails((previous) => ({
                                ...previous,
                                nameStyle: { ...previous.nameStyle, fontWeight: previous.nameStyle.fontWeight === 700 ? 600 : 700 },
                              }))
                            }
                          >
                            Bold
                          </button>
                          <button
                            className={profileDetails.nameStyle.fontStyle === 'italic' ? 'primary' : 'secondary'}
                            onClick={() =>
                              setProfileDetails((previous) => ({
                                ...previous,
                                nameStyle: { ...previous.nameStyle, fontStyle: previous.nameStyle.fontStyle === 'italic' ? 'normal' : 'italic' },
                              }))
                            }
                          >
                            Italic
                          </button>
                        </div>
                      </div>

                      <div className="card compact customization-card">
                        <p className="customization-card-title">Color & Glow</p>
                        <div className="name-color-controls">
                          <input
                            className="name-color-picker"
                            type="color"
                            value={profileDetails.nameStyle.color}
                            onChange={(event) =>
                              setProfileDetails((previous) => ({
                                ...previous,
                                nameStyle: { ...previous.nameStyle, color: event.target.value },
                              }))
                            }
                          />
                          <div className="name-color-swatches">
                            {nameColorPalette.map((color) => (
                              <button
                                key={color}
                                type="button"
                                className={profileDetails.nameStyle.color === color ? 'color-swatch active' : 'color-swatch'}
                                style={{ background: color }}
                                onClick={() =>
                                  setProfileDetails((previous) => ({
                                    ...previous,
                                    nameStyle: { ...previous.nameStyle, color },
                                  }))
                                }
                                aria-label={`Use ${color}`}
                              />
                            ))}
                          </div>
                        </div>
                        <label className="switch-row">
                          <input
                            type="checkbox"
                            checked={profileDetails.nameStyle.glowEnabled}
                            onChange={(event) =>
                              setProfileDetails((previous) => ({
                                ...previous,
                                nameStyle: { ...previous.nameStyle, glowEnabled: event.target.checked },
                              }))
                            }
                          />
                          Glow enabled
                        </label>
                        <label>
                          <div className="glow-control-row">
                            <span>Glow Intensity</span>
                            <span className="range-value-pill">{profileDetails.nameStyle.glowIntensity}%</span>
                          </div>
                          <input
                            className="modern-range"
                            type="range"
                            min={0}
                            max={100}
                            value={profileDetails.nameStyle.glowIntensity}
                            onChange={(event) =>
                              setProfileDetails((previous) => ({
                                ...previous,
                                nameStyle: { ...previous.nameStyle, glowIntensity: Number(event.target.value) },
                              }))
                            }
                          />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="locked-preview-card">
                      <p className="locked-title">Locked • $10 Pro Supporter</p>
                      <p className="muted">Name customization (font, color, glow, presets) unlocks with the $10 tier.</p>
                    </div>
                  )}

                  {canCustomizeName ? (
                    <div className="card compact customization-card">
                      <p className="customization-card-title">Presets</p>
                      <label>
                        Preset name
                        <div className="preset-row">
                          <input
                            value={newPresetName}
                            placeholder="Ex: Neon Blue"
                            onChange={(event) => setNewPresetName(event.target.value)}
                          />
                          <button className="secondary" type="button" onClick={saveCurrentNamePreset} disabled={newPresetName.trim().length === 0}>
                            Save Preset
                          </button>
                        </div>
                      </label>
                      {profileDetails.namePresets.length > 0 ? (
                        <div className="preset-list">
                          {profileDetails.namePresets.map((preset) => (
                            <div key={preset.id} className="preset-pill">
                              <button type="button" className="secondary" onClick={() => applyNamePreset(preset)}>
                                {preset.name}
                              </button>
                              <button type="button" className="danger" onClick={() => deleteNamePreset(preset.id)}>
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <p className="customization-preview">
                        Preview:{' '}
                        <span
                          className="tier-name"
                          style={displayNameStyle(profileDetails.nameStyle, profile.supporterTier)}
                        >
                          {profileUsername.trim() || profile.username || 'Your Name'}
                        </span>
                      </p>
                    </div>
                  ) : (
                    null
                  )}
                  <h3>Website Theme</h3>
                  <div className={!canUseThemes ? 'locked-preview-card theme-paywall-wrap' : ''}>
                    {!canUseThemes ? <p className="locked-title">Locked • $5 Supporter+</p> : null}
                    <div className="theme-grid">
                      {appThemePresets.map((theme) => (
                        <button
                          key={theme.id}
                          type="button"
                          className={`${profileDetails.themeId === theme.id && canUseThemes ? 'theme-card active' : 'theme-card'} ${!canUseThemes ? 'locked' : ''}`}
                          onClick={() => {
                            if (!canUseThemes) return
                            setProfileDetails((previous) => ({ ...previous, themeId: theme.id }))
                          }}
                          disabled={!canUseThemes}
                        >
                          <span className="theme-swatch" style={{ background: theme.swatch }} />
                          <span className="theme-name">{theme.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  {!canUseThemes ? <p className="muted">Themes are preview-only. Upgrade to $5 Supporter+ to apply them.</p> : null}
                  <p className="muted">Current theme: {selectedTheme.name}</p>
                  <button className="primary" onClick={submitProfile} disabled={authLoading || profileUsername.trim().length < 1}>
                    Save Customization
                  </button>
                  {authSuccess ? <p className="saved-pill">{authSuccess}</p> : null}
                  {authError ? <p className="bad">{authError}</p> : null}
                </div>
              ) : null}

              {settingsTab === 'bug_report' ? (
                <div className="settings-section-card">
                  <h3>Report a Bug</h3>
                  <p className="muted tiny">Share what happened and we will review it in the owner bug inbox.</p>
                  <label>
                    Where it happened
                    <input
                      value={bugReportPagePath}
                      placeholder="/study/test"
                      onChange={(event) => setBugReportPagePath(event.target.value)}
                    />
                  </label>
                  <label>
                    Severity
                    <select value={bugReportSeverity} onChange={(event) => setBugReportSeverity(sanitizeBugSeverity(event.target.value))}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </label>
                  <label>
                    Short summary
                    <input
                      value={bugReportSummary}
                      maxLength={160}
                      placeholder="Example: Matching timer stops while clicking fast"
                      onChange={(event) => setBugReportSummary(event.target.value)}
                    />
                  </label>
                  <label>
                    What happened?
                    <textarea
                      rows={5}
                      value={bugReportDetails}
                      maxLength={5000}
                      placeholder="Include steps to reproduce, expected result, and what actually happened."
                      onChange={(event) => setBugReportDetails(event.target.value)}
                    />
                  </label>
                  <div className="actions-row">
                    <button
                      className="primary"
                      type="button"
                      onClick={() => void submitBugReport()}
                      disabled={bugReportSending || bugReportSummary.trim().length < 6 || bugReportDetails.trim().length < 12}
                    >
                      {bugReportSending ? 'Sending...' : 'Submit Bug Report'}
                    </button>
                  </div>
                  {bugReportError ? <p className="bad">{bugReportError}</p> : null}
                  {bugReportSuccess ? <p className="saved-pill">{bugReportSuccess}</p> : null}
                </div>
              ) : null}

              {settingsTab === 'bug_inbox' ? (
                isOwner ? (
                  <div className="settings-section-card">
                    <h3>Bug Inbox</h3>
                    <p className="muted tiny">Owner-only list of submitted bug reports.</p>
                    <div className="actions-row">
                      <button className="secondary" type="button" onClick={() => void loadOwnerBugReports()} disabled={ownerBugReportsLoading}>
                        {ownerBugReportsLoading ? 'Refreshing...' : 'Refresh'}
                      </button>
                    </div>
                    {ownerBugReportsError ? <p className="bad">{ownerBugReportsError}</p> : null}
                    {ownerBugReportsSuccess ? <p className="saved-pill">{ownerBugReportsSuccess}</p> : null}
                    <div className="bug-report-list">
                      {ownerBugReports.length === 0 ? (
                        <p className="muted">No bug reports yet.</p>
                      ) : (
                        ownerBugReports.map((report) => (
                          <article key={report.id} className={`bug-report-item status-${report.status}`}>
                            <div className="bug-report-head">
                              <div>
                                <p className="bug-report-summary">{report.summary}</p>
                                <p className="tiny muted">
                                  {new Date(report.createdAt).toLocaleString()} • @{report.reporterName} • {report.pagePath}
                                </p>
                              </div>
                              <div className="bug-report-meta">
                                <span className={`badge bug-severity-${report.severity}`}>{bugSeverityLabel[report.severity]}</span>
                                <select
                                  value={report.status}
                                  onChange={(event) => {
                                    const nextStatus = sanitizeBugStatus(event.target.value)
                                    setOwnerBugReports((previous) =>
                                      previous.map((entry) => (entry.id === report.id ? { ...entry, status: nextStatus } : entry)),
                                    )
                                    void updateOwnerBugReport(report.id, { status: nextStatus })
                                  }}
                                >
                                  {bugStatusOrder.map((status) => (
                                    <option key={`${report.id}-status-${status}`} value={status}>
                                      {bugStatusLabel[status]}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <p className="bug-report-details">{report.details}</p>
                            <p className="tiny muted">
                              Reporter email: {report.reporterEmail || 'Not provided'} • Viewport: {report.viewport || 'Unknown'}
                            </p>
                            <label>
                              Owner note
                              <textarea
                                rows={2}
                                value={report.ownerNote}
                                placeholder="Add internal note for follow-up."
                                onChange={(event) => {
                                  const value = event.target.value
                                  setOwnerBugReports((previous) =>
                                    previous.map((entry) => (entry.id === report.id ? { ...entry, ownerNote: value } : entry)),
                                  )
                                }}
                                onBlur={(event) => {
                                  void updateOwnerBugReport(report.id, { ownerNote: event.target.value })
                                }}
                              />
                            </label>
                            <div className="actions-row">
                              <button className="danger" type="button" onClick={() => void deleteOwnerBugReport(report.id)}>
                                Delete
                              </button>
                            </div>
                          </article>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="settings-section-card">
                    <p className="muted">Bug inbox is available to owner accounts only.</p>
                  </div>
                )
              ) : null}

              {settingsTab === 'editor' ? (
                isOwner ? (
                  <div className="settings-section-card">
                    <h3>Content Editor</h3>
                    <div className="card compact content-editor-card">
                      <div className="content-editor-toolbar">
                        <button className="secondary" type="button" onClick={() => startNewEditorItem(editorCategoryFilter)}>
                          New Item
                        </button>
                        <button className="secondary" type="button" onClick={() => void loadOwnerEditorItems()} disabled={editorLoading || ownerLoading}>
                          Refresh
                        </button>
                      </div>
                      <div className="content-editor-filters">
                        <label>
                          Category
                          <select value={editorCategoryFilter} onChange={(event) => setEditorCategoryFilter(event.target.value)}>
                            <option value="all">All</option>
                            {editorCategoryOptions.map((category) => (
                              <option key={`editor-category-${category}`} value={category}>
                                {category.toUpperCase()}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Type
                          <select value={editorTypeFilter} onChange={(event) => setEditorTypeFilter(event.target.value as 'all' | 'code' | 'scenario' | 'question')}>
                            <option value="all">All</option>
                            <option value="code">Code</option>
                            <option value="scenario">Scenario</option>
                          </select>
                        </label>
                      </div>
                      <div className="content-editor-main">
                        <div className="content-editor-list-wrap">
                          <p className="content-editor-list-count">
                            {filteredEditorItems.length} item{filteredEditorItems.length === 1 ? '' : 's'}
                          </p>
                          <div className="content-editor-list">
                            {filteredEditorItems.length === 0 ? (
                              <p className="muted">No content items found.</p>
                            ) : (
                              filteredEditorItems.map((item) => (
                                <button
                                  key={`editor-item-${item.id}`}
                                  className={editorSelectedId === item.id ? 'secondary content-editor-list-item active' : 'secondary content-editor-list-item'}
                                  type="button"
                                  onClick={() => selectEditorItem(item)}
                                >
                                  <span className="content-editor-list-item-title">{item.title}</span>
                                  <small>{item.category.toUpperCase()} • {item.type}</small>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                        <div className="content-editor-form">
                        <div className="content-editor-filters">
                          <label>
                            Category
                            <select
                              value={editorDraft.category}
                              onChange={(event) => setEditorDraft((previous) => ({ ...previous, category: event.target.value }))}
                            >
                              <option value="pc">PC</option>
                              <option value="hs">H&S</option>
                              <option value="vc">VC</option>
                              <option value="scenario">Scenario</option>
                              {editorCategoryOptions
                                .filter((category) => !['pc', 'hs', 'vc', 'scenario'].includes(category))
                                .map((category) => (
                                  <option key={`editor-category-extra-${category}`} value={category}>
                                    {category.toUpperCase()}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <label>
                            Kind
                            <select
                              value={editorDraft.type === 'scenario' ? 'scenario' : 'code'}
                              onChange={(event) =>
                                setEditorDraft((previous) => ({
                                  ...previous,
                                  type: event.target.value as 'code' | 'scenario',
                                }))
                              }
                            >
                              <option value="code">Code Item</option>
                              <option value="scenario">Scenario</option>
                            </select>
                          </label>
                        </div>
                        {editorDraft.type === 'scenario' ? (
                          <>
                            <label>
                              Scenario
                              <textarea rows={4} value={editorDraft.scenario} onChange={(event) => setEditorDraft((previous) => ({ ...previous, scenario: event.target.value }))} />
                            </label>
                            <label>
                              Scenario title (optional)
                              <input value={editorDraft.title} onChange={(event) => setEditorDraft((previous) => ({ ...previous, title: event.target.value }))} />
                            </label>
                            <label>
                              Answer mode
                              <select value={scenarioAnswerMode} onChange={(event) => setScenarioAnswerMode(event.target.value as 'choices' | 'truefalse')}>
                                <option value="choices">2-4 answer choices</option>
                                <option value="truefalse">True / False</option>
                              </select>
                            </label>
                            {scenarioAnswerMode === 'choices' ? (
                              <div className="content-editor-filters">
                                {[0, 1, 2, 3].map((index) => (
                                  <label key={`scenario-option-${index}`}>
                                    Choice {index + 1}{index < 2 ? ' *' : ' (optional)'}
                                    <input
                                      value={scenarioOptionInputs[index] || ''}
                                      onChange={(event) =>
                                        setScenarioOptionInputs((previous) => {
                                          const next = [...previous]
                                          next[index] = event.target.value
                                          return next
                                        })
                                      }
                                    />
                                  </label>
                                ))}
                              </div>
                            ) : null}
                            <label>
                              Correct answer
                              <select value={scenarioCorrectChoice} onChange={(event) => setScenarioCorrectChoice(event.target.value)}>
                                <option value="">Select correct answer</option>
                                {(scenarioAnswerMode === 'truefalse'
                                  ? ['True', 'False']
                                  : scenarioOptionInputs.map((item) => item.trim()).filter(Boolean).slice(0, 4)
                                ).map((choice) => (
                                  <option key={`scenario-correct-${choice}`} value={choice}>
                                    {choice}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Explanation (optional)
                              <textarea rows={3} value={editorDraft.explanation} onChange={(event) => setEditorDraft((previous) => ({ ...previous, explanation: event.target.value }))} />
                            </label>
                          </>
                        ) : (
                          <>
                            <label>
                              Code section
                              <input
                                value={editorDraft.codeSection}
                                placeholder={editorDraft.category === 'vc' ? 'VC 23152(a)' : editorDraft.category === 'hs' ? 'H&S 11350' : 'PC 148(a)(1)'}
                                onChange={(event) => setEditorDraft((previous) => ({ ...previous, codeSection: event.target.value }))}
                              />
                            </label>
                            <label>
                              Name
                              <input
                                value={editorDraft.title}
                                placeholder="Kidnapping"
                                onChange={(event) => setEditorDraft((previous) => ({ ...previous, title: event.target.value }))}
                              />
                            </label>
                            <label>
                              Definition (Elements)
                              <textarea rows={3} value={editorDraft.explanation} onChange={(event) => setEditorDraft((previous) => ({ ...previous, explanation: event.target.value }))} />
                            </label>
                          </>
                        )}
                        <label className="switch-row">
                          <input
                            type="checkbox"
                            checked={editorDraft.isPublished}
                            onChange={(event) => setEditorDraft((previous) => ({ ...previous, isPublished: event.target.checked }))}
                          />
                          Published
                        </label>
                        {editorError ? <p className="bad">{editorError}</p> : null}
                        {editorSuccess ? <p className="good">{editorSuccess}</p> : null}
                        <div className="actions-row">
                          <button className="primary" type="button" onClick={saveEditorItem} disabled={editorLoading || ownerLoading}>
                            {editorLoading ? 'Saving...' : 'Save Item'}
                          </button>
                          {editorSelectedId ? (
                            <button className="danger" type="button" onClick={() => deleteEditorItem(editorSelectedId)} disabled={editorLoading || ownerLoading}>
                              Delete Item
                            </button>
                          ) : null}
                        </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="settings-section-card">
                    <p className="muted">Content Editor is available to owner accounts only.</p>
                  </div>
                )
              ) : null}

              {settingsTab === 'agencies' ? (
                isOwner ? (
                  <div className="settings-section-card">
                    <h3>Agencies</h3>
                    <p className="muted tiny">Manage the agency list shown in profile settings.</p>
                    <div className="agency-settings-add">
                      <input
                        value={agencyNewName}
                        placeholder="Add agency name"
                        onChange={(event) => setAgencyNewName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            void addAgencyOption()
                          }
                        }}
                      />
                      <button className="primary" type="button" onClick={() => void addAgencyOption()} disabled={agencySaving}>
                        {agencySaving ? 'Saving...' : 'Add'}
                      </button>
                    </div>
                    <div className="agency-settings-list">
                      {agencyOptions.map((agency) => (
                        <div key={`agency-option-${agency}`} className="agency-settings-row">
                          {agencyEditingOriginal === agency ? (
                            <input value={agencyEditingValue} onChange={(event) => setAgencyEditingValue(event.target.value)} />
                          ) : (
                            <p>{agency}</p>
                          )}
                          <div className="actions-row">
                            {agency === defaultAgency ? (
                              <span className="tiny muted">Required</span>
                            ) : agencyEditingOriginal === agency ? (
                              <>
                                <button className="primary" type="button" onClick={() => void saveEditedAgencyOption()} disabled={agencySaving}>
                                  Save
                                </button>
                                <button className="secondary cancel-button" type="button" onClick={cancelEditAgencyOption} disabled={agencySaving}>
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button className="secondary" type="button" onClick={() => beginEditAgencyOption(agency)} disabled={agencySaving}>
                                  Edit
                                </button>
                                <button className="danger" type="button" onClick={() => void deleteAgencyOption(agency)} disabled={agencySaving}>
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {agencyError ? <p className="bad">{agencyError}</p> : null}
                    {agencySuccess ? <p className="saved-pill">{agencySuccess}</p> : null}
                  </div>
                ) : (
                  <div className="settings-section-card">
                    <p className="muted">Agency settings are available to owner accounts only.</p>
                  </div>
                )
              ) : null}

              {settingsTab === 'banner' ? (
                isOwner ? (
                  <div className="settings-section-card">
                    <h3>Global Site Banner</h3>
                    <p className="muted tiny">This banner appears at the top of the website for all users.</p>

                    <label className="switch-row">
                      <input
                        type="checkbox"
                        checked={ownerBannerDraft.enabled}
                        onChange={(event) => {
                          const enabled = event.target.checked
                          setOwnerBannerDraft((previous) => ({
                            ...previous,
                            enabled,
                          }))
                        }}
                      />
                      Show banner
                    </label>

                    <div className="content-editor-filters">
                      <label>
                        Message type
                        <select
                          value={ownerBannerDraft.tone}
                          onChange={(event) => {
                            const tone = sanitizeBannerTone(event.target.value)
                            setOwnerBannerDraft((previous) => ({
                              ...previous,
                              tone,
                            }))
                          }}
                        >
                          <option value="courteous">Courteous</option>
                          <option value="notice">Notice</option>
                          <option value="urgent">Urgent</option>
                        </select>
                      </label>
                      <label className="switch-row">
                        <input
                          type="checkbox"
                          checked={ownerBannerDraft.scroll}
                          onChange={(event) => {
                            const scroll = event.target.checked
                            setOwnerBannerDraft((previous) => ({
                              ...previous,
                              scroll,
                            }))
                          }}
                        />
                        Scroll text
                      </label>
                      {ownerBannerDraft.scroll ? (
                        <>
                          <label>
                            Scroll speed
                            <select
                              value={ownerBannerDraft.scrollSpeed}
                              onChange={(event) => {
                                const nextSpeed = Number(event.target.value)
                                setOwnerBannerDraft((previous) => ({
                                  ...previous,
                                  scrollSpeed: Number.isFinite(nextSpeed)
                                    ? Math.min(60, Math.max(6, Math.round(nextSpeed)))
                                    : previous.scrollSpeed,
                                }))
                              }}
                            >
                              <option value={12}>Very fast</option>
                              <option value={16}>Fast</option>
                              <option value={20}>Normal</option>
                              <option value={26}>Slow</option>
                              <option value={34}>Very slow</option>
                            </select>
                          </label>
                          <label>
                            Repeats per cycle
                            <select
                              value={ownerBannerDraft.scrollRepeat}
                              onChange={(event) => {
                                const nextRepeat = Number(event.target.value)
                                setOwnerBannerDraft((previous) => ({
                                  ...previous,
                                  scrollRepeat: Number.isFinite(nextRepeat)
                                    ? Math.min(8, Math.max(1, Math.round(nextRepeat)))
                                    : previous.scrollRepeat,
                                }))
                              }}
                            >
                              {Array.from({ length: 8 }, (_, index) => index + 1).map((count) => (
                                <option key={count} value={count}>
                                  {count === 1 ? '1 time' : `${count} times`}
                                </option>
                              ))}
                            </select>
                          </label>
                        </>
                      ) : null}
                    </div>

                    <label>
                      Banner message
                      <textarea
                        rows={3}
                        maxLength={320}
                        placeholder="Enter the message you want shown across the site."
                        value={ownerBannerDraft.message}
                        onChange={(event) =>
                          setOwnerBannerDraft((previous) => ({
                            ...previous,
                            message: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <p className="tiny muted">{ownerBannerDraft.message.trim().length}/320</p>

                    <div
                      className={`global-owner-banner global-owner-banner-${ownerBannerDraft.tone} global-owner-banner-preview${
                        ownerBannerDraft.scroll ? ' global-owner-banner-scrolling' : ''
                      }`}
                    >
                      <span className="global-owner-banner-label">{bannerToneLabel[ownerBannerDraft.tone]}</span>
                      {ownerBannerDraft.scroll && ownerBannerDraft.message.trim().length > 0 ? (
                        <div className="global-owner-banner-marquee" aria-label={ownerBannerDraft.message.trim()}>
                          <div
                            className="global-owner-banner-marquee-track"
                            style={{ ['--banner-scroll-duration' as string]: `${ownerBannerDraft.scrollSpeed}s` } as CSSProperties}
                          >
                            {buildBannerMarqueeSegments(ownerBannerDraft.message, ownerBannerDraft.scrollRepeat).map((segment, index) => (
                              <span key={`banner-preview-${index}`}>{segment}</span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="global-owner-banner-text">
                          {ownerBannerDraft.message.trim() || 'Banner preview text will appear here.'}
                        </p>
                      )}
                      <span className="global-owner-banner-spacer" aria-hidden />
                    </div>

                    <div className="actions-row">
                      <button className="primary" type="button" onClick={() => void saveOwnerBannerSettings()} disabled={ownerBannerSaving}>
                        {ownerBannerSaving ? 'Saving...' : 'Save Banner'}
                      </button>
                    </div>

                    {ownerBannerError ? <p className="bad">{ownerBannerError}</p> : null}
                    {ownerBannerSuccess ? <p className="saved-pill">{ownerBannerSuccess}</p> : null}
                  </div>
                ) : (
                  <div className="settings-section-card">
                    <p className="muted">Global banner controls are available to owner accounts only.</p>
                  </div>
                )
              ) : null}

              {settingsTab === 'support' ? (
                <div className="settings-section-card">
                  <h3>Support Tiers</h3>
                  <p className="muted">Current tier: {tierLabel[profile.supporterTier]}</p>
                  <div className="tier-upgrade-grid">
                    {(['tier2', 'tier5', 'tier10'] as Exclude<SupporterTier, 'free'>[]).map((tier) => (
                      <div
                        key={tier}
                        className={tierRank(profile.supporterTier) >= tierRank(tier) ? 'tier-upgrade-card tier-locked' : 'tier-upgrade-card'}
                      >
                        <p className="tier-upgrade-title">{tierLabel[tier]}</p>
                        <ul className="muted support-benefits-list">
                          {tier === 'tier2' ? (
                            <>
                              <li>Support the project and roadmap</li>
                              <li>Supporter badge on your account</li>
                            </>
                          ) : null}
                          {tier === 'tier5' ? (
                            <>
                              <li>Everything in $2 tier</li>
                              <li>Unlock all website themes</li>
                              <li>Priority access to upcoming features</li>
                            </>
                          ) : null}
                          {tier === 'tier10' ? (
                            <>
                              <li>Everything in $2 and $5 tiers</li>
                              <li>Name customization (font, glow, color)</li>
                            </>
                          ) : null}
                        </ul>
                        <button
                          className="primary"
                          onClick={() => startTierCheckout(tier)}
                          disabled={tierRank(profile.supporterTier) >= tierRank(tier)}
                        >
                          {tierRank(profile.supporterTier) > tierRank(tier)
                            ? 'Included'
                            : tierRank(profile.supporterTier) === tierRank(tier)
                              ? 'Current Tier'
                              : 'Upgrade with Stripe'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {settingsTab === 'security' ? (
                <div className="settings-section-card">
                  <p className="muted">Email: {currentUserEmail || 'Unknown'}</p>
                  <button className="secondary" onClick={linkGoogleAccount} disabled={authLoading || currentUserProvider.toLowerCase() === 'google'}>
                    {currentUserProvider.toLowerCase() === 'google' ? 'Google Linked' : 'Link Google Account'}
                  </button>
                  <label>
                    New password
                    <div className="password-row">
                      <input
                        type={showAccountPassword ? 'text' : 'password'}
                        value={accountNewPassword}
                        onChange={(event) => setAccountNewPassword(event.target.value)}
                      />
                      <button type="button" className="password-eye" onClick={() => setShowAccountPassword((value) => !value)} aria-label="Toggle new password visibility">
                        {showAccountPassword ? (
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M3 3l18 18" />
                            <path d="M10.6 10.7A3 3 0 0013.3 13.4" />
                            <path d="M9.5 4.6A11.3 11.3 0 0112 4.3c6.7 0 10.5 7.7 10.5 7.7a16.9 16.9 0 01-4 5.2" />
                            <path d="M6.1 6.2A16.8 16.8 0 001.5 12s3.8 7.7 10.5 7.7a11 11 0 004.2-.8" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M1.5 12S5.3 4.3 12 4.3 22.5 12 22.5 12 18.7 19.7 12 19.7 1.5 12 1.5 12z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </label>
                  <label>
                    Verify new password
                    <input
                      type={showAccountPassword ? 'text' : 'password'}
                      value={accountConfirmPassword}
                      onChange={(event) => setAccountConfirmPassword(event.target.value)}
                    />
                  </label>
                  <button className="secondary" onClick={updateAccountPassword} disabled={authLoading || accountNewPassword.length === 0 || accountConfirmPassword.length === 0}>
                    Change Password
                  </button>
                  <button className="secondary" onClick={refreshSupporterTier}>
                    Refresh Tier
                  </button>
                  <button className="secondary" onClick={signOut}>
                    Sign Out
                  </button>
                  <button
                    className="danger"
                    onClick={() => {
                      setResetConfirmText('')
                      setShowResetConfirmModal(true)
                    }}
                  >
                    Reset Progress and Data
                  </button>
                  {authSuccess ? <p className="saved-pill">{authSuccess}</p> : null}
                  {authError ? <p className="bad">{authError}</p> : null}
                </div>
              ) : null}
              </div>
            </div>
          </section>
        )}
      </main>

      {homeLeaderboardSettingsOpen ? (
        <div className="profile-modal-overlay home-leaderboard-settings-overlay" onClick={closeHomeLeaderboardSettings}>
          <div className="card home-leaderboard-settings-modal home-leaderboard-settings-modal-modern" onClick={(event) => event.stopPropagation()}>
            <div className="home-leaderboard-settings-topbar">
              <div className="home-leaderboard-settings-head">
                <h3>Customize Home Leaderboards</h3>
                <small>Live preview is active. Save to make it persistent.</small>
              </div>
              <button className="secondary" onClick={closeHomeLeaderboardSettings} disabled={homeLeaderboardSettingsSaving}>
                Cancel
              </button>
            </div>

            <div className="home-leaderboard-mode-row">
              <div className="home-leaderboard-mode-card">
                <p className="home-leaderboard-mode-title">1v1 Most Wins Source</p>
                <div className="mini-chip-row">
                  {duelLeaderboardModeOrder.map((mode) => (
                    <button
                      key={`home-duel-wins-mode-${mode}`}
                      className={homeLeaderboardSettingsDraft.duelWinsMode === mode ? 'chip chip-active' : 'chip'}
                      onClick={() => setHomeLeaderboardDraftMode('duelWinsMode', mode)}
                    >
                      {duelLeaderboardModeLabel[mode]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="home-leaderboard-mode-card">
                <p className="home-leaderboard-mode-title">1v1 Streak Source</p>
                <div className="mini-chip-row">
                  {duelLeaderboardModeOrder.map((mode) => (
                    <button
                      key={`home-duel-streak-mode-${mode}`}
                      className={homeLeaderboardSettingsDraft.duelStreakMode === mode ? 'chip chip-active' : 'chip'}
                      onClick={() => setHomeLeaderboardDraftMode('duelStreakMode', mode)}
                    >
                      {duelLeaderboardModeLabel[mode]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="home-leaderboard-live-row">
              <p className="muted home-leaderboard-selection-note">
                {homeLeaderboardSettingsDraft.visibleCards.length === 0
                  ? 'No boards selected for Home right now.'
                  : `${homeLeaderboardSettingsDraft.visibleCards.length} board${homeLeaderboardSettingsDraft.visibleCards.length === 1 ? '' : 's'} selected.`}
              </p>
              <div className="actions-row home-leaderboard-settings-actions-inline">
                <button className="secondary" onClick={selectAllHomeLeaderboardCards} disabled={homeLeaderboardSettingsSaving}>Select All</button>
                <button className="secondary" onClick={clearAllHomeLeaderboardCards} disabled={homeLeaderboardSettingsSaving}>Select None</button>
                <button className="secondary" onClick={resetHomeLeaderboardDraftDefaults} disabled={homeLeaderboardSettingsSaving}>Reset Default</button>
              </div>
            </div>

            <div className="home-leaderboard-live-preview">
              {homeVisibleLeaderboardCards.length === 0 ? (
                <span className="home-leaderboard-preview-pill home-leaderboard-preview-empty">No cards visible</span>
              ) : (
                homeVisibleLeaderboardCards.map((card) => (
                  <span key={`home-preview-${card}`} className="home-leaderboard-preview-pill">
                    {homeLeaderboardCardLabel[card]}
                  </span>
                ))
              )}
            </div>

            <div className="home-leaderboard-settings-grid home-leaderboard-settings-grid-modern">
              {homeLeaderboardCardOrder.map((card) => {
                const selected = homeLeaderboardSettingsDraft.visibleCards.includes(card)
                return (
                  <button
                    key={`home-leaderboard-card-${card}`}
                    className={selected ? 'home-leaderboard-toggle home-leaderboard-toggle-active' : 'home-leaderboard-toggle'}
                    onClick={() => toggleHomeLeaderboardDraftCard(card)}
                  >
                    <span className="home-leaderboard-toggle-top">
                      <span className="home-leaderboard-toggle-title-wrap">
                        <AppIcon name={homeLeaderboardCardIcon[card]} className="home-leaderboard-toggle-icon" />
                        <span>{homeLeaderboardCardLabel[card]}</span>
                      </span>
                      <span className={selected ? 'home-leaderboard-toggle-state shown' : 'home-leaderboard-toggle-state hidden'}>
                        {selected ? 'Shown' : 'Hidden'}
                      </span>
                    </span>
                    <small>{homeLeaderboardCardDescription[card]}</small>
                  </button>
                )
              })}
            </div>
            {homeLeaderboardSettingsError ? <p className="bad">{homeLeaderboardSettingsError}</p> : null}
            <div className="actions-row home-leaderboard-settings-actions">
              <button className="primary" onClick={() => void saveHomeLeaderboardSettings()} disabled={homeLeaderboardSettingsSaving}>
                {homeLeaderboardSettingsSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {homeWhatsNewOpen ? (
        <div className="profile-modal-overlay home-whats-new-overlay" onClick={() => setHomeWhatsNewOpen(false)}>
          <div className="card home-whats-new-modal" onClick={(event) => event.stopPropagation()}>
            <div className="home-whats-new-head">
              <div className="home-whats-new-title-wrap">
                <p className="eyebrow">Release Notes</p>
                <h3>What’s New · v0.40</h3>
              </div>
              <button className="secondary" onClick={() => setHomeWhatsNewOpen(false)}>
                Close
              </button>
            </div>
            <div className="home-whats-new-list">
              {releaseNotesV040.map((group) => (
                <article key={`v040-note-${group.title}`} className="home-whats-new-card">
                  <h4>{group.title}</h4>
                  <ul>
                    {group.items.map((item) => (
                      <li key={`${group.title}-${item}`}>{item}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {showResetConfirmModal ? (
        <div
          className="profile-modal-overlay"
          onClick={() => {
            if (authLoading) return
            setShowResetConfirmModal(false)
            setResetConfirmText('')
          }}
        >
          <div
            className="card profile-modal-card"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Confirm Reset</h3>
            <p className="bad">
              This will permanently delete your progress, mastered codes, study stats, streaks, and leaderboard scores.
            </p>
            <p className="muted">Type RESET to confirm.</p>
            <input
              value={resetConfirmText}
              onChange={(event) => setResetConfirmText(event.target.value)}
              placeholder="Type RESET"
            />
            <div className="actions-row">
              <button
                className="secondary cancel-button"
                onClick={() => {
                  if (authLoading) return
                  setShowResetConfirmModal(false)
                  setResetConfirmText('')
                }}
                disabled={authLoading}
              >
                Cancel
              </button>
              <button
                className="danger"
                onClick={() => void resetEverything()}
                disabled={authLoading || resetConfirmText.trim().toUpperCase() !== 'RESET'}
              >
                {authLoading ? 'Resetting...' : 'Yes, Reset Everything'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showAssistedLearningInfo ? (
        <div className="profile-modal-overlay assisted-info-overlay" onClick={() => setShowAssistedLearningInfo(false)}>
          <div className="card profile-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="quiz-top">
              <h3>Assisted Learning</h3>
              <button className="secondary" onClick={() => setShowAssistedLearningInfo(false)}>Close</button>
            </div>
            <p className="muted">
              Assisted Learning adapts question frequency based on your performance.
            </p>
            <ul className="muted">
              <li>Codes you miss more often appear more frequently.</li>
              <li>Codes you consistently answer correctly appear less often.</li>
              <li>Mastered codes are still included, but at lower frequency.</li>
              <li>This applies to Quick Quiz and Flashcards.</li>
            </ul>
          </div>
        </div>
      ) : null}

      {showDevNotice && currentUserId ? (
        <div
          className="profile-modal-overlay dev-notice-overlay"
          onClick={() => {
            window.localStorage.setItem(`dev_notice_dismissed_${currentUserId}`, '1')
            setShowDevNotice(false)
          }}
        >
          <div className="card profile-modal-card dev-notice-card" onClick={(event) => event.stopPropagation()}>
            <div className="quiz-top">
              <div className="dev-notice-heading">
                <AppIcon name="warning" className="dev-notice-icon" />
                <h3>Development Notice</h3>
              </div>
              <button
                className="secondary"
                onClick={() => {
                  window.localStorage.setItem(`dev_notice_dismissed_${currentUserId}`, '1')
                  setShowDevNotice(false)
                }}
              >
                Close
              </button>
            </div>
            <p className="muted">
              This website is still in development by Roland. Expect bugs. He will continue to develop this whenever he has a chance, such as never.
            </p>
            <button
              className="primary"
              onClick={() => {
                window.localStorage.setItem(`dev_notice_dismissed_${currentUserId}`, '1')
                setShowDevNotice(false)
              }}
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}

      {selectedLeaderboardEntry ? (
        <div
          className="profile-modal-overlay leaderboard-profile-overlay leaderboard-profile-overlay-themed"
          style={selectedLeaderboardThemeStyle}
          onClick={() => {
            setSelectedLeaderboardEntry(null)
            setSelectedLeaderboardIsTop(false)
          }}
        >
          <div className={`card profile-modal-card ${selectedLeaderboardThemeCardClass}`} onClick={(event) => event.stopPropagation()}>
            <div className="quiz-top">
              <h3>Player Profile</h3>
              <button
                className="secondary"
                onClick={() => {
                  setSelectedLeaderboardEntry(null)
                  setSelectedLeaderboardIsTop(false)
                }}
              >
                Close
              </button>
            </div>
            <div className="leader-player">
              <span className="leader-avatar-wrap">
                {selectedLeaderboardIsTop ? <span className="leader-crown leader-crown-modal" aria-label="Top Player">👑</span> : null}
                <span className={leaderAvatarFrameClass(selectedLeaderboardEntry.userId, 'modal-avatar')}>
                  <img src={avatarFor(selectedLeaderboardEntry.avatarUrl)} alt={selectedLeaderboardEntry.playerName} className="leader-avatar" onError={handleAvatarImageError} />
                </span>
              </span>
              <div className="leader-profile-head">
                <div className="leader-profile-name-row">
                  <h3 className={`leader-profile-name ${displayNameClass(selectedLeaderboardEntry.supporterTier, true)}`} style={leaderboardProfileNameStyle}>
                    {selectedLeaderboardEntry.playerName}
                  </h3>
                  <span className={`profile-presence-pill is-${selectedLeaderboardCurrentActivity.state}`}>
                    {selectedLeaderboardCurrentActivity.statusLabel}
                  </span>
                </div>
                <div className="leader-profile-pills">
                  <p className="leader-theme-pill">Tier: {tierLabel[selectedLeaderboardEntry.supporterTier]}</p>
                  {selectedLeaderboardEntry.isOwner ? <p className="owner-pill owner-pill-inline">Owner</p> : null}
                </div>
              </div>
            </div>
            <div className="leader-profile-grid">
              <div className="leader-profile-item">
                <p className="leader-profile-label">Agency</p>
                <p>{selectedLeaderboardEntry.agency || 'Not provided'}</p>
              </div>
              <div className="leader-profile-item">
                <p className="leader-profile-label">Most Studied</p>
                <p>
                  {selectedLeaderboardEntry.mostStudiedMode
                    ? selectedLeaderboardEntry.mostStudiedMode === 'all'
                      ? 'All'
                      : codeSetLabel[selectedLeaderboardEntry.mostStudiedMode]
                    : 'No study data yet'}
                </p>
              </div>
              <div className="leader-profile-item">
                <p className="leader-profile-label">Current Activity</p>
                <div className="leader-profile-activity">
                  <p className={`leader-profile-activity-main is-${selectedLeaderboardCurrentActivity.state}`}>
                    {selectedLeaderboardCurrentActivity.mainLabel}
                  </p>
                  <p className="leader-profile-activity-sub">{selectedLeaderboardCurrentActivity.subLabel}</p>
                </div>
              </div>
              <div className="leader-profile-item leader-profile-item-wide">
                <p className="leader-profile-label">About Me</p>
                <p>{selectedLeaderboardEntry.bio || 'Not provided'}</p>
              </div>
            </div>
            <div className="leader-profile-stats">
              <div className="leader-profile-stat">
                <p className="leader-profile-label">Mastered</p>
                <strong>{selectedLeaderboardEntry.masteredCodes}</strong>
              </div>
              <div className="leader-profile-stat">
                <p className="leader-profile-label">Study Time</p>
                <strong>{formatStudyTime(selectedLeaderboardEntry.studySeconds)}</strong>
              </div>
              <div className="leader-profile-stat">
                <p className="leader-profile-label">Day Streak</p>
                <strong>{selectedLeaderboardEntry.studyDayStreak} day{selectedLeaderboardEntry.studyDayStreak === 1 ? '' : 's'}{selectedLeaderboardEntry.studyDayStreak >= 7 ? ' 🔥' : ''}</strong>
              </div>
              <div className="leader-profile-stat">
                <p className="leader-profile-label">1v1 Record</p>
                <strong>
                  {selectedLeaderboardEntry.duelWins}-{selectedLeaderboardEntry.duelLosses}
                  {selectedLeaderboardEntry.duelCurrentWinStreak > 0 ? (
                    <span className="leader-record-streak-inline">
                      <span className="leader-win-streak-icon" aria-hidden>🔥</span>
                      {selectedLeaderboardEntry.duelCurrentWinStreak}
                    </span>
                  ) : null}
                </strong>
              </div>
              <div className="leader-profile-stat">
                <p className="leader-profile-label">#1 Spots</p>
                <strong>{selectedLeaderboardAllTimeFirstSpots}</strong>
                <span className="leader-profile-substat">Weekly: {selectedLeaderboardWeeklyFirstSpots}</span>
              </div>
            </div>
            <div className="leader-profile-footer">
              <p className="muted">
                {selectedLeaderboardEntry.round > 0
                  ? `Best ${selectedLeaderboardEntry.game} score: ${selectedLeaderboardEntry.score} • Round ${selectedLeaderboardEntry.round}`
                  : `${selectedLeaderboardEntry.game}: ${selectedLeaderboardEntry.game === 'Study Time'
                    ? formatStudyTime(selectedLeaderboardEntry.score)
                    : selectedLeaderboardEntry.game === 'Study Streak'
                      ? `${selectedLeaderboardEntry.score} day${selectedLeaderboardEntry.score === 1 ? '' : 's'}`
                      : selectedLeaderboardEntry.score}`}
              </p>
              <p className="leader-theme-pill">Theme: {selectedLeaderboardTheme.name}</p>
            </div>
          </div>
        </div>
      ) : null}

      {celebration ? (
        <div className="celebration-overlay" aria-live="polite">
          <div className="celebration-card">
            <h3>{celebration.title}</h3>
            <p>{celebration.subtitle}</p>
          </div>
          <div className="celebration-burst" key={`burst-${celebration.burst}`}>
            {Array.from({ length: 52 }).map((_, index) => (
              <span key={`confetti-${celebration.burst}-${index}`} className="confetti-dot" style={{ ['--i' as string]: `${index}` }} />
            ))}
          </div>
        </div>
      ) : null}

      {avatarCropOpen ? (
        <div className="profile-modal-overlay" onClick={cancelAvatarCrop}>
          <div className="card avatar-crop-card" onClick={(event) => event.stopPropagation()}>
            <h3>Crop Profile Picture</h3>
            <div className="avatar-crop-frame">
              <img
                src={avatarCropSourceUrl}
                alt="Crop preview"
                className="avatar-crop-image"
                style={{
                  transform: `translate(calc(-50% + ${avatarCropX}px), calc(-50% + ${avatarCropY}px)) scale(${avatarCropZoom})`,
                }}
              />
            </div>
            <div className="avatar-crop-controls">
              <label>
                Zoom: {avatarCropZoom.toFixed(2)}x
                <input type="range" min={1} max={3} step={0.01} value={avatarCropZoom} onChange={(event) => setAvatarCropZoom(Number(event.target.value))} />
              </label>
              <label>
                Horizontal
                <input type="range" min={-140} max={140} step={1} value={avatarCropX} onChange={(event) => setAvatarCropX(Number(event.target.value))} />
              </label>
              <label>
                Vertical
                <input type="range" min={-140} max={140} step={1} value={avatarCropY} onChange={(event) => setAvatarCropY(Number(event.target.value))} />
              </label>
            </div>
            <div className="actions-row">
              <button className="secondary cancel-button" onClick={cancelAvatarCrop}>Cancel</button>
              <button className="primary" onClick={applyAvatarCrop}>Use This Crop</button>
            </div>
          </div>
        </div>
      ) : null}

      {showMatchSetupModal ? (
        <div className="profile-modal-overlay game-setup-overlay" onClick={() => setShowMatchSetupModal(false)}>
          <div className="card game-settings-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Matching Settings</h3>
            <label className="game-control">
              Code Set
              <div className="segmented">
                {(['all', 'penal', 'hs', 'vehicle'] as CodeFilter[]).map((filter) => (
                  <button key={`match-setup-${filter}`} className={gamesSelection.filter === filter ? 'seg active' : 'seg'} onClick={() => setGamesSelection((prev) => ({ ...prev, filter }))}>
                    {filter === 'all' ? 'All' : codeSetLabel[filter]}
                  </button>
                ))}
              </div>
            </label>
            <label className="game-control">
              Time
              <div className="segmented">
                {[15, 30, 60].map((time) => (
                  <button key={`match-setup-time-${time}`} className={gamesSelection.duration === time ? 'seg active' : 'seg'} onClick={() => setGamesSelection((prev) => ({ ...prev, duration: time as HomeDurationFilter }))}>
                    {time}s
                  </button>
                ))}
              </div>
            </label>
            <div className="actions-row">
              <button className="secondary cancel-button" onClick={() => setShowMatchSetupModal(false)}>Cancel</button>
              <button className="primary" onClick={beginMatchingFromSetup}>Start</button>
            </div>
          </div>
        </div>
      ) : null}

      {showSpeedSetupModal ? (
        <div className="profile-modal-overlay game-setup-overlay" onClick={() => setShowSpeedSetupModal(false)}>
          <div className="card game-settings-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Speed Test Settings</h3>
            <label className="game-control">
              Code Set
              <div className="segmented">
                {(['all', 'penal', 'hs', 'vehicle'] as CodeFilter[]).map((filter) => (
                  <button key={`speed-setup-${filter}`} className={gamesSelection.filter === filter ? 'seg active' : 'seg'} onClick={() => setGamesSelection((prev) => ({ ...prev, filter }))}>
                    {filter === 'all' ? 'All' : codeSetLabel[filter]}
                  </button>
                ))}
              </div>
            </label>
            <label className="game-control">
              Time
              <div className="segmented">
                {[15, 30, 60].map((time) => (
                  <button key={`speed-setup-time-${time}`} className={gamesSelection.duration === time ? 'seg active' : 'seg'} onClick={() => setGamesSelection((prev) => ({ ...prev, duration: time as HomeDurationFilter }))}>
                    {time}s
                  </button>
                ))}
              </div>
            </label>
            <div className="actions-row">
              <button className="secondary cancel-button" onClick={() => setShowSpeedSetupModal(false)}>Cancel</button>
              <button className="primary" onClick={beginSpeedFromSetup} disabled={speedQuestionBank.length === 0}>Start</button>
            </div>
          </div>
        </div>
      ) : null}
          </div>
        </div>
        {mobileQuickLinks.length > 0 ? (
          <div className="mobile-quick-strip" aria-label="Mobile quick shortcuts">
            <div className="mobile-quick-strip-track">
              {mobileQuickLinks.map((link) => (
                <button key={link.key} className={link.active ? 'mobile-quick-chip active' : 'mobile-quick-chip'} onClick={link.onClick}>
                  <AppIcon name={link.icon} className="mobile-bottom-icon" />
                  <span>{link.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
          <button className={isStudyPage ? 'mobile-bottom-tab active' : 'mobile-bottom-tab'} onClick={() => navigateToTab('study')}>
            <AppIcon name="study" className="mobile-bottom-icon" />
            <span>Study</span>
          </button>
          <button className={isGamesPage ? 'mobile-bottom-tab active' : 'mobile-bottom-tab'} onClick={() => navigateToTab('games')}>
            <AppIcon name="games" className="mobile-bottom-icon" />
            <span>Games</span>
          </button>
          <button className={isHomePage ? 'mobile-bottom-tab active' : 'mobile-bottom-tab'} onClick={() => navigateToTab('home')}>
            <AppIcon name="home" className="mobile-bottom-icon" />
            <span>Home</span>
          </button>
          <button className={isScenariosPage ? 'mobile-bottom-tab active' : 'mobile-bottom-tab'} onClick={() => navigateToTab('scenarios')}>
            <AppIcon name="scenarios" className="mobile-bottom-icon" />
            <span>Scenarios</span>
          </button>
          <button
            className={
              mobileNavMenuOpen ||
              isLibraryPage ||
              isProfilePage ||
              isStatsPage ||
              isSupportPage ||
              isLeaderboardsPage ||
              isChatPage
                ? 'mobile-bottom-tab active'
                : 'mobile-bottom-tab'
            }
            onClick={() => setMobileNavMenuOpen((value) => !value)}
          >
            <AppIcon name="settings" className="mobile-bottom-icon" />
            <span>Menu</span>
          </button>
        </nav>
        {mobileNavMenuOpen ? (
          <div className="mobile-nav-backdrop" onClick={() => setMobileNavMenuOpen(false)}>
            <div className="mobile-nav-sheet card" onClick={(event) => event.stopPropagation()}>
              <div className="mobile-nav-sheet-head">
                <h3>Quick Access</h3>
                <button className="secondary" onClick={() => setMobileNavMenuOpen(false)}>Close</button>
              </div>
              <div className="mobile-nav-grid">
                <button className={isLibraryPage ? 'mobile-nav-action active' : 'mobile-nav-action'} onClick={() => navigateToTab('library')}>
                  <AppIcon name="library" className="mobile-bottom-icon" />
                  <span>Library</span>
                </button>
                <button className={isLeaderboardsPage ? 'mobile-nav-action active' : 'mobile-nav-action'} onClick={() => navigateToTab('leaderboards')}>
                  <AppIcon name="leaderboards" className="mobile-bottom-icon" />
                  <span>Leaderboards</span>
                </button>
                <button className={isStatsPage ? 'mobile-nav-action active' : 'mobile-nav-action'} onClick={() => { setMobileNavMenuOpen(false); goToPath('/stats') }}>
                  <AppIcon name="stats" className="mobile-bottom-icon" />
                  <span>Stats</span>
                </button>
                <button className={isChatPage ? 'mobile-nav-action active' : 'mobile-nav-action'} onClick={() => navigateToTab('chat')}>
                  <AppIcon name="chat" className="mobile-bottom-icon" />
                  <span>Chat</span>
                </button>
                <button className={isProfilePage ? 'mobile-nav-action active' : 'mobile-nav-action'} onClick={() => { setMobileNavMenuOpen(false); goToPath('/profile') }}>
                  <AppIcon name="settings" className="mobile-bottom-icon" />
                  <span>Settings</span>
                </button>
                <button className={isSupportPage ? 'mobile-nav-action active' : 'mobile-nav-action'} onClick={() => { setMobileNavMenuOpen(false); goToPath('/support') }}>
                  <AppIcon name="support" className="mobile-bottom-icon" />
                  <span>Support</span>
                </button>
              </div>

              <p className="mobile-nav-group-label">Study</p>
              <div className="mobile-nav-grid mobile-nav-grid-sub">
                <button className={isStudyHubPage ? 'mobile-nav-action active' : 'mobile-nav-action'} onClick={() => navigateToTab('study')}>
                  <AppIcon name="study" className="mobile-bottom-icon" />
                  <span>Study Hub</span>
                </button>
                <button className={isStudyGuidePage ? 'mobile-nav-action active' : 'mobile-nav-action'} onClick={() => { setMobileNavMenuOpen(false); openStudyGuidePage() }}>
                  <AppIcon name="study" className="mobile-bottom-icon" />
                  <span>Study Guide</span>
                </button>
                <button className={isStudyPracticeTestPage ? 'mobile-nav-action active' : 'mobile-nav-action'} onClick={() => { setMobileNavMenuOpen(false); openStudyPracticeTestPage() }}>
                  <AppIcon name="test" className="mobile-bottom-icon" />
                  <span>Practice Test</span>
                </button>
                <button className={isStudyFlashcardsPage ? 'mobile-nav-action active' : 'mobile-nav-action'} onClick={() => { setMobileNavMenuOpen(false); openStudyFlashcardsPage() }}>
                  <AppIcon name="flashcards" className="mobile-bottom-icon" />
                  <span>Flashcards</span>
                </button>
                <button className={isStudyTestPage ? 'mobile-nav-action active' : 'mobile-nav-action'} onClick={() => { setMobileNavMenuOpen(false); openStudyTestPage() }}>
                  <AppIcon name="test" className="mobile-bottom-icon" />
                  <span>Test</span>
                </button>
              </div>

              <p className="mobile-nav-group-label">Games</p>
              <div className="mobile-nav-grid mobile-nav-grid-sub">
                <button className={isGamesHubPage ? 'mobile-nav-action active' : 'mobile-nav-action'} onClick={() => navigateToTab('games')}>
                  <AppIcon name="games" className="mobile-bottom-icon" />
                  <span>Games Hub</span>
                </button>
                <button className={isGamesSpeedPage ? 'mobile-nav-action active' : 'mobile-nav-action'} onClick={() => { setMobileNavMenuOpen(false); goToPath('/games/speed', { tab: 'games' }) }}>
                  <AppIcon name="speed" className="mobile-bottom-icon" />
                  <span>Speed Test</span>
                </button>
                <button className={isGamesMatchingPage ? 'mobile-nav-action active' : 'mobile-nav-action'} onClick={() => { setMobileNavMenuOpen(false); goToPath('/games/matching', { tab: 'games' }) }}>
                  <AppIcon name="games" className="mobile-bottom-icon" />
                  <span>Matching</span>
                </button>
                <button className={isGamesDuelPage ? 'mobile-nav-action active' : 'mobile-nav-action'} onClick={() => { setMobileNavMenuOpen(false); goToPath('/games/duel', { tab: 'games' }) }}>
                  <AppIcon name="duel" className="mobile-bottom-icon" />
                  <span>1v1</span>
                </button>
              </div>
            </div>
          </div>
        ) : null}
        </>
      ) : null}

      {authReady && currentUserId && !isChatPage ? (
        <GlobalChatWidget
          currentUserId={currentUserId}
          currentUsername={profileUsername}
          userAgency={profileDetails?.agency}
          isOwner={isOwner}
          leaderboardFirstSpotCounts={{
            allTime: allTimeFirstSpotCountsByUser,
            weekly: weeklyFirstSpotCountsByUser,
          }}
        />
      ) : null}
      <SpeedInsights />
      <Analytics />
    </div>
  )
}

export default App
