import { useEffect, useMemo, useRef, useState, type CSSProperties, type SyntheticEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { FireFlame, type FireFlameOption } from '@9am/fire-flame-react'
import './App.css'
import { loadLocalContentBundle, type ContentBankItem, type ScenarioBankItem } from './content'
import { useOwner } from './hooks/useOwner'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { OneVsOnePanel } from './components/OneVsOnePanel'
import { GlobalChatWidget } from './components/GlobalChatWidget'
import './components/GlobalChatWidget.css'

type CodeSet = 'penal' | 'hs' | 'vehicle'
type CodeFilter = CodeSet | 'all'
type SupporterTier = 'free' | 'tier2' | 'tier5' | 'tier10'
type AppTab = 'library' | 'study' | 'games' | 'scenarios' | 'home'
type HomeDurationFilter = 15 | 30 | 60
type GameModeSelection = {
  duration: HomeDurationFilter
  filter: CodeFilter
}
type AppIconName = 'study' | 'games' | 'scenarios' | 'support' | 'home' | 'library' | 'flashcards' | 'warning'
type StatsIconName = 'overview' | 'time' | 'words' | 'penal' | 'flashcards' | 'scenarios' | 'streak' | 'game' | 'studyset'
type StudyWrongness = 'balanced' | 'needs_work' | 'most_needs_work'
type StudyAnswerMode = 'multiple' | 'truefalse'

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
  homeLeaderboardRotationMs: number
  themeId: string
  nameStyle: NameStyle
  namePresets: NameStylePreset[]
  stats: UserStats
  algorithmSnapshot?: Record<string, PersistedAlgorithmStat>
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
}

type SessionMode = 'study_test' | 'matching' | 'speed'

type SessionTrack = {
  lastAttempt: SessionAttemptSnapshot | null
  accuracyHistory: number[]
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

type LeaderPreviewItem = {
  rank: number
  playerName: string
  score: number
  isCurrentUser: boolean
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
  trend: number[]
  focusTips: string[]
  leaderboardPreview: LeaderPreviewItem[]
  currentRank: number | null
  previousRank: number | null
}

type SettingsTab = 'profile' | 'customization' | 'support' | 'security' | 'editor' | 'agencies'

const defaultLeaderboardRotationMs = 3600

const defaultAgency = 'Unaffiliated'
const appSettingsRowId = 'global'
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
const homeLeaderboardRotationSteps = homeLeaderboardRotationDurations.flatMap((duration) =>
  homeLeaderboardRotationCodeSets.map((codeSet) => ({ duration, codeSet })),
)

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
  return stats.sessionTracks[trackKey] || { lastAttempt: null, accuracyHistory: [] }
}

function getLeaderboardPreview(
  entries: LeaderboardEntry[],
  game: 'Matching' | 'Speed Test',
  duration: number,
  filter: CodeFilter,
  currentUserId: string,
) {
  const scoped = entries
    .filter((entry) => entry.game === game)
    .filter((entry) => entry.matchDuration === duration && entry.matchFilter === filter)
    .sort((left, right) => right.score - left.score || right.round - left.round)
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
    swatch: 'linear-gradient(120deg, #0b1f45, #0a1228)',
    vars: {
      bg: '#091225',
      panel: 'rgba(35, 51, 84, 0.72)',
      panelStrong: 'rgba(41, 58, 97, 0.92)',
      border: 'rgba(158, 180, 228, 0.22)',
      text: '#f0f4ff',
      muted: '#b3bedf',
      accent: '#4ba4ff',
      good: '#34d17b',
      bad: '#ff6666',
      bodyRadial: '#11306d',
      bodyBase: '#070d1d',
    },
  },
  {
    id: 'pastel-sky',
    name: 'Pastel Sky',
    swatch: 'linear-gradient(120deg, #9bc9ff, #cde0ff)',
    vars: {
      bg: '#e8f2ff',
      panel: 'rgba(215, 231, 255, 0.84)',
      panelStrong: 'rgba(204, 222, 251, 0.95)',
      border: 'rgba(90, 124, 186, 0.3)',
      text: '#10213f',
      muted: '#455e8f',
      accent: '#2f78f4',
      good: '#26995e',
      bad: '#c64c5f',
      bodyRadial: '#82b7ff',
      bodyBase: '#dcecff',
    },
  },
  {
    id: 'pastel-rose',
    name: 'Pastel Rose',
    swatch: 'linear-gradient(120deg, #ffd6e8, #ffe6c8)',
    vars: {
      bg: '#fff7fb',
      panel: 'rgba(255, 238, 247, 0.86)',
      panelStrong: 'rgba(255, 232, 243, 0.96)',
      border: 'rgba(189, 128, 154, 0.26)',
      text: '#301c2e',
      muted: '#6f5470',
      accent: '#ca5f95',
      good: '#2a9b71',
      bad: '#c84e62',
      bodyRadial: '#ffd3ea',
      bodyBase: '#fff2f7',
    },
  },
  {
    id: 'pure-white',
    name: 'Clean White',
    swatch: 'linear-gradient(120deg, #ffffff, #f5f7fb)',
    vars: {
      bg: '#ffffff',
      panel: 'rgba(248, 250, 254, 0.92)',
      panelStrong: 'rgba(242, 246, 252, 0.97)',
      border: 'rgba(132, 148, 177, 0.26)',
      text: '#101827',
      muted: '#4c596f',
      accent: '#2f6ae8',
      good: '#248a57',
      bad: '#bf4558',
      bodyRadial: '#edf2fa',
      bodyBase: '#f8fafd',
    },
  },
  {
    id: 'pure-black',
    name: 'Graphite Black',
    swatch: 'linear-gradient(120deg, #161616, #080808)',
    vars: {
      bg: '#070707',
      panel: 'rgba(29, 29, 31, 0.82)',
      panelStrong: 'rgba(36, 36, 39, 0.93)',
      border: 'rgba(180, 180, 185, 0.24)',
      text: '#f7f7f7',
      muted: '#b9b9bf',
      accent: '#5f9aff',
      good: '#39c07a',
      bad: '#ff6c6c',
      bodyRadial: '#2a2a2f',
      bodyBase: '#050505',
    },
  },
  {
    id: 'golden',
    name: 'Executive Gold',
    swatch: 'linear-gradient(120deg, #3f2a08, #d5a12a 55%, #8b6312)',
    vars: {
      bg: '#1d1406',
      panel: 'rgba(82, 57, 17, 0.8)',
      panelStrong: 'rgba(96, 67, 20, 0.93)',
      border: 'rgba(237, 200, 112, 0.38)',
      text: '#fff6dc',
      muted: '#ebd2a0',
      accent: '#ffd069',
      good: '#5de3a0',
      bad: '#ff8a76',
      bodyRadial: '#b07e21',
      bodyBase: '#130b03',
    },
  },
  {
    id: 'ocean-mint',
    name: 'Ocean Mint',
    swatch: 'linear-gradient(120deg, #0f3e4a, #3cb9a0)',
    vars: {
      bg: '#062b35',
      panel: 'rgba(18, 65, 79, 0.78)',
      panelStrong: 'rgba(22, 74, 88, 0.93)',
      border: 'rgba(124, 210, 205, 0.28)',
      text: '#e8fcff',
      muted: '#a8d8de',
      accent: '#58d0bd',
      good: '#6df0b0',
      bad: '#ff8b86',
      bodyRadial: '#1d6f7f',
      bodyBase: '#051a23',
    },
  },
  {
    id: 'lavender-dusk',
    name: 'Lavender Dusk',
    swatch: 'linear-gradient(120deg, #4a3f7a, #8f7ad7)',
    vars: {
      bg: '#1d1a33',
      panel: 'rgba(56, 49, 96, 0.78)',
      panelStrong: 'rgba(67, 57, 111, 0.93)',
      border: 'rgba(184, 171, 255, 0.26)',
      text: '#f3f0ff',
      muted: '#c8c2eb',
      accent: '#9f8dff',
      good: '#63dca8',
      bad: '#ff7c9b',
      bodyRadial: '#544a91',
      bodyBase: '#141026',
    },
  },
]

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
}

const stripeTierLinks: Partial<Record<Exclude<SupporterTier, 'free'>, string>> = {
  tier2: (import.meta.env.VITE_STRIPE_LINK_TIER2 || '').trim(),
  tier5: (import.meta.env.VITE_STRIPE_LINK_TIER5 || '').trim(),
  tier10: (import.meta.env.VITE_STRIPE_LINK_TIER10 || '').trim(),
}
const appContentSource = String(import.meta.env.VITE_CONTENT_SOURCE || 'local')
  .trim()
  .toLowerCase()

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

function dayKeyUtc(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function previousDayKeyUtc(dayKey: string) {
  const parsed = new Date(`${dayKey}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return ''
  parsed.setUTCDate(parsed.getUTCDate() - 1)
  return dayKeyUtc(parsed)
}

function applyStudyDayActivity(stats: UserStats) {
  const today = dayKeyUtc()
  if (stats.lastStudyDay === today) return stats
  const continuesStreak = stats.lastStudyDay && previousDayKeyUtc(today) === stats.lastStudyDay
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

function buildScenarioQuestions(rows: ScenarioBankItem[]) {
  const fallbackDistractors = [
    'Document observations only and continue routine contact',
    'Investigate further using articulable facts and legal authority',
    'Insufficient facts for immediate enforcement action',
    'Reassess scene safety and gather additional witness evidence',
  ]

  return shuffle(
    rows.flatMap<ScenarioQuestion>((row) => {
      const codeSet = categoryToCodeSet(row.category, row.codeSection || '') || 'penal'
      const prompt = row.scenario.trim()
      const providedChoices = row.questions.map((item) => item.trim()).filter(Boolean).slice(0, 4)
      const correctChoice = (row.expectedAnswer || '').trim()

      if (providedChoices.length >= 2 && correctChoice && providedChoices.includes(correctChoice)) {
        const randomizedChoices = shuffle([...providedChoices])
        return [
          {
            id: row.id,
            codeSet,
            prompt,
            choices: randomizedChoices,
            correctIndex: Math.max(0, randomizedChoices.indexOf(correctChoice)),
            explanation: row.explanation?.trim() || (row.keyPoints || []).join(' '),
          },
        ]
      }

      const fallback = correctChoice || row.keyPoints?.[0] || row.title || 'Use the best lawful response.'
      const distractors = fallbackDistractors
        .filter((item) => item !== fallback)
        .slice(0, 3)
      const choices = shuffle([fallback, ...distractors]).slice(0, 4)
      return [
        {
          id: row.id,
          codeSet,
          prompt,
          choices,
          correctIndex: Math.max(0, choices.indexOf(fallback)),
          explanation: row.explanation?.trim() || (row.keyPoints || []).join(' '),
        },
      ]
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

function mastery(performance?: CodePerformance) {
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

function sanitizeLeaderboardRotationMs(input: unknown) {
  if (typeof input !== 'number' || Number.isNaN(input)) return defaultLeaderboardRotationMs
  return Math.max(2000, Math.min(12000, Math.round(input)))
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
  const sanitizeTrack = (entry: unknown): SessionTrack => {
    if (!entry || typeof entry !== 'object') return { lastAttempt: null, accuracyHistory: [] }
    const value = entry as { lastAttempt?: unknown; accuracyHistory?: unknown }
    return {
      lastAttempt: sanitizeAttempt(value.lastAttempt),
      accuracyHistory: sanitizeHistory(value.accuracyHistory),
    }
  }
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
      normalizedTracks[sessionTrackKey({ mode, filter: 'all', duration: mode === 'study_test' ? null : 0 })] = {
        lastAttempt: sanitizeAttempt(legacyAttemptsMap[mode]),
        accuracyHistory: sanitizeHistory(legacyHistoryMap[mode]),
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
  }
}

function mostStudiedModeFromStats(stats: UserStats): CodeFilter | null {
  const ranked: CodeFilter[] = ['penal', 'hs', 'vehicle', 'all']
  let winner: CodeFilter | null = null
  let max = 0
  for (const mode of ranked) {
    const value = stats.studyModeCounts[mode] || 0
    if (value > max) {
      max = value
      winner = mode
    }
  }
  return max > 0 ? winner : null
}

function hexToRgba(hex: string, alpha: number) {
  const value = hex.replace('#', '')
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
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
      homeLeaderboardRotationMs: defaultLeaderboardRotationMs,
      themeId: appThemePresets[0].id,
      nameStyle: { ...defaultNameStyle },
      namePresets: [],
      stats: { ...defaultUserStats, gamePlays: { ...defaultUserStats.gamePlays }, studyModeCounts: { ...defaultUserStats.studyModeCounts } },
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
            homeLeaderboardRotationMs: sanitizeLeaderboardRotationMs((state.profileDetails as Partial<ProfileDetails>).homeLeaderboardRotationMs),
            themeId: getThemePreset(String((state.profileDetails as Partial<ProfileDetails>).themeId || appThemePresets[0].id)).id,
            nameStyle: sanitizeNameStyle((state.profileDetails as Partial<ProfileDetails>).nameStyle),
            namePresets: sanitizeNamePresets((state.profileDetails as Partial<ProfileDetails>).namePresets),
            stats: sanitizeUserStats((state.profileDetails as Partial<ProfileDetails>).stats),
            algorithmSnapshot:
              (state.profileDetails as Partial<ProfileDetails>).algorithmSnapshot &&
              typeof (state.profileDetails as Partial<ProfileDetails>).algorithmSnapshot === 'object'
                ? ((state.profileDetails as Partial<ProfileDetails>).algorithmSnapshot as Record<string, PersistedAlgorithmStat>)
                : undefined,
          }
        : {
            bio: '',
            agency: defaultAgency,
            homeLeaderboardRotationMs: defaultLeaderboardRotationMs,
            themeId: appThemePresets[0].id,
            nameStyle: { ...defaultNameStyle },
            namePresets: [],
            stats: { ...defaultUserStats, gamePlays: { ...defaultUserStats.gamePlays }, studyModeCounts: { ...defaultUserStats.studyModeCounts } },
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

function LeaderboardPlayerName({ entry }: { entry: LeaderNameEntry }) {
  const streak = Math.max(0, Math.floor(entry.duelCurrentWinStreak || 0))
  return (
    <span className="leader-player-name-block">
      <span className={displayNameClass(entry.supporterTier, true)} style={displayNameStyle(entry.nameStyle, entry.supporterTier)}>
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
        <rect x="5" y="6" width="12" height="10" rx="2" />
        <path d="M9 4h9a2 2 0 0 1 2 2v9" />
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
  const stepX = safePoints.length > 1 ? usableWidth / (safePoints.length - 1) : 0
  const coords = safePoints.map((value, index) => {
    const clamped = Math.max(0, Math.min(100, value))
    const x = paddingX + index * stepX
    const y = paddingY + ((100 - clamped) / 100) * usableHeight
    return { x, y }
  })
  return {
    width,
    height,
    coords,
    path: coords.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' '),
  }
}

function SessionPerformanceReportCard({ report }: { report: SessionPerformanceReport }) {
  const trendValues = report.trend.length > 0 ? report.trend : [report.accuracy]
  const trend = buildTrendPath(trendValues)
  const lastPoint = trend.coords[trend.coords.length - 1]
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
          <p className="muted">{report.contextLabel} • Accuracy: {report.accuracy}%</p>
        </div>
      </div>

      <div className="session-trend-wrap">
        <svg viewBox={`0 0 ${trend.width} ${trend.height}`} className="session-trend-chart" role="img" aria-label="Accuracy trend">
          <path d={trend.path} className="session-trend-glow" />
          <path d={trend.path} className="session-trend-line" />
          <circle cx={lastPoint.x} cy={lastPoint.y} r="4.5" className="session-trend-dot" />
        </svg>
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
        {report.deltaAccuracy === null
          ? 'First tracked attempt for this mode. Keep building consistency.'
          : report.deltaAccuracy >= 0
            ? `You improved ${report.deltaAccuracy}% since your last attempt.`
            : `You are down ${Math.abs(report.deltaAccuracy)}% from your last attempt. Bounce back next run.`}
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

function App() {
  const location = useLocation()
  const navigate = useNavigate()

  const [sections, setSections] = useState<CodeSection[]>([])
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [scenarioItems, setScenarioItems] = useState<ScenarioBankItem[]>([])
  const [activeTab, setActiveTab] = useState<AppTab>('home')
  const [onlineUsersCount, setOnlineUsersCount] = useState(0)
  const [showStudyFlashSetupModal, setShowStudyFlashSetupModal] = useState(false)
  const [showStudyTestSetupModal, setShowStudyTestSetupModal] = useState(false)
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
  
  // Track online users - update last_active and fetch count
  useEffect(() => {
    const client = supabase
    if (!client || !currentUserId) return
    
    const updateLastActive = async () => {
      try {
        await client.from('profiles').update({ last_active: new Date().toISOString() }).eq('user_id', currentUserId)
      } catch (e) { /* ignore */ }
    }

    const fetchOnlineCount = async () => {
      try {
        const { data } = await client.rpc('get_online_users_count', { minutes_interval: 5 })
        setOnlineUsersCount(data || 0)
      } catch (e) { setOnlineUsersCount(0) }
    }

    updateLastActive()
    const interval = setInterval(() => {
      updateLastActive()
      fetchOnlineCount()
    }, 30000)
    fetchOnlineCount()

    return () => clearInterval(interval)
  }, [supabase, currentUserId])

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
  const [forceProfileSetup, setForceProfileSetup] = useState(false)
  const [profileDetails, setProfileDetails] = useState<ProfileDetails>({
    bio: '',
    agency: defaultAgency,
    homeLeaderboardRotationMs: defaultLeaderboardRotationMs,
    themeId: appThemePresets[0].id,
    nameStyle: { ...defaultNameStyle },
    namePresets: [],
    stats: { ...defaultUserStats, gamePlays: { ...defaultUserStats.gamePlays }, studyModeCounts: { ...defaultUserStats.studyModeCounts } },
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

  const [performance, setPerformance] = useState<Record<string, CodePerformance>>({})
  const [highScores, setHighScores] = useState(gameHighScoreSeed)
  const [bestStreak, setBestStreak] = useState(0)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [leaderboardError, setLeaderboardError] = useState('')
  const [selectedLeaderboardEntry, setSelectedLeaderboardEntry] = useState<LeaderboardEntry | null>(null)
  const [selectedLeaderboardIsTop, setSelectedLeaderboardIsTop] = useState(false)
  const [stateHydrated, setStateHydrated] = useState(false)
  const [celebration, setCelebration] = useState<{ title: string; subtitle: string; burst: number } | null>(null)
  const [homeStudyTimeLeaders, setHomeStudyTimeLeaders] = useState<HomeLeaderboardEntry[]>([])
  const [homeStudyStreakLeaders, setHomeStudyStreakLeaders] = useState<HomeLeaderboardEntry[]>([])
  const [homeMostMasteredLeaders, setHomeMostMasteredLeaders] = useState<HomeLeaderboardEntry[]>([])
  const [homeMatchingDurationFilter, setHomeMatchingDurationFilter] = useState<HomeDurationFilter>(15)
  const [homeMatchingCodeFilter, setHomeMatchingCodeFilter] = useState<CodeFilter>('all')
  const [homeSpeedDurationFilter, setHomeSpeedDurationFilter] = useState<HomeDurationFilter>(15)
  const [homeSpeedCodeFilter, setHomeSpeedCodeFilter] = useState<CodeFilter>('all')
  const [homeMatchingConfigOpen, setHomeMatchingConfigOpen] = useState(false)
  const [homeSpeedConfigOpen, setHomeSpeedConfigOpen] = useState(false)
  const [homeMasteredInfoOpen, setHomeMasteredInfoOpen] = useState(false)
  const [assistedLearningEnabled, setAssistedLearningEnabled] = useState(true)
  const [showAssistedLearningInfo, setShowAssistedLearningInfo] = useState(false)
  const [showDevNotice, setShowDevNotice] = useState(false)
  const [reduceVisualEffects, setReduceVisualEffects] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement | null>(null)

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
  const [matchSessionDuration, setMatchSessionDuration] = useState(30)
  const [matchSessionFilter, setMatchSessionFilter] = useState<CodeFilter>('all')
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
  const [speedSessionDuration, setSpeedSessionDuration] = useState(30)
  const [speedSessionFilter, setSpeedSessionFilter] = useState<CodeFilter>('all')
  const [showSpeedSetupModal, setShowSpeedSetupModal] = useState(false)
  const [speedFeedback, setSpeedFeedback] = useState('')
  const [scenarioDeck, setScenarioDeck] = useState<ScenarioQuestion[]>([])
  const [scenarioCurrentQuestion, setScenarioCurrentQuestion] = useState<ScenarioQuestion | null>(null)
  const [scenarioResult, setScenarioResult] = useState<string>('')
  const [scenarioSelectedChoice, setScenarioSelectedChoice] = useState<number | null>(null)
  const [scenarioStreak, setScenarioStreak] = useState(0)
  const [gamesMode, setGamesMode] = useState<'matching' | 'speed' | 'duel'>('matching')
  const homeMatchingRotationIndexRef = useRef(0)
  const homeSpeedRotationIndexRef = useRef(0)
  const lastAppStateUpdateRef = useRef(0)
  const highScoresRef = useRef(gameHighScoreSeed)
  const leaderboardRef = useRef<LeaderboardEntry[]>([])
  const matchScoreRef = useRef(0)
  const matchRoundRef = useRef(1)
  const speedScoreRef = useRef(0)
  const speedAnsweredCountRef = useRef(0)
  const matchCorrectCountRef = useRef(0)
  const matchIncorrectCountRef = useRef(0)
  const speedCorrectCountRef = useRef(0)
  const speedIncorrectCountRef = useRef(0)
  const recentSpeedSectionsRef = useRef<string[]>([])
  const quizFireHostRef = useRef<HTMLDivElement | null>(null)
  const scenarioFireHostRef = useRef<HTMLDivElement | null>(null)
  const scenarioNextRef = useRef<HTMLDivElement | null>(null)
  const scenarioPromptRef = useRef<HTMLHeadingElement | null>(null)
  const quizNextRef = useRef<HTMLButtonElement | null>(null)
  const [quizFireWidth, setQuizFireWidth] = useState(0)
  const [scenarioFireWidth, setScenarioFireWidth] = useState(0)
  const { isOwner, loading: ownerLoading } = useOwner(currentUserId || null)

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
    const loadAppSettings = async () => {
      const { data, error } = await client.from('app_settings').select('id,agencies').eq('id', appSettingsRowId).maybeSingle()
      if (cancelled) return
      if (error) {
        console.warn('[app_settings] failed loading agency settings:', error.message)
        return
      }
      const savedAgencies = sanitizeAgencyOptions(data?.agencies)
      setAgencyOptions(savedAgencies)
      setAgencySettingsId(String(data?.id || appSettingsRowId))
    }
    loadAppSettings().catch((error) => {
      console.warn('[app_settings] load crashed:', error)
    })
    return () => {
      cancelled = true
    }
  }, [currentUserId])

  useEffect(() => {
    setProfileDetails((previous) => {
      const normalized = normalizeAgency(previous.agency, agencyOptions)
      if (normalized === previous.agency) return previous
      return { ...previous, agency: normalized }
    })
  }, [agencyOptions])

  useEffect(() => {
    if (isOwner) return
    if (settingsTab === 'editor' || settingsTab === 'agencies') {
      setSettingsTab('profile')
    }
  }, [isOwner, settingsTab])

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
    if (!supabase || !currentUserId || !isOwner) {
      setEditorItems([])
      return
    }
    void loadOwnerEditorItems()
  }, [currentUserId, isOwner])

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
        if (!id || !category || !title || !scenario || questions.length === 0) {
          console.warn(`[content] supabase content_items(scenario)[${index}] missing required fields, skipping.`)
          return accumulator
        }

        accumulator.push({
          id,
          category,
          title,
          scenario,
          questions,
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
        try {
          const supabaseContent = await loadFromSupabase()
          setContentWarning('')
          applyLoadedContentToRuntime(supabaseContent.codeItems, supabaseContent.scenarios)
          return
        } catch (error) {
          console.warn('[content] supabase content unavailable, falling back to local content.', error)
          setContentWarning('Content editor source unavailable, using local content fallback.')
        }
      } else {
        setContentWarning('')
      }

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
  }, [])

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

  const refreshLeaderboard = async () => {
    if (!supabase) return []

    const { data: rows, error } = await supabase
      .from('leaderboard')
      .select('id,user_id,game,score,round,created_at,match_duration,match_filter')
      .order('score', { ascending: false })
      .limit(300)

    if (error || !rows) {
      setLeaderboardError(error?.message || 'Could not load leaderboard.')
      return []
    }
    setLeaderboardError('')

    const userIds = [...new Set(rows.map((entry) => String(entry.user_id)))]
    let profilesByUserId: Record<string, { username: string; avatarUrl: string; supporterTier: SupporterTier }> = {}
    let detailsByUserId: Record<string, ProfileDetails> = {}
    let masteredCodesByUserId: Record<string, number> = {}
    let studySecondsByUserId: Record<string, number> = {}
    let studyDayStreakByUserId: Record<string, number> = {}
    let mostStudiedModeByUserId: Record<string, CodeFilter | null> = {}
    let duelStatsByUserId: Record<string, { wins: number; losses: number; currentWinStreak: number }> = {}
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
      detailsByUserId = (profiles || []).reduce<Record<string, ProfileDetails>>((accumulator, entry) => {
        accumulator[String(entry.user_id)] = {
          bio: String(entry.bio || ''),
          agency: String(entry.agency || defaultAgency),
          homeLeaderboardRotationMs: defaultLeaderboardRotationMs,
          themeId: appThemePresets[0].id,
          nameStyle: { ...defaultNameStyle },
          namePresets: [],
          stats: { ...defaultUserStats, gamePlays: { ...defaultUserStats.gamePlays }, studyModeCounts: { ...defaultUserStats.studyModeCounts } },
        }
        return accumulator
      }, {})

      const { data: appStates } = await supabase
        .from('app_state')
        .select('user_id,profile_details,performance')
        .in('user_id', userIds)
      for (const row of appStates || []) {
        const userId = String(row.user_id || '')
        if (!userId) continue
        const parsed = sanitizeState({ profileDetails: row.profile_details, performance: row.performance })
        const details = parsed.profileDetails
        const existing = detailsByUserId[userId] ?? {
          bio: '',
          agency: defaultAgency,
          homeLeaderboardRotationMs: defaultLeaderboardRotationMs,
          themeId: appThemePresets[0].id,
          nameStyle: { ...defaultNameStyle },
          namePresets: [],
          stats: { ...defaultUserStats, gamePlays: { ...defaultUserStats.gamePlays }, studyModeCounts: { ...defaultUserStats.studyModeCounts } },
        }
        detailsByUserId[userId] = {
          bio: existing.bio || details.bio,
          agency: existing.agency || details.agency,
          homeLeaderboardRotationMs: sanitizeLeaderboardRotationMs(details.homeLeaderboardRotationMs || existing.homeLeaderboardRotationMs),
          themeId: details.themeId || existing.themeId,
          nameStyle: details.nameStyle,
          namePresets: details.namePresets,
          stats: details.stats,
        }
        masteredCodesByUserId[userId] = Object.values(parsed.performance).filter((item) => mastery(item) === 'Mastered').length
        studySecondsByUserId[userId] = details.stats.studySeconds
        studyDayStreakByUserId[userId] = details.stats.studyDayStreak
        mostStudiedModeByUserId[userId] = mostStudiedModeFromStats(details.stats)
      }

      const { data: roleRows } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'owner')
        .in('user_id', userIds)
      ownerUserIds = new Set((roleRows || []).map((entry) => String(entry.user_id || '')))

      const { data: duelRows, error: duelError } = await supabase
        .from('duel_player_stats')
        .select('user_id,wins,losses,current_win_streak')
        .eq('game_type', 'all')
        .in('user_id', userIds)
      if (!duelError) {
        duelStatsByUserId = (duelRows || []).reduce<Record<string, { wins: number; losses: number; currentWinStreak: number }>>((accumulator, entry) => {
          const userId = String(entry.user_id || '')
          if (!userId) return accumulator
          accumulator[userId] = {
            wins: Number(entry.wins || 0),
            losses: Number(entry.losses || 0),
            currentWinStreak: Number(entry.current_win_streak || 0),
          }
          return accumulator
        }, {})
      }
    }

    const mapped = rows.map(
      (entry): LeaderboardEntry => ({
        id: String(entry.id),
        userId: String(entry.user_id || ''),
        game: String(entry.game),
        playerName: profilesByUserId[String(entry.user_id)]?.username || 'Player',
        avatarUrl: profilesByUserId[String(entry.user_id)]?.avatarUrl || defaultAvatarUrl,
        supporterTier: profilesByUserId[String(entry.user_id)]?.supporterTier || 'free',
        bio: detailsByUserId[String(entry.user_id)]?.bio || '',
        agency: detailsByUserId[String(entry.user_id)]?.agency || '',
        nameStyle: detailsByUserId[String(entry.user_id)]?.nameStyle || { ...defaultNameStyle },
        themeId: detailsByUserId[String(entry.user_id)]?.themeId || appThemePresets[0].id,
        isOwner: ownerUserIds.has(String(entry.user_id || '')),
        matchDuration: typeof entry.match_duration === 'number' ? entry.match_duration : null,
        matchFilter: (['all', 'penal', 'hs', 'vehicle'].includes(String(entry.match_filter))
          ? String(entry.match_filter)
          : null) as CodeFilter | null,
        score: Number(entry.score || 0),
        round: Number(entry.round || 0),
        createdAt: Date.parse(String(entry.created_at || '')) || Date.now(),
        masteredCodes: masteredCodesByUserId[String(entry.user_id)] || 0,
        studySeconds: studySecondsByUserId[String(entry.user_id)] || 0,
        studyDayStreak: studyDayStreakByUserId[String(entry.user_id)] || 0,
        mostStudiedMode: mostStudiedModeByUserId[String(entry.user_id)] || null,
        duelWins: duelStatsByUserId[String(entry.user_id)]?.wins || 0,
        duelLosses: duelStatsByUserId[String(entry.user_id)]?.losses || 0,
        duelCurrentWinStreak: duelStatsByUserId[String(entry.user_id)]?.currentWinStreak || 0,
      }),
    )

    const deduped = Array.from(
      mapped
        .reduce<Map<string, LeaderboardEntry>>((accumulator, entry) => {
          const key = `${entry.userId.toLowerCase()}|${entry.game.toLowerCase()}|${entry.matchDuration ?? 0}|${entry.matchFilter ?? 'all'}`
          const current = accumulator.get(key)
          if (!current || entry.score > current.score || (entry.score === current.score && entry.round > current.round)) {
            accumulator.set(key, entry)
          }
          return accumulator
        }, new Map<string, LeaderboardEntry>())
        .values(),
    ).sort((left, right) => right.score - left.score || right.round - left.round)

    setLeaderboard(deduped)
    leaderboardRef.current = deduped
    return deduped
  }

  const refreshHomeLeaderboards = async () => {
    if (!supabase) return
    const { data: states, error } = await supabase
      .from('app_state')
      .select('user_id,performance,profile_details')
      .limit(400)
    if (error || !states) return

    const userIds = [...new Set(states.map((entry) => String(entry.user_id || '')))].filter(Boolean)
    let profileMap: Record<string, { username: string; avatarUrl: string; supporterTier: SupporterTier }> = {}
    let duelStatsByUserId: Record<string, { wins: number; losses: number; currentWinStreak: number }> = {}
    let ownerUserIds = new Set<string>()
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
        .select('user_id,wins,losses,current_win_streak')
        .eq('game_type', 'all')
        .in('user_id', userIds)
      if (!duelError) {
        duelStatsByUserId = (duelRows || []).reduce<Record<string, { wins: number; losses: number; currentWinStreak: number }>>((accumulator, entry) => {
          const userId = String(entry.user_id || '')
          if (!userId) return accumulator
          accumulator[userId] = {
            wins: Number(entry.wins || 0),
            losses: Number(entry.losses || 0),
            currentWinStreak: Number(entry.current_win_streak || 0),
          }
          return accumulator
        }, {})
      }
    }

    const studyRows: HomeLeaderboardEntry[] = []
    const studyStreakRows: HomeLeaderboardEntry[] = []
    const masteredRows: HomeLeaderboardEntry[] = []
    let ownerRotationMs: number | null = null
    for (const row of states) {
      const userId = String(row.user_id || '')
      if (!userId) continue
      const parsed = sanitizeState({ profileDetails: row.profile_details, performance: row.performance })
      if (ownerRotationMs === null && ownerUserIds.has(userId)) {
        ownerRotationMs = sanitizeLeaderboardRotationMs(parsed.profileDetails.homeLeaderboardRotationMs)
      }
      const profile = profileMap[userId] || { username: 'Player', avatarUrl: defaultAvatarUrl, supporterTier: 'free' as SupporterTier }
      const masteredCount = Object.values(parsed.performance).filter((item) => mastery(item) === 'Mastered').length
      const studySeconds = parsed.profileDetails.stats.studySeconds
      const studyDayStreak = parsed.profileDetails.stats.studyDayStreak
      const mostStudiedMode = mostStudiedModeFromStats(parsed.profileDetails.stats)
      const duelStats = duelStatsByUserId[userId] || { wins: 0, losses: 0, currentWinStreak: 0 }
      studyRows.push({
        userId,
        playerName: profile.username,
        avatarUrl: profile.avatarUrl,
        supporterTier: profile.supporterTier,
        themeId: parsed.profileDetails.themeId || appThemePresets[0].id,
        nameStyle: parsed.profileDetails.nameStyle,
        bio: parsed.profileDetails.bio,
        agency: parsed.profileDetails.agency,
        isOwner: ownerUserIds.has(userId),
        value: studySeconds,
        masteredCodes: masteredCount,
        studySeconds,
        studyDayStreak,
        mostStudiedMode,
        duelWins: duelStats.wins,
        duelLosses: duelStats.losses,
        duelCurrentWinStreak: duelStats.currentWinStreak,
      })
      studyStreakRows.push({
        userId,
        playerName: profile.username,
        avatarUrl: profile.avatarUrl,
        supporterTier: profile.supporterTier,
        themeId: parsed.profileDetails.themeId || appThemePresets[0].id,
        nameStyle: parsed.profileDetails.nameStyle,
        bio: parsed.profileDetails.bio,
        agency: parsed.profileDetails.agency,
        isOwner: ownerUserIds.has(userId),
        value: studyDayStreak,
        masteredCodes: masteredCount,
        studySeconds,
        studyDayStreak,
        mostStudiedMode,
        duelWins: duelStats.wins,
        duelLosses: duelStats.losses,
        duelCurrentWinStreak: duelStats.currentWinStreak,
      })
      masteredRows.push({
        userId,
        playerName: profile.username,
        avatarUrl: profile.avatarUrl,
        supporterTier: profile.supporterTier,
        themeId: parsed.profileDetails.themeId || appThemePresets[0].id,
        nameStyle: parsed.profileDetails.nameStyle,
        bio: parsed.profileDetails.bio,
        agency: parsed.profileDetails.agency,
        isOwner: ownerUserIds.has(userId),
        value: masteredCount,
        masteredCodes: masteredCount,
        studySeconds,
        studyDayStreak,
        mostStudiedMode,
        duelWins: duelStats.wins,
        duelLosses: duelStats.losses,
        duelCurrentWinStreak: duelStats.currentWinStreak,
      })
    }

    setHomeStudyTimeLeaders(studyRows.filter((entry) => entry.value > 0).sort((left, right) => right.value - left.value).slice(0, 5))
    setHomeStudyStreakLeaders(studyStreakRows.filter((entry) => entry.value > 0).sort((left, right) => right.value - left.value).slice(0, 5))
    setHomeMostMasteredLeaders(masteredRows.filter((entry) => entry.value > 0).sort((left, right) => right.value - left.value).slice(0, 5))
    if (ownerRotationMs !== null) {
      setLeaderboardRotateMs(ownerRotationMs)
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
    } = client.auth.onAuthStateChange((event, session) => {
      console.log('Auth state change:', event, session ? 'session exists' : 'no session')
      if (session?.user) {
        setCurrentUserId(session.user.id)
        setCurrentUserEmail(session.user.email || '')
        setCurrentUserProvider(String(session.user.app_metadata?.provider || 'email'))
      } else {
        console.log('No session - clearing user')
        setCurrentUserId('')
        setCurrentUserEmail('')
        setCurrentUserProvider('email')
        setProfile(null)
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
      const { data: profileRow } = await client
        .from('profiles')
        .select('user_id,username,avatar_path,supporter_tier,bio,agency')
        .eq('user_id', currentUserId)
        .maybeSingle()

      if (profileRow) {
        const mapped = mapProfileRow(profileRow as Record<string, unknown>, currentUserId)
        setProfile(mapped)
        setProfileUsername(mapped.username)
        setForceProfileSetup(false)
      } else {
        setProfile({ userId: currentUserId, username: '', avatarPath: '', avatarUrl: defaultAvatarUrl, supporterTier: 'free', isOwner: false })
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
        homeLeaderboardRotationMs: nextState.profileDetails.homeLeaderboardRotationMs,
        themeId: nextState.profileDetails.themeId,
        nameStyle: nextState.profileDetails.nameStyle,
        namePresets: nextState.profileDetails.namePresets,
        stats: nextState.profileDetails.stats,
      })
      lastAppStateUpdateRef.current = Date.parse(String(stateRow?.updated_at || '')) || Date.now()
      setStateHydrated(true)

      await refreshLeaderboard()
      await refreshHomeLeaderboards()
    }

    hydrate().catch(() => undefined)
  }, [currentUserId])

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
            homeLeaderboardRotationMs: previous.homeLeaderboardRotationMs,
            themeId: previous.themeId,
            nameStyle: previous.nameStyle,
            namePresets: previous.namePresets,
            stats: previous.stats,
          }))
        },
      )
      .subscribe()

    return () => {
      client.removeChannel(channel)
    }
  }, [currentUserId])

  useEffect(() => {
    if (!supabase || !currentUserId) return
    const client = supabase
    const timer = setInterval(async () => {
      const { data: profileRow } = await client
        .from('profiles')
        .select('user_id,username,avatar_path,supporter_tier,bio,agency')
        .eq('user_id', currentUserId)
        .maybeSingle()
      if (!profileRow) return
      const mapped = mapProfileRow(profileRow as Record<string, unknown>, currentUserId)
      setProfile(mapped)
    }, 20000)

    return () => clearInterval(timer)
  }, [currentUserId])

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

  const speedQuestionBank = useMemo(() => {
    const base = questions.filter((question) => question.prompt.startsWith('Which section number matches:'))
    return gamesSelection.filter === 'all' ? base : base.filter((question) => question.codeSet === gamesSelection.filter)
  }, [questions, gamesSelection.filter])
  const scenarioQuestionBank = useMemo(() => buildScenarioQuestions(scenarioItems), [scenarioItems])

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
    return deck
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
    setShowStudyFlashSetupModal(false)
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
    setShowStudyTestSetupModal(false)
    setStudyTestSessionOpen(true)
    setQuizDeck(remaining)
    setCurrentQuestion(first)
    setSelectedChoice(null)
    setFeedback('')
    setStreak(0)
  }

  const advanceStudyTestQuestion = () => {
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
      const delta = previous ? accuracy - previous.accuracy : null
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
        trend,
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
  }

  useEffect(() => {
    if (!matchRunning) return
    const timer = setInterval(() => {
      setMatchRemaining((remaining) => {
        if (remaining <= 1) {
          clearInterval(timer)
          setMatchRunning(false)
          setMatchDone(true)
          const finalMatchScore = matchScoreRef.current
          const finalMatchRound = matchRoundRef.current
          const finalCorrect = matchCorrectCountRef.current
          const finalIncorrect = matchIncorrectCountRef.current
          const finalAttempts = finalCorrect + finalIncorrect
          const finalAccuracy = finalAttempts > 0 ? Math.round((finalCorrect / finalAttempts) * 100) : 0
          const trackKey = sessionTrackKey({ mode: 'matching', duration: matchSessionDuration, filter: matchSessionFilter })
          const track = getSessionTrack(profileDetails.stats, trackKey)
          const previousAttempt = track.lastAttempt
          const trend = [...track.accuracyHistory, finalAccuracy].slice(-8)
          const focusTips = getFocusTips(matchSessionFilter, 'matching')
          const previousBest = highScoresRef.current.matching
          const globalBest = leaderboardRef.current
            .filter((entry) => entry.game === 'Matching')
            .reduce((max, entry) => Math.max(max, entry.score), 0)
          const isPersonalBest = finalMatchScore > previousBest
          const isGlobalBest = finalMatchScore > globalBest
          setHighScores((previous) => ({ ...previous, matching: Math.max(previous.matching, finalMatchScore) }))
          if (isGlobalBest) {
            triggerCelebration('🏆 New #1 Matching Score', `${finalMatchScore} points`)
          } else if (isPersonalBest) {
            triggerCelebration('🎉 New Personal Best', `Matching: ${finalMatchScore} points`)
          }

          if (supabase && currentUserId) {
            void (async () => {
              // Only save if it's a personal best for this category
              const existingMatch = leaderboardRef.current.find(
                (e) => e.userId === currentUserId && 
                       e.game === 'Matching' && 
                       e.matchDuration === matchSessionDuration && 
                       e.matchFilter === matchSessionFilter
              )
              
              if (existingMatch && existingMatch.score >= finalMatchScore) {
                console.log('Matching score not high enough to save:', { new: finalMatchScore, existing: existingMatch.score })
              } else {
                const { error: insertError } = await supabase
                  .from('leaderboard')
                  .upsert({
                    game: 'Matching',
                    score: finalMatchScore,
                    round: finalMatchRound,
                    user_id: currentUserId,
                    match_duration: matchSessionDuration,
                    match_filter: matchSessionFilter,
                  }, {
                    onConflict: 'user_id,game,match_duration,match_filter',
                    ignoreDuplicates: false,
                  })

                if (insertError) {
                  console.error('Matching leaderboard save failed:', insertError)
                } else {
                  console.log('Matching high score saved!')
                }
              }

              const refreshed = await refreshLeaderboard()
              await refreshHomeLeaderboards()

              const { preview, currentRank } = getLeaderboardPreview(
                refreshed.length > 0 ? refreshed : leaderboardRef.current,
                'Matching',
                matchSessionDuration,
                matchSessionFilter,
                currentUserId,
              )
              setMatchingReport({
                mode: 'matching',
                title: 'Matching',
                contextLabel: `${matchSessionDuration}s • ${leaderboardCodeSetLabel(matchSessionFilter)}`,
                accuracy: finalAccuracy,
                correct: finalCorrect,
                incorrect: finalIncorrect,
                score: finalMatchScore,
                deltaAccuracy: previousAttempt ? finalAccuracy - previousAttempt.accuracy : null,
                trend,
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
                duration: matchSessionDuration,
                filter: matchSessionFilter,
                at: Date.now(),
              })
            })()
          } else {
            setMatchingReport({
              mode: 'matching',
              title: 'Matching',
              contextLabel: `${matchSessionDuration}s • ${leaderboardCodeSetLabel(matchSessionFilter)}`,
              accuracy: finalAccuracy,
              correct: finalCorrect,
              incorrect: finalIncorrect,
              score: finalMatchScore,
              deltaAccuracy: previousAttempt ? finalAccuracy - previousAttempt.accuracy : null,
              trend,
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
              duration: matchSessionDuration,
              filter: matchSessionFilter,
              at: Date.now(),
            })
          }

          return 0
        }

        return remaining - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [matchRunning, currentUserId, matchSessionDuration, matchSessionFilter, profileDetails.stats.sessionTracks, sections, performance])

  const markPerformance = (codeSet: CodeSet, sectionNumber: string, correct: boolean) => {
    const key = performanceKey(codeSet, sectionNumber)
    const current = performance[key] ?? { correctCount: 0, incorrectCount: 0, correctStreak: 0 }
    const previousStatus = mastery(current)
    const updated: CodePerformance = {
      correctCount: current.correctCount + (correct ? 1 : 0),
      incorrectCount: current.incorrectCount + (correct ? 0 : 1),
      correctStreak: correct ? (current.correctStreak ?? 0) + 1 : 0,
    }
    setPerformance((previous) => ({ ...previous, [key]: updated }))
    const nextStatus = mastery(updated)
    return nextStatus !== previousStatus ? nextStatus : ''
  }

  const answerQuestion = (index: number) => {
    if (!studyTestSessionOpen || !currentQuestion || selectedChoice !== null || studyTestSessionDone) return
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
  }

  const makeRoundCards = (targetFilter: CodeFilter) => {
    const pool = (targetFilter === 'all' ? sections : sections.filter((section) => section.codeSet === targetFilter)).filter(
      (section) => !recentMatchSections.includes(section.sectionNumber.toLowerCase()),
    )
    const selected = shuffle(pool.length >= 3 ? pool : sections).slice(0, 3)

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
  }

  const startMatching = () => {
    const selectedDuration = gamesSelection.duration
    const selectedFilter = gamesSelection.filter
    setMatchSessionDuration(selectedDuration)
    setMatchSessionFilter(selectedFilter)
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
    setSelectedCards([])
    setWrongCardIds([])
    setMatchedPairIds([])
  }

  const nextSpeedQuestion = (candidateDeck?: QuizQuestion[], previousId?: string) => {
    const source = Array.isArray(candidateDeck) ? candidateDeck : speedSessionQuestions
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
  }

  const startSpeedTest = () => {
    const selectedDuration = gamesSelection.duration
    const selectedFilter = gamesSelection.filter
    const pool = speedQuestionBank.filter((question) => selectedFilter === 'all' || question.codeSet === selectedFilter)
    if (pool.length === 0) {
      setSpeedCurrentQuestion(null)
      setSpeedDeck([])
      setSpeedRunning(false)
      setSpeedDone(false)
      setSpeedFeedback('')
      return
    }
    setSpeedSessionQuestions(pool)
    setSpeedSessionDuration(selectedDuration)
    setSpeedSessionFilter(selectedFilter)
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
    setSpeedRunning(false)
    setSpeedDone(false)
    setSpeedFeedback('')
  }

  const answerSpeedQuestion = (choiceIndex: number) => {
    if (!speedRunning || !speedCurrentQuestion) return
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
    setTimeout(() => {
      nextSpeedQuestion(undefined, previousId)
      setSpeedFeedback('')
    }, 150)
  }

  const nextScenarioQuestion = (candidateDeck?: ScenarioQuestion[], previousId?: string) => {
    let deck = candidateDeck ? [...candidateDeck] : [...scenarioDeck]
    if (deck.length === 0) {
      deck = shuffle(scenarioQuestionBank)
    }
    if (deck.length === 0) {
      setScenarioCurrentQuestion(null)
      setScenarioDeck([])
      return
    }
    if (previousId && deck.length > 1 && deck[0].id === previousId) {
      ;[deck[0], deck[1]] = [deck[1], deck[0]]
    }
    const [next, ...remaining] = deck
    setScenarioCurrentQuestion(next)
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
  }

  const answerScenario = (choiceIndex: number) => {
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
  }

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
    }

    const timeout = setTimeout(() => {
      setSelectedCards([])
      setWrongCardIds([])
    }, 260)
    return () => clearTimeout(timeout)
  }, [selectedCards, matchCards])

  useEffect(() => {
    if (!matchRunning || matchCards.length === 0) return
    const uniquePairs = new Set(matchCards.map((card) => card.pairId))
    if (matchedPairIds.length !== uniquePairs.size) return
    setMatchRound((round) => round + 1)
    setMatchScore((score) => score + 20)
    makeRoundCards(matchSessionFilter)
  }, [matchedPairIds, matchCards, matchRunning, matchSessionFilter])

  useEffect(() => {
    if (!speedRunning) return
    const timer = setInterval(() => {
      setSpeedRemaining((remaining) => {
        if (remaining <= 1) {
          clearInterval(timer)
          setSpeedRunning(false)
          setSpeedDone(true)
          const finalSpeedScore = speedScoreRef.current
          const finalAnswered = speedAnsweredCountRef.current
          const finalCorrect = speedCorrectCountRef.current
          const finalIncorrect = speedIncorrectCountRef.current
          const finalAccuracy = finalAnswered > 0 ? Math.round((finalCorrect / finalAnswered) * 100) : 0
          const trackKey = sessionTrackKey({ mode: 'speed', duration: speedSessionDuration, filter: speedSessionFilter })
          const track = getSessionTrack(profileDetails.stats, trackKey)
          const previousAttempt = track.lastAttempt
          const trend = [...track.accuracyHistory, finalAccuracy].slice(-8)
          const focusTips = getFocusTips(speedSessionFilter, 'speed')
          const previousBest = highScoresRef.current.rapidFire
          const globalBest = leaderboardRef.current
            .filter((entry) => entry.game === 'Speed Test')
            .reduce((max, entry) => Math.max(max, entry.score), 0)
          const isPersonalBest = finalSpeedScore > previousBest
          const isGlobalBest = finalSpeedScore > globalBest
          setHighScores((previous) => ({ ...previous, rapidFire: Math.max(previous.rapidFire, finalSpeedScore) }))
          if (isGlobalBest) {
            triggerCelebration('🏆 New #1 Speed Score', `${finalSpeedScore} points`)
          } else if (isPersonalBest) {
            triggerCelebration('🎉 New Personal Best', `Speed: ${finalSpeedScore} points`)
          }

          if (supabase && currentUserId) {
            void (async () => {
              // Only save if it's a personal best for this category
              const existing = leaderboardRef.current.find(
                (e) => e.userId === currentUserId && 
                       e.game === 'Speed Test' && 
                       e.matchDuration === speedSessionDuration && 
                       e.matchFilter === speedSessionFilter
              )
              
              if (existing && existing.score >= finalSpeedScore) {
                console.log('Score not high enough to save:', { new: finalSpeedScore, existing: existing.score })
              } else {
                const { error: insertError } = await supabase
                  .from('leaderboard')
                  .upsert({
                    game: 'Speed Test',
                    score: finalSpeedScore,
                    round: finalAnswered,
                    user_id: currentUserId,
                    match_duration: speedSessionDuration,
                    match_filter: speedSessionFilter,
                  }, {
                    onConflict: 'user_id,game,match_duration,match_filter',
                    ignoreDuplicates: false,
                  })

                if (insertError) {
                  console.error('Leaderboard save failed:', insertError)
                } else {
                  console.log('High score saved!')
                }
              }

              const refreshed = await refreshLeaderboard()
              await refreshHomeLeaderboards()

              const { preview, currentRank } = getLeaderboardPreview(
                refreshed.length > 0 ? refreshed : leaderboardRef.current,
                'Speed Test',
                speedSessionDuration,
                speedSessionFilter,
                currentUserId,
              )
              setSpeedReport({
                mode: 'speed',
                title: 'Speed Test',
                contextLabel: `${speedSessionDuration}s • ${leaderboardCodeSetLabel(speedSessionFilter)}`,
                accuracy: finalAccuracy,
                correct: finalCorrect,
                incorrect: finalIncorrect,
                score: finalSpeedScore,
                deltaAccuracy: previousAttempt ? finalAccuracy - previousAttempt.accuracy : null,
                trend,
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
                duration: speedSessionDuration,
                filter: speedSessionFilter,
                at: Date.now(),
              })
            })()
          } else {
            setSpeedReport({
              mode: 'speed',
              title: 'Speed Test',
              contextLabel: `${speedSessionDuration}s • ${leaderboardCodeSetLabel(speedSessionFilter)}`,
              accuracy: finalAccuracy,
              correct: finalCorrect,
              incorrect: finalIncorrect,
              score: finalSpeedScore,
              deltaAccuracy: previousAttempt ? finalAccuracy - previousAttempt.accuracy : null,
              trend,
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
              duration: speedSessionDuration,
              filter: speedSessionFilter,
              at: Date.now(),
            })
          }
          return 0
        }
        return remaining - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [speedRunning, speedSessionDuration, speedSessionFilter, currentUserId, profileDetails.stats.sessionTracks, sections, performance])

  useEffect(() => {
    setScenarioDeck([])
    setScenarioStreak(0)
    nextScenarioQuestion([])
  }, [scenarioQuestionBank])

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

  const submitSignUp = async () => {
    if (!supabase) return
    if (authPassword !== authPasswordConfirm) {
      setAuthError('Passwords do not match.')
      return
    }
    setAuthLoading(true)
    setAuthError('')
    setAuthSuccess('')
    window.localStorage.removeItem('pending_profile_setup')

    const { data, error } = await supabase.auth.signUp({
      email: authEmail,
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

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: authPassword,
    })

    if (signInError) {
      const message = signInError.message.toLowerCase()
      if (message.includes('email not confirmed') || message.includes('confirmation')) {
        setAuthError('Account created, but email confirmation is enabled in Supabase. Disable email confirmation to allow immediate sign-in.')
      } else {
        setAuthError(`Account created, but sign-in failed: ${signInError.message}`)
      }
      setAuthLoading(false)
      return
    }

    window.localStorage.setItem('pending_profile_setup', '1')
    window.localStorage.setItem('pending_dev_notice', '1')
    setForceProfileSetup(true)
    await supabase.auth.signOut()
    const normalizedEmail = authEmail.trim().toLowerCase()
    setAuthEmail(normalizedEmail)
    setAuthSuccess("You're able to sign in now.")
    setAuthPassword('')
    setAuthPasswordConfirm('')
    setShowSignUpPassword(false)
    setShowSignUpPasswordConfirm(false)
    navigate('/signin')

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
      .select('user_id,username,avatar_path,supporter_tier,bio,agency')
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
    await supabase
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
    await refreshLeaderboard()
    await refreshHomeLeaderboards()
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
      homeLeaderboardRotationMs: defaultLeaderboardRotationMs,
      themeId: appThemePresets[0].id,
      nameStyle: { ...defaultNameStyle },
      namePresets: [],
      stats: { ...defaultUserStats, gamePlays: { ...defaultUserStats.gamePlays }, studyModeCounts: { ...defaultUserStats.studyModeCounts } },
    })
    setNewPresetName('')
    setStateHydrated(false)
    recentSpeedSectionsRef.current = []
    setShowStudyFlashSetupModal(false)
    setShowStudyTestSetupModal(false)
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
      const [{ error: stateError }, { error: leaderboardError }] = await Promise.all([
        supabase.from('app_state').delete().eq('user_id', currentUserId),
        supabase.from('leaderboard').delete().eq('user_id', currentUserId),
      ])

      if (stateError || leaderboardError) {
        setAuthError(stateError?.message || leaderboardError?.message || 'Could not reset data.')
        setAuthLoading(false)
        return
      }
    }

    setPerformance({})
    setHighScores(gameHighScoreSeed)
    setBestStreak(0)
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
    setShowStudyFlashSetupModal(false)
    setShowStudyTestSetupModal(false)
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
    await refreshLeaderboard()
    await refreshHomeLeaderboards()
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

  const currentPath = location.pathname.toLowerCase()
  const isSignInPage = currentPath === '/signin'
  const isSignUpPage = currentPath === '/signup'
  const isHomePage = currentPath === '/home'
  const isStudyPage = currentPath === '/study'
  const isGamesPage = currentPath === '/games'
  const isScenariosPage = currentPath === '/scenarios'
  const isLibraryPage = currentPath === '/library'
  const isSupportPage = currentPath === '/support'
  const isProfilePage = currentPath === '/profile'
  const isStatsPage = currentPath === '/stats'
  const isKnownAuthedPage =
    isHomePage ||
    isStudyPage ||
    isGamesPage ||
    isScenariosPage ||
    isLibraryPage ||
    isSupportPage ||
    isProfilePage ||
    isStatsPage
  const needsProfileSetup = Boolean(authReady && currentUserId && profile && !profile.username && forceProfileSetup)

  // Flashcard keyboard controls: Space to flip, Arrow keys to navigate
  useEffect(() => {
    if (!isStudyPage || !studyFlashSessionOpen || orderedStudyFlashSessionCards.length === 0) return

    const goToPreviousCard = () => {
      setStudyFlashSessionFlipped(false)
      setStudyFlashSessionIndex((current) => {
        if (orderedStudyFlashSessionCards.length === 0) return 0
        return current === 0 ? orderedStudyFlashSessionCards.length - 1 : current - 1
      })
      incrementUserStats((stats) => ({ ...stats, flashcardsReviewed: stats.flashcardsReviewed + 1 }), true)
    }

    const goToNextCard = () => {
      setStudyFlashSessionFlipped(false)
      setStudyFlashSessionIndex((current) => {
        if (orderedStudyFlashSessionCards.length === 0) return 0
        if (current < orderedStudyFlashSessionCards.length - 1) return current + 1
        const lastCardId = orderedStudyFlashSessionCards[current]?.id
        let reshuffled = shuffle(studyFlashSessionCards.map((card) => card.id))
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
  }, [isStudyPage, studyFlashSessionOpen, orderedStudyFlashSessionCards, studyFlashSessionCards])

  // Keyboard shortcuts for answering multiple-choice questions (1-4 keys)
  useEffect(() => {
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
          console.log('Spam detected, key ignored')
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
  }, [currentQuestion, selectedChoice, answerQuestion])

  // Enter key to advance study test question
  useEffect(() => {
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
  }, [currentQuestion, selectedChoice, studyTestSessionDone, advanceStudyTestQuestion])

  // Keyboard shortcuts for speed test questions (1-4 keys)
  useEffect(() => {
    if (!speedCurrentQuestion || speedFeedback) return

    // Spam detection: track recent keypresses
    const lastKeyPress = { key: '', time: 0 }
    const SPAM_THRESHOLD_MS = 250 // Same key within 250ms = spam

    const handleSpeedAnswerKeyDown = (event: KeyboardEvent) => {
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
          console.log('Spam detected, key ignored')
          return
        }
        
        lastKeyPress.key = key
        lastKeyPress.time = now

        const index = parseInt(key) - 1
        if (speedCurrentQuestion.choices && index < speedCurrentQuestion.choices.length) {
          event.preventDefault()
          answerSpeedQuestion(index)
        }
      }
    }

    window.addEventListener('keydown', handleSpeedAnswerKeyDown)
    return () => window.removeEventListener('keydown', handleSpeedAnswerKeyDown)
  }, [speedCurrentQuestion, speedFeedback, answerSpeedQuestion])

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
      navigate('/home', { replace: true })
      setActiveTab('home')
    }
  }, [authReady, currentUserId, currentPath, navigate])

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
    }
  }, [isHomePage, isStudyPage, isGamesPage, isScenariosPage, isLibraryPage])

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
    if (!isHomePage || homeMatchingConfigOpen || homeMatchingRotationSteps.length === 0) return

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
  }, [isHomePage, homeMatchingConfigOpen, homeMatchingDurationFilter, homeMatchingCodeFilter, homeMatchingRotationSteps, leaderboardRotateMs])

  useEffect(() => {
    if (!isHomePage || homeSpeedConfigOpen || homeSpeedRotationSteps.length === 0) return

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
  }, [isHomePage, homeSpeedConfigOpen, homeSpeedDurationFilter, homeSpeedCodeFilter, homeSpeedRotationSteps, leaderboardRotateMs])

  const refreshSupporterTier = async () => {
    if (!supabase || !currentUserId || !profile) return
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('user_id,username,avatar_path,supporter_tier,bio,agency')
      .eq('user_id', currentUserId)
      .maybeSingle()

    if (!profileRow) return
    const mapped = mapProfileRow(profileRow as Record<string, unknown>, currentUserId)
    setProfile(mapped)
  }

  const canCustomizeName = profile?.supporterTier === 'tier10'
  const canUseThemes = tierRank(profile?.supporterTier || 'free') >= tierRank('tier5')
  const selectedTheme = getThemePreset(canUseThemes ? profileDetails.themeId : appThemePresets[0].id)
  const isLightTheme = ['pure-white', 'pastel-sky', 'pastel-rose'].includes(selectedTheme.id)
  const activeProfileTier: SupporterTier = profile?.supporterTier || 'free'
  const activeProfileName = profile?.username || 'Officer'
  const showHomeButton = !isHomePage
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
  const incrementUserStats = (updater: (stats: UserStats) => UserStats, trackStudyDay = false) => {
    setProfileDetails((previous) => ({
      ...previous,
      stats: trackStudyDay ? applyStudyDayActivity(updater(previous.stats)) : updater(previous.stats),
    }))
  }
  const triggerCelebration = (title: string, subtitle: string) => {
    const burst = Date.now()
    setCelebration({ title, subtitle, burst })
    window.setTimeout(() => {
      setCelebration((current) => (current?.burst === burst ? null : current))
    }, 2200)
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
    const vars = selectedTheme.vars
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
  }, [selectedTheme])

  useEffect(() => {
    if (!isOwner) return
    setLeaderboardRotateMs(sanitizeLeaderboardRotationMs(profileDetails.homeLeaderboardRotationMs))
  }, [isOwner, profileDetails.homeLeaderboardRotationMs])
  const loadOwnerEditorItems = async () => {
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
  }
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
      createdAt: Date.now(),
      masteredCodes: entry.masteredCodes,
      studySeconds: entry.studySeconds,
      studyDayStreak: entry.studyDayStreak,
      mostStudiedMode: entry.mostStudiedMode,
      duelWins: entry.duelWins,
      duelLosses: entry.duelLosses,
      duelCurrentWinStreak: entry.duelCurrentWinStreak,
    })
    setSelectedLeaderboardIsTop(isTop)
  }

  useEffect(() => {
    if (!currentUserId) return
    if (activeTab !== 'study') return
    if (isProfilePage || isStatsPage || isHomePage) return
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      incrementUserStats((stats) => ({ ...stats, studySeconds: stats.studySeconds + 5 }), true)
    }, 5000)
    return () => window.clearInterval(interval)
  }, [currentUserId, activeTab, isProfilePage, isStatsPage, isHomePage])
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

  const getFocusTips = (filter: CodeFilter, mode: SessionMode) => {
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
  }

  const saveSessionAttempt = (trackKey: string, snapshot: SessionAttemptSnapshot) => {
    setProfileDetails((previous) => {
      const currentTrack = previous.stats.sessionTracks[trackKey] || { lastAttempt: null, accuracyHistory: [] }
      const nextHistory = [...currentTrack.accuracyHistory, snapshot.accuracy].slice(-12)
      return {
        ...previous,
        stats: {
          ...previous.stats,
          sessionTracks: {
            ...previous.stats.sessionTracks,
            [trackKey]: {
              lastAttempt: snapshot,
              accuracyHistory: nextHistory,
            },
          },
        },
      }
    })
  }

  return (
    <div
      className={`app-shell ${isHomePage ? 'home-page' : ''} ${isLightTheme ? 'theme-light theme-glass' : ''} ${selectedTheme.id === 'golden' ? 'theme-gold' : ''} ${reduceVisualEffects ? 'reduced-effects' : ''}`}
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

      {authReady && !currentUserId && isSignInPage ? (
        <div className="onboarding-overlay">
          <div className="onboarding-card">
            <p className="eyebrow">Welcome to</p>
            <h1>LEO Study</h1>
            <label>
              Email
              <input value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} />
            </label>
            <label>
              Password
              <div className="password-row">
                <input
                  type={showSignInPassword ? 'text' : 'password'}
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
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
      {!isHomePage ? (
      <header className="top-header">
        <div className="header-left">
          {showHomeButton ? (
            <button
              className="secondary header-home-button"
              onClick={() => {
                setActiveTab('home')
                navigate('/home')
              }}
            >
              <AppIcon name="home" className="button-icon" />
              {isSupportPage ? 'Back' : 'Home'}
            </button>
          ) : null}
          {!isHomePage ? (
            <h1>{isProfilePage ? 'Settings' : isStatsPage ? 'Stats' : isSupportPage ? 'Support Creator' : activeTab === 'study' ? 'Study' : activeTab === 'library' ? 'Library' : activeTab === 'games' ? 'Games' : 'Scenarios'}</h1>
          ) : null}
        </div>
        {profile ? (
          <div className="profile-shortcut-wrap" ref={profileMenuRef}>
            <button className="profile-shortcut" onClick={() => setProfileMenuOpen((value) => !value)} aria-label="Open profile menu">
              <img src={avatarFor(profileAvatarPreviewUrl || profile.avatarUrl)} alt={profile.username} className="profile-shortcut-image" onError={handleAvatarImageError} />
            </button>
            <span className={`profile-shortcut-name ${displayNameClass(profile.supporterTier, true)}`} style={displayNameStyle(profileDetails.nameStyle, profile.supporterTier)}>
              {profile.username || 'Profile'}
            </span>
            {profileMenuOpen ? (
              <div className="profile-menu">
                <button
                  className="profile-menu-item"
                  onClick={() => {
                    setProfileMenuOpen(false)
                    navigate('/profile')
                  }}
                >
                  Settings
                </button>
                <button
                  className="profile-menu-item"
                  onClick={() => {
                    setProfileMenuOpen(false)
                    navigate('/stats')
                  }}
                >
                  Stats
                </button>
                <button className="profile-menu-item danger-item" onClick={signOut}>
                  Sign Out
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </header>
      ) : null}

      <main className="content-area">
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
                  <div className={profileDetails.stats.studyDayStreak >= 7 ? 'day-streak-chip day-streak-chip-fire' : 'day-streak-chip'}>
                    <span className="day-streak-label">Study Streak</span>
                    <strong>{profileDetails.stats.studyDayStreak} day{profileDetails.stats.studyDayStreak === 1 ? '' : 's'}</strong>
                    {profileDetails.stats.studyDayStreak >= 7 ? <span className="day-streak-fire" aria-hidden>🔥</span> : null}
                  </div>
                </div>
                {profile ? (
                  <div className="profile-shortcut-wrap home-hero-profile" ref={profileMenuRef}>
                    <button className="profile-shortcut" onClick={() => setProfileMenuOpen((value) => !value)} aria-label="Open profile menu">
                      <img src={avatarFor(profileAvatarPreviewUrl || profile.avatarUrl)} alt={profile.username} className="profile-shortcut-image" onError={handleAvatarImageError} />
                    </button>
                    {profileMenuOpen ? (
                      <div className="profile-menu">
                        <button
                          className="profile-menu-item"
                          onClick={() => {
                            setProfileMenuOpen(false)
                            navigate('/profile')
                          }}
                        >
                          Settings
                        </button>
                        <button
                          className="profile-menu-item"
                          onClick={() => {
                            setProfileMenuOpen(false)
                            navigate('/stats')
                          }}
                        >
                          Stats
                        </button>
                        <button className="profile-menu-item danger-item" onClick={signOut}>
                          Sign Out
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="home-actions">
                <button className="primary" onClick={() => { setActiveTab('study'); navigate('/study') }}>
                  <AppIcon name="study" className="button-icon" />
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

            <div className="home-online-indicator">
              <span className="online-dot"></span>
              <span className="online-count">{onlineUsersCount}</span>
              <span className="online-label">studying now</span>
            </div>

            <div className="home-leaderboard-grid">
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
                            <span className="leader-avatar-frame">
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
                            <span className="leader-avatar-frame">
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

              {homeMatchingRotationSteps.length > 0 ? (
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
                            <span className="leader-avatar-frame">
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

              {homeSpeedRotationSteps.length > 0 ? (
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
                            <span className="leader-avatar-frame">
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
                            <span className="leader-avatar-frame">
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
            </div>
          </section>
        )}

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

        {!isProfilePage && !isStatsPage && !isHomePage && !isSupportPage && isStudyPage && (
          <section className="study-section study-hub">
            <div className="study-actions-grid">
              <button className="card study-action-card" onClick={() => setShowStudyFlashSetupModal(true)}>
                <div className="study-action-icon">
                  <AppIcon name="flashcards" className="button-icon" />
                </div>
                <div>
                  <h3>Flashcards</h3>
                  <p className="muted">Open a full-screen flashcard session with smart ordering.</p>
                </div>
              </button>
              <button className="card study-action-card" onClick={() => setShowStudyTestSetupModal(true)}>
                <div className="study-action-icon">
                  <AppIcon name="study" className="button-icon" />
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
          </section>
        )}

        {isStudyPage && studyFlashSessionOpen ? (
          <div className="study-session-overlay">
            <div className="study-session-shell">
              <div className="study-session-top">
                <button className="secondary" onClick={() => setStudyFlashSessionOpen(false)}>Exit</button>
                <span>{studyFlashSessionFilter === 'all' ? 'All Codes' : codeSetLabel[studyFlashSessionFilter]}</span>
                <span>
                  {orderedStudyFlashSessionCards.length > 0 ? studyFlashSessionIndex + 1 : 0}/{orderedStudyFlashSessionCards.length}
                </span>
              </div>
              {orderedStudyFlashSessionCards.length === 0 ? (
                <div className="card study-session-empty">
                  <p>No flashcards found for this selection.</p>
                  <button className="primary" onClick={() => setStudyFlashSessionOpen(false)}>Back</button>
                </div>
              ) : (
                <>
                  <button
                    tabIndex={0}
                    className={studyFlashSessionFlipped ? 'study-session-flashcard flipped' : 'study-session-flashcard'}
                    onClick={(e) => {
                      e.stopPropagation()
                      setStudyFlashSessionFlipped((value) => !value)
                    }}
                  >
                    <div className="face front">{orderedStudyFlashSessionCards[studyFlashSessionIndex]?.front}</div>
                    <div className="face back">{orderedStudyFlashSessionCards[studyFlashSessionIndex]?.back}</div>
                  </button>
                  <div className="study-session-actions">
                    <button
                      className="secondary study-session-nav"
                      onClick={() => {
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
                    <button className="secondary study-session-nav" onClick={() => setStudyFlashSessionFlipped((value) => !value)}>
                      Flip
                    </button>
                    <button
                      className="primary study-session-nav"
                      onClick={() => {
                        setStudyFlashSessionFlipped(false)
                        setStudyFlashSessionIndex((current) => {
                          if (orderedStudyFlashSessionCards.length === 0) return 0
                          if (current < orderedStudyFlashSessionCards.length - 1) return current + 1
                          const lastCardId = orderedStudyFlashSessionCards[current]?.id
                          let reshuffled = shuffle(studyFlashSessionCards.map((card) => card.id))
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
          </div>
        ) : null}

        {isStudyPage && studyTestSessionOpen ? (
          <div className="study-session-overlay">
            <div className="study-session-shell study-test-shell">
              <div className="study-session-top">
                <button
                  className="secondary"
                  onClick={() => {
                    setStudyTestSessionOpen(false)
                    setStudyTestSessionDone(false)
                    setCurrentQuestion(null)
                    setQuizDeck([])
                    setSelectedChoice(null)
                    setFeedback('')
                    setStreak(0)
                  }}
                >
                  Exit
                </button>
                <span>{studyTestSessionFilter === 'all' ? 'All Codes' : codeSetLabel[studyTestSessionFilter]}</span>
                <span>{studyTestSessionAnswered}/{studyTestSessionTotal}</span>
              </div>

              {!studyTestSessionDone && currentQuestion ? (
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
                <div className="card study-test-complete">
                  <h3>Test Complete</h3>
                  {studyTestReport ? <SessionPerformanceReportCard report={studyTestReport} /> : (
                    <p className="muted">
                      Score: {studyTestSessionCorrect}/{studyTestSessionTotal} ({studyTestSessionTotal > 0 ? Math.round((studyTestSessionCorrect / studyTestSessionTotal) * 100) : 0}%)
                    </p>
                  )}
                  <div className="actions-row">
                    <button className="secondary" onClick={() => setStudyTestSessionOpen(false)}>Exit</button>
                    <button className="primary" onClick={beginStudyTest}>Retake Test</button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {!isProfilePage && !isStatsPage && !isHomePage && !isSupportPage && isGamesPage && (
          <section className="games-section">
            <div className="game-scores">
              <button
                type="button"
                className={gamesMode === 'matching' ? 'card compact game-mode-card game-mode-active' : 'card compact game-mode-card'}
                onClick={() => setGamesMode('matching')}
              >
                <span className="game-mode-title"><AppIcon name="games" className="button-icon" /> Matching</span>
                <span className="muted tiny">Match code sections fast</span>
              </button>
              <button
                type="button"
                className={gamesMode === 'speed' ? 'card compact game-mode-card game-mode-active' : 'card compact game-mode-card'}
                onClick={() => setGamesMode('speed')}
              >
                <span className="game-mode-title"><AppIcon name="study" className="button-icon" /> Speed Test</span>
                <span className="muted tiny">Answer as many as possible</span>
              </button>
              <button
                type="button"
                className={gamesMode === 'duel' ? 'card compact game-mode-card game-mode-active' : 'card compact game-mode-card'}
                onClick={() => setGamesMode('duel')}
              >
                <span className="game-mode-title"><AppIcon name="games" className="button-icon" /> 1v1</span>
                <span className="muted tiny">Realtime head-to-head</span>
              </button>
              <article className="card compact muted-box">Gravity (Disabled)</article>
            </div>

            {gamesMode === 'matching' ? (
              <>
            <h2>Matching</h2>
            {!matchRunning && !matchDone ? (
              <div className="card game-launch-card">
                <button className="primary game-start-button" onClick={() => setShowMatchSetupModal(true)}>
                  <AppIcon name="games" className="button-icon" />
                  Start Matching
                </button>
              </div>
            ) : null}

            {(matchRunning || matchDone) ? (
              <div className="match-session-overlay">
                <div className={matchDone && !matchRunning ? 'match-session-shell match-session-shell-done' : 'match-session-shell'}>
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
                            disabled={matched || selected || selectedCards.length >= 2}
                            onClick={() => setSelectedCards((previous) => [...previous, card.id])}
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

            {!matchRunning && !matchDone ? (
            <>
            <h2>Matching Leaderboard</h2>
            <div className="card leaderboard-card">
              {leaderboardError ? <p className="bad">{leaderboardError}</p> : null}
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
              {matchingLeaderboard.length === 0 ? (
                <p className="muted">No scores submitted yet.</p>
              ) : (
                matchingLeaderboard.map((entry, index) => (
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
                        <span className="leader-avatar-frame">
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
            </>
            ) : null}
              </>
            ) : null}

            {gamesMode === 'speed' ? (
              <>
            <h2>Speed Test</h2>
            {!speedRunning && !speedDone ? (
              <div className="card game-launch-card">
                <button className="primary game-start-button" onClick={() => setShowSpeedSetupModal(true)} disabled={speedQuestionBank.length === 0}>
                  <AppIcon name="study" className="button-icon" />
                  Start Speed Test
                </button>
                {speedQuestionBank.length === 0 ? <p className="muted">No speed test questions loaded.</p> : null}
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

            {!speedRunning && !speedDone ? (
            <>
            <h2>Speed Test Leaderboard</h2>
            <div className="card leaderboard-card">
              {leaderboardError ? <p className="bad">{leaderboardError}</p> : null}
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
              {speedLeaderboard.length === 0 ? (
                <p className="muted">No speed test scores submitted yet.</p>
              ) : (
                speedLeaderboard.map((entry, index) => (
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
                        <span className="leader-avatar-frame">
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
            </>
            ) : null}
              </>
            ) : null}

            {gamesMode === 'duel' ? (
              <OneVsOnePanel
                currentUserId={currentUserId}
                currentUsername={profile?.username || currentUserEmail || 'You'}
                isOwner={isOwner}
              />
            ) : null}
          </section>
        )}

        {!isProfilePage && !isStatsPage && !isHomePage && !isSupportPage && isScenariosPage && (
          <section className="scenario-section">
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
                    </div>
                    <h3 ref={scenarioPromptRef}>{scenarioCurrentQuestion.prompt}</h3>
                    <div className="scenario-actions">
                      <span className="choice-hint">Press 1–4 to answer</span>
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
                        <p className="muted">{scenarioCurrentQuestion.explanation}</p>
                      </div>
                    ) : null}
                    <div className="scenario-next-wrap" ref={scenarioNextRef}>
                      <button className="secondary scenario-next" onClick={() => nextScenarioQuestion(undefined, scenarioCurrentQuestion.id)}>
                        Next Scenario
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
              <p className="muted">Track your progress across study, games, and scenarios.</p>
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
                                <button className="secondary" type="button" onClick={cancelEditAgencyOption} disabled={agencySaving}>
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
                className="secondary"
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
                <span className="leader-avatar-frame modal-avatar">
                  <img src={avatarFor(selectedLeaderboardEntry.avatarUrl)} alt={selectedLeaderboardEntry.playerName} className="leader-avatar" onError={handleAvatarImageError} />
                </span>
              </span>
              <div className="leader-profile-head">
                <h3 className={`leader-profile-name ${displayNameClass(selectedLeaderboardEntry.supporterTier, true)}`} style={leaderboardProfileNameStyle}>
                  {selectedLeaderboardEntry.playerName}
                </h3>
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
              <button className="secondary" onClick={cancelAvatarCrop}>Cancel</button>
              <button className="primary" onClick={applyAvatarCrop}>Use This Crop</button>
            </div>
          </div>
        </div>
      ) : null}

      {showStudyFlashSetupModal ? (
        <div className="profile-modal-overlay study-setup-overlay" onClick={() => setShowStudyFlashSetupModal(false)}>
          <div className="card game-settings-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Flashcards Setup</h3>
            <label className="game-control">
              Subject
              <div className="segmented">
                {(['all', 'penal', 'hs', 'vehicle'] as CodeFilter[]).map((filter) => (
                  <button
                    key={`study-flash-filter-${filter}`}
                    className={studyFlashFilter === filter ? 'seg active' : 'seg'}
                    onClick={() => setStudyFlashFilter(filter)}
                  >
                    {filter === 'all' ? 'All' : codeSetLabel[filter]}
                  </button>
                ))}
              </div>
            </label>
            <p className="muted">{studyFlashSelectionCount} cards available</p>
            <div className="actions-row">
              <button className="secondary" onClick={() => setShowStudyFlashSetupModal(false)}>Cancel</button>
              <button className="primary" onClick={beginStudyFlashcards} disabled={studyFlashSelectionCount === 0}>Start Flashcards</button>
            </div>
          </div>
        </div>
      ) : null}

      {showStudyTestSetupModal ? (
        <div className="profile-modal-overlay study-setup-overlay" onClick={() => setShowStudyTestSetupModal(false)}>
          <div className="card game-settings-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Test Setup</h3>
            <label className="game-control">
              Subject
              <div className="segmented">
                {(['all', 'penal', 'hs', 'vehicle'] as CodeFilter[]).map((filter) => (
                  <button
                    key={`study-test-filter-${filter}`}
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
                    key={`study-test-wrongness-${option.value}`}
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
                    key={`study-test-answer-mode-${option.value}`}
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
                    key={`study-test-count-${size}`}
                    className={studyTestQuestionCount === size ? 'seg active' : 'seg'}
                    onClick={() => setStudyTestQuestionCount(size)}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </label>
            <p className="muted">{studyTestSelectionCount} source questions available</p>
            <div className="actions-row">
              <button className="secondary" onClick={() => setShowStudyTestSetupModal(false)}>Cancel</button>
              <button className="primary" onClick={beginStudyTest} disabled={studyTestSelectionCount === 0}>Start Test</button>
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
              <button className="secondary" onClick={() => setShowMatchSetupModal(false)}>Cancel</button>
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
              <button className="secondary" onClick={() => setShowSpeedSetupModal(false)}>Cancel</button>
              <button className="primary" onClick={beginSpeedFromSetup} disabled={speedQuestionBank.length === 0}>Start</button>
            </div>
          </div>
        </div>
      ) : null}

      <nav className="tab-bar">
        {[
          { key: 'study', label: 'Study' },
          { key: 'games', label: 'Games' },
          { key: 'home', label: 'Home' },
          { key: 'scenarios', label: 'Scenarios' },
          { key: 'library', label: 'Library' },
        ].map((tab) => (
          <button
            key={tab.key}
            className={(tab.key === 'home' ? isHomePage : !isHomePage && activeTab === tab.key) ? 'tab active' : 'tab'}
            onClick={() => {
              setActiveTab(tab.key as AppTab)
              const pathByTab: Record<AppTab, string> = {
                home: '/home',
                study: '/study',
                games: '/games',
                scenarios: '/scenarios',
                library: '/library',
              }
              navigate(pathByTab[tab.key as AppTab])
            }}
          >
            <AppIcon
              name={tab.key === 'home' ? 'home' : tab.key === 'study' ? 'study' : tab.key === 'games' ? 'games' : tab.key === 'scenarios' ? 'scenarios' : 'library'}
              className="tab-icon"
            />
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>
        </>
      ) : null}

      {authReady && currentUserId ? (
        <GlobalChatWidget
          currentUserId={currentUserId}
          currentUsername={profileUsername}
          userAgency={profileDetails?.agency}
          isOwner={isOwner}
        />
      ) : null}
    </div>
  )
}

export default App
